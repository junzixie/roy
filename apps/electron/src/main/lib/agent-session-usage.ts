/**
 * 读取一个 Agent session 当前的上下文占用率。
 *
 * 用途：automation 调度器在 daily 模式下决定是否要切到新会话——
 * 同一自然日内即便上次运行成功，如果上下文已经接近窗口上限，
 * 继续往里塞会导致本次运行刚开始就触发 SDK 自动压缩，得不偿失。
 *
 * 数据来源：~/.roy/agent-sessions/{id}.jsonl 里最后一条带 usage 的消息。
 * 优先级：
 * 1. SDK result 消息（subtype=success/error_*）：usage + modelUsage[?].contextWindow
 * 2. SDK assistant 消息：message.usage + 按 message.model 推断 contextWindow
 * 3. 都拿不到：返回 undefined（占用率未知），调度器按"保守复用"处理
 *
 * 已用 token 口径与渲染层（useGlobalAgentListeners / SDKMessageRenderer）保持一致：
 * input_tokens + cache_read_input_tokens + cache_creation_input_tokens。
 * 开启 prompt caching 后上下文绝大部分落在 cache_read 上，只取 input_tokens 会把
 * 真实占用率严重低估、令 daily 安全阀几乎无法触发。
 *
 * 性能：从文件尾部反向逐行惰性解析，命中第一条带 usage 的消息即返回，
 * 避免对整份会话 JSONL 全量 JSON.parse（高频 daily 任务一天可触发数百次）。
 */

import { calculateContextUsageRatio, inferContextWindow } from '@roy/shared'
import type { SDKAssistantMessage, SDKResultMessage } from '@roy/shared'
import { closeSync, existsSync, openSync, readSync, statSync } from 'node:fs'
import { getAgentSessionMessagesPath } from './config-paths'

/**
 * 每次从尾部读取的块大小。
 *
 * 会话 JSONL 里真正需要的只是最后一条带 usage 的消息，通常在文件末尾几 KB 内。
 * 64 KB 足够覆盖「最后一个 result + 若干 assistant」的常见情形，又远小于
 * 整份文件（实测最大 2.64 MB）。
 */
const TAIL_CHUNK_BYTES = 64 * 1024

/**
 * 最多往回读多少字节就放弃。
 *
 * 兜底防止「整个文件都没有 usage 字段」时一路读到开头——那种情况读满 1 MB
 * 还没有结果，继续读下去收益也很低，直接返回 undefined 更划算。
 */
const TAIL_MAX_BYTES = 1024 * 1024

/**
 * 从文件尾部反向读取，返回按「从后往前」顺序的非空行。
 *
 * 只读需要的那段字节，而不是把整份 JSONL 读进内存再 split：
 * 2.64 MB 的会话文件实测全量读 + split 单次约 5 ms 同步阻塞主进程，
 * 而 daily 定时任务一天可能触发数百次。
 *
 * 每次读完都把已累积的块**整体**解码一次，而不是逐块 decode 后拼接：
 * 分块边界可能正好落在多字节 UTF-8 字符中间，逐块 toString 会产生替换字符，
 * 把那一行 JSON 变成非法内容。整体解码天然没有这个问题。
 */
function readLinesFromTail(filePath: string): string[] {
  let fd: number | undefined
  try {
    fd = openSync(filePath, 'r')
    const size = statSync(filePath).size
    if (size === 0) return []

    const chunks: Buffer[] = []
    let position = size
    let consumed = 0
    /** 拿到至少这么多完整行就够调用方回溯了。 */
    const ENOUGH_LINES = 5

    while (position > 0 && consumed < TAIL_MAX_BYTES) {
      const chunkSize = Math.min(TAIL_CHUNK_BYTES, position)
      position -= chunkSize
      const buffer = Buffer.allocUnsafe(chunkSize)
      readSync(fd, buffer, 0, chunkSize, position)
      consumed += chunkSize
      chunks.unshift(buffer)

      const text = Buffer.concat(chunks).toString('utf-8')
      const parts = text.split('\n')
      // 未读到文件开头时，parts[0] 是被截断的半行，不能算作完整行
      const completeLines = position === 0 ? parts.length : parts.length - 1
      if (completeLines >= ENOUGH_LINES) break
    }

    const text = Buffer.concat(chunks).toString('utf-8')
    const lines = text.split('\n')
    // 未读到开头就丢掉被截断的首行
    if (position > 0) lines.shift()
    return lines.filter((line) => line.trim()).reverse()
  } catch {
    return []
  } finally {
    if (fd !== undefined) {
      try { closeSync(fd) } catch { /* ignore */ }
    }
  }
}

