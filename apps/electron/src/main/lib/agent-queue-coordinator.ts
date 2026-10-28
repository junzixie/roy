import type { WebContents } from 'electron'
import type {
  AgentDeferredQueueMessageInput,
  AgentMoveQueuedMessageInput,
  AgentQueuedMessageSnapshot,
  AgentQueuedMessageControlInput,
  AgentQueuedMessageStatus,
} from '@roy/shared'

type DispatchedQueueRunInput = AgentDeferredQueueMessageInput & { runGeneration: number }

interface QueueEntry {
  input: AgentDeferredQueueMessageInput
  queuedAt: number
  retryCount?: number  // 添加重试计数，防止死循环
}

export interface AgentQueueCoordinatorOptions {
  isActive: (sessionId: string) => boolean
  getWebContents: (sessionId: string) => WebContents | null
  startRun: (input: DispatchedQueueRunInput, webContents: WebContents) => Promise<void>
  sendStarted: (webContents: WebContents, status: AgentQueuedMessageStatus) => void
  /** 运行身份由生命周期所有者分配，队列只负责调度。 */
  reserveRunGeneration: (sessionId: string) => number
}

/** 主进程持有 deferred queue；renderer 只保留展示投影。 */
export class AgentQueueCoordinator {
  private readonly queues = new Map<string, QueueEntry[]>()
  private readonly dispatching = new Map<string, string>()

  constructor(private readonly options: AgentQueueCoordinatorOptions) {}

  enqueue(input: AgentDeferredQueueMessageInput): 'started' | 'queued' {
    if (this.dispatching.get(input.sessionId) === input.queueMessageId) return 'started'
    const queue = this.queues.get(input.sessionId) ?? []
    if (queue.some((entry) => entry.input.queueMessageId === input.queueMessageId)) {
      const runStarted = this.dispatching.get(input.sessionId) === input.queueMessageId
      return runStarted ? 'started' : 'queued'
    }
    queue.push({ input, queuedAt: Date.now() })
    this.queues.set(input.sessionId, queue)
    this.tryDispatch(input.sessionId)
    const runStarted = this.dispatching.get(input.sessionId) === input.queueMessageId
    return runStarted ? 'started' : 'queued'
  }

  cancel(input: AgentQueuedMessageControlInput): boolean {
    const queue = this.queues.get(input.sessionId)
    if (!queue) return false
    const index = queue.findIndex((entry) => entry.input.queueMessageId === input.messageId)
    if (index < 0) return false
    queue.splice(index, 1)
    if (queue.length === 0) this.queues.delete(input.sessionId)
    return true
  }

  move(input: AgentMoveQueuedMessageInput): boolean {
    const queue = this.queues.get(input.sessionId)
    if (!queue || input.sourceId === input.targetId) return false
    const sourceIndex = queue.findIndex((entry) => entry.input.queueMessageId === input.sourceId)
    const targetIndex = queue.findIndex((entry) => entry.input.queueMessageId === input.targetId)
    if (sourceIndex < 0 || targetIndex < 0) return false
    const [source] = queue.splice(sourceIndex, 1)
    if (!source) return false
    const adjustedTarget = queue.findIndex((entry) => entry.input.queueMessageId === input.targetId)
    const insertIndex = input.placement === 'after' ? adjustedTarget + 1 : adjustedTarget
    queue.splice(insertIndex, 0, source)
    return true
  }

  onRunComplete(
    sessionId: string,
    queueMessageId: string | undefined,
    backgroundTasksPending: boolean,
    stoppedByUser: boolean,
  ): void {
    if (queueMessageId && this.dispatching.get(sessionId) === queueMessageId) {
      this.dispatching.delete(sessionId)
    }
    if (backgroundTasksPending || stoppedByUser) return
    this.tryDispatch(sessionId)
  }

  onBackgroundTaskComplete(sessionId: string): void {
    this.tryDispatch(sessionId)
  }

