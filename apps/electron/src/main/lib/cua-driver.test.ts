import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { expectedSha256, findCuaDriver } from './cua-driver'

describe('Cua Driver 查找与校验', () => {
  test('非 Windows 不启用', () => {
    expect(findCuaDriver({ platform: 'darwin', exists: () => true })).toBeNull()
  })

  test('官方安装位置优先，其次 PATH', () => {
    const hit = findCuaDriver({ platform: 'win32', path: 'C:\\tools', exists: (p) => p.includes('Programs') && p.includes('Cua') })
    expect(hit?.endsWith(join('Cua', 'cua-driver', 'bin', 'cua-driver.exe'))).toBe(true)
    const fromPath = findCuaDriver({ platform: 'win32', path: 'C:\\tools', exists: (p) => p.startsWith('C:\\tools') })
    expect(fromPath).toBe(join('C:\\tools', 'cua-driver.exe'))
    expect(findCuaDriver({ platform: 'win32', path: '', exists: () => false })).toBeNull()
  })

  test('从 SHA256SUMS 取对应文件的哈希', () => {
    const sums = 'aa'.repeat(32) + '  other.zip\n' + '109ab57e5c0a6e13a73e2ce2daf01b338027366eb1a20c6e0b413a10610bc8e2  cua-driver-rs-0.37.0-windows-x86_64.zip\n'
    expect(expectedSha256(sums, 'cua-driver-rs-0.37.0-windows-x86_64.zip')).toBe('109ab57e5c0a6e13a73e2ce2daf01b338027366eb1a20c6e0b413a10610bc8e2')
    expect(expectedSha256(sums, 'missing.zip')).toBeNull()
  })
})
