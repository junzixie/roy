import { describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { computeHitRate, createCacheLogExtension, findDivergence, SessionCacheLog } from './session-cache-log'

describe('findDivergence', () => {
  test('纯追加返回 -1', () => {
    expect(findDivergence(['a', 'b'], ['a', 'b', 'c']).index).toBe(-1)
  })

  test('中间某条字节变化返回该下标', () => {
    expect(findDivergence(['a', 'b', 'c'], ['a', 'x', 'c']).index).toBe(1)
  })

  test('历史变短返回新长度', () => {
    expect(findDivergence(['a', 'b', 'c'], ['a']).index).toBe(1)
  })

  test('完全相同返回 -1', () => {
    expect(findDivergence(['a'], ['a']).index).toBe(-1)
  })
})

describe('computeHitRate', () => {
  test('与 usage-summary 口径一致：cacheRead / 全部输入', () => {
    expect(computeHitRate({ input: 806, cacheRead: 41600, cacheWrite: 0 })).toBeCloseTo(0.9810, 3)
  })

  test('全空返回 undefined 而不是 0', () => {
    expect(computeHitRate({})).toBeUndefined()
  })
})

describe('SessionCacheLog', () => {
  test('逐请求落行，纯追加的第二轮 divergedAt=-1', () => {
    const dir = mkdtempSync(join(tmpdir(), 'roy-cache-log-'))
    const file = join(dir, 's.cache.jsonl')
    const log = new SessionCacheLog(file)
    const system = 'SYS'

    log.beginRequest({ model: 'm', systemPrompt: system, messages: [{ role: 'user', content: 'a' }] })
    log.complete({ input: 100, cacheRead: 0, output: 10 })

    log.beginRequest({
      model: 'm',
      systemPrompt: system,
      messages: [
        { role: 'user', content: 'a' },
        { role: 'assistant', content: 'b' },
        { role: 'user', content: 'c' },
      ],
    })
    log.complete({ input: 20, cacheRead: 400, output: 5 })

    const lines = readFileSync(file, 'utf8').trim().split('\n')
    expect(lines).toHaveLength(2)
    const first = JSON.parse(lines[0]!)
    const second = JSON.parse(lines[1]!)
    expect(first.seq).toBe(1)
    expect(second.divergedAt).toBe(-1)
    expect(second.hitRate).toBeCloseTo(0.9524, 3)
    expect(second.prefixHash).not.toBe(first.prefixHash)
  })

  test('改写历史时指向第一处差异', () => {
    const log = new SessionCacheLog()
    log.beginRequest({ systemPrompt: 'sys', messages: [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }] })
    log.complete({ input: 10, cacheRead: 90 })

    const record = log.beginRequest({
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'EDITED' }],
    })
    expect(record.divergedAt).toBe(1)
    expect(record.divergedRole).toBe('assistant')
  })

  test('没有 usage 的请求也记一行并带原因', () => {
    const dir = mkdtempSync(join(tmpdir(), 'roy-cache-log-'))
    const file = join(dir, 'a.cache.jsonl')
    const log = new SessionCacheLog(file)
    log.beginRequest({ messages: [{ role: 'user', content: 'a' }] })
    log.abandon('aborted')

    const parsed = JSON.parse(readFileSync(file, 'utf8').trim())
    expect(parsed.error).toBe('aborted')
    expect(parsed.hitRate).toBeUndefined()
  })

  test('路径不可写时不影响调用方', () => {
    const log = new SessionCacheLog(join(tmpdir(), 'definitely-missing-dir', 'x', 'y.cache.jsonl'))
    expect(() => {
      log.beginRequest({ messages: [{ role: 'user', content: 'a' }] })
      log.complete({ input: 1, cacheRead: 1 })
    }).not.toThrow()
  })
})

describe('createCacheLogExtension', () => {
  test('按 wire payload 记账：system 在 messages 里，工具定义变化单独标出', () => {
    const log = new SessionCacheLog()
    let handler: ((event: { payload: unknown }) => unknown) | undefined
    const fakePi = {
      on: (_name: string, fn: typeof handler) => { handler = fn },
    } as unknown as Parameters<ReturnType<typeof createCacheLogExtension>>[0]
    createCacheLogExtension(log, { mode: 'deepseek-spark' })(fakePi)

    const system = { role: 'system', content: 'SYS' }
    const user = { role: 'user', content: 'a' }
    expect(handler!({ payload: { model: 'deepseek-v4.1-flash', messages: [system, user], tools: [{ name: 'bash' }] } })).toBeUndefined()
    log.complete({ input: 100, cacheRead: 0 })

    handler!({ payload: { model: 'deepseek-v4.1-flash', messages: [system, user, { role: 'assistant', content: 'b' }], tools: [{ name: 'bash' }, { name: 'read' }] } })
    log.complete({ input: 100, cacheRead: 0 })
    const record = log.getLastRecord()!
    expect(record.model).toBe('deepseek-v4.1-flash')
    expect(record.mode).toBe('deepseek-spark')
    expect(record.divergedAt).toBe(-1)
    expect(record.toolsChanged).toBe(true)
    expect(record.systemChanged).toBeUndefined()

    handler!({ payload: { messages: [{ role: 'system', content: 'SYS2' }, user], tools: [{ name: 'bash' }, { name: 'read' }] } })
    log.complete({ input: 1 })
    expect(log.getLastRecord()!.systemChanged).toBe(true)
    expect(log.getLastRecord()!.divergedAt).toBe(0)
    expect(log.getLastRecord()!.divergedRole).toBe('system')
  })
})
