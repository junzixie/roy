import { describe, expect, test } from 'bun:test'
import {
  PI_AUTO_COMPACTION_MAX_PERCENT,
  PI_AUTO_COMPACTION_MIN_PERCENT,
  calculatePiAutoCompactionReserveTokens,
  calculatePiAutoCompactionThresholdTokens,
  normalizeCompactionPercent,
  LAYERED_COMPACT_KEEP_RECENT_MESSAGES,
  LAYERED_COMPACT_TOKEN_BUDGET_HINT,
} from './pi-compaction'

describe('自动压缩阈值', () => {
  test('默认在 80% 开始压缩：预留 20% 窗口', () => {
    expect(calculatePiAutoCompactionReserveTokens(100_000)).toBe(20_000)
    expect(calculatePiAutoCompactionThresholdTokens(100_000)).toBe(80_000)
  })

  test('给定用户设置的 70%，压缩点落在 70% 附近（预留向上取整，不会晚于 70%）', () => {
    // 预留 = ceil(窗口 * 30%) = 30000，所以压缩点是 70000
    expect(calculatePiAutoCompactionReserveTokens(100_000, 0.7)).toBe(30_000)
    expect(calculatePiAutoCompactionThresholdTokens(100_000, 0.7)).toBe(70_000)
  })

  test('预留向上取整：窗口不是整数倍时也不会晚于目标比例', () => {
    const window = 333_333
    const reserve = calculatePiAutoCompactionReserveTokens(window, 0.7)
    const threshold = calculatePiAutoCompactionThresholdTokens(window, 0.7)

    expect(reserve).toBe(Math.ceil(window * 0.3))
    expect(threshold).toBeLessThanOrEqual(window * 0.7)
  })

  test('给定 90%，只预留 10%', () => {
    expect(calculatePiAutoCompactionReserveTokens(100_000, 0.9)).toBe(10_000)
  })

  test('非法比例回退到默认 80%，不会算出负数或零预留', () => {
    expect(calculatePiAutoCompactionReserveTokens(100_000, 0)).toBe(20_000)
    expect(calculatePiAutoCompactionReserveTokens(100_000, 1)).toBe(20_000)
    expect(calculatePiAutoCompactionReserveTokens(100_000, Number.NaN)).toBe(20_000)
  })

  test('contextWindow 非法时抛错，避免静默配置出错误的预留值', () => {
    expect(() => calculatePiAutoCompactionReserveTokens(0)).toThrow()
    expect(() => calculatePiAutoCompactionReserveTokens(-1)).toThrow()
    expect(() => calculatePiAutoCompactionReserveTokens(Number.NaN)).toThrow()
  })

  test('百分比收敛到允许区间内', () => {
    expect(normalizeCompactionPercent(undefined)).toBe(80)
    expect(normalizeCompactionPercent(10)).toBe(PI_AUTO_COMPACTION_MIN_PERCENT)
    expect(normalizeCompactionPercent(100)).toBe(PI_AUTO_COMPACTION_MAX_PERCENT)
    expect(normalizeCompactionPercent(72.6)).toBe(73)
  })

  test('分层预算常量已导出且为正', () => {
    expect(LAYERED_COMPACT_KEEP_RECENT_MESSAGES).toBeGreaterThan(0)
    expect(LAYERED_COMPACT_TOKEN_BUDGET_HINT).toBeGreaterThan(0)
  })
})