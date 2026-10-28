/**
 * 更新检查排期（错峰）
 *
 * 固定每 30 分钟检查时，所有客户端会在差不多的时间一起请求更新服务器（agares）。这里：
 * - 首次检查在启动后 initialMin–initialMax 之间随机
 * - 之后每次间隔在 interval ±jitter 之间随机
 * - 休眠唤醒 / 网络恢复时补查一次；距上次检查不到 cooldown 就跳过
 * - 同一时间只跑一次检查
 */

export interface UpdateCheckSchedulerOptions {
  check: () => Promise<unknown> | unknown
  intervalMs?: number
  jitterRatio?: number
  cooldownMs?: number
  initialMinMs?: number
  initialMaxMs?: number
  now?: () => number
  random?: () => number
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
}

export interface UpdateCheckScheduler {
  start(): void
  /** 休眠唤醒、网络恢复、窗口重新激活时调用 */
  nudge(): void
  dispose(): void
}

export const UPDATE_CHECK_INTERVAL_MS = 30 * 60_000
export const UPDATE_CHECK_JITTER_RATIO = 0.2
export const UPDATE_CHECK_COOLDOWN_MS = 5 * 60_000

export function createUpdateCheckScheduler(options: UpdateCheckSchedulerOptions): UpdateCheckScheduler {
  const {
    check,
    intervalMs = UPDATE_CHECK_INTERVAL_MS,
    jitterRatio = UPDATE_CHECK_JITTER_RATIO,
    cooldownMs = UPDATE_CHECK_COOLDOWN_MS,
    initialMinMs = 3_000,
    initialMaxMs = 20_000,
    now = Date.now,
    random = Math.random,
    setTimer = (fn, ms) => { const t = setTimeout(fn, ms); (t as { unref?: () => void }).unref?.(); return t },
    clearTimer = (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  } = options

  let timer: unknown
  let started = false
  let disposed = false
  let inFlight: Promise<void> | null = null
  let lastFinishedAt: number | null = null

  const cancel = (): void => { if (timer !== undefined) { clearTimer(timer); timer = undefined } }

  const run = (): Promise<void> => {
    if (disposed) return Promise.resolve()
    if (inFlight) return inFlight
    inFlight = Promise.resolve()
      .then(check)
      .then(() => undefined, (error: unknown) => { console.warn('[更新] 检查未完成，下个周期再试:', error) })
      .finally(() => { lastFinishedAt = now(); inFlight = null })
    return inFlight
  }

  const nextDelay = (): number => {
    const factor = 1 + (random() * 2 - 1) * jitterRatio
    return Math.max(60_000, Math.round(intervalMs * factor))
  }

  const scheduleNext = (): void => {
    if (disposed) return
    cancel()
    timer = setTimer(() => { timer = undefined; void run().finally(scheduleNext) }, nextDelay())
  }

  return {
    start() {
      if (started || disposed) return
      started = true
      const min = Math.max(0, initialMinMs)
      const max = Math.max(min, initialMaxMs)
      timer = setTimer(() => { timer = undefined; void run().finally(scheduleNext) }, Math.round(min + (max - min) * random()))
    },
    nudge() {
      if (!started || disposed || inFlight) return
      if (lastFinishedAt !== null && now() - lastFinishedAt < cooldownMs) return
      void run()
    },
    dispose() {
      disposed = true
      cancel()
    },
  }
}
