import { describe, expect, test } from 'bun:test'
import type { AssistantMessage, AssistantMessageEvent } from '@earendil-works/pi-ai'
import { splitLeakedThinkingTag, withLeakedThinkingTagSplit } from './leaked-thinking-tag'

function message(content: unknown[]): AssistantMessage {
  return { role: 'assistant', content, stopReason: 'stop' } as unknown as AssistantMessage
}

describe('splitLeakedThinkingTag', () => {
  test('正文全写在推理里时，标签后的内容挪成正文', () => {
    const fixed = splitLeakedThinkingTag(message([
      { type: 'thinking', thinking: '先确认结构。\n\n写。</thinking>\n#### 结论\n\n你早就有界面了。', thinkingSignature: 'reasoning_content' },
    ]))
    expect(fixed.content).toEqual([
      { type: 'thinking', thinking: '先确认结构。\n\n写。', thinkingSignature: 'reasoning_content' },
      { type: 'text', text: '#### 结论\n\n你早就有界面了。' },
    ])
  })

  test('工具调用前的说明也挪成正文，且排在 toolCall 之前', () => {
    const toolCall = { type: 'toolCall' as const, id: 't1', name: 'bash', arguments: {} }
    const fixed = splitLeakedThinkingTag(message([
      { type: 'thinking', thinking: '值得再跑一个统计。</think>\n我统计一下分布。' },
      toolCall,
    ]))
    expect(fixed.content).toEqual([
      { type: 'thinking', thinking: '值得再跑一个统计。' },
      { type: 'text', text: '我统计一下分布。' },
      toolCall,
    ])
  })

  test('已有正文时不拆，标签后的写作计划不能暴露给用户', () => {
    const original = message([
      { type: 'thinking', thinking: '计划。</thinking>要开始写了：1. 2. 3.' },
      { type: 'text', text: '正式回答' },
    ])
    expect(splitLeakedThinkingTag(original)).toBe(original)
  })

  test('没有标签或标签后为空时保持原引用', () => {
    const plain = message([{ type: 'thinking', thinking: '普通推理' }])
    const trailing = message([{ type: 'thinking', thinking: '推理结束</thinking>\n  ' }])
    expect(splitLeakedThinkingTag(plain)).toBe(plain)
    expect(splitLeakedThinkingTag(trailing)).toBe(trailing)
  })
})

describe('withLeakedThinkingTagSplit', () => {
  test('done 事件和 result() 都拿到修正后的消息，增量原样转发', async () => {
    const final = message([{ type: 'thinking', thinking: '想完了</thinking>回答' }])
    const events: AssistantMessageEvent[] = [
      { type: 'thinking_delta', contentIndex: 0, delta: '想完了', partial: final } as AssistantMessageEvent,
      { type: 'done', reason: 'stop', message: final } as AssistantMessageEvent,
    ]
    const source = {
      async *[Symbol.asyncIterator]() { yield* events },
      result: async () => final,
    }
    const stream = await withLeakedThinkingTagSplit((() => source) as (model: never, context: never) => typeof source)(
      undefined as never,
      undefined as never,
    )
    const seen: AssistantMessageEvent[] = []
    for await (const event of stream) seen.push(event)
    expect(seen[0]).toBe(events[0]!)
    const done = seen[1] as Extract<AssistantMessageEvent, { type: 'done' }>
    expect(done.message.content).toEqual([
      { type: 'thinking', thinking: '想完了' },
      { type: 'text', text: '回答' },
    ])
    expect(await stream.result()).toBe(done.message)
  })
})
