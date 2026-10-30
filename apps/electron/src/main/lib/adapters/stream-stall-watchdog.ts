/**
 * 模型流式响应的「卡住」看门狗
 *
 * Pi 对 OpenAI 兼容 / Anthropic 接口只设了总超时和 HTTP 空闲超时（默认 300 秒）。
 * 中转站挂起时常常还在发心跳包，HTTP 层永远不算空闲，于是只能干等对方掐断连接
 * （实际记录：卡了 2 分 40 秒才收到 `terminated`）。
 *
 * 这里按「模型事件」计时：连上之前等 firstEventMs，开始输出后两次事件之间超过 idleMs，
 * 就主动断开这次请求，并以 stopReason=error、错误信息含 `timeout` 结束本次回答，
 * 交给 Pi 现有的自动重试（重试在工具执行之前发生，不会重复执行写操作）。
 * 用户点停止时仍是 aborted，不会被改成可重试错误。
 */
import type { AssistantMessage, AssistantMessageEvent } from '@earendil-works/pi-ai'
import { NETWORK_CHANGE_STALL_MS, networkChangeMonitor, type NetworkChangeMonitor } from '../network-change'

export interface StreamStallSettings {
  /** 发出请求到收到第一个事件的最长等待（含连接、排队、首包）。 */
  firstEventMs: number
  /** 开始输出后，两次事件之间的最长间隔；0 表示关闭看门狗。 */
  idleMs: number
  /** 断开后等底层流自己收尾的时间，超时就直接结束本次回答。 */
  graceMs: number
  requestMs?: number
}

export const DEFAULT_STREAM_STALL_SETTINGS: StreamStallSettings = {
  // 中转站高 effort / 长思考首包常超过 3 分钟；过早 idle 会 timeout→胡乱 retry，用户感觉又慢又重试。
  firstEventMs: 240_000,
  idleMs: 180_000,
  graceMs: 3_000,
  // 有真实进展时不按总时长截断；无进展仍受首包/空闲保护。
  requestMs: 0,
}

/** 环境变量 ROY_STREAM_STALL_SECONDS 可调整开始输出后的空闲阈值（调试用，0 关闭）。 */
export function resolveStreamStallSettings(env: Record<string, string | undefined> = process.env): StreamStallSettings {
  const raw = env.ROY_STREAM_STALL_SECONDS?.trim()
  if (!raw) return DEFAULT_STREAM_STALL_SETTINGS
  const seconds = Number(raw)
  if (!Number.isFinite(seconds) || seconds < 0) return DEFAULT_STREAM_STALL_SETTINGS
  if (seconds === 0) return { ...DEFAULT_STREAM_STALL_SETTINGS, idleMs: 0 }
  const idleMs = Math.round(seconds * 1000)
  return { ...DEFAULT_STREAM_STALL_SETTINGS, idleMs, firstEventMs: Math.max(DEFAULT_STREAM_STALL_SETTINGS.firstEventMs, idleMs) }
}

/** 错误信息里必须带 `timeout`：Pi 的可重试判断按这个词把它归为临时故障。 */
export function streamStallErrorMessage(waitedMs: number): string {
  return `Stream idle timeout：${Math.round(waitedMs / 1000)} 秒没有收到模型的新数据，本次等待已超时；是否重试由运行时决定（不代表服务繁忙）`
}

/** 网络切换后旧连接失效：同样带 `timeout`，交给自动重试重新连接 */
export function networkChangedErrorMessage(waitedMs: number): string {
  return `Network changed timeout：检测到网络切换，之后 ${Math.round(waitedMs / 1000)} 秒没有收到模型数据，旧连接已失效，正在重新连接`
}

export interface StreamStallDependencies {
  /** 网络切换监视器；不传则用进程共用的那个 */
  network?: Pick<NetworkChangeMonitor, 'subscribe'>
  /** 网络切换后等待新数据的时间；0 表示不处理网络切换 */
  networkStallMs?: number
}

interface WatchableEventStream extends AsyncIterable<AssistantMessageEvent> {
  result(): Promise<AssistantMessage>
}

interface ModelLike {
  api?: string
  provider?: string
  id?: string
}

interface StreamOptionsLike {
  signal?: AbortSignal
}

/** 转发流：和 Pi 的 AssistantMessageEventStream 一样，可逐个取事件，也可 result() 取最终消息。 */
class ForwardingStream implements WatchableEventStream {
  private readonly queue: AssistantMessageEvent[] = []
  private readonly waiters: Array<(result: IteratorResult<AssistantMessageEvent>) => void> = []
  private resolveResult: (message: AssistantMessage) => void = () => {}
  private readonly finalResult = new Promise<AssistantMessage>((resolve) => { this.resolveResult = resolve })
  closed = false

  push(event: AssistantMessageEvent): void {
    if (this.closed) return
    if (event.type === 'done' || event.type === 'error') {
      this.closed = true
      this.resolveResult(event.type === 'done' ? event.message : event.error)
    }
    const waiter = this.waiters.shift()
    if (waiter) waiter({ value: event, done: false })
    else this.queue.push(event)
    if (this.closed) {
      for (const pending of this.waiters.splice(0)) pending({ value: undefined, done: true })
    }
  }

