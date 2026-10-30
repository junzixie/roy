/**
 * 逐请求前缀缓存账本（Spark 模式 P0）
 *
 * 为什么需要它：Roy 现在只有会话级 usage 汇总，能算出「这个会话命中 92%」，
 * 但回答不了「哪一轮碎了、碎在第几条消息」。缓存成本是主成本项，缺了这个
 * 维度就只能靠猜，任何优化也无法归因。
 *
 * 每条**真正发给 provider 的请求**记一行到 `~/.roy/agent-sessions/<id>.cache.jsonl`：
 *
 *   {"t":…,"seq":7,"msgs":42,"chars":81234,"divergedAt":-1,
 *    "prefixHash":"ab12…","systemHash":"cd34…","toolsHash":"ef56…",
 *    "input":1806,"output":214,"cacheRead":79488,"cacheWrite":0,"hitRate":0.9778}
 *
 * `divergedAt` 的口径：
 *   - `-1`：与上一次请求相比只追加了新消息（前缀完整，理想态）；
 *   - `>=0`：第 N 条消息的字节变了，缓存从该位置往后全部失效；
 *   - `msgs` 比上次少：历史被重写（压缩/倒带），取新长度作为分歧点。
 *
 * 账本只做观测，不改变任何请求内容；写盘失败绝不影响对话。
 */

import { appendFileSync } from 'node:fs'
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { hashValue, stableSerialize } from './prefix-bytes'

export interface CacheLogUsage {
  input?: number
  output?: number
  cacheRead?: number
  cacheWrite?: number
}

export interface CacheLogRequestInput {
  model?: string
  mode?: string
  systemPrompt?: string
  messages: readonly unknown[]
  tools?: readonly unknown[]
}

export interface CacheLogRecord {
  /** 请求开始时刻（毫秒） */
  t: number
  /** 会话内自增序号，从 1 开始 */
  seq: number
  model?: string
  mode?: string
  /** 请求里的消息条数 */
  msgs: number
  /** 请求体积（稳定序列化后的字符数），用于观察每轮新增 */
  chars: number
  /** 与上一请求的首个分歧下标；-1 表示纯追加 */
  divergedAt: number
  divergedRole?: string
  /** 除最后一条消息外的前缀哈希 */
  prefixHash: string
  systemHash: string
  toolsHash?: string
  /** 系统提示词与上一请求不同（缓存从最开头失效） */
  systemChanged?: true
  /** 工具定义与上一请求不同（缓存从工具段失效，messages 再一致也命不中） */
  toolsChanged?: true
  input?: number
  output?: number
  cacheRead?: number
  cacheWrite?: number
  /** cacheRead / (input + cacheRead + cacheWrite)，与 usage-summary 口径一致 */
  hitRate?: number
  /** 请求没有拿到 usage 就结束时记录原因 */
  error?: string
}

export interface CacheLogDivergence {
  /** -1 = 纯追加 */
  index: number
  role?: string
}

/** 找出两次请求之间第一处字节差异。纯追加返回 -1。 */
export function findDivergence(previous: readonly string[], next: readonly string[]): CacheLogDivergence {
  const shared = Math.min(previous.length, next.length)
  for (let i = 0; i < shared; i++) {
    if (previous[i] !== next[i]) return { index: i }
  }
  // 消息数变少：历史被重写，分歧点在新的末尾
  if (next.length < previous.length) return { index: next.length }
  return { index: -1 }
}

export function computeHitRate(usage: CacheLogUsage): number | undefined {
  const input = usage.input ?? 0
  const cacheRead = usage.cacheRead ?? 0
  const cacheWrite = usage.cacheWrite ?? 0
  const total = input + cacheRead + cacheWrite
  return total > 0 ? cacheRead / total : undefined
}

export class SessionCacheLog {
  private seq = 0
  private previousMessageHashes: string[] = []
  private previousSystemHash?: string
  private previousToolsHash?: string
  private pending?: {
    record: CacheLogRecord
    messageHashes: string[]
  }
  private lastRecord?: CacheLogRecord

  /**
   * @param filePath JSONL 落盘路径；`undefined` 时只维护内存状态（测试或关闭账本时）
   */
  constructor(private readonly filePath?: string) {}

