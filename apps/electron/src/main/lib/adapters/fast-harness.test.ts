import { describe, expect, test } from 'bun:test'
import { Type } from 'typebox'
import type { ToolDefinition } from '@earendil-works/pi-coding-agent'
import { FastHarness } from './fast-harness'

function tool(execute: ToolDefinition['execute'], name = 'read'): ToolDefinition {
  return { name, label: name, description: name, parameters: Type.Object({}), execute }
}
const ok = async () => ({ content: [{ type: 'text' as const, text: 'ok' }], details: {} })
function invoke(def: ToolDefinition, params: Record<string, unknown> = {}, signal?: AbortSignal) {
  return def.execute('test', params, signal, undefined, {} as Parameters<ToolDefinition['execute']>[4])
}
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

describe('快速模式增强', () => {
  test('仅可信内置只读工具可并行，关闭开关时全部串行', () => {
    const h = new FastHarness({ metrics: false })
    expect(h.wrap(tool(ok), true).executionMode).toBe('parallel')
    expect(h.wrap(tool(ok), false).executionMode).toBe('sequential')
    expect(new FastHarness({ parallel: false }).wrap(tool(ok), true).executionMode).toBe('sequential')
  })
  test('独立读取同时执行但最多四个', async () => {
    let active = 0, peak = 0
    const h = new FastHarness({ metrics: false })
    const wrapped = h.wrap(tool(async () => { active++; peak = Math.max(active, peak); await sleep(15); active--; return ok() }), true)
    await Promise.all(Array.from({ length: 12 }, (_, n) => invoke(wrapped, { n })))
    expect(peak).toBe(4)
    expect(active).toBe(0)
  })
  test('并发相同参数仅执行两次失败，参数键顺序不影响拦截', async () => {
    let count = 0
    const h = new FastHarness({ metrics: false })
    const wrapped = h.wrap(tool(async () => { count++; throw new Error('失败') }), true)
    const results = await Promise.allSettled([
      invoke(wrapped, { a: 1, b: 2 }), invoke(wrapped, { b: 2, a: 1 }), invoke(wrapped, { a: 1, b: 2 }),
    ])
    expect(count).toBe(2)
    expect(results.every((r) => r.status === 'rejected')).toBe(true)
    h.resetFailures()
    await expect(invoke(wrapped, { a: 1, b: 2 })).rejects.toThrow('失败')
    expect(count).toBe(3)
  })
  test('成功与变更参数允许继续执行', async () => {
    let count = 0
    const h = new FastHarness({ metrics: false })
    const wrapped = h.wrap(tool(async () => { count++; if (count === 1) throw new Error('失败'); return ok() }), true)
    await expect(invoke(wrapped)).rejects.toThrow()
    await invoke(wrapped); await invoke(wrapped); await invoke(wrapped, { changed: true })
    expect(count).toBe(4)
  })
  test('关闭重复防护仍保留原失败语义', async () => {
    let count = 0
    const wrapped = new FastHarness({ repeatGuard: false, metrics: false }).wrap(tool(async () => { count++; throw new Error('原错误') }), true)
    for (let n = 0; n < 4; n++) await expect(invoke(wrapped)).rejects.toThrow('原错误')
    expect(count).toBe(4)
  })
  test('排队取消不执行工具，且不泄漏并发槽位', async () => {
    let count = 0
    const wrapped = new FastHarness({ limit: 1, metrics: false }).wrap(tool(async () => { count++; await sleep(20); return ok() }), true)
    const first = invoke(wrapped, { n: 1 })
    const abort = new AbortController()
    const second = Promise.resolve(invoke(wrapped, { n: 2 }, abort.signal))
    const outcome = second.then(() => 'executed', (error: Error) => error.message)
    await sleep(1)
    abort.abort()
    expect(await outcome).toContain('取消')
    await first; await invoke(wrapped, { n: 3 })
    expect(count).toBe(2)
  })
  test('已取消调用不执行，成功非只读操作会重置旧失败', async () => {
    let count = 0
    const h = new FastHarness({ metrics: false })
    const wrapped = h.wrap(tool(async () => { count++; throw new Error('失败') }), true)
    const abort = new AbortController(); abort.abort()
    await expect(invoke(wrapped, {}, abort.signal)).rejects.toThrow('取消')
    expect(count).toBe(0)
    await expect(invoke(wrapped)).rejects.toThrow(); await expect(invoke(wrapped)).rejects.toThrow()
    await invoke(h.wrap(tool(ok, 'write'), false))
    await expect(invoke(wrapped)).rejects.toThrow('失败')
    expect(count).toBe(3)
  })
  test('统计只输出数值，不记录参数；收尾幂等', async () => {
    const lines: string[] = []
    const h = new FastHarness({ log: (line) => lines.push(line), metrics: true })
    h.noteEvent('message_start'); h.noteEvent('message_update')
    await invoke(h.wrap(tool(ok), true), { secret: 'never-log-this' })
    h.finish(); h.finish()
    expect(lines).toHaveLength(1)
    expect(lines[0]).not.toContain('never-log-this')
    expect(lines[0]).toContain('"toolCalls":1')
  })
})

