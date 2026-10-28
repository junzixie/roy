import { describe, expect, mock, test } from 'bun:test'
import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'roy-gmem-'))
mock.module('./config-paths', () => ({ getConfigDir: () => dir }))
const m = await import('./global-memory')

describe('全局长期记忆', () => {
  test('追加带日期的条目，自动建文件', () => {
    m.appendGlobalMemory('用户叫小罗，回复用中文、简洁', new Date(2026, 9, 26))
    const text = readFileSync(m.globalMemoryPath(), 'utf8')
    expect(text).toContain('# 全局记忆')
    expect(text).toContain('- 用户叫小罗，回复用中文、简洁（2026-10-26）')
  })
  test('覆盖写入前留 .bak', () => {
    m.writeGlobalMemory('# 全局记忆\n- 新内容')
    expect(existsSync(`${m.globalMemoryPath()}.bak`)).toBe(true)
    expect(m.readGlobalMemory().content).toBe('# 全局记忆\n- 新内容\n')
  })
  test('拒绝敏感信息和超长内容', () => {
    expect(() => m.appendGlobalMemory('我的 key 是 sk-abcdefghijklmnopqrstuvwx')).toThrow(/API Key/)
    expect(() => m.appendGlobalMemory('邮箱密码：hunter22')).toThrow(/密码/)
    expect(() => m.writeGlobalMemory('x'.repeat(m.GLOBAL_MEMORY_MAX_CHARS + 10))).toThrow(/最多/)
  })
  test('提示词段包含内容，过长时截断', () => {
    m.writeGlobalMemory('# 全局记忆\n- 偏好 A')
    expect(m.buildGlobalMemoryPromptSection()).toContain('- 偏好 A')
    m.writeGlobalMemory('# 全局记忆\n' + '- 很长的偏好\n'.repeat(600))
    expect(m.buildGlobalMemoryPromptSection()).toContain('后面还有')
  })
})
