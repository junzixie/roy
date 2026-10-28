import { describe, expect, test } from 'bun:test'
import {
  buildChannelPreviewUrl,
  inferChannelApi,
  resolveChannelApi,
} from './channel-api'

describe('渠道请求协议', () => {
  test('Anthropic 系走 anthropic-messages', () => {
    expect(inferChannelApi('anthropic')).toBe('anthropic-messages')
    expect(inferChannelApi('anthropic-compatible')).toBe('anthropic-messages')
    expect(inferChannelApi('deepseek')).toBe('anthropic-messages')
    expect(inferChannelApi('kimi-api')).toBe('anthropic-messages')
  })

  test('OpenAI Responses 与 Codex 走 responses', () => {
    expect(inferChannelApi('openai-responses')).toBe('responses')
    expect(inferChannelApi('openai-codex')).toBe('responses')
  })

  test('其余默认 chat-completions', () => {
    expect(inferChannelApi('openai')).toBe('chat-completions')
    expect(inferChannelApi('custom')).toBe('chat-completions')
    expect(inferChannelApi('zhipu')).toBe('chat-completions')
    expect(inferChannelApi('google')).toBe('chat-completions')
  })

  test('显式 api 优先于 provider 推导', () => {
    expect(resolveChannelApi({ provider: 'openai', api: 'anthropic-messages' })).toBe('anthropic-messages')
    // 没填 api 时回退到 provider 推导，保证存量渠道行为不变
    expect(resolveChannelApi({ provider: 'openai' })).toBe('chat-completions')
    expect(resolveChannelApi({ provider: 'deepseek' })).toBe('anthropic-messages')
  })

  test('实际请求地址按协议拼接，并去掉 baseURL 尾部斜杠', () => {
    expect(buildChannelPreviewUrl('https://api.deepseek.com/v1/', 'chat-completions'))
      .toBe('https://api.deepseek.com/v1/chat/completions')
    expect(buildChannelPreviewUrl('https://api.openai.com/v1', 'responses'))
      .toBe('https://api.openai.com/v1/responses')
  })

  test('Anthropic 协议在 baseURL 已带 /v1 时不再重复插入', () => {
    expect(buildChannelPreviewUrl('https://api.anthropic.com/v1', 'anthropic-messages'))
      .toBe('https://api.anthropic.com/v1/messages')
    expect(buildChannelPreviewUrl('https://api.anthropic.com', 'anthropic-messages'))
      .toBe('https://api.anthropic.com/v1/messages')
  })

  test('baseURL 为空时返回空串，不拼出裸路径', () => {
    expect(buildChannelPreviewUrl('   ', 'chat-completions')).toBe('')
  })
})