  async *[Symbol.asyncIterator](): AsyncIterator<AssistantMessageEvent> {
    while (true) {
      const queued = this.queue.shift()
      if (queued) {
        yield queued
        continue
      }
      if (this.closed) return
      const next = await new Promise<IteratorResult<AssistantMessageEvent>>((resolve) => this.waiters.push(resolve))
      if (next.done) return
      yield next.value
    }
  }

  result(): Promise<AssistantMessage> {
    return this.finalResult
  }
}

function emptyAssistantMessage(model: ModelLike): AssistantMessage {
  return {
    role: 'assistant',
    content: [],
    api: model.api ?? 'unknown',
    provider: model.provider ?? 'unknown',
    model: model.id ?? 'unknown',
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    stopReason: 'error',
    timestamp: Date.now(),
  } as unknown as AssistantMessage
}

function terminalEventFor(message: AssistantMessage): AssistantMessageEvent {
  if (message.stopReason === 'error' || message.stopReason === 'aborted') {
    return { type: 'error', reason: message.stopReason, error: message }
  }
  return { type: 'done', reason: message.stopReason, message } as AssistantMessageEvent
}

/**
 * 给流式函数加看门狗。返回值与原函数签名一致，可以直接替换 session.agent.streamFunction。
 */
export function withStreamStallWatchdog<F extends (model: never, context: never, options?: never) => unknown>(
  streamFn: F,
  settings: StreamStallSettings = resolveStreamStallSettings(),
  deps: StreamStallDependencies = {},
): F {
  if (settings.idleMs <= 0) return streamFn
  const network = deps.network ?? networkChangeMonitor
  const networkStallMs = deps.networkStallMs ?? NETWORK_CHANGE_STALL_MS
  const call = streamFn as unknown as (model: ModelLike, context: unknown, options?: StreamOptionsLike) => WatchableEventStream | Promise<WatchableEventStream>

  const watched = async (model: ModelLike, context: unknown, options?: StreamOptionsLike): Promise<WatchableEventStream> => {
    const userSignal = options?.signal
    const controller = new AbortController()
    const forwardAbort = (): void => controller.abort(userSignal?.reason)
    if (userSignal?.aborted) controller.abort(userSignal.reason)
    else userSignal?.addEventListener('abort', forwardAbort, { once: true })

    const startedAt = Date.now()
    let rejectAbort: (() => void) | undefined
    const abortedConnection = new Promise<never>((_, reject) => {
      rejectAbort = () => reject(new DOMException("Request aborted", "AbortError"))
      if (userSignal?.aborted) rejectAbort()
      else userSignal?.addEventListener("abort", rejectAbort, { once: true })
    })
    let source: WatchableEventStream
    let connectTimer: ReturnType<typeof setTimeout> | undefined
    let connectDeadline = startedAt + settings.firstEventMs
    let rejectConnect: ((error: Error) => void) | undefined
    const armConnect = (ms: number, message: string): void => {
      if (connectTimer) clearTimeout(connectTimer)
      connectDeadline = Date.now() + ms
      connectTimer = setTimeout(() => {
        controller.abort()
        rejectConnect?.(new Error(message))
      }, ms)
    }
    // 等首包期间切换了网络：剩余等待超过 networkStallMs 时缩短到 networkStallMs
    const stopConnectWatch = networkStallMs > 0
      ? network.subscribe(() => {
        if (connectDeadline - Date.now() > networkStallMs) armConnect(networkStallMs, networkChangedErrorMessage(networkStallMs))
      })
      : () => {}
    try {
      source = await Promise.race([
        abortedConnection,
        Promise.resolve().then(() => {
          if (userSignal?.aborted) throw new DOMException("Request aborted", "AbortError")
          return call(model, context, { ...options, signal: controller.signal })
        }),
        new Promise<never>((_, reject) => {
          rejectConnect = reject
          armConnect(settings.firstEventMs, streamStallErrorMessage(settings.firstEventMs))
        }),
      ])
    } catch (error) {
      userSignal?.removeEventListener('abort', forwardAbort)
      throw error
    } finally {
      stopConnectWatch()
      if (connectTimer) clearTimeout(connectTimer)
      if (rejectAbort) userSignal?.removeEventListener("abort", rejectAbort)
    }

    const out = new ForwardingStream()
    let stalledAfterMs: number | undefined
    let requestExpired = false
    const finishUserAbort = (): void => {
      if (out.closed) return
      cleanup()
      const error = { ...(lastPartial ?? emptyAssistantMessage(model)), stopReason: "aborted", errorMessage: "Request aborted" } as AssistantMessage
      out.push({ type: "error", reason: "aborted", error })
    }
    let lastPartial: AssistantMessage | undefined
    let idleTimer: ReturnType<typeof setTimeout> | undefined
    let requestTimer: ReturnType<typeof setTimeout> | undefined
    let graceTimer: ReturnType<typeof setTimeout> | undefined
    /** 当前空闲计时的到期时间 */
    let idleDeadline = 0
    /** 这次断开是不是因为网络切换 */
    let networkStalled = false
    let stopStreamWatch: () => void = () => {}

    const cleanup = (): void => {
      stopStreamWatch()
      if (idleTimer) clearTimeout(idleTimer)
      if (requestTimer) clearTimeout(requestTimer)
      if (graceTimer) clearTimeout(graceTimer)
      userSignal?.removeEventListener('abort', forwardAbort)
      userSignal?.removeEventListener("abort", finishUserAbort)
    }
    const finishStalled = (base?: AssistantMessage): void => {
      if (out.closed) return
      cleanup()
      // 底层中止时没带已输出的内容，就用最后一次收到的部分消息补上。
      const usable = base && base.content.length > 0 ? base : (lastPartial ?? base)
      const error = {
        ...(usable ?? emptyAssistantMessage(model)),
        stopReason: 'error',
        errorMessage: requestExpired
          ? "Stream request timeout：达到显式设置的单次请求时限，不代表服务繁忙"
          : networkStalled
            ? networkChangedErrorMessage(stalledAfterMs ?? networkStallMs)
            : streamStallErrorMessage(stalledAfterMs ?? settings.idleMs),
      } as AssistantMessage
      out.push({ type: 'error', reason: 'error', error })
    }
    const arm = (ms: number, viaNetwork = false): void => {
      if (idleTimer) clearTimeout(idleTimer)
      idleDeadline = Date.now() + ms
      idleTimer = setTimeout(() => {
        if (out.closed || userSignal?.aborted) return
        stalledAfterMs = ms
        networkStalled = viaNetwork
        console.warn(viaNetwork
          ? `[Agent] 网络切换后 ${Math.round(ms / 1000)} 秒没有新数据，断开旧连接并交给自动重试`
          : `[Agent] 模型流 ${Math.round(ms / 1000)} 秒没有新数据，主动断开并交给自动重试`)
        controller.abort(new Error(viaNetwork ? networkChangedErrorMessage(ms) : streamStallErrorMessage(ms)))
        // 底层流一般会马上以 error 收尾；万一它也卡住，就不再等它。
        graceTimer = setTimeout(() => finishStalled(), settings.graceMs)
      }, ms)
    }

    if (settings.requestMs) requestTimer = setTimeout(() => {
      if (out.closed || userSignal?.aborted) return
      stalledAfterMs = settings.requestMs
      requestExpired = true
      if (idleTimer) clearTimeout(idleTimer)
      controller.abort(new Error('模型单次请求超过时间上限'))
      graceTimer = setTimeout(() => finishStalled(), settings.graceMs)
    }, settings.requestMs)
    arm(Math.max(1, settings.firstEventMs - (Date.now() - startedAt)))
    // 输出途中切换了网络：剩余空闲等待超过 networkStallMs 时缩短；之后只要有新数据就恢复正常计时
    if (networkStallMs > 0) {
      stopStreamWatch = network.subscribe(() => {
        if (out.closed || stalledAfterMs !== undefined || userSignal?.aborted) return
        if (idleDeadline - Date.now() > networkStallMs) arm(networkStallMs, true)
      })
    }
    userSignal?.addEventListener("abort", finishUserAbort, { once: true })
    if (userSignal?.aborted) finishUserAbort()
    void (async () => {
      try {
        for await (const event of source) {
          if (out.closed) return
          if (stalledAfterMs !== undefined) {
            // 断开后迟到的增量不再转发；真拿到了完整答复就照常交付。
            if (event.type === 'done') { cleanup(); out.push(event); return }
            if (event.type === 'error') { finishStalled(event.error); return }
            continue
          }
          if ('partial' in event) lastPartial = event.partial
          if (event.type === 'done' || event.type === 'error') {
            cleanup()
            out.push(event)
            return
          }
          // start/空心跳不是模型内容，不能把首包宽限提前缩成空闲阈值，也不能无限续命。
          const progress = (event.type === 'text_delta' || event.type === 'thinking_delta' || event.type === 'toolcall_delta') && event.delta.length > 0
          if (progress) arm(settings.idleMs)
          out.push(event)
        }
        if (out.closed) return
        const final = await source.result()
        if (stalledAfterMs !== undefined && final.stopReason !== 'stop' && final.stopReason !== 'toolUse' && final.stopReason !== 'length') {
          finishStalled(final)
          return
        }
        cleanup()
        out.push(terminalEventFor(final))
      } catch (error) {
        if (out.closed) return
        if (stalledAfterMs !== undefined && !userSignal?.aborted) {
          finishStalled()
          return
        }
        cleanup()
        const aborted = !!userSignal?.aborted
        out.push({
          type: 'error',
          reason: aborted ? 'aborted' : 'error',
          error: {
            ...(lastPartial ?? emptyAssistantMessage(model)),
            stopReason: aborted ? 'aborted' : 'error',
            errorMessage: error instanceof Error ? error.message : String(error),
          } as AssistantMessage,
        })
      }
    })()
    return out
  }

  return watched as unknown as F
}
