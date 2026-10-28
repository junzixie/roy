import { describe, expect, test } from 'bun:test'
import { isOfficialDeepSeekBaseUrl, parseRelayBilling, relayBillingBase } from './balance-schemes'

describe('DeepSeek 官方 / 中转站区分', () => {
  test('只有 deepseek.com 才走官方 /user/balance', () => {
    expect(isOfficialDeepSeekBaseUrl('https://api.deepseek.com/v1')).toBe(true)
    expect(isOfficialDeepSeekBaseUrl('https://api.deepseek.com')).toBe(true)
    expect(isOfficialDeepSeekBaseUrl('https://api.pleasure2ai.top/v1')).toBe(false)
    expect(isOfficialDeepSeekBaseUrl('https://www.sub-coco.org')).toBe(false)
    expect(isOfficialDeepSeekBaseUrl('https://deepseek.com.evil.example')).toBe(false)
    expect(isOfficialDeepSeekBaseUrl('不是网址')).toBe(false)
  })

  test('中转站额度接口基址：保留或补上 /v1', () => {
    expect(relayBillingBase('https://api.pleasure2ai.top/v1')).toBe('https://api.pleasure2ai.top/v1')
    expect(relayBillingBase('https://api.pleasure2ai.top/v1/')).toBe('https://api.pleasure2ai.top/v1')
    expect(relayBillingBase('https://www.sub-coco.org')).toBe('https://www.sub-coco.org/v1')
  })
})

describe('中转站额度解析', () => {
  test('总额度 + 已用（美分）算出剩余', () => {
    expect(parseRelayBilling({ hard_limit_usd: 50 }, { total_usage: 1250 })).toEqual({
      unlimited: false, limit: 50, used: 12.5, remaining: 37.5,
    })
  })

  test('拿不到已用：只给总额度，不猜剩余', () => {
    expect(parseRelayBilling({ hard_limit_usd: 20 }, undefined)).toEqual({
      unlimited: false, limit: 20, used: undefined, remaining: undefined,
    })
  })

  test('超大额度视为不限额', () => {
    expect(parseRelayBilling({ hard_limit_usd: 100_000_000 }, { total_usage: 5 })?.unlimited).toBe(true)
  })

  test('没有总额度字段（比如返回的是网页或别的结构）：返回 undefined', () => {
    expect(parseRelayBilling({ object: 'list' }, { total_usage: 5 })).toBeUndefined()
    expect(parseRelayBilling(undefined, undefined)).toBeUndefined()
  })
})
