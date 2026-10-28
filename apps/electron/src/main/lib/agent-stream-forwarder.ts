import type { AgentStreamEvent, AgentStreamPayload, SDKMessage } from '@roy/shared'

export const FOREGROUND_PARTIAL_INTERVAL_MS = 50
export const BACKGROUND_PARTIAL_INTERVAL_MS = 250
/** 只有思考在涨时的推送间隔：FeiBo 是 1.5 秒，Roy 要显示思考滚动，取 0.4 秒 */
export const THINKING_PARTIAL_INTERVAL_MS = 400
/** 快速模式前台约 60fps：字一个个往外冒，和 Arthur 的手感一致 */
export const FAST_FOREGROUND_PARTIAL_INTERVAL_MS = 16

type TimerHandle = ReturnType<typeof setTimeout>

interface PendingPartial {
  event: AgentStreamEvent
  send: (event: AgentStreamEvent) => void
  timer?: TimerHandle
}

export interface AgentStreamForwarderOptions {
  now?: () => number
  schedule?: (callback: () => void, delayMs: number) => TimerHandle
  cancel?: (timer: TimerHandle) => void
  /** 前台推送间隔（毫秒）；每次调度时读取，切换运行模式后马上生效 */
  foregroundIntervalMs?: () => number
}

function isThinkingOnlyPayload(payload: AgentStreamPayload): boolean {
  if (payload.kind !== 'sdk_delta') return false
  const deltas = payload.delta.deltas
  return deltas.length > 0 && deltas.every((d) => d.type === 'thinking_delta' || d.type === 'thinking_start')
}

function isPartialAssistantPayload(payload: AgentStreamPayload): boolean {
  if (payload.kind === 'sdk_delta') return true
  return payload.kind === 'sdk_message'
    && (payload.message as SDKMessage & { _partial?: unknown })._partial === true
}

/**
 * 在 main → renderer 边界合并 Pi 的原生 Delta。
 *
 * 前台会话保持 20fps，后台会话降为 4fps；终态消息直接发送，并在发送前 flush
 * 尚未交付的 Delta，保证高频增量不会被中间状态事件覆盖。
 */
export class AgentStreamForwarder {
  private readonly pending = new Map<string, PendingPartial>()
  private readonly lastSentAt = new Map<string, number>()
  private readonly now: () => number
  private readonly schedule: (callback: () => void, delayMs: number) => TimerHandle
  private readonly cancel: (timer: TimerHandle) => void
  private readonly foregroundIntervalMs: () => number

  constructor(options: AgentStreamForwarderOptions = {}) {
    this.now = options.now ?? Date.now
    this.schedule = options.schedule ?? ((callback, delayMs) => setTimeout(callback, delayMs))
    this.cancel = options.cancel ?? clearTimeout
    this.foregroundIntervalMs = options.foregroundIntervalMs ?? (() => FOREGROUND_PARTIAL_INTERVAL_MS)
  }

  forward(
    event: AgentStreamEvent,
    send: (event: AgentStreamEvent) => void,
    foreground: boolean,
  ): void {
    const { sessionId, payload } = event
    if (!isPartialAssistantPayload(payload)) {
      // 保持 Delta 与紧随其后的终态/状态事件顺序，避免 permission 或 result 抢掉待发送 Delta。
      if (this.pending.has(sessionId)) this.emit(sessionId)
      this.clear(sessionId)
      send(event)
      return
    }

    const existing = this.pending.get(sessionId)
    if (existing) {
      if (
        existing.event.payload.kind === 'sdk_delta'
        && payload.kind === 'sdk_delta'
        && existing.event.payload.delta.uuid === payload.delta.uuid
        && existing.event.payload.delta.runStartedAt === payload.delta.runStartedAt
        && existing.event.payload.delta.runGeneration === payload.delta.runGeneration
      ) {
        const current = existing.event.payload.delta
        const wasThinkingOnly = isThinkingOnlyPayload(existing.event.payload)
        existing.event = {
          ...event,
          payload: {
            kind: 'sdk_delta',
            delta: {
              ...payload.delta,
              deltas: [...current.deltas, ...payload.delta.deltas],
            },
          },
        }
        existing.send = send
        // 思考之后开始出正文 / 工具调用：不再等思考的慢节奏，按正常频率尽快发
        if (wasThinkingOnly && !isThinkingOnlyPayload(existing.event.payload)) {
          if (existing.timer) this.cancel(existing.timer)
          this.schedulePending(sessionId, existing, foreground)
        }
        return
      }
      if (existing.event.payload.kind === 'sdk_delta') {
        this.emit(sessionId)
      } else {
        existing.event = event
        existing.send = send
        return
      }
    }

    const pending: PendingPartial = { event, send }
    this.pending.set(sessionId, pending)
    this.schedulePending(sessionId, pending, foreground)
  }

  /** 会话切换前后台时按新频率重排尚未发送的快照。 */
  reprioritize(sessionId: string, foreground: boolean): void {
    const pending = this.pending.get(sessionId)
    if (!pending) return
    if (pending.timer) this.cancel(pending.timer)
    this.schedulePending(sessionId, pending, foreground)
  }

  /** 当前会话切到前台时立即交付已合并快照，避免等待后台的 250ms 窗口。 */
  promote(sessionId: string): void {
    if (this.pending.has(sessionId)) this.emit(sessionId)
  }

  clear(sessionId: string): void {
    const pending = this.pending.get(sessionId)
    if (pending?.timer) this.cancel(pending.timer)
    this.pending.delete(sessionId)
    this.lastSentAt.delete(sessionId)
  }

  private schedulePending(sessionId: string, pending: PendingPartial, foreground: boolean): void {
    const baseMs = foreground ? this.foregroundIntervalMs() : BACKGROUND_PARTIAL_INTERVAL_MS
    const intervalMs = isThinkingOnlyPayload(pending.event.payload) ? Math.max(baseMs, THINKING_PARTIAL_INTERVAL_MS) : baseMs
    const elapsed = this.now() - (this.lastSentAt.get(sessionId) ?? 0)
    pending.timer = this.schedule(() => this.emit(sessionId), Math.max(0, intervalMs - elapsed))
  }

  private emit(sessionId: string): void {
    const pending = this.pending.get(sessionId)
    if (!pending) return
    this.pending.delete(sessionId)
    if (pending.timer) this.cancel(pending.timer)
    this.lastSentAt.set(sessionId, this.now())
    pending.send(pending.event)
  }
}
