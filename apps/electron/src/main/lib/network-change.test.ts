import { describe, expect, test } from 'bun:test'
import type { AssistantMessage, AssistantMessageEvent } from '@earendil-works/pi-ai'
import { isRetryableAssistantError } from '@earendil-works/pi-ai/compat'
import { createNetworkChangeMonitor, networkFingerprint } from './network-change'
import { withStreamStallWatchdog, type StreamStallSettings } from './adapters/stream-stall-watchdog'

type Ifaces = ReturnType<typeof import('node:os').networkInterfaces>
const iface = (address: string, family: 'IPv4' | 'IPv6' = 'IPv4', internal = false, scopeid?: number) =>
  ({ address, family, internal, netmask: '', mac: '', cidr: null, ...(scopeid !== undefined ? { scopeid } : {}) }) as never

describe('网卡地址指纹', () => {
  test('忽略回环和链路本地地址，顺序无关', () => {
    const a: Ifaces = { WLAN: [iface('192.168.1.5'), iface('fe80::1', 'IPv6', false, 12)], lo: [iface('127.0.0.1', 'IPv4', true)] }
    const b: Ifaces = { lo: [iface('127.0.0.1', 'IPv4', true)], WLAN: [iface('192.168.1.5')] }
    expect(networkFingerprint(() => a)).toBe(networkFingerprint(() => b))
    expect(networkFingerprint(() => a)).toBe('WLAN|IPv4|192.168.1.5')
  })

  test('读网卡出错时返回空，不当作网络变化', () => {
    expect(networkFingerprint(() => { throw new Error('boom') })).toBe('')
  })
})

describe('网络切换监视器', () => {
  test('地址变化才通知；没有订阅时不轮询', () => {
    let current: Ifaces = { WLAN: [iface('192.168.1.5')] }
    const monitor = createNetworkChangeMonitor({ read: () => current, pollMs: 60_000 })
    let hits = 0
    const stop = monitor.subscribe(() => { hits++ })
    monitor.check()
    expect(hits).toBe(0)
    current = { WLAN: [iface('10.0.0.8')] } // 换了 Wi-Fi
    monitor.check()
    expect(hits).toBe(1)
    monitor.check()
    expect(hits).toBe(1)
    current = { WLAN: [iface('10.0.0.8')], VPN: [iface('172.16.0.2')] } // 开了 VPN
    monitor.check()
    expect(hits).toBe(2)
    stop()
    current = { WLAN: [iface('192.168.9.9')] }
    monitor.check()
    expect(hits).toBe(2)
  })
})

// ---- 看门狗配合网络切换 ----
const model = { api: 'openai-completions', provider: 'test', id: 'm' }
const slow: StreamStallSettings = { firstEventMs: 5_000, idleMs: 5_000, graceMs: 30 }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
function message(stopReason: AssistantMessage['stopReason'], text = ''): AssistantMessage {
  return {
    role: 'assistant', content: text ? [{ type: 'text', text }] : [], api: 'openai-completions', provider: 'test', model: 'm',
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    stopReason, timestamp: Date.now(),
  } as unknown as AssistantMessage
}
const partial = message('stop', '半截')
const start: AssistantMessageEvent = { type: 'start', partial }
const delta: AssistantMessageEvent = { type: 'text_delta', contentIndex: 0, delta: '字', partial }
const done: AssistantMessageEvent = { type: 'done', reason: 'stop', message: message('stop', '完整') }

function fakeNetwork() {
  const listeners = new Set<() => void>()
  return {
    subscribe: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } },
    change: () => { for (const l of [...listeners]) l() },
    get count() { return listeners.size },
  }
}
function scripted(steps: Array<{ wait: number; event: AssistantMessageEvent }>, signal?: AbortSignal) {
  let resolveResult: (m: AssistantMessage) => void = () => {}
  const result = new Promise<AssistantMessage>((r) => { resolveResult = r })
  async function* run(): AsyncGenerator<AssistantMessageEvent> {
    for (const step of steps) {
      const aborted = await Promise.race([sleep(step.wait).then(() => false), new Promise<boolean>((r) => signal?.addEventListener('abort', () => r(true), { once: true }))])
      if (aborted) { const error = message('aborted'); resolveResult(error); yield { type: 'error', reason: 'aborted', error }; return }
      if (step.event.type === 'done') resolveResult(step.event.message)
      yield step.event
    }
  }
  return { [Symbol.asyncIterator]: run, result: () => result }
}

describe('网络切换后快速重连', () => {
  test('输出途中切换网络、之后没有新数据：很快断开，给出可重试的网络切换错误', async () => {
    const net = fakeNetwork()
    const fn = withStreamStallWatchdog((_m: typeof model, _c: unknown, o?: { signal?: AbortSignal }) => scripted([
      { wait: 5, event: start }, { wait: 5, event: delta }, { wait: 60_000, event: done },
    ], o?.signal), slow, { network: net, networkStallMs: 50 })
    const stream = await fn(model, {}, {})
    const begin = Date.now()
    setTimeout(() => net.change(), 30)
    for await (const _e of stream) { /* 消费 */ }
    const final = await stream.result()
    expect(Date.now() - begin).toBeLessThan(1_000) // 不用等 5 秒空闲超时
    expect(final.stopReason).toBe('error')
    expect(final.errorMessage).toContain('Network changed timeout')
    expect(isRetryableAssistantError(final)).toBe(true)
    expect(net.count).toBe(0) // 结束后取消订阅
  })

  test('切换网络后又收到新数据：恢复正常计时，正常完成', async () => {
    const net = fakeNetwork()
    const fn = withStreamStallWatchdog((_m: typeof model, _c: unknown, o?: { signal?: AbortSignal }) => scripted([
      { wait: 5, event: start }, { wait: 5, event: delta }, { wait: 40, event: delta }, { wait: 80, event: done },
    ], o?.signal), slow, { network: net, networkStallMs: 60 })
    const stream = await fn(model, {}, {})
    setTimeout(() => net.change(), 15)
    for await (const _e of stream) { /* 消费 */ }
    expect((await stream.result()).stopReason).toBe('stop')
  })

  test('等首包时切换网络：按网络切换时限断开', async () => {
    const net = fakeNetwork()
    const fn = withStreamStallWatchdog((_m: typeof model, _c: unknown, o?: { signal?: AbortSignal }) =>
      new Promise((resolve, reject) => { o?.signal?.addEventListener('abort', () => reject(new Error('aborted'))); void resolve }) as never,
    slow, { network: net, networkStallMs: 40 })
    const begin = Date.now()
    setTimeout(() => net.change(), 20)
    await expect(fn(model, {}, {})).rejects.toThrow('Network changed timeout')
    expect(Date.now() - begin).toBeLessThan(1_000)
    expect(net.count).toBe(0)
  })
})
