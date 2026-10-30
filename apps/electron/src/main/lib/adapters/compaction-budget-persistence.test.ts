import { describe, expect, test, mock } from 'bun:test'
import { readFileSync } from 'node:fs'
// 不启动 Electron 的真实 utility process
mock.module('../agent-runtime-client', () => ({ AgentRuntimeClient: class {} }))
const { PiAgentAdapter } = await import('./pi-agent-adapter')

/**
 * 压缩后「残留偏高 → 收紧保留原文预算」必须跨轮生效，且能回弹。
 *
 * 回归背景：`currentKeepRecentTokens` 原本是 `query()` 内的局部变量，而
 * `query()` 每轮对话都会重新进入。compaction_end 里算出的收紧值因此只在本轮
 * 有效，下一轮开头又被 `calculatePiCompactionKeepRecentTokens()` 算回默认
 * 12000——日志里打印的「下次保留原文预算 → 6000」实际从未生效。
 *
 * `settingsManager.applyOverrides()` 也救不了：那个 manager 是
 * `SettingsManager.inMemory()`，同样在 query() 内新建、query 结束即丢弃。
 *
 * 两个层面一起验证：
 * 1. 运行时——状态确实挂在适配器实例上，能跨多次 query() 存活；
 * 2. 接线——query() 的起始值确实读了这份状态、收紧时确实写了它
 *    （只测 Map 本身会漏掉「没人读写」这种最常见的失联）。
 */
const source = readFileSync(new URL('./pi-agent-adapter.ts', import.meta.url), 'utf8')

const store = (adapter: unknown): Map<string, number> =>
  (adapter as { tightenedKeepRecentBySession: Map<string, number> }).tightenedKeepRecentBySession

describe('压缩保留预算跨轮持久化', () => {
  test('适配器实例持有按会话的收紧值存储', () => {
    const adapter = new PiAgentAdapter()
    expect(store(adapter)).toBeInstanceOf(Map)
    expect(store(adapter).size).toBe(0)
  })

  test('同一实例的两次「轮次」之间，收紧值不会丢', () => {
    const adapter = new PiAgentAdapter()
    // 模拟第一轮 query() 里 compaction_end 判定残留偏高后收紧
    store(adapter).set('session-a', 6_000)
    // 模拟第二轮 query() 开始：起始值必须读到上一轮的收紧值
    expect(store(adapter).get('session-a')).toBe(6_000)
  })

  test('不同会话互不影响', () => {
    const adapter = new PiAgentAdapter()
    store(adapter).set('session-a', 6_000)
    store(adapter).set('session-b', 3_000)
    expect(store(adapter).get('session-a')).toBe(6_000)
    expect(store(adapter).get('session-b')).toBe(3_000)
  })

  test('dispose 清空存储，避免长期运行累积', () => {
    const adapter = new PiAgentAdapter()
    store(adapter).set('session-a', 6_000)
    adapter.dispose()
    expect(store(adapter).size).toBe(0)
  })
})

describe('压缩保留预算的接线', () => {
  test('query() 起始值读取上一轮的收紧值，并用当前窗口默认值夹上限', () => {
    // 换小窗口模型后，旧预算不能超过新窗口算出的默认值
    expect(source).toMatch(
      /let currentKeepRecentTokens = Math\.min\(\s*this\.tightenedKeepRecentBySession\.get\(input\.sessionId\) \?\? windowDefaultKeepRecent,\s*windowDefaultKeepRecent,\s*\)/,
    )
  })

  test('残留偏高时收紧并写回实例级存储', () => {
    expect(source).toContain('this.tightenedKeepRecentBySession.set(input.sessionId, tightened)')
  })

  test('残留回落时逐步放宽，不是单向棘轮', () => {
    // 没有这条，长期会话会被一路压到 2000 下限再也不恢复
    expect(source).toMatch(/else if \(currentKeepRecentTokens < defaultKeepRecent\)/)
    expect(source).toContain('this.tightenedKeepRecentBySession.set(input.sessionId, relaxed)')
  })
})
