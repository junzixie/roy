import { describe, expect, test } from 'bun:test'
import {
  collectAnchorsFromMessages,
  compactRequestReasoning,
  DEFAULT_TRUNCATE_CHARS,
  extractExcludedAnchors,
  MAX_ANCHORS,
  renderExcludedPaths,
  truncateReasoningContent,
} from './deepseek-reasoning-compaction'
import { createDeepSeekReasoningBridgeExtension, restoreThinkingSignatures } from './deepseek-reasoning-bridge'
import { injectDeepSeekOpenAIReasoningLevel } from './pi-deepseek-openai-reasoning-request-settings'
import { resolveReasoningProfile } from '@roy/shared'

const longReasoning = (marker: string) => `${marker}${'x'.repeat(4000)}`

describe('DeepSeek 推理尾截断', () => {
  test('超长推理只保留尾部，并标注被裁掉多少', () => {
    const reasoning = longReasoning('头部推理')
    const next = truncateReasoningContent({ role: 'assistant', reasoning_content: reasoning }) as {
      reasoning_content: string
    }
    expect(next.reasoning_content.length).toBeLessThan(reasoning.length)
    expect(next.reasoning_content).toMatch(/^\[前 \d+ 字推理已省略\]\n/)
    expect(next.reasoning_content.endsWith('x'.repeat(100))).toBe(true)
  })

  test('短推理原样返回，不做无意义截断', () => {
    const message = { role: 'assistant', reasoning_content: '很短的一段推理' }
    expect(truncateReasoningContent(message)).toBe(message)
  })

  test('没有 reasoning_content 的消息不动', () => {
    const message = { role: 'assistant', content: 'hi' }
    expect(truncateReasoningContent(message)).toBe(message)
  })

  test('copy-on-write：不改原对象', () => {
    const original = { role: 'assistant', reasoning_content: longReasoning('a') }
    const snapshot = original.reasoning_content
    truncateReasoningContent(original)
    expect(original.reasoning_content).toBe(snapshot)
  })

  test('整包处理：只动 assistant，前缀稳定', () => {
    const payload = {
      messages: [
        { role: 'user', content: '问题' },
        { role: 'assistant', reasoning_content: longReasoning('r1') },
        { role: 'user', content: '追问' },
      ],
    }
    const out = compactRequestReasoning(payload) as { messages: Array<Record<string, unknown>> }
    expect(out).not.toBe(payload)
    expect(out.messages[0]).toBe(payload.messages[0])
    expect(out.messages[2]).toBe(payload.messages[2])
    expect(String(out.messages[1]?.reasoning_content)).toMatch(/^\[前 \d+ 字推理已省略\]\n/)
  })

  test('无改动时返回原引用，供调用方判断', () => {
    const payload = { messages: [{ role: 'assistant', reasoning_content: '短' }] }
    expect(compactRequestReasoning(payload)).toBe(payload)
  })
})

describe('DeepSeek 已排除路径锚点', () => {
  test('从中段排除句提取锚点', () => {
    const head = '先看 router.ts，可以排除 router.ts 的注册问题。另外不是 config 的问题导致的。'
    const reasoning = head + longReasoning('尾部')
    const anchors = extractExcludedAnchors(reasoning, DEFAULT_TRUNCATE_CHARS)
    expect(anchors).toContain('router.ts 的注册问题')
    expect(anchors).toContain('config')
  })

  test('只扫被截掉的前段，尾段不重复提取', () => {
    const reasoning = `${'y'.repeat(3000)}可以排除 tail-only 这条`
    // 截断保留尾 2000，前段 1000+ 不含该句
    expect(extractExcludedAnchors(reasoning, 2000)).not.toContain('tail-only')
  })

  test('弱表述不算排除', () => {
    const reasoning = `可能不行吧，也许 config 有问题。${'z'.repeat(3000)}`
    expect(extractExcludedAnchors(reasoning, 2000)).toEqual([])
  })

  test('锚点上限受控', () => {
    const reasoning = Array.from({ length: 40 }, (_, i) => `可以排除 item${i} 这个方向。`).join('') + 'z'.repeat(3000)
    expect(extractExcludedAnchors(reasoning, 2000).length).toBeLessThanOrEqual(MAX_ANCHORS)
  })

  test('跨消息去重，保首见顺序', () => {
    const messages = [
      { role: 'assistant', reasoning_content: `可以排除 alpha。${'a'.repeat(3000)}` },
      { role: 'assistant', reasoning_content: `可以排除 alpha。可以排除 beta。${'b'.repeat(3000)}` },
    ]
    expect(collectAnchorsFromMessages(messages, 2000)).toEqual(['alpha', 'beta'])
  })

  test('无锚点渲染空串（零字节差异）', () => {
    expect(renderExcludedPaths([])).toBe('')
    expect(renderExcludedPaths(['a.ts'])).toContain('<excluded-paths')
  })
})

