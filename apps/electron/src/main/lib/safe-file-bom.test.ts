/**
 * 配置文件必须能读带 UTF-8 BOM 的内容。
 *
 * 触发场景很常见：用户用 Windows 记事本打开 settings.json / channels.json
 * 改个值再保存，记事本会写入 UTF-8 BOM（EF BB BF → U+FEFF）。
 * `JSON.parse` 不认 BOM，直接抛 "Unexpected token '﻿'"。
 *
 * 后果不是「报个错」这么轻：读失败的调用方普遍 catch 后回落成空配置，
 * 用户会以为模型、渠道、设置全丢了。日志里这条错误已出现 13 次，都是这个原因。
 *
 * BOM 对 JSON 只是编码标记，语义上应该被忽略。
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseJsonText } from './safe-file'

const BOM = '\uFEFF'

let dir = ''
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'roy-bom-'))
})
afterEach(() => {
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {
    // 清理失败不影响断言
  }
})

describe('parseJsonText 去 BOM', () => {
  test('无 BOM 正常解析', () => {
    expect(parseJsonText<{ a: number }>('{"a":1}')).toEqual({ a: 1 })
  })

  test('带 BOM 也能解析', () => {
    expect(parseJsonText<{ a: number }>(`${BOM}{"a":1}`)).toEqual({ a: 1 })
  })

  test('BOM + 中文内容', () => {
    expect(parseJsonText<{ name: string }>(`${BOM}{"name":"渠道一"}`)).toEqual({ name: '渠道一' })
  })

  test('BOM + 前导换行（记事本另存为常见形态）', () => {
    expect(parseJsonText<{ a: number }>(`${BOM}\n{"a":1}`)).toEqual({ a: 1 })
  })

  test('真实文件：带 BOM 写入后读取', () => {
    const file = join(dir, 'channels.json')
    // 用 Buffer 明确写入 EF BB BF，模拟记事本行为
    writeFileSync(file, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('{"version":2,"channels":[]}')]))
    const text = readFileSync(file, 'utf-8')
    expect(text.charCodeAt(0)).toBe(0xfeff)
    expect(parseJsonText<{ version: number; channels: unknown[] }>(text)).toEqual({ version: 2, channels: [] })
  })

  test('对照：不去 BOM 时确实会失败（证明这个修复不是多余的）', () => {
    expect(() => JSON.parse(`${BOM}{"a":1}`)).toThrow()
  })

  test('内容本身非法时仍然抛错（不掩盖真错误）', () => {
    expect(() => parseJsonText('{broken')).toThrow()
    expect(() => parseJsonText(`${BOM}{broken`)).toThrow()
  })

  test('空字符串仍然抛错', () => {
    expect(() => parseJsonText('')).toThrow()
  })
})
