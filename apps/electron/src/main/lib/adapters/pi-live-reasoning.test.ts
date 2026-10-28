import { describe, expect, test, mock } from 'bun:test'
// 专项测试只验证 RPC 参数，不启动 Electron 的真实 utility process。
mock.module('../agent-runtime-client', () => ({ AgentRuntimeClient: class {} }))
const { PiAgentAdapter, withLiveThinkingLevel } = await import('./pi-agent-adapter')
const { PiUtilityAdapter } = await import('./pi-utility-adapter')
import { createDeepSeekReasoningRequestExtension } from './pi-deepseek-reasoning-request-settings'
import { createOpenAIReasoningRequestExtension, injectOpenAIReasoningLevel } from './pi-openai-reasoning-request-settings'
import { AGENT_RUNTIME_METHODS, type AgentThinkingLevel } from '@roy/shared'

describe('运行中切换思考档位', () => {
  test('同一工具循环的请求不沿用启动时缓存的 high', () => {
    let level: AgentThinkingLevel = 'high'
    const sent: Array<Record<string, unknown>> = []
    const stream = withLiveThinkingLevel(((_model: unknown, _context: unknown, options: Record<string, unknown>) => {
      sent.push(options)
      return undefined
    }) as never, () => level)
    const cached = { reasoning: 'high', apiKey: 'test-only', maxRetries: 2 }
    stream({} as never, {} as never, cached as never)
    level = 'low'
    stream({} as never, {} as never, cached as never)
    expect(sent.map(item => item.reasoning)).toEqual(['high', 'low'])
    expect(sent[1]?.maxRetries).toBe(2)
    expect(cached.reasoning).toBe('high')
    expect(sent[0]?.reasoning).toBe('high')
  })

  test('关闭思考后不保留旧 reasoning', () => {
    let value: unknown = 'not-called'
    const stream = withLiveThinkingLevel(((_m: unknown, _c: unknown, options: Record<string, unknown>) => {
      value = options.reasoning
      return undefined
    }) as never, () => 'off')
    stream({} as never, {} as never, { reasoning: 'high' } as never)
    expect(value).toBeUndefined()
  })

  test('活跃会话切轻度不取消请求、不清空历史', async () => {
    const adapter = new PiAgentAdapter()
    const calls: AgentThinkingLevel[] = []
    const messages = [{ role: 'user', content: '继续' }]
    const active = {
      disposed: false, abortRequested: false,
      session: { setThinkingLevel: (level: AgentThinkingLevel) => calls.push(level), agent: { state: { messages } } },
    }
    ;(adapter as unknown as { activeSessions: Map<string, unknown> }).activeSessions.set('live-test', active)
    await adapter.setThinkingLevel('live-test', 'low')
    expect(calls).toEqual(['low'])
    expect(active.session.agent.state.messages).toBe(messages)
    expect((active as typeof active & { requestedThinkingLevel: string }).requestedThinkingLevel).toBe('low')
  })

  test('初始化期间也记住最新选择', async () => {
    const adapter = new PiAgentAdapter()
    const active = { disposed: false, abortRequested: false, requestedThinkingLevel: undefined as AgentThinkingLevel | undefined }
    ;(adapter as unknown as { activeSessions: Map<string, unknown> }).activeSessions.set('starting-test', active)
    await adapter.setThinkingLevel('starting-test', 'low')
    expect(active.requestedThinkingLevel).toBe('low')
  })

  test('已经结束的会话不报错、不重新启动', async () => {
    await new PiAgentAdapter().setThinkingLevel('finished-test', 'low')
  })

  test('独立运行进程收到同一会话的新档位', async () => {
    const adapter = new PiUtilityAdapter()
    const calls: unknown[][] = []
    ;(adapter as unknown as { pendingQueries: Map<string, unknown> }).pendingQueries.set('query-test', {
      sessionId: 'live-test', queryId: 'query-test',
      client: { call: async (...args: unknown[]) => { calls.push(args) } },
    })
    await adapter.setThinkingLevel('live-test', 'low')
    expect(calls).toEqual([[
      AGENT_RUNTIME_METHODS.QUERY_SET_THINKING_LEVEL,
      { sessionId: 'live-test', level: 'low' },
      { queryId: 'query-test' },
    ]])
  })

  test('DeepSeek 请求扩展逐次读取，不锁定启动时 high', () => {
    let level: AgentThinkingLevel = 'high'
    let hook: (event: { payload: unknown }) => unknown = () => undefined
    createDeepSeekReasoningRequestExtension({ thinkingLevel: 'high', getThinkingLevel: () => level })({
      on: (_event: unknown, callback: typeof hook) => { hook = callback },
    } as never)
    const payload = { model: 'deepseek-v4-flash', thinking: { type: 'enabled' }, output_config: { effort: 'high' } }
    expect(hook({ payload })).toMatchObject({ output_config: { effort: 'high' } })
    level = 'low'
    expect(hook({ payload })).toMatchObject({ output_config: { effort: 'low' } })
    level = 'off'
    expect(hook({ payload })).toMatchObject({ thinking: { type: 'disabled' } })
  })

  test('Responses 请求扩展覆盖残留旧 effort', () => {
    let level: AgentThinkingLevel = 'high'
    let hook: (event: { payload: unknown }) => unknown = () => undefined
    createOpenAIReasoningRequestExtension({ thinkingLevel: 'high', getThinkingLevel: () => level })({
      on: (_event: unknown, callback: typeof hook) => { hook = callback },
    } as never)
    const payload = { model: 'gpt-5', reasoning: { effort: 'high', summary: 'auto', mode: 'legacy' } }
    level = 'low'
    expect(hook({ payload })).toMatchObject({ reasoning: { effort: 'low', summary: 'auto' } })
    const result = injectOpenAIReasoningLevel(payload, { thinkingLevel: 'low' }) as { reasoning: Record<string, unknown> }
    expect(result.reasoning.mode).toBeUndefined()
  })
})
