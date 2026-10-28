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
  if (!Number.isFinite(contextWindow) || contextWindow <= 0) {
    throw new TypeError('Pi context window must be a positive finite number')
  }

  const ratio = Number.isFinite(thresholdRatio) && thresholdRatio > 0 && thresholdRatio < 1
    ? thresholdRatio
    : PI_AUTO_COMPACTION_THRESHOLD_RATIO

  // 用阈值减法，而不是直接算 window*(1-ratio)，避免浮点误差
  //（1 - 0.7 === 0.30000000000000004，再 ceil 就会多预留 1 个 token）。
  const threshold = Math.floor(contextWindow * ratio)
  return contextWindow - threshold
}

/** 返回 Pi SDK 会开始自动压缩的上下文 token 阈值。 */
export function calculatePiAutoCompactionThresholdTokens(
  contextWindow: number,
  thresholdRatio: number = PI_AUTO_COMPACTION_THRESHOLD_RATIO,
): number {
  return contextWindow - calculatePiAutoCompactionReserveTokens(contextWindow, thresholdRatio)
}