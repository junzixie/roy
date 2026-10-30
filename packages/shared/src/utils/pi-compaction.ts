/**
 * Pi 自动压缩阈值与压缩预算
 *
 * Pi SDK 在 `contextTokens > contextWindow - reserveTokens` 时开始自动压缩，
 * 也就是说：预留越多、「越早」用到百分之多少开始压缩。
 *
 * 阈值可由用户设置（百分比，默认 90%，对齐 Claude/Codex 近满再压）：更高=更晚压缩（更省摘要、更易撞到细节）；
 * 更低=更早压缩（更省原上下文）。
 */

/** 默认上下文占用到 90% 时开始自动压缩（cache-preserving，对齐 Claude/Codex）。 */
export const PI_AUTO_COMPACTION_THRESHOLD_RATIO = 0.9

/**
 * 参与压缩计算的有效窗口上限（token）。
 *
 * 渠道里的 contextWindow 是手填/抓取来的，虚标成 1,000,000 时，80% 的阈值会算成
 * 80 万 token——而中转站往往在二三十万 token 就开始明显变慢，导致压缩永远不触发
 * （实测：某会话堆到 24.6 万 token、首字节 164 秒，压缩事件 0 次）。
 * 所以先按这个上限截断「有效窗口」，再乘用户设置的比例：无论窗口标多大，
 * 压缩点都不会晚于 28 万 token；同时百分比设置对大窗口依然生效
 * （若直接对乘积取小值，1M 窗口下无论填 50% 还是 95% 都恒等于 20 万，设置等于失效）。
 */
export const PI_AUTO_COMPACTION_ABSOLUTE_MAX_TOKENS = 280_000

/**
 * 空闲预压缩水位：有效窗口的 65%。
 * 低于正式 90% 触发线；会话空闲一段时间后后台静默整理，避免聊天时卡在近满节点等待摘要。
 */
export const PI_IDLE_PRECOMPACT_WATERMARK_RATIO = 0.65

/** 会话空闲多久后才启动预压缩（毫秒）。默认 45 秒，落在 30–60 秒建议区间。 */
export const PI_IDLE_PRECOMPACT_DELAY_MS = 45_000

/** 已达正式阈值时的短延迟：尽快在后台整理，但仍让 STREAM_COMPLETE 先落下。 */
export const PI_IDLE_PRECOMPACT_NEAR_FULL_DELAY_MS = 1_500


/** Known provider windows can explicitly opt out of the conservative safety cap. */
export type PiCompactionCacheStrategy = 'cache-preserving' | 'balanced' | 'aggressive'

export interface PiCompactionThresholdOptions {
  /** Trust the provider-reported context window instead of applying the fallback cap. */
  trustedWindow?: boolean
  /** Select a default threshold ratio when no explicit ratio is passed. */
  strategy?: PiCompactionCacheStrategy
}

/** Higher ratios compact later, preserving cache longer; lower ratios compact more aggressively. */
export const PI_COMPACTION_STRATEGY_RATIOS: Record<PiCompactionCacheStrategy, number> = {
  'cache-preserving': 0.9,
  balanced: 0.8,
  aggressive: 0.7,
}

/** Pure strategy-to-threshold mapping. */
export function getPiCompactionStrategyRatio(
  strategy: PiCompactionCacheStrategy = 'cache-preserving',
): number {
  return PI_COMPACTION_STRATEGY_RATIOS[strategy] ?? PI_COMPACTION_STRATEGY_RATIOS.balanced
}

/** 用户可配置百分比的范围：太低会频繁压缩，太高容易一轮对话就撞上限。 */
export const PI_AUTO_COMPACTION_MIN_PERCENT = 50
export const PI_AUTO_COMPACTION_MAX_PERCENT = 95

/**
 * 压缩时保留最近原文的 token 预算上限。
 *
 * Pi 默认 20000。实测 Roy 压缩一次后残留仍有 8.6 万 token（其中 4.25 万是系统提示与
 * 工具定义的固定开销），说明 2 万原文叠加摘要后压缩收益有限，很快会再次撞线。
 * 降到 12000 让压缩后能真正回落到可用区间，同时仍保留足够近期上下文。
 */
export const PI_COMPACTION_KEEP_RECENT_TOKENS = 12_000

/** 保留原文预算的下限，避免小窗口模型压缩后只剩摘要、丢掉全部近期上下文。 */
export const PI_COMPACTION_KEEP_RECENT_MIN_TOKENS = 2_000