  /** Renderer/webContents 重新可用后唤醒等待中的队列。tryDispatch 自身负责去重 active/dispatching。 */
  onTargetAvailable(sessionId: string): void {
    this.tryDispatch(sessionId)
  }

  snapshot(sessionId: string): AgentQueuedMessageSnapshot[] {
    return (this.queues.get(sessionId) ?? []).map((entry) => ({ input: { ...entry.input }, queuedAt: entry.queuedAt }))
  }

  isDispatching(sessionId: string): boolean {
    return this.dispatching.has(sessionId)
  }

  hasPending(sessionId: string): boolean {
    return this.dispatching.has(sessionId) || (this.queues.get(sessionId)?.length ?? 0) > 0
  }

  clear(sessionId: string): void {
    this.queues.delete(sessionId)
    this.dispatching.delete(sessionId)
  }

  /**
   * 只释放派发占位，保留队列内容。
   *
   * 用户停止后，本轮 run 结束了但队列里的消息应当还在；旧实现里 stopAgent 既不调用
   * clear 也不释放 dispatching，导致该 session 的队列卡在“正在派发”占位，
   * 后续 onTargetAvailable / onBackgroundTaskComplete 全部被 tryDispatch 的
   * `if (this.dispatching.has(sessionId)) return` 挡住，表现为“停止后队列再也不动”。
   */
  releaseDispatch(sessionId: string): void {
    this.dispatching.delete(sessionId)
  }

  private tryDispatch(sessionId: string): void {
    if (this.dispatching.has(sessionId) || this.options.isActive(sessionId)) return
    const queue = this.queues.get(sessionId)
    const entry = queue?.shift()
    if (!entry) return
    if (queue?.length === 0) this.queues.delete(sessionId)

    const messageId = entry.input.queueMessageId
    this.dispatching.set(sessionId, messageId)
    const webContents = this.options.getWebContents(sessionId)
    if (!webContents || webContents.isDestroyed()) {
      // 重试要有上限，避免 renderer 不在时无限 unshift → 再 dispatch 的空转；
      // 但达到上限后必须把终端状态告诉 renderer，否则该消息会凭空消失，
      // 用户看到的就是“队列里那条消息点了没反应”。
      const retryCount = (entry.retryCount || 0) + 1
      const MAX_RETRIES = 5

      if (retryCount < MAX_RETRIES) {
        entry.retryCount = retryCount
        queue?.unshift(entry)
        if (queue) this.queues.set(sessionId, queue)
        console.warn(`[Queue] 队列任务重试 ${retryCount}/${MAX_RETRIES}: ${sessionId}`)
      } else {
        console.error(`[Queue] 队列任务失败，已达最大重试次数: ${sessionId}`)
        // 保留消息本身，以便 renderer 恢复后能重新看到并可重试（不清空队列投影）。
        queue?.unshift(entry)
        if (queue) this.queues.set(sessionId, queue)
      }
      this.dispatching.delete(sessionId)
      return
    }
    const runGeneration = this.options.reserveRunGeneration(sessionId)
    const startedAt = Date.now()
    try {
      this.options.sendStarted(webContents, {
        sessionId,
        messageId,
        status: 'started',
        userMessage: entry.input.userMessage,
        rawUserMessage: entry.input.rawUserMessage,
        startedAt,
        runGeneration,
    })
    } catch {
      // renderer 可能在检查 isDestroyed() 后立即销毁；发送失败时必须保留消息，等待下一次重试。
      queue?.unshift(entry)
      if (queue) this.queues.set(sessionId, queue)
      this.dispatching.delete(sessionId)
      return
    }
    void Promise.resolve()
      .then(() => this.options.startRun({ ...entry.input, startedAt, runGeneration, userMessageUuid: messageId }, webContents))
      .then(
        () => this.finishDispatch(sessionId, messageId),
        () => this.finishDispatch(sessionId, messageId),
      )
  }

  private finishDispatch(sessionId: string, messageId: string): void {
    if (this.dispatching.get(sessionId) === messageId) {
      this.dispatching.delete(sessionId)
      this.tryDispatch(sessionId)
    }
  }
}
