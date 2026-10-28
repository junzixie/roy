import { describe, expect, test } from 'bun:test'
import type { AssistantMessage } from '@earendil-works/pi-ai/compat'
import { convertResultMessage, lastCallContextUsage } from './pi-message-adapter'

function call(input: number, cacheRead: number, output = 100, stopReason = 'toolUse'): AssistantMessage {
  return {
    role: 'assistant',
    content: [{ type: 'text', text: 'x' }],
    usage: { input, output, cacheRead, cacheWrite: 0, totalTokens: input + cacheRead + output, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    stopReason,
  } as unknown as AssistantMessage
}

describe('当前上下文只取最后一次调用', () => {
  test('10 次调用、每次约 23 万：上下文是 23 万，不是 230 万', () => {
    const calls = Array.from({ length: 10 }, (_, i) => call(5_000, 225_000 + i * 10, 100, i === 9 ? 'stop' : 'toolUse'))
    const result = convertResultMessage(calls, 's1') as unknown as {
      usage: { input_tokens: number; cache_read_input_tokens: number }
      context_usage: { input_tokens: number; cache_read_input_tokens: number }
    }
    // 累加值仍保留（用于费用、今日用量）
    expect(result.usage.input_tokens + result.usage.cache_read_input_tokens).toBeGreaterThan(2_000_000)
    // 当前上下文只看最后一次
    expect(result.context_usage.input_tokens + result.context_usage.cache_read_input_tokens).toBe(5_000 + 225_090)
  })

  test('最后一次调用没有用量（取消、报错）时，往前找最近一次有用量的', () => {
    const empty = call(0, 0, 0, 'aborted')
    expect(lastCallContextUsage([call(1_000, 50_000), empty])).toEqual({
      input_tokens: 1_000,
      output_tokens: 100,
      cache_read_input_tokens: 50_000,
      cache_creation_input_tokens: 0,
    })
  })

  test('整轮都没有用量：不输出 context_usage', () => {
    const result = convertResultMessage([call(0, 0, 0, 'stop')], 's1') as unknown as Record<string, unknown>
    expect(result['context_usage']).toBeUndefined()
  })
})
