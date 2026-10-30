import { describe, expect, test } from 'bun:test'
import { allowedChannelApis, sanitizeChannelApi } from './channel-api'

describe('供应商可选协议', () => {
  test('DeepSeek 不提供 Responses', () => {
    expect(allowedChannelApis('deepseek')).toEqual(['chat-completions', 'anthropic-messages'])
    expect(sanitizeChannelApi('deepseek', 'responses')).toBe('chat-completions')
    expect(sanitizeChannelApi('deepseek', 'anthropic-messages')).toBe('anthropic-messages')
    expect(sanitizeChannelApi('deepseek', undefined)).toBeUndefined()
  })
  test('其他供应商三种都可选', () => {
    expect(allowedChannelApis('custom')).toEqual(['chat-completions', 'responses', 'anthropic-messages'])
    expect(sanitizeChannelApi('custom', 'responses')).toBe('responses')
  })
})