interface UsageTokens {
  input_tokens: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
}

/** 仅供测试：暴露尾部倒读，便于验证分块边界与截断处理。 */
export const readLinesFromTailForTest = readLinesFromTail

/**
 * 与渲染层一致的"已用上下文 token"口径：base input + 两类 cache token。
 */
function sumUsedTokens(usage: UsageTokens): number {
  return (
    usage.input_tokens +
    (usage.cache_read_input_tokens ?? 0) +
    (usage.cache_creation_input_tokens ?? 0)
  )
}

export function getSessionContextUsageRatio(sessionId: string): number | undefined {
  const filePath = getAgentSessionMessagesPath(sessionId)
  if (!existsSync(filePath)) return undefined

  // 只读文件尾部需要的几行，不整份读入（见 readLinesFromTail 注释）。
  // 返回顺序已是「从后往前」。
  const lines = readLinesFromTail(filePath)

  // 从尾部反向找最后一条带 usage 的 SDK 消息（result 优先，因为它带 modelUsage.contextWindow）。
  // 命中即返回，绝大多数情况下只需解析最后一行（result）或最后几行。
  for (const line of lines) {
    if (!line || !line.trim()) continue

    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      continue
    }

    const msg = parsed as { type?: string }

    if (msg.type === 'result') {
      const result = parsed as SDKResultMessage
      // result.usage 是整轮累加值，不是当前上下文；只认 context_usage（最后一次调用）。
      // 旧记录没有这个字段，就跳过 result，往前找单次调用的 assistant 用量。
      if (!result.context_usage) continue
      const usedTokens = sumUsedTokens(result.context_usage)
      const contextWindow = pickResultContextWindow(result)
      return calculateContextUsageRatio(usedTokens, contextWindow)
    }

    if (msg.type === 'assistant') {
      const asst = parsed as SDKAssistantMessage
      const usage = asst.message?.usage
      if (!usage) continue
      const usedTokens = sumUsedTokens(usage)
      const modelId = asst._channelModelId ?? asst.message?.model
      const contextWindow = inferContextWindow(modelId)
      return calculateContextUsageRatio(usedTokens, contextWindow)
    }
  }

  return undefined
}

/**
 * 从 SDK result.modelUsage 多 entry 中选择代表性的 contextWindow。
 *
 * SDK 0.3.142+ Task 工具默认启用后，单次 result 可能包含多个模型（主对话 + 子 agent），
 * modelUsage 会有多个 entry。result.usage 是聚合值，其中大头通常属于主模型，
 * 所以用**最大** contextWindow 作为分母最接近"主模型视角的占用率"——这样：
 *   - 单 entry（常态）：行为与从前一致
 *   - 多 entry：避免被子 agent 的小窗口拉低、过早误触发 daily 切换阈值
 *
 * 每个 entry 优先用 SDK 实测的 contextWindow，缺失时按本次 Agent provider 的运行窗口推断。
 */
function pickResultContextWindow(result: SDKResultMessage): number | undefined {
  if (!result.modelUsage) return undefined
  let best: number | undefined
  for (const [modelId, info] of Object.entries(result.modelUsage)) {
    const fallbackModelId = result._channelModelId ?? modelId
    const fallbackWindow = inferContextWindow(fallbackModelId)
    const win = Math.max(info?.contextWindow ?? 0, fallbackWindow ?? 0) || undefined
    if (win === undefined) continue
    if (best === undefined || win > best) best = win
  }
  return best
}
