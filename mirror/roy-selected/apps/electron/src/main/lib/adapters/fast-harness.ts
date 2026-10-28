import { createHash } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import type { ToolDefinition } from '@earendil-works/pi-coding-agent'

interface HarnessOptions {
  parallel?: boolean
  repeatGuard?: boolean
  metrics?: boolean
  limit?: number
  log?: (line: string) => void
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return '{' + Object.keys(record).sort().map((key) => JSON.stringify(key) + ':' + canonical(record[key])).join(',') + '}'
  }
  return JSON.stringify(value) ?? 'null'
}

function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('操作已取消', 'AbortError')
}

/** 每个 query 独享；不缓存工具输出，不记录路径、命令或用户参数。 */
export class FastHarness {
  readonly parallelEnabled: boolean
  private readonly repeatGuard: boolean
  private readonly metrics: boolean
  private readonly limit: number
  private readonly log: (line: string) => void
  private readonly started = performance.now()
  private readonly failures = new Map<string, number>()
  private readonly tails = new Map<string, Promise<void>>()
  private readonly waiting: Array<() => void> = []
  private running = 0
  private peak = 0
  private calls = 0
  private blocked = 0
  private toolMs = 0
  private firstEventMs?: number
  private firstUpdateMs?: number
  private finished = false

  constructor(options: HarnessOptions = {}) {
    this.parallelEnabled = options.parallel ?? process.env.ROY_FAST_PARALLEL !== '0'
    this.repeatGuard = options.repeatGuard ?? process.env.ROY_FAST_REPEAT_GUARD !== '0'
    this.metrics = options.metrics ?? process.env.ROY_FAST_METRICS !== '0'
    this.limit = Math.max(1, Math.min(4, Math.floor(options.limit ?? 4) || 4))
    this.log = options.log ?? console.log
  }

  noteEvent(type: string): void {
    this.firstEventMs ??= performance.now() - this.started
    // 这是首个消息增量，不冒充首个可见文字或纯模型耗时。
    if (type === 'message_update') this.firstUpdateMs ??= performance.now() - this.started
    // 新用户输入（包括排队补充）允许重新尝试。
    if (type === 'user_message') this.failures.clear()
  }

  resetFailures(): void { this.failures.clear() }

  private async acquire(signal?: AbortSignal): Promise<() => void> {
    checkAbort(signal)
    if (this.running < this.limit) this.running++
    else {
      await new Promise<void>((resolve, reject) => {
        const ready = (): void => { signal?.removeEventListener('abort', abort); resolve() }
        const abort = (): void => {
          const index = this.waiting.indexOf(ready)
          if (index >= 0) this.waiting.splice(index, 1)
          reject(new DOMException('操作已取消', 'AbortError'))
        }
        this.waiting.push(ready)
        signal?.addEventListener('abort', abort, { once: true })
        if (signal?.aborted) abort()
      })
    }
    this.peak = Math.max(this.peak, this.running)
    return () => {
      const next = this.waiting.shift()
      if (next) next()
      else this.running--
    }
  }

  wrap(tool: ToolDefinition, trustedRead: boolean): ToolDefinition {
    return {
      ...tool,
      executionMode: this.parallelEnabled && trustedRead ? 'parallel' : 'sequential',
      execute: async (id, params, signal, update, context) => {
        const key = createHash('sha256').update(tool.name + '\n' + canonical(params)).digest('hex')
        const previous = this.tails.get(key) ?? Promise.resolve()
        let unlock!: () => void
        const tail = new Promise<void>((resolve) => { unlock = resolve })
        this.tails.set(key, tail)
        let release: (() => void) | undefined
        try {
          await previous
          checkAbort(signal)
          if (this.repeatGuard && (this.failures.get(key) ?? 0) >= 2) {
            this.blocked++
            throw new Error('相同工具和参数已经连续失败两次，本次未执行。请更换方法或询问用户；收到新请求后可重试。')
          }
          release = await this.acquire(signal)
          checkAbort(signal)
          const started = performance.now()
          this.calls++
          try {
            const result = await tool.execute(id, params, signal, update, context)
            const isError = 'isError' in result && result.isError === true
            if (isError) this.recordFailure(key)
            else {
              this.failures.delete(key)
              // 成功的非只读操作可能修复了环境；不再沿用之前的失败条件。
              if (!trustedRead) this.failures.clear()
            }
            return result
          } catch (error) {
            if (!signal?.aborted && !(error instanceof Error && error.name === 'AbortError')) this.recordFailure(key)
            throw error
          } finally { this.toolMs += performance.now() - started }
        } finally {
          release?.()
          unlock()
          if (this.tails.get(key) === tail) this.tails.delete(key)
        }
      },
    }
  }

  private recordFailure(key: string): void {
    if (this.failures.size >= 512 && !this.failures.has(key)) this.failures.delete(this.failures.keys().next().value!)
    this.failures.set(key, (this.failures.get(key) ?? 0) + 1)
  }

  finish(): void {
    if (this.finished) return
    this.finished = true
    if (this.metrics) this.log('[快速模式耗时] ' + JSON.stringify({
      totalMs: Math.round(performance.now() - this.started),
      firstEventMs: this.firstEventMs == null ? null : Math.round(this.firstEventMs),
      firstMessageUpdateMs: this.firstUpdateMs == null ? null : Math.round(this.firstUpdateMs),
      toolExecutionSumMs: Math.round(this.toolMs),
      toolCalls: this.calls, blockedRepeats: this.blocked, peakConcurrency: this.peak,
    }))
  }
}
