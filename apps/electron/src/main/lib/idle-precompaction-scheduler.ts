/**
 * 空闲静默预压缩调度器
 *
 * 回合结束后若上下文已过较低水位，预约在「真正空闲」一段时间后再跑同一套 session.compact()。
 * 用户发消息会 cancel；若压缩已在跑则由编排层 stop 让路。
 */

/**
 * 定时器句柄类型。
 *
 * 主进程运行在 Node 里（`Timeout` 对象），但 tsconfig 同时引入了 `DOM` lib
 * （渲染层要用），于是全局 `setTimeout` 是「Node 版 + DOM 版」两套签名的叠加，
 * `ReturnType<typeof setTimeout>` 推导出来是 `number | Timeout`——拿它当字段类型
 * 会让 `unref()` 和 `clearTimeoutFn` 都对不上。
 *
 * 用结构类型而不是直接引 NodeJS.Timeout：这样测试里注入的假定时器只要能
 * 被 `clearTimeout` 接受就行，不必真的造一个 Timeout 实例。
 */
interface TimerHandle {
  unref?: () => void
}

export interface IdlePrecompactSchedulePayload {
  sessionId: string
  channelId: string
  modelId?: string
  workspaceId?: string
  contextTokens: number
  contextWindow: number
  formalThresholdTokens: number
  trustedWindow?: boolean
  delayMs: number
}

export interface IdlePrecompactSchedulerOptions {
  /** 到期且仍空闲时执行预压缩 */
  run: (payload: IdlePrecompactSchedulePayload) => void | Promise<void>
  /** 当前会话是否仍有前台/后台 Agent 在跑（含其它任务） */
  isSessionBusy: (sessionId: string) => boolean
  setTimeoutFn?: (callback: () => void, ms: number) => TimerHandle
  clearTimeoutFn?: (timer: TimerHandle) => void
}

interface PendingEntry {
  timer: TimerHandle
  payload: IdlePrecompactSchedulePayload
}

export interface IdlePrecompactScheduler {
  schedule(payload: IdlePrecompactSchedulePayload): void
  cancel(sessionId: string): void
  cancelAll(): void
  /** 标记某会话的空闲压缩正在执行（用于发消息让路） */
  markRunning(sessionId: string): void
  markFinished(sessionId: string): void
  isRunning(sessionId: string): boolean
  hasPending(sessionId: string): boolean
  dispose(): void
}

export function createIdlePrecompactScheduler(
  options: IdlePrecompactSchedulerOptions,
): IdlePrecompactScheduler {
  // 全局 setTimeout 的类型是「Node 版 | DOM 版」的叠加，直接 `?? setTimeout`
  // 会让推导结果退回到 `number | Timeout`。这里显式收窄到 Node 的句柄形态。
  const setTimeoutFn: (callback: () => void, ms: number) => TimerHandle =
    options.setTimeoutFn ?? (setTimeout as unknown as (callback: () => void, ms: number) => TimerHandle)
  const clearTimeoutFn: (timer: TimerHandle) => void =
    options.clearTimeoutFn ?? (clearTimeout as unknown as (timer: TimerHandle) => void)
  const pending = new Map<string, PendingEntry>()
  const running = new Set<string>()

  const clearPending = (sessionId: string): void => {
    const entry = pending.get(sessionId)
    if (!entry) return
    clearTimeoutFn(entry.timer)
    pending.delete(sessionId)
  }

  const fire = (sessionId: string): void => {
    const entry = pending.get(sessionId)
    pending.delete(sessionId)
    if (!entry) return
    if (running.has(sessionId) || options.isSessionBusy(sessionId)) {
      return
    }
    void Promise.resolve()
      .then(() => options.run(entry.payload))
      .catch((error) => {
        console.warn(`[idle-precompact] 执行失败 session=${sessionId}`, error)
        running.delete(sessionId)
      })
  }

  return {
    schedule(payload) {
      clearPending(payload.sessionId)
      if (running.has(payload.sessionId) || options.isSessionBusy(payload.sessionId)) return
      const delay = Math.max(0, Math.floor(payload.delayMs))
      const timer = setTimeoutFn(() => fire(payload.sessionId), delay)
      // Node/Electron：不拖住进程退出
      timer.unref?.()
      pending.set(payload.sessionId, { timer, payload })
    },
    cancel(sessionId) {
      clearPending(sessionId)
    },
    cancelAll() {
      for (const sessionId of [...pending.keys()]) clearPending(sessionId)
    },
    markRunning(sessionId) {
      clearPending(sessionId)
      running.add(sessionId)
    },
    markFinished(sessionId) {
      running.delete(sessionId)
    },
    isRunning(sessionId) {
      return running.has(sessionId)
    },
    hasPending(sessionId) {
      return pending.has(sessionId)
    },
    dispose() {
      this.cancelAll()
      running.clear()
    },
  }
}
