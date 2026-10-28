import { describe, expect, test } from 'bun:test'
import { titleProviderFor } from './title-provider'

describe('起标题跟渠道协议走', () => {
  test('显式协议优先', () => {
    expect(titleProviderFor('deepseek', 'chat-completions')).toBe('openai')
    expect(titleProviderFor('deepseek', 'responses')).toBe('openai-responses')
  })
  test('没选协议或选 anthropic 时用供应商默认', () => {
    expect(titleProviderFor('deepseek')).toBe('deepseek')
    expect(titleProviderFor('anthropic', 'anthropic-messages')).toBe('anthropic')
  })
})
