import { describe, expect, test } from 'bun:test'
import { formatProValidity, isLifetimePro } from './pro-expiry'

describe('Pro 到期显示', () => {
  test('服务器永久授权（3000-01-01）显示永久有效', () => {
    const lifetime = Date.UTC(3000, 0, 1)
    expect(isLifetimePro(lifetime)).toBe(true)
    expect(formatProValidity(lifetime)).toBe('永久有效')
  })

  test('普通到期时间显示日期，没有到期时间返回空', () => {
    const t = Date.UTC(2027, 0, 15)
    expect(isLifetimePro(t)).toBe(false)
    expect(formatProValidity(t)).toBe(`有效期到 ${new Date(t).toLocaleDateString('zh-CN')}`)
    expect(formatProValidity(null)).toBe('')
  })
})
