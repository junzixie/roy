/**
 * Pi 自动压缩阈值与压缩预算
 *
 * Pi SDK 在 `contextTokens > contextWindow - reserveTokens` 时开始自动压缩，
 * 也就是说：预留越多、「越早」用到百分之多少开始压缩。
 *
 * 阈值可由用户设置（百分比，默认 80%）：更高=更晚压缩（更省摘要、更易撞到细节）；
 * 更低=更早压缩（更省原上下文）。
 */

/** 默认上下文占用到 80% 时开始自动压缩。 */
export const PI_AUTO_COMPACTION_THRESHOLD_RATIO = 0.8

/**
 * 参与压缩计算的有效窗口上限（token）。
 *
 * 渠道里的 contextWindow 是手填/抓取来的，虚标成 1,000,000 时，80% 的阈值会算成
 * 80 万 token——而中转站往往在二三十万 token 就开始明显变慢，导致压缩永远不触发
 * （实测：某会话堆到 24.6 万 token、首字节 164 秒，压缩事件 0 次）。
 * 所以先按这个上限截断「有效窗口」，再乘用户设置的比例：无论窗口标多大，
 * 压缩点都不会晚于 20 万 token；同时百分比设置对大窗口依然生效
 * （若直接对乘积取小值，1M 窗口下无论填 50% 还是 95% 都恒等于 20 万，设置等于失效）。
 */
export const PI_AUTO_COMPACTION_ABSOLUTE_MAX_TOKENS = 200_000

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
 * @param thresholdRatio 目标占用比例（默认 0.8）；来自设置上的百分比 / 100
 */
export function calculatePiAutoCompactionReserveTokens(
  contextWindow: number,
  thresholdRatio: number = PI_AUTO_COMPACTION_THRESHOLD_RATIO,
): number {
  return contextWindow - calculatePiAutoCompactionThresholdTokens(contextWindow, thresholdRatio)
}

/**
 * 返回 Pi SDK 会开始自动压缩的上下文 token 阈值。
 *
 * 先把窗口截断到绝对上限得到「有效窗口」，再乘比例：
 * - 窗口标得再大，压缩点也不会晚于 20 万 token；
 * - 用户设置的百分比对大窗口仍然生效（1M 窗口填 50% 就是 10 万）。
 */
export function calculatePiAutoCompactionThresholdTokens(
  contextWindow: number,
  thresholdRatio: number = PI_AUTO_COMPACTION_THRESHOLD_RATIO,
): number {
  if (!Number.isFinite(contextWindow) || contextWindow <= 0) {
    throw new TypeError('Pi context window must be a positive finite number')
  }

  const ratio = Number.isFinite(thresholdRatio) && thresholdRatio > 0 && thresholdRatio < 1
    ? thresholdRatio
    : PI_AUTO_COMPACTION_THRESHOLD_RATIO

  const effectiveWindow = Math.min(contextWindow, PI_AUTO_COMPACTION_ABSOLUTE_MAX_TOKENS)
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
