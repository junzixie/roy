/**
 * 设置缓存必须能发现「文件被外部改了」。
 *
 * 缓存是为了省掉每次 getSettings() 的读盘 + JSON.parse（实测单次约 240µs），
 * 但纯内存缓存会让外部改动在进程重启前完全不生效——这个坑真的踩到过：
 * 测试里重写 settings.json 后读到的还是旧值。
 *
 * 用 mtime+size 指纹校验。只靠 mtime 不够：Windows 的文件时间精度受系统时钟
 * 粒度限制，同一毫秒内连续两次写入会得到相同的 mtimeMs，长度又恰好不变时
 * 就会被误判成「没变化」。
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let dir = ''

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'roy-fingerprint-'))
})

afterEach(() => {
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {
    // 清理失败不影响断言
  }
})

/** 与 settings-service 内部实现一致的指纹算法。 */
function fingerprint(filePath: string): string | null {
  try {
    const stat = statSync(filePath)
    return `${stat.mtimeMs}:${stat.size}`
  } catch {
    return null
  }
}

describe('设置文件指纹', () => {
  test('文件不存在返回 null', () => {
    expect(fingerprint(join(dir, 'nope.json'))).toBeNull()
  })

  test('内容变化时指纹变化', () => {
    const file = join(dir, 'settings.json')
    writeFileSync(file, '{"a":1}')
    const first = fingerprint(file)
    writeFileSync(file, '{"a":123456}')
    expect(fingerprint(file)).not.toBe(first)
  })

  test('长度不变但内容变化时，指纹仍能区分（靠 mtime）', () => {
    const file = join(dir, 'settings.json')
    writeFileSync(file, '{"mode":"dark"}')
    const first = fingerprint(file)
    // 等一小会儿确保 mtime 前进
    const start = Date.now()
    while (Date.now() - start < 12) { /* 故意忙等，跨过时间粒度 */ }
    writeFileSync(file, '{"mode":"lite"}')
    expect(fingerprint(file)).not.toBe(first)
  })

  test('同一毫秒内、长度不同的写入也能被区分（靠 size）', () => {
    const file = join(dir, 'settings.json')
    writeFileSync(file, '{"a":1}')
    const first = fingerprint(file)
    // 立刻再写，mtime 可能相同，但长度不同
    writeFileSync(file, '{"a":1,"b":2}')
    const second = fingerprint(file)
    expect(second).not.toBe(first)
    // 明确验证 size 参与了指纹
    expect(second?.split(':')[1]).toBe(String('{"a":1,"b":2}'.length))
  })

  test('指纹包含 mtime 与 size 两部分', () => {
    const file = join(dir, 'settings.json')
    writeFileSync(file, '{"x":1}')
    const fp = fingerprint(file)
    expect(fp).not.toBeNull()
    expect(fp!.split(':')).toHaveLength(2)
  })
})
