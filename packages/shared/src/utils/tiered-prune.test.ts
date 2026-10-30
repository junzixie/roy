/**
 * 分级瘦身（对照 DSH 的 compaction/prune）。
 *
 * 实测背景：DSH 单个会话里 compaction/prune 出现 35 次、22 次、15 次，
 * 而真正调 LLM 摘要的 compaction/start 只有 1–6 次。它主要靠裁剪历史工具输出
 * 控制体积，而不是频繁重写历史。
 *
 * Roy 侧实测：~/.roy/agent-sessions 里单条工具结果最大 85,171 字符，
 * 超 12000 的部分占会话工具输出总量的 10%–60%。
 */

import { describe, expect, test } from 'bun:test'
import {
  PI_TIERED_PRUNE_OLD_CHARS,
  estimatePiMessagesChars,
  pruneToolResultsTiered,
} from './pi-compaction'

function toolResult(text: string) {
  return { role: 'toolResult' as const, content: text }
}
function user(text: string) {
  return { role: 'user' as const, content: text }
}

/** 造 n 条超长工具结果 */
function makeResults(n: number, chars: number) {
  return Array.from({ length: n }, (_, i) => toolResult(`${i}:` + 'x'.repeat(chars)))
}

describe('estimatePiMessagesChars', () => {
  test('累加字符串长度', () => {
    expect(estimatePiMessagesChars([user('abc'), toolResult('de')])).toBe(5)
  })

  test('跳过 uuid/timestamp 等元数据，不把元数据算成体积', () => {
    const withMeta = [{ role: 'user', content: 'hi', uuid: 'x'.repeat(100), timestamp: 1234567890 }]
    const withoutMeta = [{ role: 'user', content: 'hi' }]
    expect(estimatePiMessagesChars(withMeta)).toBe(estimatePiMessagesChars(withoutMeta))
  })

  test('空数组为 0', () => {
    expect(estimatePiMessagesChars([])).toBe(0)
  })

  test('处理嵌套结构不崩', () => {
    const nested = [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }]
    expect(estimatePiMessagesChars(nested)).toBeGreaterThan(0)
  })
})

describe('pruneToolResultsTiered', () => {
  test('工具结果太少时完全不动', () => {
    const msgs = makeResults(3, 50_000)
    const r = pruneToolResultsTiered(msgs, { recentKeep: 6 })
    expect(r.changed).toBe(false)
    expect(r.messages).toBe(msgs) // 引用相等，调用方可零开销短路
  })

  test('最近几条保持原样', () => {
    const msgs = makeResults(10, 20_000)
    const r = pruneToolResultsTiered(msgs, { recentKeep: 3, midChars: 1000, oldChars: 200 })
    // 最后 3 条原样
    for (let i = 7; i < 10; i++) {
      expect(r.messages[i]!.content).toBe(msgs[i]!.content)
    }
  })

  test('越早的消息裁得越狠', () => {
    const msgs = makeResults(10, 20_000)
    const r = pruneToolResultsTiered(msgs, { recentKeep: 2, midChars: 1000, oldChars: 200 })
    const oldLen = (r.messages[0]!.content as string).length
    const midLen = (r.messages[7]!.content as string).length
    expect(oldLen).toBeLessThan(midLen)
    expect(oldLen).toBeLessThanOrEqual(200 + 200) // 截断标记会加一点长度
  })

  test('未超限的消息不改动', () => {
    // 每条都很短，即使过了 recentKeep 也不该被裁
    const msgs = makeResults(10, 10)
    const r = pruneToolResultsTiered(msgs, { recentKeep: 2, midChars: 12_000, oldChars: 3_000 })
    expect(r.changed).toBe(false)
    expect(r.prunedCount).toBe(0)
  })

  test('非工具消息永远不动', () => {
    const msgs = [
      user('u'.repeat(100_000)),
      ...makeResults(8, 50_000),
    ]
    const r = pruneToolResultsTiered(msgs, { recentKeep: 1, midChars: 500, oldChars: 100 })
    expect(r.messages[0]!.content).toBe(msgs[0]!.content)
  })

  test('统计被裁剪的条数', () => {
    const msgs = makeResults(10, 20_000)
    const r = pruneToolResultsTiered(msgs, { recentKeep: 2, midChars: 1000, oldChars: 200 })
    // 10 条里后 2 条不动，前 8 条被裁
    expect(r.prunedCount).toBe(8)
  })

  test('默认参数下 3 万字符的老消息会被裁到 OLD_CHARS 量级', () => {
    const msgs = makeResults(20, 30_000)
    const r = pruneToolResultsTiered(msgs)
    const firstLen = (r.messages[0]!.content as string).length
    expect(firstLen).toBeLessThan(PI_TIERED_PRUNE_OLD_CHARS * 2)
  })

  test('保留原有内容的前缀，便于模型识别是哪次工具调用', () => {
    const msgs = makeResults(10, 20_000)
    const r = pruneToolResultsTiered(msgs, { recentKeep: 1, midChars: 1000, oldChars: 200 })
    // 头部保留，说明截断是从中间省的
    expect((r.messages[0]!.content as string).startsWith('0:')).toBe(true)
  })
})
