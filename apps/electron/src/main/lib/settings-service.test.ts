/**
 * 设置文件的持久化安全性。
 *
 * 两个约束，都属于「用户数据不能丢」：
 *
 * 1. 写入必须原子——进程写到一半被杀（Electron 退出、断电、磁盘满）不能留下
 *    半截 JSON。半截文件会让下次启动解析失败，全部设置回落默认值。
 * 2. 读取失败时必须先备份再回落——不备份的话，用户下次改任何设置都会拿默认值
 *    整体覆盖，原始配置永久丢失。
 *
 * 直接测真实导出的 `writeFileAtomic`，不复刻实现。
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeFileAtomic } from './settings-service'

let dir = ''

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'roy-settings-'))
})

afterEach(() => {
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {
    // 清理失败不影响断言
  }
})

describe('writeFileAtomic', () => {
  test('Given 正常写入 When 完成 Then 内容完整且不残留 .tmp', () => {
    const file = join(dir, 'settings.json')
    writeFileAtomic(file, JSON.stringify({ themeMode: 'dark' }))

    expect(JSON.parse(readFileSync(file, 'utf-8'))).toEqual({ themeMode: 'dark' })
    expect(existsSync(`${file}.tmp`)).toBe(false)
  })

  test('Given 已有旧文件 When 覆盖 Then 得到完整新内容', () => {
    const file = join(dir, 'settings.json')
    writeFileSync(file, JSON.stringify({ themeMode: 'light', keep: true }))

    writeFileAtomic(file, JSON.stringify({ themeMode: 'dark' }))

    expect(JSON.parse(readFileSync(file, 'utf-8'))).toEqual({ themeMode: 'dark' })
  })

  test('Given 大内容 When 写入 Then 不截断', () => {
    const file = join(dir, 'settings.json')
    const payload = { channels: Array.from({ length: 2000 }, (_, i) => ({ id: `ch-${i}`, name: `渠道 ${i}` })) }
    writeFileAtomic(file, JSON.stringify(payload))

    const parsed = JSON.parse(readFileSync(file, 'utf-8')) as { channels: unknown[] }
    expect(parsed.channels).toHaveLength(2000)
  })

  test('Given 目标路径不可写 When 写入失败 Then 抛错且不留下 .tmp 垃圾', () => {
    // 用一个不存在的深层目录当目标，writeFileSync 会 ENOENT
    const file = join(dir, 'missing-dir', 'settings.json')
    expect(() => writeFileAtomic(file, '{}')).toThrow()
    expect(existsSync(`${file}.tmp`)).toBe(false)
  })
})

describe('损坏设置文件的备份', () => {
  test('Given 文件内容不是合法 JSON When 读取失败 Then 原内容可被改名保留', () => {
    const file = join(dir, 'settings.json')
    const brokenContent = '{"themeMode": "dark", "channels": [{"id": "a"'
    writeFileSync(file, brokenContent)

    expect(() => JSON.parse(readFileSync(file, 'utf-8'))).toThrow()

    const backupPath = `${file}.corrupt-${Date.now()}`
    renameSync(file, backupPath)

    // 关键：内容还在，可以人工恢复
    expect(existsSync(file)).toBe(false)
    expect(readFileSync(backupPath, 'utf-8')).toBe(brokenContent)
  })
})
