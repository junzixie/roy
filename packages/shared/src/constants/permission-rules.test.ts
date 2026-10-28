import { describe, expect, test } from 'bun:test'
import {
  hasDangerousStructure,
  isDangerousCommand,
  isLookOnlyBashCommand,
  isSafeBashCommand,
} from './permission-rules'

describe('permission-rules look-only / safe bash', () => {
  test('Windows 诊断命令可识别为 look-only 与 safe', () => {
    expect(isLookOnlyBashCommand('tasklist')).toBe(true)
    expect(isSafeBashCommand('ipconfig /all')).toBe(true)
    expect(isLookOnlyBashCommand('Get-Process')).toBe(true)
  })

  test('管道与重定向不算 look-only', () => {
    expect(isLookOnlyBashCommand('tasklist | findstr chrome')).toBe(false)
    expect(isSafeBashCommand('ls > out.txt')).toBe(false)
    expect(hasDangerousStructure('echo hi; rm -rf /')).toBe(true)
  })

  test('危险前缀仍命中', () => {
    expect(isDangerousCommand('rm -rf tmp')).toBe(true)
    expect(isDangerousCommand('git push origin main')).toBe(true)
  })
})