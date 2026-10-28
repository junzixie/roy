import { describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { appendLogLine, formatLogLine } from './file-logger'

describe('主进程日志落盘', () => {
  test('格式化时带级别并脱敏 token', () => {
    const line = formatLogLine('error', ['请求失败', { authorization: 'Bearer abc.def' }, 'apiKey=sk-123'], new Date(2026, 9, 25, 8, 5, 3, 7))
    expect(line.startsWith('[2026-10-25 08:05:03.007] [ERROR] 请求失败')).toBe(true)
    expect(line).not.toContain('sk-123')
    expect(line).not.toContain('abc.def')
  })

  test('超过上限时轮转为 main.old.log', () => {
    const dir = mkdtempSync(join(tmpdir(), 'roy-log-'))
    writeFileSync(join(dir, 'main.log'), 'x'.repeat(95))
    appendLogLine(dir, 'new line\n', 100)
    expect(readFileSync(join(dir, 'main.old.log'), 'utf8')).toBe('x'.repeat(95))
    expect(readFileSync(join(dir, 'main.log'), 'utf8')).toBe('new line\n')
  })

  test('未超限时直接追加', () => {
    const dir = mkdtempSync(join(tmpdir(), 'roy-log-'))
    appendLogLine(dir, 'a\n', 100)
    appendLogLine(dir, 'b\n', 100)
    expect(readFileSync(join(dir, 'main.log'), 'utf8')).toBe('a\nb\n')
    expect(existsSync(join(dir, 'main.old.log'))).toBe(false)
  })
})