/** 把设置上的百分比（80）规范成合法整数；非法则掉到默认。 */
export function normalizeCompactionPercent(percent: number | null | undefined): number {
  if (typeof percent !== 'number' || !Number.isFinite(percent)) {
    return Math.round(PI_AUTO_COMPACTION_THRESHOLD_RATIO * 100)
  }
  const rounded = Math.round(percent)
  if (rounded < PI_AUTO_COMPACTION_MIN_PERCENT) return PI_AUTO_COMPACTION_MIN_PERCENT
  if (rounded > PI_AUTO_COMPACTION_MAX_PERCENT) return PI_AUTO_COMPACTION_MAX_PERCENT
  return rounded
}

/**
 * 把目标上下文占用比例换算为 Pi SDK 的 reserveTokens 参数。
 *
 * @param contextWindow 模型上下文窗口（token）
 * @param thresholdRatio 目标占用比例（优先）；来自设置上的百分比 / 100
 * @param options trustedWindow 只应由已验证的模型窗口启用；strategy 只在未传有效比例时生效
 */
export function calculatePiAutoCompactionReserveTokens(
  contextWindow: number,
  thresholdRatio?: number,
  options?: PiCompactionThresholdOptions,
): number {
  return contextWindow - calculatePiAutoCompactionThresholdTokens(contextWindow, thresholdRatio, options)
}

/**
 * 返回 Pi SDK 会开始自动压缩的上下文 token 阈值。
 *
 * 先把窗口截断到绝对上限得到「有效窗口」，再乘比例：
 * - 窗口标得再大，压缩点也不会晚于 28 万 token；
 * - 用户设置的百分比对大窗口仍然生效（1M 窗口填 50% 就是 10 万）。
 * 已验证的原生上下文窗口可通过 trustedWindow 显式跳过该保守上限。
 */
export function calculatePiAutoCompactionThresholdTokens(
  contextWindow: number,
  thresholdRatio?: number,
  options?: PiCompactionThresholdOptions,
): number {
  if (!Number.isFinite(contextWindow) || contextWindow <= 0) {
    throw new TypeError('Pi context window must be a positive finite number')
  }

  const fallbackRatio = options?.strategy
    ? getPiCompactionStrategyRatio(options.strategy)
    : PI_AUTO_COMPACTION_THRESHOLD_RATIO
  const ratio = typeof thresholdRatio === 'number' && Number.isFinite(thresholdRatio) && thresholdRatio > 0 && thresholdRatio < 1
    ? thresholdRatio
    : fallbackRatio

  const effectiveWindow = options?.trustedWindow
    ? contextWindow
    : Math.min(contextWindow, PI_AUTO_COMPACTION_ABSOLUTE_MAX_TOKENS)
  // 用 floor 而不是 round，保证压缩点不会晚于目标比例
  //（1 - 0.7 === 0.30000000000000004，向上取整会多预留 1 个 token）。
  return Math.floor(effectiveWindow * ratio)
}

/**
 * 计算压缩时保留最近原文的 token 预算。
 *
 * 取固定预算与窗口的比例值中的较小者，再夹到下限：
 * - 大窗口：用固定 12000，避免像 Pi 默认 20000 那样压完仍偏高；
 * - 小窗口：按窗口收缩，避免保留量本身就把上下文顶回阈值。
 */
export function calculatePiCompactionKeepRecentTokens(contextWindow: number): number {
  if (!Number.isFinite(contextWindow) || contextWindow <= 0) {
    throw new TypeError('Pi context window must be a positive finite number')
  }

  const effectiveWindow = Math.min(contextWindow, PI_AUTO_COMPACTION_ABSOLUTE_MAX_TOKENS)
  const byWindow = Math.floor(effectiveWindow * 0.1)
  return Math.max(
    PI_COMPACTION_KEEP_RECENT_MIN_TOKENS,
    Math.min(PI_COMPACTION_KEEP_RECENT_TOKENS, byWindow),
  )
}

/**
 * 压缩后残留是否仍然过高。
 *
 * 压缩的收益不看「是否触发」，而看「压完降到多少」。若压缩后估算 token 仍超过阈值，
 * 说明保留预算过大或摘要本身太长，继续对话很快会再次撞线、反复压缩。
 *
 * @param estimatedTokensAfter 压缩后的估算上下文 token（Pi 的 CompactionResult 提供）
 * @param thresholdTokens 本次运行的压缩阈值
 * @param toleranceRatio 允许的超阈值余量比例，默认 0.1（即超过阈值 10% 才算未收敛）
 */
