/**
 * 代理状态日志必须去重。
 *
 * `getEffectiveProxyUrl()` 是读函数，每次建连都会调用。原来无条件打日志，
 * 实测单次运行写入 7659 行完全相同的「使用系统代理: http://127.0.0.1:7892/」，
 * 占整个 main.log 的 16.7%——把压缩、Agent 编排这些真正要看的诊断挤成了少数派。
 *
 * 期望行为：状态不变就不写，状态变化才写。日志留下的应该是一条时间线。
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let dir = ''
const originalHome = process.env.HOME
const originalUserProfile = process.env.USERPROFILE

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'roy-proxy-'))
  process.env.HOME = dir
  process.env.USERPROFILE = dir
})

afterEach(() => {
  process.env.HOME = originalHome
  process.env.USERPROFILE = originalUserProfile
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {
    // 清理失败不影响断言
  }
})

describe('代理状态日志去重', () => {
  test('相同状态重复调用只记一次', async () => {
    // 手动模式，避免依赖真实系统代理检测
    const { mkdirSync } = await import('node:fs')
    mkdirSync(join(dir, '.roy'), { recursive: true })
    writeFileSync(join(dir, '.roy', 'proxy-settings.json'), JSON.stringify({
      enabled: true,
      mode: 'manual',
      manualUrl: 'http://127.0.0.1:7892',
    }))

    const { getEffectiveProxyUrl, resetProxyStateLogForTest } = await import('./proxy-settings-service')
    resetProxyStateLogForTest()

    const lines: string[] = []
    const originalLog = console.log
    console.log = (...args: unknown[]) => { lines.push(args.join(' ')) }
    try {
      for (let i = 0; i < 20; i++) {
        await getEffectiveProxyUrl()
      }
    } finally {
      console.log = originalLog
    }

    // 20 次调用只应留下 1 条代理日志。
    // 注意：config-paths 首次解析时会打一条「[配置] 配置目录: ...」，
    // 那是模块级一次性初始化信息，不属于代理日志，按前缀过滤掉。
    const proxyLines = lines.filter((l) => l.includes('[代理配置]'))
    expect(proxyLines.length).toBe(1)
    expect(proxyLines[0]).toContain('使用手动配置代理')
  })

  test('状态变化时会重新记录', async () => {
    const { mkdirSync } = await import('node:fs')
    mkdirSync(join(dir, '.roy'), { recursive: true })
    const cfgPath = join(dir, '.roy', 'proxy-settings.json')

    const { getEffectiveProxyUrl, resetProxyStateLogForTest } = await import('./proxy-settings-service')
    resetProxyStateLogForTest()

    const lines: string[] = []
    const originalLog = console.log
    console.log = (...args: unknown[]) => { lines.push(args.join(' ')) }
    try {
      writeFileSync(cfgPath, JSON.stringify({ enabled: true, mode: 'manual', manualUrl: 'http://a:1' }))
      await getEffectiveProxyUrl()
      await getEffectiveProxyUrl()

      writeFileSync(cfgPath, JSON.stringify({ enabled: true, mode: 'manual', manualUrl: 'http://b:2' }))
      await getEffectiveProxyUrl()

      writeFileSync(cfgPath, JSON.stringify({ enabled: false, mode: 'manual', manualUrl: 'http://b:2' }))
      await getEffectiveProxyUrl()
    } finally {
      console.log = originalLog
    }

    // a → b → 关闭，共 3 次状态变化（同样只统计代理日志）
    const proxyLines = lines.filter((l) => l.includes('[代理配置]'))
    expect(proxyLines.length).toBe(3)
    expect(proxyLines[0]).toContain('http://a:1')
    expect(proxyLines[1]).toContain('http://b:2')
    expect(proxyLines[2]).toContain('代理未启用')
  })
})