describe('thinking 签名补全', () => {
  test('缺签名的思考块补上 reasoning_content', () => {
    const { messages, changed } = restoreThinkingSignatures([
      { role: 'assistant', content: [{ type: 'thinking', thinking: '想一想' }] },
    ])
    expect(changed).toBe(true)
    const block = (messages[0]?.content as Array<Record<string, unknown>>)[0]
    expect(block?.thinkingSignature).toBe('reasoning_content')
  })

  test('已有签名不覆盖（那是模型真实返回的）', () => {
    const original = [{ role: 'assistant', content: [{ type: 'thinking', thinking: 'x', thinkingSignature: 'real' }] }]
    const { changed } = restoreThinkingSignatures(original)
    expect(changed).toBe(false)
  })

  test('空思考块不补签名，避免发出空 reasoning', () => {
    const { changed } = restoreThinkingSignatures([
      { role: 'assistant', content: [{ type: 'thinking', thinking: '   ' }] },
    ])
    expect(changed).toBe(false)
  })

  test('非 assistant 消息与无 content 消息原样通过', () => {
    const input = [{ role: 'user', content: 'hi' }, { role: 'assistant' }]
    const { messages, changed } = restoreThinkingSignatures(input)
    expect(changed).toBe(false)
    expect(messages[0]).toBe(input[0])
  })
})

describe('DeepSeek OpenAI 兼容协议 effort 注入', () => {
  const flash = resolveReasoningProfile({ modelId: 'deepseek-v4.1-flash', transport: 'openai-completions' })

  test('v4.1-flash 能解析出 profile（此前正则匹配不到）', () => {
    expect(flash?.id).toBe('deepseek-v4-flash')
    expect(flash?.encodings['openai-completions']).toBeDefined()
    expect(flash?.encodings['openai-responses']).toBeDefined()
  })

  test('chat-completions 写顶层 reasoning_effort 并开启 thinking', () => {
    const out = injectDeepSeekOpenAIReasoningLevel(
      { messages: [] },
      { profile: flash, transport: 'openai-completions', thinkingLevel: 'low' },
    ) as Record<string, unknown>
    expect(out.reasoning_effort).toBe('low')
    expect(out.thinking).toEqual({ type: 'enabled' })
  })

  test('responses 写嵌套 reasoning.effort 且保留原有字段', () => {
    const out = injectDeepSeekOpenAIReasoningLevel(
      { messages: [], reasoning: { summary: 'auto' } },
      { profile: flash, transport: 'openai-responses', thinkingLevel: 'max' },
    ) as Record<string, unknown>
    expect(out.reasoning).toEqual({ summary: 'auto', effort: 'max' })
  })

  test('目标值已一致时返回原引用（不制造无意义变更）', () => {
    const payload = { messages: [], reasoning_effort: 'low', thinking: { type: 'enabled' } }
    expect(
      injectDeepSeekOpenAIReasoningLevel(payload, {
        profile: flash,
        transport: 'openai-completions',
        thinkingLevel: 'low',
      }),
    ).toBe(payload)
  })
})

describe('推理回传默认关闭（成本护栏）', () => {
  /**
   * 回归：补签名等于开启历史推理回传，实测是净增输入（此前为 0）。
   * 默认必须不改变任何行为，否则「优化模式」会默默变成加价模式。
   */
  test('默认设置下不挂 context 处理器，历史推理仍为空', () => {
    const handlers: string[] = []
    const fakePi = {
      on: (name: string) => { handlers.push(name); return () => {} },
    } as unknown as Parameters<ReturnType<typeof createDeepSeekReasoningBridgeExtension>>[0]
    createDeepSeekReasoningBridgeExtension()(fakePi)
    expect(handlers).not.toContain('context')
    // 截断处理器仍应挂载：一旦有人手动开启回传，护栏就在
    expect(handlers).toContain('before_provider_request')
  })

  test('显式开启后才接管 context', () => {
    const handlers: string[] = []
    const fakePi = {
      on: (name: string) => { handlers.push(name); return () => {} },
    } as unknown as Parameters<ReturnType<typeof createDeepSeekReasoningBridgeExtension>>[0]
    createDeepSeekReasoningBridgeExtension({ restoreSignatures: true })(fakePi)
    expect(handlers).toContain('context')
  })
})

