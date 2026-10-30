import { describe, expect, test } from 'bun:test'
import { createIdlePrecompactScheduler, type IdlePrecompactSchedulePayload } from './idle-precompaction-scheduler'

function basePayload(over: Partial<IdlePrecompactSchedulePayload> = {}): IdlePrecompactSchedulePayload {
  return {
    sessionId: 's1',
    channelId: 'ch1',
    contextTokens: 200_000,
    contextWindow: 372_000,
    formalThresholdTokens: 334_800,
    delayMs: 45_000,
    ...over,
  }
}

describe('idle-precompaction-scheduler', () => {
  test('fires after delay when still idle', async () => {
    const timers: Array<{ id: number; ms: number; cb: () => void }> = []
    let nextId = 1
    let ran = 0
    const busy = new Set<string>()
    const scheduler = createIdlePrecompactScheduler({
      isSessionBusy: (id) => busy.has(id),
      run: () => { ran += 1 },
      setTimeoutFn: (cb, ms) => {
        const id = nextId++
        timers.push({ id, ms, cb: cb as () => void })
        return id as unknown as ReturnType<typeof setTimeout>
      },
      clearTimeoutFn: (timer) => {
        const idx = timers.findIndex((t) => t.id === (timer as unknown as number))
        if (idx >= 0) timers.splice(idx, 1)
      },
    })

    scheduler.schedule(basePayload({ delayMs: 45_000 }))
    expect(timers).toHaveLength(1)
    expect(timers[0]!.ms).toBe(45_000)
    timers[0]!.cb()
    await Promise.resolve()
    expect(ran).toBe(1)
    scheduler.dispose()
  })

  test('cancel before fire prevents run', () => {
    const timers: Array<{ id: number; cb: () => void }> = []
    let nextId = 1
    let ran = 0
    const scheduler = createIdlePrecompactScheduler({
      isSessionBusy: () => false,
      run: () => { ran += 1 },
      setTimeoutFn: (cb) => {
        const id = nextId++
        timers.push({ id, cb: cb as () => void })
        return id as unknown as ReturnType<typeof setTimeout>
      },
      clearTimeoutFn: (timer) => {
        const idx = timers.findIndex((t) => t.id === (timer as unknown as number))
        if (idx >= 0) timers.splice(idx, 1)
      },
    })
    scheduler.schedule(basePayload())
    scheduler.cancel('s1')
    expect(timers).toHaveLength(0)
    expect(ran).toBe(0)
    scheduler.dispose()
  })

  test('does not fire while session busy', async () => {
    const timers: Array<{ id: number; cb: () => void }> = []
    let nextId = 1
    let ran = 0
    const busy = new Set<string>()
    const scheduler = createIdlePrecompactScheduler({
      isSessionBusy: (id) => busy.has(id),
      run: () => { ran += 1 },
      setTimeoutFn: (cb) => {
        const id = nextId++
        timers.push({ id, cb: cb as () => void })
        return id as unknown as ReturnType<typeof setTimeout>
      },
      clearTimeoutFn: (timer) => {
        const idx = timers.findIndex((t) => t.id === (timer as unknown as number))
        if (idx >= 0) timers.splice(idx, 1)
      },
    })
    scheduler.schedule(basePayload())
    expect(timers).toHaveLength(1)
    busy.add('s1')
    timers[0]!.cb()
    await Promise.resolve()
    expect(ran).toBe(0)
    scheduler.dispose()
  })
})
