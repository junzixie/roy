import { describe, expect, mock, test } from 'bun:test'

const sessionMessages: unknown[] = []
mock.module('./agent-session-manager', () => ({
  getAgentSessionSDKMessages: () => sessionMessages,
  getAgentSessionMeta: () => undefined,
}))

const { mapAgentErrorToTypedError } = await import('./agent-error-utils')
const { buildContextPrompt } = await import('./agent-session-context-prompt')

const CLOUDFLARE_502 = '502 {"type":"https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/error-502/","title":"Error 502: Bad gateway","status":502,"detail":"The origin web server returned an invalid or incomplete response to Cloudflare.","error_code":502,"error_name":"origin_bad_gateway","cloudflare_error":true}'

describe('错误标题', () => {
  test('Cloudflare 502 识别为网关异常，不再显示服务繁忙', () => {
    const error = mapAgentErrorToTypedError('provider_error', CLOUDFLARE_502, CLOUDFLARE_502)
    expect(error.title).toBe('网关异常')
    expect(error.canRetry).toBe(true)
  })
  test('真正的过载仍是服务繁忙', () => {
    expect(mapAgentErrorToTypedError('overloaded', 'overloaded', 'overloaded').title).toBe('服务繁忙')
  })
})

describe('历史回填', () => {
  test('Roy 插入的错误卡片不回填给模型', () => {
    sessionMessages.length = 0
    sessionMessages.push(
      { type: 'user', message: { content: [{ type: 'text', text: '你好' }] } },
      { type: 'assistant', message: { content: [{ type: 'text', text: `网关异常: ${CLOUDFLARE_502}` }] }, _errorCode: 'service_error' },
      { type: 'assistant', message: { content: [{ type: 'text', text: '正常回复' }] } },
      { type: 'user', message: { content: [{ type: 'text', text: '当前消息' }] } },
    )
    const prompt = buildContextPrompt('s1', '当前消息')
    expect(prompt).toContain('正常回复')
    expect(prompt).not.toContain('网关异常')
    expect(prompt).not.toContain('cloudflare')
  })
})