describe('快速模式边界与模拟耗时', () => {
  test('原权限封装的拒绝保持有效', async () => {
    let permissionChecks = 0, executed = 0
    const denied = tool(async () => {
      permissionChecks++
      const allowed = false
      if (!allowed) throw new Error('权限拒绝')
      executed++
      return ok()
    })
    const wrapped = new FastHarness({ metrics: false }).wrap(denied, true)
    await expect(invoke(wrapped)).rejects.toThrow('权限拒绝')
    expect(permissionChecks).toBe(1)
    expect(executed).toBe(0)
  })
  test('返回 isError 的工具同样被计入失败', async () => {
    let calls = 0
    const wrapped = new FastHarness({ metrics: false }).wrap(tool(async () => {
      calls++
      return { ...await ok(), isError: true }
    }), true)
    await invoke(wrapped); await invoke(wrapped)
    await expect(invoke(wrapped)).rejects.toThrow('连续失败两次')
    expect(calls).toBe(2)
  })
  test('八个独立模拟读取的串行与四并发对照', async () => {
    const base = tool(async () => { await sleep(25); return ok() })
    const started = performance.now()
    for (let n = 0; n < 8; n++) await invoke(base, { n })
    const sequentialMs = performance.now() - started
    const wrapped = new FastHarness({ metrics: false }).wrap(base, true)
    const parallelStarted = performance.now()
    await Promise.all(Array.from({ length: 8 }, (_, n) => invoke(wrapped, { n })))
    const parallelMs = performance.now() - parallelStarted
    console.log('模拟读取耗时对照', JSON.stringify({ sequentialMs: Math.round(sequentialMs), parallelMs: Math.round(parallelMs) }))
    expect(parallelMs).toBeLessThan(sequentialMs)
  })
})


describe('无进展读取提醒但不强制暂停',()=>{
  test('相同内容第三次提醒，第四次仍真实执行',async()=>{
    let calls=0
    const h=new FastHarness({metrics:false})
    const wrapped=h.wrap(tool(async()=>{calls++;return ok()}),true)
    await invoke(wrapped);await invoke(wrapped)
    const result=await invoke(wrapped)
    expect(JSON.stringify(result)).toContain('执行进展提醒')
    expect(result.content[0]).toEqual({type:'text',text:'ok'})
    await invoke(wrapped)
    expect(calls).toBe(4)
  })
  test('结果变化和成功写入会重置无进展计数',async()=>{
    let value='a'
    const h=new FastHarness({metrics:false})
    const wrapped=h.wrap(tool(async()=>({content:[{type:'text' as const,text:value}],details:{}})),true)
    await invoke(wrapped);await invoke(wrapped);value='b'
    expect(JSON.stringify(await invoke(wrapped))).not.toContain('执行进展提醒')
    await invoke(wrapped)
    await invoke(h.wrap(tool(ok,'write'),false))
    expect(JSON.stringify(await invoke(wrapped))).not.toContain('执行进展提醒')
    h.resetFailures()
    expect(JSON.stringify(await invoke(wrapped))).not.toContain('执行进展提醒')
  })
  test('非只读操作不被成功去重或自动重放',async()=>{
    let calls=0
    const wrapped=new FastHarness({metrics:false}).wrap(tool(async()=>{calls++;return ok()},'write'),false)
    for(let i=0;i<4;i++)expect(JSON.stringify(await invoke(wrapped))).not.toContain('执行进展提醒')
    expect(calls).toBe(4)
  })
})