describe('Spark 模式：补签名 + 尾截断 + 锚点联动', () => {
  test('历史推理补签名后被截断，被截掉前段的排除结论以锚点补回末条 user', () => {
    const handlers = new Map<string, (event: { messages?: unknown[]; payload?: unknown }) => unknown>()
    const fakePi = {
      on: (name: string, fn: (event: { messages?: unknown[]; payload?: unknown }) => unknown) => {
        handlers.set(name, fn)
        return () => {}
      },
    } as unknown as Parameters<ReturnType<typeof createDeepSeekReasoningBridgeExtension>>[0]
    createDeepSeekReasoningBridgeExtension({ restoreSignatures: true })(fakePi)

    const longThinking = `先试了本地缓存，已经排除了：缓存 key 不一致。${'中间分析。'.repeat(600)}`
    const contextHandler = handlers.get('context')
    const contextResult = contextHandler?.({
      messages: [{ role: 'assistant', content: [{ type: 'thinking', thinking: longThinking }] }],
    }) as { messages: Array<{ content: Array<{ thinkingSignature?: string }> }> }
    expect(contextResult.messages[0]?.content[0]?.thinkingSignature).toBe('reasoning_content')

    const payload = {
      messages: [
        { role: 'assistant', content: [], reasoning_content: longThinking },
        { role: 'user', content: '继续' },
      ],
    }
    const wire = (handlers.get('before_provider_request')?.({ payload }) ?? payload) as {
      messages: Array<{ reasoning_content?: string; content: string }>
    }
    expect(wire).not.toBe(payload)
    expect(wire.messages[0]?.reasoning_content?.length).toBeLessThan(longThinking.length)
    expect(wire.messages[1]?.content).toContain('<excluded-paths')
    expect(wire.messages[1]?.content).toContain('缓存 key 不一致')
  })
})

describe('补偿块定稿：同一条 user 消息的字节在整个会话里不变', () => {
  type Handler = (event: { payload?: unknown }) => unknown
  const createBridge = (pinned: Map<string, string>): Handler => {
    const handlers = new Map<string, Handler>()
    const fakePi = {
      on: (name: string, fn: Handler) => {
        handlers.set(name, fn)
        return () => {}
      },
    } as unknown as Parameters<ReturnType<typeof createDeepSeekReasoningBridgeExtension>>[0]
    createDeepSeekReasoningBridgeExtension({ pinnedExcludedPaths: pinned })(fakePi)
    return handlers.get('before_provider_request')!
  }
  const send = (handler: Handler, messages: unknown[]) => {
    const payload = { messages }
    return ((handler({ payload }) ?? payload) as { messages: Array<{ content: unknown }> }).messages
  }

  const longThinking = `先试了本地缓存，已经排除了：缓存 key 不一致。${'中间分析。'.repeat(600)}`
  const history = [
    { role: 'user', content: '查一下' },
    { role: 'assistant', content: '', reasoning_content: longThinking },
  ]
  const ask = { role: 'user', content: '继续' }

  test('回合内第二个请求（末条已是 toolResult）仍带同一个补偿块', () => {
    const handler = createBridge(new Map())
    const first = send(handler, [...history, ask])
    const second = send(handler, [
      ...history,
      ask,
      { role: 'assistant', content: '', reasoning_content: '短推理', tool_calls: [{ id: 't1' }] },
      { role: 'tool', tool_call_id: 't1', content: 'ok' },
    ])
    expect(String(first[2]!.content)).toContain('<excluded-paths')
    expect(second[2]!.content).toEqual(first[2]!.content)
  })

  test('新回合重建扩展后，共享定稿表的旧 user 消息字节不变', () => {
    const pinned = new Map<string, string>()
    const first = send(createBridge(pinned), [...history, ask])
    const nextTurn = send(createBridge(pinned), [
      ...history,
      ask,
      { role: 'assistant', content: '好的' },
      { role: 'user', content: '下一个问题' },
    ])
    expect(nextTurn[2]!.content).toEqual(first[2]!.content)
  })

  test('首次没有锚点的 user 消息之后也不会被补上', () => {
    const handler = createBridge(new Map())
    send(handler, [ask])
    const later = send(handler, [ask, ...history, { role: 'user', content: '再看看' }])
    expect(later[0]!.content).toBe('继续')
  })
})