export function isCompactionResidualTooHigh(
  estimatedTokensAfter: number | undefined,
  thresholdTokens: number,
  toleranceRatio = 0.1,
): boolean {
  if (typeof estimatedTokensAfter !== 'number' || !Number.isFinite(estimatedTokensAfter)) return false
  if (!Number.isFinite(thresholdTokens) || thresholdTokens <= 0) return false
  const safeTolerance = Number.isFinite(toleranceRatio) && toleranceRatio >= 0 ? toleranceRatio : 0.1
  return estimatedTokensAfter > thresholdTokens * (1 + safeTolerance)
}

/** 压缩后残留的归因结果。 */
export interface CompactionResidualBreakdown {
  /** 每轮固定重发的系统提示 + 工具定义，压缩无法触及。 */
  fixedOverhead: number
  /** 保留的最近原文（keepRecentTokens 预算）。 */
  keepRecent: number
  /** 摘要本身的体积。 */
  summary: number
  /** 以上三项之外的差额：文件操作列表、turn prefix 等。 */
  unexplained: number
  /** 占比最大的一项，用于判断该往哪里优化。 */
  dominant: 'fixedOverhead' | 'keepRecent' | 'summary' | 'unexplained'
}

/**
 * 把压缩后的残留拆成可归因的几部分。
 *
 * 实测 Roy 压缩一次后残留 8.6 万 token，其中约 4.25 万是每轮固定重发的系统提示与
 * 工具定义——这部分压缩永远碰不到。只有把残留拆开，才能判断「压完还是慢」到底该
 * 减工具、降 keepRecentTokens，还是摘要本身太长。
 *
 * @param estimatedTokensAfter Pi 给出的压缩后估算 token
 * @param keepRecentTokens 本次压缩的保留原文预算
 * @param summaryChars 摘要字符数
 * @param fixedOverheadTokens 系统提示与工具定义的估算 token
 */
export function describeCompactionResidual(
  estimatedTokensAfter: number,
  keepRecentTokens: number,
  summaryChars: number,
  fixedOverheadTokens: number,
): CompactionResidualBreakdown {
  const safeTotal = Number.isFinite(estimatedTokensAfter) && estimatedTokensAfter > 0 ? estimatedTokensAfter : 0
  const fixedOverhead = Math.max(0, Math.min(fixedOverheadTokens, safeTotal))
  const keepRecent = Math.max(0, Math.min(keepRecentTokens, safeTotal - fixedOverhead))
  // 中英混排按约 3.5 字符/token 估算，只用于归因，不参与阈值判定。
  const summary = Math.max(0, Math.min(Math.ceil(Math.max(0, summaryChars) / 3.5), safeTotal - fixedOverhead - keepRecent))
  const unexplained = Math.max(0, safeTotal - fixedOverhead - keepRecent - summary)

  const parts: Array<[CompactionResidualBreakdown['dominant'], number]> = [
    ['fixedOverhead', fixedOverhead],
    ['keepRecent', keepRecent],
    ['summary', summary],
    ['unexplained', unexplained],
  ]
  const dominant = parts.reduce((best, cur) => (cur[1] > best[1] ? cur : best))[0]

  return { fixedOverhead, keepRecent, summary, unexplained, dominant }
}

/**
 * Feibo 风格：单条工具输出的字符上限。
 *
 * 大文件 read / 长命令输出不截断会几轮就把上下文顶满，触发过早压缩。
 * 保留头+尾，中间标省略，模型仍能看到开头结构与末尾结果。
 */

/** 空闲预压缩水位（绝对 token）。与正式阈值共用有效窗口 / trustedWindow 规则。 */
export function calculatePiIdlePrecompactWatermarkTokens(
  contextWindow: number,
  options?: PiCompactionThresholdOptions,
): number {
  if (!Number.isFinite(contextWindow) || contextWindow <= 0) {
    throw new TypeError('Pi context window must be a positive finite number')
  }
  const effectiveWindow = options?.trustedWindow
    ? contextWindow
    : Math.min(contextWindow, PI_AUTO_COMPACTION_ABSOLUTE_MAX_TOKENS)
  return Math.floor(effectiveWindow * PI_IDLE_PRECOMPACT_WATERMARK_RATIO)
}

/** 是否应在空闲时预约静默预压缩（已达水位，且不是正在跑的压缩本身）。 */
export function shouldScheduleIdlePrecompact(options: {
  contextTokens: number
  contextWindow: number
  formalThresholdTokens: number
  trustedWindow?: boolean
}): boolean {
  const { contextTokens, contextWindow, formalThresholdTokens, trustedWindow } = options
  if (!Number.isFinite(contextTokens) || contextTokens <= 0) return false
  if (!Number.isFinite(contextWindow) || contextWindow <= 0) return false
  if (!Number.isFinite(formalThresholdTokens) || formalThresholdTokens <= 0) return false
  const watermark = calculatePiIdlePrecompactWatermarkTokens(contextWindow, { trustedWindow })
  // 水位必须低于正式线；若配置异常则仍允许在正式线附近预约。
  const gate = Math.min(watermark, formalThresholdTokens)
  return contextTokens >= gate
}

