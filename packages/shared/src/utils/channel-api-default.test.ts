import { describe, expect, test } from 'bun:test'
import { defaultNewChannelSetup, inferChannelApi } from './channel-api'
import { inferReasoningTransport } from '../types/reasoning-profile'

describe('新建渠道默认协议', () => {
  test('Claude 仍默认 Anthropic Messages', () => {
    expect(defaultNewChannelSetup('anthropic', 'https://api.anthropic.com').api).toBe('anthropic-messages')
    expect(defaultNewChannelSetup('anthropic-compatible', '').api).toBe('anthropic-messages')
  })
  test('DeepSeek 等默认 Chat Completions，并换成对应地址', () => {
    expect(defaultNewChannelSetup('deepseek', 'https://api.deepseek.com/anthropic')).toEqual({ api: 'chat-completions', baseUrl: 'https://api.deepseek.com/v1' })
    expect(defaultNewChannelSetup('kimi-api', 'x').api).toBe('chat-completions')
    expect(defaultNewChannelSetup('zhipu', 'https://open.bigmodel.cn/api/paas/v4')).toEqual({ api: 'chat-completions', baseUrl: 'https://open.bigmodel.cn/api/paas/v4' })
    expect(defaultNewChannelSetup('openai', 'https://api.openai.com/v1').api).toBe('chat-completions')
  })
  test('Responses 供应商保持 Responses', () => {
    expect(defaultNewChannelSetup('openai-responses', 'https://api.openai.com/v1').api).toBe('responses')
  })
  test('存量渠道推导不变', () => {
    expect(inferChannelApi('deepseek')).toBe('anthropic-messages')
  })
  test('思考参数按渠道实际协议走', () => {
    expect(inferReasoningTransport('deepseek')).toBe('anthropic-messages')
    expect(inferReasoningTransport('deepseek', 'chat-completions')).toBe('openai-completions')
  })
})
