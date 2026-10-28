import { describe, expect, test } from 'bun:test'
import { createUpdateCheckScheduler } from './update-check-scheduler'

/** 假时钟：记录每次排的定时，手动推进 */
function fakeClock() {
  let t = 0
  const timers: Array<{ at: number; fn: () => void; id: number }> = []
  let seq = 0
  return {
    now: () => t,
    setTimer: (fn: () => void, ms: number) => { const id = ++seq; timers.push({ at: t + ms, fn, id }); return id },
    clearTimer: (id: unknown) => { const i = timers.findIndex((x) => x.id === id); if (i >= 0) timers.splice(i, 1) },
    delays: [] as number[],
    pending: () => timers.map((x) => x.at - t),
    async fireNext() {
      timers.sort((a, b) => a.at - b.at)
      const next = timers.shift()
      if (!next) return false
      t = next.at
      next.fn()
      await new Promise((r) => setTimeout(r, 0)) // 让 check 的 Promise 收尾
      await new Promise((r) => setTimeout(r, 0))
      return true
    },
    advance(ms: number) { t += ms },
  }
}

describe('更新检查错峰', () => {
  test('首次检查在 3–20 秒之间随机；之后间隔在 24–36 分钟之间随机', async () => {
    for (const r of [0, 0.5, 0.999]) {
      const clock = fakeClock()
      let checks = 0
      const s = createUpdateCheckScheduler({ check: () => { checks++ }, now: clock.now, random: () => r, setTimer: clock.setTimer, clearTimer: clock.clearTimer })
      s.start()
      const first = clock.pending()[0]
      expect(first).toBeGreaterThanOrEqual(3_000)
      expect(first).toBeLessThanOrEqual(20_000)
      await clock.fireNext()
      expect(checks).toBe(1)
      const next = clock.pending()[0]
      expect(next).toBeGreaterThanOrEqual(24 * 60_000)
      expect(next).toBeLessThanOrEqual(36 * 60_000)
      s.dispose()
      expect(clock.pending()).toHaveLength(0)
    }
  })

  test('唤醒补查：5 分钟内查过就跳过，超过就补查一次', async () => {
    const clock = fakeClock()
    let checks = 0
    const s = createUpdateCheckScheduler({ check: () => { checks++ }, now: clock.now, random: () => 0.5, setTimer: clock.setTimer, clearTimer: clock.clearTimer })
    s.nudge() // 还没 start，不查
    expect(checks).toBe(0)
    s.start()
    await clock.fireNext()
    expect(checks).toBe(1)
    clock.advance(60_000)
    s.nudge()
    expect(checks).toBe(1)
    clock.advance(5 * 60_000)
    s.nudge()
    await new Promise((r) => setTimeout(r, 0))
    expect(checks).toBe(2)
  })

  test('同一时间只跑一次检查；检查出错不影响后续排期', async () => {
    const clock = fakeClock()
    let running = 0
    let maxRunning = 0
    let release: () => void = () => {}
    const s = createUpdateCheckScheduler({
      check: () => { running++; maxRunning = Math.max(maxRunning, running); return new Promise<void>((_, reject) => { release = () => { running--; reject(new Error('网络错误')) } }) },
      now: clock.now, random: () => 0.5, setTimer: clock.setTimer, clearTimer: clock.clearTimer, cooldownMs: 0,
    })
    s.start()
    await clock.fireNext()
    s.nudge()
    s.nudge()
    expect(maxRunning).toBe(1)
    release()
    await new Promise((r) => setTimeout(r, 0))
    await new Promise((r) => setTimeout(r, 0))
    expect(clock.pending()).toHaveLength(1) // 失败后仍排了下一次
    s.dispose()
  })
})