/** 预约延迟：已过正式线 → 短延迟；仅过水位 → 正常空闲延迟。 */
export function resolveIdlePrecompactDelayMs(
  contextTokens: number,
  formalThresholdTokens: number,
): number {
  if (
    Number.isFinite(contextTokens)
    && Number.isFinite(formalThresholdTokens)
    && formalThresholdTokens > 0
    && contextTokens >= formalThresholdTokens
  ) {
    return PI_IDLE_PRECOMPACT_NEAR_FULL_DELAY_MS
  }
  return PI_IDLE_PRECOMPACT_DELAY_MS
}

export const PI_SHORT_TOOL_OUTPUT_CHARS = 12_000
/** 截断时保留的头部字符数。 */
export const PI_SHORT_TOOL_OUTPUT_HEAD_CHARS = 8_000
/** 截断时保留的尾部字符数。 */
export const PI_SHORT_TOOL_OUTPUT_TAIL_CHARS = 3_000

/** 把过长纯文本截成「头 + 省略标记 + 尾」。未超限返回原串。 */
export function truncateToolResultText(
  text: string,
  maxChars: number = PI_SHORT_TOOL_OUTPUT_CHARS,
): string {
  if (typeof text !== 'string' || text.length <= maxChars) return text
  const headBudget = Math.min(PI_SHORT_TOOL_OUTPUT_HEAD_CHARS, Math.max(0, maxChars - 120))
  const tailBudget = Math.min(
    PI_SHORT_TOOL_OUTPUT_TAIL_CHARS,
    Math.max(0, maxChars - headBudget - 120),
  )
  const head = text.slice(0, headBudget)
  const tail = text.slice(Math.max(headBudget, text.length - tailBudget))
  const omitted = Math.max(0, text.length - head.length - tail.length)
  return `${head}\n\n…[工具输出已截断，省略 ${omitted} 字符]…\n\n${tail}`
}

type ToolResultTextPart = { type?: unknown; text?: unknown }

/**
 * 截断 tool result 的 content（string 或 text part 数组）。
 * 未改动时返回原引用，便于调用方做引用相等判断。
 */
export function truncateToolResultContent<T>(
  content: T,
  maxChars: number = PI_SHORT_TOOL_OUTPUT_CHARS,
): T {
  if (typeof content === 'string') {
    const next = truncateToolResultText(content, maxChars)
    return (next === content ? content : next) as T
  }
  if (!Array.isArray(content)) return content

  let changed = false
  const next = content.map((part) => {
    if (!part || typeof part !== 'object') return part
    const typed = part as ToolResultTextPart
    if (typed.type !== 'text' || typeof typed.text !== 'string') return part
    const truncated = truncateToolResultText(typed.text, maxChars)
    if (truncated === typed.text) return part
    changed = true
    return { ...typed, text: truncated }
  })
  return (changed ? next : content) as T
}

/**
 * 对消息列表里 role=toolResult 的正文做就地式预截断（copy-on-write）。
 * 用于 transformContext / 压缩前：历史里已有的大工具输出也会被裁掉。
 */
export function pruneOversizedToolResultsInMessages<T extends { role?: unknown; content?: unknown }>(
  messages: readonly T[],
  maxChars: number = PI_SHORT_TOOL_OUTPUT_CHARS,
): T[] {
  let changed = false
  const next = messages.map((message) => {
    if (!message || message.role !== 'toolResult') return message
    if (message.content === undefined) return message
    const truncated = truncateToolResultContent(message.content, maxChars)
    if (truncated === message.content) return message
    changed = true
    return { ...message, content: truncated }
  })
  return changed ? next : (messages as T[])
}

/**
 * 粗略估算消息列表的字符总量，用于「要不要开始瘦身」的水位判断。
 *
 * 只数文本，不数图片二进制；够用来做门限比较，不用于精确 token 记账。
 * 与 token 的换算按 3 字符 ≈ 1 token 的保守经验值，调用方自己乘。
 */
export function estimatePiMessagesChars(messages: readonly unknown[]): number {
  let total = 0
  const walk = (value: unknown, depth: number): void => {
    if (depth > 8 || value == null) return
    if (typeof value === 'string') { total += value.length; return }
    if (Array.isArray(value)) {
      for (const item of value) walk(item, depth + 1)
      return
    }
    if (typeof value === 'object') {
      for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
        // 跳过元数据与结构性字段，避免把时间戳/uuid/role 枚举也算成体积
        if (key === 'uuid' || key === 'timestamp' || key === 'parent_tool_use_id' || key === 'role' || key === 'type') continue
        walk(item, depth + 1)
      }
    }
  }
  walk(messages, 0)
  return total
}

