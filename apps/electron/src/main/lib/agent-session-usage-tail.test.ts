import { describe, expect, test } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readLinesFromTailForTest } from './agent-session-usage'

/**
 * 尾部倒读的正确性。
 *
 * 这里最容易错的两件事：
 * 1. 分块边界正好切在多字节 UTF-8 字符中间 —— 逐块 toString 会产生替换字符，
 *    把那一行 JSON 变成非法内容（中文会话里必然发生）；
 * 2. 被截断的半行被当成完整行解析 —— 同样会解析失败，且可能静默跳过真正需要的行。
 */
const dir = mkdtempSync(join(tmpdir(), 'roy-tail-'))
let seq = 0
const write = (content: string): string => {
  const p = join(dir, `f${seq++}.jsonl`)
  writeFileSync(p, content, 'utf8')
  return p
}

describe('尾部倒读', () => {
  test('返回顺序是从后往前', () => {
    const p = write(['a', 'b', 'c'].join('\n'))
    expect(readLinesFromTailForTest(p)).toEqual(['c', 'b', 'a'])
  })

  test('空文件返回空数组', () => {
    expect(readLinesFromTailForTest(write(''))).toEqual([])
  })

  test('忽略空行', () => {
    const p = write(['a', '', '  ', 'b', ''].join('\n'))
    expect(readLinesFromTailForTest(p)).toEqual(['b', 'a'])
  })

  test('单行无换行符', () => {
    expect(readLinesFromTailForTest(write('{"type":"result"}'))).toEqual(['{"type":"result"}'])
  })

  test('中文多字节字符跨块边界仍能正确解析', () => {
    // 构造大量中文行，让 64KB 边界必然落在某个汉字中间
    const line = JSON.stringify({ type: 'assistant', text: '中文内容'.repeat(20) })
    const lines = Array.from({ length: 2000 }, (_, i) => `${line}#${i}`)
    const p = write(lines.join('\n'))
    const got = readLinesFromTailForTest(p)
    // 最后一行必须完整（含结尾序号），且不含 UTF-8 替换字符
    expect(got[0]).toBe(`${line}#1999`)
    expect(got[0]).not.toContain('\uFFFD')
    // 所有返回行都必须是合法 JSON 前缀形态（以 { 开头，序号结尾）
    for (const l of got) {
      expect(l.startsWith('{')).toBe(true)
      expect(l).not.toContain('\uFFFD')
    }
  })

  test('超过 1MB 时只读尾部，不把整个文件读进来', () => {
    const line = JSON.stringify({ type: 'assistant', text: 'x'.repeat(200) })
    const lines = Array.from({ length: 20000 }, (_, i) => `${line}#${i}`)
    const p = write(lines.join('\n'))
    const got = readLinesFromTailForTest(p)
    // 尾部读取上限 1MB，每行约 220 字节 → 最多几千行，绝不可能拿到全部 2 万行
    expect(got.length).toBeLessThan(20000)
    expect(got.length).toBeGreaterThan(0)
    expect(got[0]).toBe(`${line}#19999`)
  })
})
