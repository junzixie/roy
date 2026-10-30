import { describe, expect, test } from 'bun:test'
import { applyAgentEvent, type AgentStreamState } from './agent-atoms'

const base = { running: true, startedAt: 0 } as unknown as AgentStreamState

describe('一轮结束时的上下文用量', () => {
  test('带 isLastCall 的用量直接覆盖流式值（也校正压缩后的预估值）', () => {
    const prev = { ...base, inputTokens: 180_000, contextWindow: 1_000_000, contextUsageIsEstimated: true }
    const next = applyAgentEvent(prev, {
      type: 'complete',
      usage: { inputTokens: 230_000, cacheReadTokens: 225_000, contextWindow: 1_000_000, isLastCall: true },
    })
    expect(next.inputTokens).toBe(230_000)
    expect(next.contextUsageIsEstimated).toBe(false)
  })

  test('没有 isLastCall 的累加值超过窗口：丢弃，不会显示 234%', () => {
    const prev = { ...base, inputTokens: 0, contextWindow: 1_000_000 }
    const next = applyAgentEvent(prev, {
      type: 'complete',
      usage: { inputTokens: 2_300_000, contextWindow: 1_000_000 },
    })
    expect(next.inputTokens ?? 0).toBeLessThanOrEqual(1_000_000)
  })

  test('没有 isLastCall 但已有流式真实值：保持流式值', () => {
    const prev = { ...base, inputTokens: 200_000, contextWindow: 1_000_000 }
    const next = applyAgentEvent(prev, {
      type: 'complete',
      usage: { inputTokens: 900_000, contextWindow: 1_000_000 },
    })
    expect(next.inputTokens).toBe(200_000)
  })

  test('只在 result 里给用量的渠道（流式不带 usage）：仍可兜底显示', () => {
    const prev = { ...base, contextWindow: 200_000 }
    const next = applyAgentEvent(prev, {
      type: 'complete',
      usage: { inputTokens: 50_000, contextWindow: 200_000 },
    })
    expect(next.inputTokens).toBe(50_000)
  })

  test('保留后端可信窗口标记和实际压缩点', () => {
    const next = applyAgentEvent(base, {
      type: 'usage_update',
      usage: { contextWindow: 372_000, contextWindowTrusted: true, compactionThresholdTokens: 297_600 },
    })
    expect(next.contextWindow).toBe(372_000)
    expect(next.contextWindowTrusted).toBe(true)
    expect(next.compactionThresholdTokens).toBe(297_600)
  })
})
