/**
 * 用量统计
 *
 * 从 ~/.roy/agent-sessions/*.jsonl 汇总 token 消耗，供侧边栏卡片与用量详情页使用：
 * - 累计 / 今天 / 近 7 天 / 近 30 天
 * - 近 14 天逐日曲线
 * - 本月按模型分布
 * - 缓存命中率（缓存读 token 占输入的比例）
 *
 * 只做本地只读统计，不发任何网络请求。
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { getAgentSessionsDir } from './config-paths'

export interface UsageBucket {
  /** 会话数 */
  sessions: number
  /** 消息条数（含工具消息） */
  messages: number
  /** 输入 token（含缓存） */
  inputTokens: number
  /** 输出 token */
  outputTokens: number
}

export interface UsageSummary {
  /** 累计 */
  total: UsageBucket
  /** 近 7 天 */
  last7Days: UsageBucket
  /** 近 30 天 */
  last30Days: UsageBucket
  /** 今天 */
  today: UsageBucket
  /** 近 14 天逐日 token（键为 YYYY-MM-DD，含 0 值日期） */
  days: Record<string, number>
  /** 本月按模型分布（模型名 → token） */
  byModel: Record<string, number>
  /** 缓存命中率 0..1；无数据时为 null */
  cacheHitRate: number | null
  /** 有多少个会话参与过统计 */
  scannedSessions: number
  /** 统计是否因为文件过大被截断 */
  truncated: boolean
}

const EMPTY_BUCKET = (): UsageBucket => ({ sessions: 0, messages: 0, inputTokens: 0, outputTokens: 0 })

function addBucket(target: UsageBucket, source: UsageBucket): void {
  target.sessions += source.sessions
  target.messages += source.messages
  target.inputTokens += source.inputTokens
  target.outputTokens += source.outputTokens
}

interface UsageNumbers {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
}

interface SessionStats {
  bucket: UsageBucket
  /** 逐日 token（本地时区 YYYY-MM-DD） */
  days: Record<string, number>
  /** 按模型 token（仅本月） */
  byModel: Record<string, number>
  /** 缓存读 token 累计 */
  cacheReadTokens: number
}

function tokensFrom(usage: UsageNumbers): { input: number; output: number; cacheRead: number } {
  const cacheRead = usage.cache_read_input_tokens ?? 0
  const input = (usage.input_tokens ?? 0) + cacheRead + (usage.cache_creation_input_tokens ?? 0)
  return { input, output: usage.output_tokens ?? 0, cacheRead }
}

/** 单文件最大扫描 24MB，避免一个超长会话拖垮统计。 */
const MAX_BYTES_PER_SESSION = 24 * 1024 * 1024

/** 本地时区的 YYYY-MM-DD，与用户直觉一致（不用 UTC） */
function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/**
 * 从会话行解析时间。
 *
 * 优先 `_createdAt`（Roy 写入的毫秒时间戳），
 * 回退到标准 `timestamp` / `message.timestamp`（ISO 字符串）。
 */
function resolveMessageTime(parsed: Record<string, unknown>): Date | undefined {
  const raw = parsed._createdAt ?? parsed.timestamp ?? parsed.createdAt
    ?? ((parsed.message as Record<string, unknown> | undefined)?.timestamp)

  if (typeof raw === 'number' && Number.isFinite(raw)) {
    // 兼容秒级与毫秒级
    const ms = raw < 1e12 ? raw * 1000 : raw
    const date = new Date(ms)
    return Number.isNaN(date.getTime()) ? undefined : date
  }
  if (typeof raw === 'string' && raw) {
    const date = new Date(raw)
    return Number.isNaN(date.getTime()) ? undefined : date
  }
  return undefined
}