/**
 * 分级瘦身：按「离当前多远」决定每条历史工具结果留多少。
 *
 * 动机（对照 DSH 的 `compaction/prune` 机制）：
 * DSH 会话里 prune 事件出现 35 次、22 次、15 次，而真正调 LLM 做摘要的
 * `compaction/start` 只有 1–6 次。也就是它主要靠「裁剪历史工具输出」控制体积，
 * 而不是频繁重写整段历史。Roy 之前只有一条 `maxChars=12000` 的一刀切阈值，
 * 实测单条工具结果最大到 85,171 字符，超阈值部分占会话工具输出的 10%–60%
 * 【实测：扫描 ~/.roy/agent-sessions 下 12 个会话得出】。
 *
 * 为什么不直接全部按 12000 一刀切：
 * 近期几轮的工具结果往往还在被引用（刚跑的命令、刚读的文件），砍掉会立刻
 * 让模型「失忆」并重跑工具，反而更贵。所以越早的消息裁得越狠，最近几轮保原样。
 *
 * 与 DSH 的差异（明确不做的事）：
 * DSH 用 `shadowedSeqs` 让旧消息「不参与上下文但保留在存储里」，那是它自己的
 * 存储格式能力。Roy 走 Pi SDK，只能在发送前生成一份裁剪副本（copy-on-write），
 * 不落盘、不改 artifact，因此**这里不会**声称做到了「可回溯的 shadow」。
 *
 * 注意：这个函数改变的是发出去的消息内容，会改变提示前缀，可能降低缓存命中率。
 * 调用方应当只在「已经超过某个体积水位」时才启用，而不是每轮无条件跑。
 */
export const PI_TIERED_PRUNE_RECENT_KEEP = 6
export const PI_TIERED_PRUNE_MID_CHARS = 12_000
export const PI_TIERED_PRUNE_OLD_CHARS = 3_000

/**
 * @param messages 消息列表（Pi 的 role 字段）
 * @param options.recentKeep 最近多少条 toolResult 保持原样
 * @param options.midChars 中间段的单条上限
 * @param options.oldChars 更早段的单条上限
 * @returns 是否发生了变化 + 新数组；未变化时返回原引用，便于调用方零开销短路
 */
export function pruneToolResultsTiered<T extends { role?: unknown; content?: unknown }>(
  messages: readonly T[],
  options?: {
    recentKeep?: number
    midChars?: number
    oldChars?: number
  },
): { messages: T[]; changed: boolean; prunedCount: number } {
  const recentKeep = Math.max(0, Math.floor(options?.recentKeep ?? PI_TIERED_PRUNE_RECENT_KEEP))
  const midChars = Math.max(0, Math.floor(options?.midChars ?? PI_TIERED_PRUNE_MID_CHARS))
  const oldChars = Math.max(0, Math.floor(options?.oldChars ?? PI_TIERED_PRUNE_OLD_CHARS))

  // 先收集所有 toolResult 的下标，从后往前数，才知道每条「排第几新」
  const toolIndexes: number[] = []
  for (let i = 0; i < messages.length; i++) {
    const role = messages[i]?.role
    if (role === 'toolResult' || role === 'tool_result') toolIndexes.push(i)
  }
  if (toolIndexes.length === 0) return { messages: messages as T[], changed: false, prunedCount: 0 }

  const total = toolIndexes.length
  const tierOf = new Map<number, number>()
  for (let n = 0; n < total; n++) {
    const index = toolIndexes[n]!
    // 从末尾数：最近 recentKeep 条保持原样
    const fromEnd = total - 1 - n
    if (fromEnd < recentKeep) continue
    // 中间段与更早段各用一个上限
    tierOf.set(index, fromEnd < recentKeep * 2 ? midChars : oldChars)
  }
  if (tierOf.size === 0) return { messages: messages as T[], changed: false, prunedCount: 0 }

  let changed = false
  let prunedCount = 0
  const next = messages.map((message, i) => {
    const limit = tierOf.get(i)
    if (limit === undefined || !message || message.content === undefined) return message
    const truncated = truncateToolResultContent(message.content, limit)
    if (truncated === message.content) return message
    changed = true
    prunedCount++
    return { ...message, content: truncated }
  })
  return { messages: changed ? next : (messages as T[]), changed, prunedCount }
}