  /** 每次请求发出前调用（在 transformContext 之后、真正写 wire 之前） */
  beginRequest(input: CacheLogRequestInput): CacheLogRecord {
    // 上一个请求如果没有拿到 usage 就结束了（中止、重试、进程中断），
    // 先补一行再开新的，避免静默丢样本。
    if (this.pending) this.abandon('no-usage')
    const messageHashes = input.messages.map((message) => hashValue(message))
    const { index } = findDivergence(this.previousMessageHashes, messageHashes)
    const role = index >= 0 && index < input.messages.length
      ? String((input.messages[index] as { role?: unknown } | undefined)?.role ?? 'unknown')
      : undefined
    const systemHash = hashValue(input.systemPrompt !== undefined ? input.systemPrompt : systemMessagesOf(input.messages))
    const toolsHash = input.tools ? hashValue(input.tools) : undefined
    const prefixHash = hashValue([systemHash, toolsHash ?? '', ...messageHashes.slice(0, -1)])
    const systemChanged = this.previousSystemHash !== undefined && this.previousSystemHash !== systemHash
    const toolsChanged = this.previousToolsHash !== undefined && this.previousToolsHash !== toolsHash
    this.previousSystemHash = systemHash
    this.previousToolsHash = toolsHash

    const record: CacheLogRecord = {
      t: Date.now(),
      seq: ++this.seq,
      ...(input.model ? { model: input.model } : {}),
      ...(input.mode ? { mode: input.mode } : {}),
      msgs: input.messages.length,
      chars: input.messages.reduce<number>((sum, message) => sum + stableLength(message), 0),
      divergedAt: index,
      ...(role ? { divergedRole: role } : {}),
      prefixHash,
      systemHash,
      ...(toolsHash ? { toolsHash } : {}),
      ...(systemChanged ? { systemChanged: true as const } : {}),
      ...(toolsChanged ? { toolsChanged: true as const } : {}),
    }
    this.pending = { record, messageHashes }
    return record
  }

  /** 该请求拿到 usage 后调用；写入完整一行 */
  complete(usage: CacheLogUsage): void {
    const pending = this.pending
    if (!pending) return
    const hitRate = computeHitRate(usage)
    const record: CacheLogRecord = {
      ...pending.record,
      ...(usage.input !== undefined ? { input: usage.input } : {}),
      ...(usage.output !== undefined ? { output: usage.output } : {}),
      ...(usage.cacheRead !== undefined ? { cacheRead: usage.cacheRead } : {}),
      ...(usage.cacheWrite !== undefined ? { cacheWrite: usage.cacheWrite } : {}),
      ...(hitRate !== undefined ? { hitRate: Number(hitRate.toFixed(4)) } : {}),
    }
    this.finish(record, pending.messageHashes)
  }

  /** 请求失败或中止、没有 usage 时调用：仍然记一行，便于统计缺失率 */
  abandon(reason: string): void {
    const pending = this.pending
    if (!pending) return
    this.finish({ ...pending.record, error: reason }, pending.messageHashes)
  }

  getLastRecord(): CacheLogRecord | undefined {
    return this.lastRecord
  }

  get requestCount(): number {
    return this.seq
  }

  private finish(record: CacheLogRecord, messageHashes: string[]): void {
    this.pending = undefined
    this.previousMessageHashes = messageHashes
    this.lastRecord = record
    this.write(record)
  }

  private write(record: CacheLogRecord): void {
    const filePath = this.filePath
    if (!filePath) return
    try {
      appendFileSync(filePath, `${JSON.stringify(record)}\n`, 'utf8')
    } catch {
      /* 观测失败不能影响对话 */
    }
  }
}

/**
 * 在 wire 层记账：注册在所有改 payload 的扩展**之后**，拿到的就是真正发出去的字节
 * （推理截断、补偿块都已生效）。Pi 的 transformContext 阶段既看不到这些改写，也拿不到
 * 系统提示词和工具定义，记在那里会把这两类断点漏掉。
 *
 * 覆盖三种 wire 形状：chat-completions 的 `messages[]`（system 在其中）、responses 的
 * `input[]` + `instructions`、anthropic-messages 的 `messages[]` + `system`。
 */
export function createCacheLogExtension(
  log: SessionCacheLog,
  meta: { mode?: string } = {},
): (pi: ExtensionAPI) => void {
  return (pi) => {
    pi.on('before_provider_request', (event) => {
      const payload = event.payload as Record<string, unknown> | null
      if (!payload || typeof payload !== 'object') return undefined
      const messages = Array.isArray(payload.messages) ? payload.messages
        : Array.isArray(payload.input) ? payload.input
          : []
      const systemPrompt = payload.system ?? payload.instructions
      log.beginRequest({
        ...(typeof payload.model === 'string' ? { model: payload.model } : {}),
        ...(meta.mode ? { mode: meta.mode } : {}),
        ...(systemPrompt !== undefined ? { systemPrompt: typeof systemPrompt === 'string' ? systemPrompt : stableSerialize(systemPrompt) } : {}),
        messages,
        ...(Array.isArray(payload.tools) ? { tools: payload.tools } : {}),
      })
      return undefined
    })
  }
}

/** 从消息数组里取 system 消息作为系统提示词的替身（TranscriptContext 不暴露 systemPrompt） */
function systemMessagesOf(messages: readonly unknown[]): unknown[] {
  return messages.filter((message) => (message as { role?: unknown } | undefined)?.role === 'system')
}

/** 消息体积的粗略估算：只为观察每轮增量，不追求与 tokenizer 对齐 */
function stableLength(value: unknown): number {
  if (value === null || typeof value !== 'object') return String(value ?? '').length
  if (Array.isArray(value)) return value.reduce<number>((sum, item) => sum + stableLength(item), 0)
  const record = value as Record<string, unknown>
  return Object.keys(record).reduce<number>((sum, key) => sum + stableLength(record[key]), 0)
}
