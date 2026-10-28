import { describe, expect, test } from 'bun:test'
import { piUserMessageText, takeDeliveredQueuedMessage, type PendingQueuedUserMessage } from './queued-user-message-delivery'

describe('运行中插话送达识别', () => {
  test('按文本匹配并移出待送达列表', () => {
    const pending: PendingQueuedUserMessage[] = [
      { uuid: 'a', text: '先别改数据库' },
      { uuid: 'b', text: '顺便把测试也跑一下' },
    ]
    expect(takeDeliveredQueuedMessage(pending, '顺便把测试也跑一下')).toBe('b')
    expect(pending.map((p) => p.uuid)).toEqual(['a'])
  })

  test('首轮 prompt 不在列表里时不匹配', () => {
    const pending: PendingQueuedUserMessage[] = [{ uuid: 'a', text: '先别改数据库' }]
    expect(takeDeliveredQueuedMessage(pending, '帮我整理一下这个项目')).toBeUndefined()
    expect(pending).toHaveLength(1)
  })

  test('Pi 追加了环境块时仍能匹配', () => {
    const pending: PendingQueuedUserMessage[] = [{ uuid: 'a', text: '<skill name="x">...</skill>\n\n先别改数据库' }]
    expect(takeDeliveredQueuedMessage(pending, '<context>浏览器</context>\n<skill name="x">...</skill>\n\n先别改数据库')).toBe('a')
  })

  test('读取字符串和 text 块两种内容', () => {
    expect(piUserMessageText({ content: 'hi' })).toBe('hi')
    expect(piUserMessageText({ content: [{ type: 'text', text: 'a' }, { type: 'image', data: '' }, { type: 'text', text: 'b' }] })).toBe('a\nb')
    expect(piUserMessageText(undefined)).toBe('')
  })
})