function readSessionStats(filePath: string, seenUuids: Set<string>): SessionStats {
  const stats: SessionStats = {
    bucket: EMPTY_BUCKET(),
    days: {},
    byModel: {},
    cacheReadTokens: 0,
  }

  // 去重集合由调用方跨文件共享：分叉会话会复制同一段历史，
  // 同一个 uuid 可能同时出现在多个会话文件里，只算一次才准确。

  let raw: string
  try {
    const size = statSync(filePath).size
    raw = readFileSync(filePath, 'utf-8')
    if (size > MAX_BYTES_PER_SESSION) raw = raw.slice(-MAX_BYTES_PER_SESSION)
  } catch {
    return stats
  }

  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)

  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(trimmed) as Record<string, unknown>
    } catch {
      continue
    }

    // 全局按 uuid 去重；没有 uuid 的旧数据不过滤（保持原有行为）
    const uuid = typeof parsed.uuid === 'string' ? parsed.uuid : undefined
    if (uuid) {
      if (seenUuids.has(uuid)) continue
      seenUuids.add(uuid)
    }

    stats.bucket.messages += 1

    const usage = (parsed.usage as UsageNumbers | undefined)
      ?? ((parsed.message as Record<string, unknown> | undefined)?.usage as UsageNumbers | undefined)
    if (!usage) continue

    const { input, output, cacheRead } = tokensFrom(usage)
    stats.bucket.inputTokens += input
    stats.bucket.outputTokens += output
    stats.cacheReadTokens += cacheRead

    // 时间：Roy 的会话行用 _createdAt（毫秒时间戳），
    // 兼容标准的 timestamp / message.timestamp 字符串形式。
    const time = resolveMessageTime(parsed)
    if (time) {
      const key = localDayKey(time)
      stats.days[key] = (stats.days[key] ?? 0) + input + output

      if (time >= monthStart) {
        // assistant 消息把模型放在 message.model；
        // result 汇总消息只带 _channelModelId，两者都要认。
        const model = ((parsed.message as Record<string, unknown> | undefined)?.model as string | undefined)
          ?? (parsed._channelModelId as string | undefined)
          ?? (parsed.model as string | undefined)
          ?? 'unknown'
        stats.byModel[model] = (stats.byModel[model] ?? 0) + input + output
      }
    }
  }

  if (stats.bucket.messages > 0) stats.bucket.sessions = 1
  return stats
}

/** 生成近 N 天（含今天）的日期键，保证曲线连续不缺口 */
function recentDayKeys(days: number): string[] {
  const keys: string[] = []
  for (let i = days - 1; i >= 0; i -= 1) {
    keys.push(localDayKey(new Date(Date.now() - i * 86400000)))
  }
  return keys
}

/**
 * 汇总用量。首次调用会读全部会话文件，之后由调用方自行缓存。
 */
export function getUsageSummary(): UsageSummary {
  const summary: UsageSummary = {
    total: EMPTY_BUCKET(),
    last7Days: EMPTY_BUCKET(),
    last30Days: EMPTY_BUCKET(),
    today: EMPTY_BUCKET(),
    days: Object.fromEntries(recentDayKeys(14).map((key) => [key, 0])),
    byModel: {},
    cacheHitRate: null,
    scannedSessions: 0,
    truncated: false,
  }

  const dir = getAgentSessionsDir()
  if (!existsSync(dir)) return summary

  let files: string[]
  try {
    files = readdirSync(dir).filter((name) => name.endsWith('.jsonl'))
  } catch {
    return summary
  }

  const now = Date.now()
  const since7 = now - 7 * 86400000
  const since30 = now - 30 * 86400000
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)

  let cacheReadTotal = 0
  // 跨会话去重：分叉会话共享同一批 uuid，重复统计会把用量放大数倍
  const seenUuids = new Set<string>()

  for (const name of files) {
    const filePath = join(dir, name)
    let mtime: number
    try {
      mtime = statSync(filePath).mtimeMs
    } catch {
      continue
    }

    const stats = readSessionStats(filePath, seenUuids)
    if (stats.bucket.messages === 0) continue

    summary.scannedSessions += 1
    addBucket(summary.total, stats.bucket)
    cacheReadTotal += stats.cacheReadTokens

    if (mtime >= startOfToday.getTime()) addBucket(summary.today, stats.bucket)
    if (mtime >= since7) addBucket(summary.last7Days, stats.bucket)
    if (mtime >= since30) addBucket(summary.last30Days, stats.bucket)

    for (const [key, value] of Object.entries(stats.days)) {
      if (key in summary.days) summary.days[key] = (summary.days[key] ?? 0) + value
    }
    for (const [model, value] of Object.entries(stats.byModel)) {
      summary.byModel[model] = (summary.byModel[model] ?? 0) + value
    }
  }

  // 缓存命中率：缓存读 / 总输入（含缓存）
  if (summary.total.inputTokens > 0) {
    summary.cacheHitRate = cacheReadTotal / summary.total.inputTokens
  }

  return summary
}
