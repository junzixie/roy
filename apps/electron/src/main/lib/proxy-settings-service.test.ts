import { describe, expect, test } from 'bun:test'
import { redactProxyUrl, normalizeProxyConfig } from './proxy-settings-service'

describe('proxy settings logging', () => {
  test('Given an authenticated proxy URL When formatting it for logs Then redacts both username and password', () => {
    const value = redactProxyUrl('http://alice:secret@127.0.0.1:7890')

    expect(value).not.toContain('alice')
    expect(value).not.toContain('secret')
    expect(value).toContain('127.0.0.1:7890')
  })

  test('Given a malformed proxy URL When formatting it for logs Then never returns the original value', () => {
    expect(redactProxyUrl('alice:secret@not a url')).toBe('[invalid proxy URL]')
  })
})

 describe('proxy defaults', () => {
  test('missing settings follow system', () => {
    expect(normalizeProxyConfig(undefined)).toEqual({ enabled: true, mode: 'system', manualUrl: '' })
    expect(normalizeProxyConfig({})).toEqual(normalizeProxyConfig(undefined))
  })
  test('explicit disable is retained', () => {
    expect(normalizeProxyConfig({ enabled: false }).enabled).toBe(false)
  })
  test('manual settings are retained', () => {
    expect(normalizeProxyConfig({ enabled: true, mode: 'manual', manualUrl: 'http://proxy.example:8080' })).toEqual({ enabled: true, mode: 'manual', manualUrl: 'http://proxy.example:8080' })
  })
  test('malformed values use safe defaults', () => {
    expect(normalizeProxyConfig(null)).toEqual(normalizeProxyConfig(undefined))
    expect(normalizeProxyConfig({ enabled: 'false', mode: 'bad', manualUrl: 12 })).toEqual(normalizeProxyConfig(undefined))
  })
})
