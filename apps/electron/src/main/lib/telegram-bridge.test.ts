import { describe, expect, mock, test } from 'bun:test'

mock.module('electron', () => ({ safeStorage: { isEncryptionAvailable: () => false } }))
mock.module('./bridge-command-handler', () => ({ BridgeCommandHandler: class {} }))
mock.module('./bridge-binding-store', () => ({ createJsonBridgeChatBindingStore: () => ({}) }))
const { splitTelegramText } = await import('./telegram-bridge')

describe('Telegram 分段', () => {
  test('短消息不分段', () => {
    expect(splitTelegramText('你好')).toEqual(['你好'])
  })
  test('长消息按换行处断开，每段不超过上限', () => {
    const text = Array.from({ length: 300 }, (_, i) => `第 ${i} 行内容内容内容`).join('\n')
    const parts = splitTelegramText(text, 1000)
    expect(parts.length).toBeGreaterThan(1)
    expect(parts.every((p) => p.length <= 1000)).toBe(true)
    expect(parts.join('\n')).toBe(text)
  })
})
