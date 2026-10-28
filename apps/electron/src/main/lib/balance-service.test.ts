import { describe, expect, test } from 'bun:test'
import { BALANCE_SCHEMES, balanceSchemeOf } from './balance-schemes'

describe('供应商余额方案', () => {
  test('DeepSeek 走 deepseek 方案', () => {
    expect(balanceSchemeOf('deepseek')).toBe('deepseek')
  })

  test('Kimi 的两种形态都走 moonshot 方案', () => {
    expect(balanceSchemeOf('kimi-api')).toBe('moonshot')
    expect(balanceSchemeOf('kimi-coding')).toBe('moonshot')
  })

  test('智谱系列都走 zai 方案', () => {
    expect(balanceSchemeOf('zhipu')).toBe('zai')
    expect(balanceSchemeOf('zhipu-coding')).toBe('zai')
    expect(balanceSchemeOf('zhipu-coding-team')).toBe('zai')
  })

  test('没有公开余额接口的供应商返回 null，不猜数字', () => {
    expect(balanceSchemeOf('anthropic')).toBeNull()
    expect(balanceSchemeOf('openai')).toBeNull()
    expect(balanceSchemeOf('google')).toBeNull()
    expect(balanceSchemeOf('custom')).toBeNull()
  })

  test('DeepSeek 响应解析：优先取 CNY 那条，并带上是否可用', () => {
    const view = BALANCE_SCHEMES.deepseek!.parse({
      is_available: true,
      balance_infos: [
        { currency: 'USD', total_balance: '1.00' },
        { currency: 'CNY', total_balance: '12.345', granted_balance: '2.00', topped_up_balance: '10.345' },
      ],
    })

    expect(view.isAvailable).toBe(true)
    expect(view.currency).toBe('CNY')
    expect(view.total).toBe('12.35')
    expect(view.granted).toBe('2')
    expect(view.toppedUp).toBe('10.35')
  })

  test('Kimi 响应解析：可用余额小于等于 0 时标记不可用', () => {
    const view = BALANCE_SCHEMES.moonshot!.parse({
      data: { available_balance: 0, cash_balance: 0, voucher_balance: 5, currency: 'CNY' },
    })

    expect(view.isAvailable).toBe(false)
    expect(view.total).toBe('0')
    expect(view.granted).toBe('5')
  })

  test('智谱响应解析：缺少 total_balance 时回退到 available_balance', () => {
    const view = BALANCE_SCHEMES.zai!.parse({
      data: { available_balance: 33, currency: 'CNY' },
    })

    expect(view.total).toBe('33')
    expect(view.isAvailable).toBe(true)
  })

  test('余额接口地址按 origin 拼，不受 baseUrl 末尾路径影响', () => {
    expect(BALANCE_SCHEMES.deepseek!.url('https://api.deepseek.com/v1')).toBe('https://api.deepseek.com/user/balance')
    expect(BALANCE_SCHEMES.moonshot!.url('https://api.moonshot.cn/v1')).toBe('https://api.moonshot.cn/v1/users/me/balance')
  })
})
