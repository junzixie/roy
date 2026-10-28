/**
 * Pi 自动压缩阈值计算
 *
 * Pi SDK 在 `contextTokens > contextWindow - reserveTokens` 时开始自动压缩，
 * 也就是说：预留越多、「越早」用到百分之多少开始压缩。
 *
 * 阈值可由用户设置（百分比，默认 80%）：更高=更晚压缩（更省摘要、更易撞到细节）；
 * 更低=更早压缩（更省原上下文）。
 *
 * 下列 LAYERED_* 常量对照 Feibo compact.ts 的 KEEP_RECENT / SHORT_TOOL_OUTPUT /
 * SUMMARY_*，供后续消息级压缩策略使用；**当前不改变**自动压缩阈值计算行为。
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

/** Feibo 对照：默认保留最近若干条消息不参与 drop（消息级策略预留） */
export const LAYERED_COMPACT_KEEP_RECENT_MESSAGES = 6
/** Feibo 对照：工具输出截断长度（字符） */
export const LAYERED_COMPACT_SHORT_TOOL_OUTPUT_CHARS = 600
/** Feibo 对照：摘要输入预算（字符近似） */
export const LAYERED_COMPACT_SUMMARY_INPUT_CHARS = 24_000
/** Feibo 对照：单次摘要输出上限（字符） */
export const LAYERED_COMPACT_SUMMARY_MAX_CHARS = 8_000
/** Feibo 对照：软 token 预算锚点（非 Pi SDK 官方字段） */
export const LAYERED_COMPACT_TOKEN_BUDGET_HINT = 64_000

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