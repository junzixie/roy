import { describe, expect, test } from 'bun:test'
import {
  PI_AUTO_COMPACTION_MAX_PERCENT,
  PI_AUTO_COMPACTION_MIN_PERCENT,
  PI_AUTO_COMPACTION_ABSOLUTE_MAX_TOKENS,
  PI_IDLE_PRECOMPACT_WATERMARK_RATIO,
  PI_IDLE_PRECOMPACT_DELAY_MS,
  PI_IDLE_PRECOMPACT_NEAR_FULL_DELAY_MS,
  PI_AUTO_COMPACTION_THRESHOLD_RATIO,
  PI_COMPACTION_KEEP_RECENT_TOKENS,
  PI_COMPACTION_KEEP_RECENT_MIN_TOKENS,
  PI_COMPACTION_STRATEGY_RATIOS,
  PI_SHORT_TOOL_OUTPUT_CHARS,
  calculatePiAutoCompactionReserveTokens,
  calculatePiAutoCompactionThresholdTokens,
  calculatePiIdlePrecompactWatermarkTokens,
  shouldScheduleIdlePrecompact,
  resolveIdlePrecompactDelayMs,
  calculatePiCompactionKeepRecentTokens,
  describeCompactionResidual,
  getPiCompactionStrategyRatio,
  isCompactionResidualTooHigh,
  normalizeCompactionPercent,
  pruneOversizedToolResultsInMessages,
  truncateToolResultContent,
  truncateToolResultText,
} from './pi-compaction'
import { inferContextWindow } from './context-window'

describe('自动压缩阈值', () => {
  test('默认在 90% 开始压缩：预留 10% 窗口（对齐 Claude/Codex）', () => {
    expect(PI_AUTO_COMPACTION_THRESHOLD_RATIO).toBe(0.9)
    expect(calculatePiAutoCompactionReserveTokens(100_000)).toBe(10_000)
    expect(calculatePiAutoCompactionThresholdTokens(100_000)).toBe(90_000)
  })

  test('给定用户设置的 70%，压缩点落在 70% 附近（预留向上取整，不会晚于 70%）', () => {
    // 预留 = ceil(窗口 * 30%) = 30000，所以压缩点是 70000
    expect(calculatePiAutoCompactionReserveTokens(100_000, 0.7)).toBe(30_000)
    expect(calculatePiAutoCompactionThresholdTokens(100_000, 0.7)).toBe(70_000)
  })

  test('预留向上取整：窗口不是整数倍时也不会晚于目标比例', () => {
    const window = 100_001
    const reserve = calculatePiAutoCompactionReserveTokens(window, 0.7)
    const threshold = calculatePiAutoCompactionThresholdTokens(window, 0.7)

    expect(reserve).toBe(Math.ceil(window * 0.3))
    expect(threshold).toBeLessThanOrEqual(window * 0.7)
  })

  test('绝对上限优先于比例：大窗口的压缩点不会晚于硬顶', () => {
    // 333333 的有效窗口截到 280000，70% = 196000，早于虚标窗口比例
    expect(calculatePiAutoCompactionThresholdTokens(333_333, 0.7)).toBe(196_000)
    expect(calculatePiAutoCompactionReserveTokens(333_333, 0.7)).toBe(333_333 - 196_000)
  })

  test('绝对上限：窗口虚标成 1,000,000 也不会等 80 万才压缩', () => {
    // 真实事故：渠道把 deepseek-v4.1-flash 标成 1M，80% = 80 万，
    // 会话堆到 24.6 万 token 时压缩一次都没触发，首字节 164 秒、被看门狗连断 3 次。
    // 现在先把窗口截到 28 万再乘比例：默认 90% → 25.2 万。
    expect(calculatePiAutoCompactionThresholdTokens(1_000_000)).toBe(252_000)
    expect(calculatePiAutoCompactionThresholdTokens(1_000_000, 0.95)).toBe(266_000)
    // 对应的 reserveTokens 必须等于窗口减压缩点，否则 Pi 会按错的预留值算阈值
    expect(calculatePiAutoCompactionReserveTokens(1_000_000)).toBe(1_000_000 - 252_000)
  })

  test('大窗口下用户设置的百分比依然生效（不再恒等于硬顶）', () => {
    // 旧实现取 min(窗口×比例, 硬顶)，1M 窗口下任何比例都恒等于硬顶，设置等于失效。
    expect(calculatePiAutoCompactionThresholdTokens(1_000_000, 0.5)).toBe(140_000)
    expect(calculatePiAutoCompactionThresholdTokens(1_000_000, 0.7)).toBe(196_000)
    expect(calculatePiAutoCompactionThresholdTokens(1_000_000, 0.9)).toBe(252_000)
  })

  test('只有显式信任窗口时才不应用保守硬顶', () => {
    expect(calculatePiAutoCompactionThresholdTokens(1_000_000)).toBe(252_000)
    expect(calculatePiAutoCompactionThresholdTokens(1_000_000, 0.8, { trustedWindow: true })).toBe(800_000)
    expect(calculatePiAutoCompactionReserveTokens(1_000_000, 0.8, { trustedWindow: true })).toBe(200_000)
  })

  test('GPT-6.1-Sol 使用已确认窗口而不是 200K 回退值', () => {
    const window = inferContextWindow('gpt-6.1-sol')!
    expect(window).toBe(372_000)
    expect(calculatePiAutoCompactionThresholdTokens(window, 0.8, { trustedWindow: true })).toBe(297_600)
  })

  test('保留上下文策略让 compaction 更晚，激进策略更早', () => {
    expect(getPiCompactionStrategyRatio('cache-preserving')).toBe(0.9)
    expect(getPiCompactionStrategyRatio('balanced')).toBe(0.8)
    expect(getPiCompactionStrategyRatio('aggressive')).toBe(0.7)
    expect(calculatePiAutoCompactionThresholdTokens(100_000, undefined, { strategy: 'cache-preserving' })).toBe(90_000)
    expect(calculatePiAutoCompactionThresholdTokens(100_000, undefined, { strategy: 'balanced' })).toBe(80_000)
    expect(calculatePiAutoCompactionThresholdTokens(100_000, undefined, { strategy: 'aggressive' })).toBe(70_000)
    expect(PI_COMPACTION_STRATEGY_RATIOS['cache-preserving']).toBeGreaterThan(PI_COMPACTION_STRATEGY_RATIOS.aggressive)
    expect(calculatePiAutoCompactionThresholdTokens(100_000, 0.6, { strategy: 'cache-preserving' })).toBe(60_000)
  })

  test('绝对上限不干扰本来就小于它的窗口', () => {
    expect(calculatePiAutoCompactionThresholdTokens(200_000)).toBe(180_000)
    expect(calculatePiAutoCompactionThresholdTokens(8192)).toBe(7372)
  })

  test('给定 90%，只预留 10%', () => {
    expect(calculatePiAutoCompactionReserveTokens(100_000, 0.9)).toBe(10_000)
  })

  test('非法比例回退到默认 90%，不会算出负数或零预留', () => {
    expect(calculatePiAutoCompactionReserveTokens(100_000, 0)).toBe(10_000)
    expect(calculatePiAutoCompactionReserveTokens(100_000, 1)).toBe(10_000)
    expect(calculatePiAutoCompactionReserveTokens(100_000, Number.NaN)).toBe(10_000)
  })

  test('contextWindow 非法时抛错，避免静默配置出错误的预留值', () => {
    expect(() => calculatePiAutoCompactionReserveTokens(0)).toThrow()
    expect(() => calculatePiAutoCompactionReserveTokens(-1)).toThrow()
    expect(() => calculatePiAutoCompactionReserveTokens(Number.NaN)).toThrow()
  })

  test('百分比收敛到允许区间内', () => {
    expect(normalizeCompactionPercent(undefined)).toBe(90)
    expect(normalizeCompactionPercent(10)).toBe(PI_AUTO_COMPACTION_MIN_PERCENT)
    expect(normalizeCompactionPercent(100)).toBe(PI_AUTO_COMPACTION_MAX_PERCENT)
    expect(normalizeCompactionPercent(72.6)).toBe(73)
  })

  test('保留原文预算低于 Pi 默认 20000，压缩后才能真回落', () => {
    // 实测：用 Pi 默认 20000 时，压缩后残留仍有 8.6 万 token，很快再次撞线。
    expect(PI_COMPACTION_KEEP_RECENT_TOKENS).toBeGreaterThan(0)
    expect(PI_COMPACTION_KEEP_RECENT_TOKENS).toBeLessThan(20_000)
  })
})
describe('压缩保留预算', () => {
  test('大窗口用固定预算，不用 Pi 默认的 20000', () => {
    expect(calculatePiCompactionKeepRecentTokens(1_000_000)).toBe(PI_COMPACTION_KEEP_RECENT_TOKENS)
    expect(calculatePiCompactionKeepRecentTokens(256_000)).toBe(PI_COMPACTION_KEEP_RECENT_TOKENS)
  })

  test('小窗口按窗口收缩，但不会低于下限', () => {
    // 30000 的 10% 是 3000，高于下限 2000
    expect(calculatePiCompactionKeepRecentTokens(30_000)).toBe(3_000)
    // 8000 的 10% 是 800，被下限抬到 2000
    expect(calculatePiCompactionKeepRecentTokens(8_000)).toBe(PI_COMPACTION_KEEP_RECENT_MIN_TOKENS)
  })

  test('窗口非法时抛错', () => {
    expect(() => calculatePiCompactionKeepRecentTokens(0)).toThrow()
    expect(() => calculatePiCompactionKeepRecentTokens(Number.NaN)).toThrow()
  })
})

describe('压缩后残留判定', () => {
  test('残留明显高于阈值时判为未收敛', () => {
    // 阈值 160000，允许 10% 余量即 176000
    expect(isCompactionResidualTooHigh(180_000, 160_000)).toBe(true)
  })

  test('残留回落到阈值附近时视为已收敛', () => {
    expect(isCompactionResidualTooHigh(120_000, 160_000)).toBe(false)
    expect(isCompactionResidualTooHigh(170_000, 160_000)).toBe(false)
  })

  test('缺少估算值时不误判', () => {
    expect(isCompactionResidualTooHigh(undefined, 160_000)).toBe(false)
    expect(isCompactionResidualTooHigh(Number.NaN, 160_000)).toBe(false)
  })

  test('阈值非法时不误判', () => {
    expect(isCompactionResidualTooHigh(200_000, 0)).toBe(false)
    expect(isCompactionResidualTooHigh(200_000, Number.NaN)).toBe(false)
  })
})

describe('压缩点与 Pi 实际触发点一致', () => {
  test('各窗口 × 各百分比下，阈值都等于 window - reserve', () => {
    for (const window of [32_000, 128_000, 256_000, 1_000_000]) {
      for (const percent of [50, 70, 80, 95]) {
        const ratio = percent / 100
        const threshold = calculatePiAutoCompactionThresholdTokens(window, ratio)
        const reserve = calculatePiAutoCompactionReserveTokens(window, ratio)
        // Pi 在 contextTokens > window - reserve 时压缩，两者必须相等，
        // 否则 UI 显示的阈值与真实触发时机不符。
        expect(window - reserve).toBe(threshold)
      }
    }
  })

  test('超过硬顶的窗口按硬顶比例算，不是按虚标窗口算', () => {
    // 1M 窗口在 80% 下应压到 22.4 万，而不是 80 万
    expect(calculatePiAutoCompactionThresholdTokens(1_000_000, 0.8)).toBe(224_000)
    // 但百分比依然生效：50% → 10 万，95% → 19 万
    expect(calculatePiAutoCompactionThresholdTokens(1_000_000, 0.5)).toBe(140_000)
    expect(calculatePiAutoCompactionThresholdTokens(1_000_000, 0.95)).toBe(266_000)
  })
})

describe('压缩后残留归因', () => {
  test('按实测数据拆分：固定开销是最大项', () => {
    // 真实场景：压缩后 86015，固定开销 42512，保留原文 12000，摘要 11173 字符
    const r = describeCompactionResidual(86_015, 12_000, 11_173, 42_512)
    expect(r.fixedOverhead).toBe(42_512)
    expect(r.keepRecent).toBe(12_000)
    expect(r.summary).toBeGreaterThan(3_000)
    // 三项之和不应超过总量
    expect(r.fixedOverhead + r.keepRecent + r.summary).toBeLessThanOrEqual(86_015)
    // 固定开销占一半，应被判为最大项
    expect(r.dominant).toBe('fixedOverhead')
  })

  test('保留原文异常大时判为最大项', () => {
    const r = describeCompactionResidual(60_000, 40_000, 1_000, 10_000)
    expect(r.dominant).toBe('keepRecent')
  })

  test('摘要很长时判为最大项', () => {
    // 50000 字符 ≈ 14286 token
    const r = describeCompactionResidual(40_000, 5_000, 50_000, 8_000)
    expect(r.dominant).toBe('summary')
  })

  test('各项都不超过总量，差额归入其他', () => {
    const r = describeCompactionResidual(10_000, 8_000, 100_000, 8_000)
    expect(r.fixedOverhead + r.keepRecent + r.summary + r.unexplained).toBe(10_000)
    expect(r.unexplained).toBeGreaterThanOrEqual(0)
  })

  test('总量为 0 时不出现负值', () => {
    const r = describeCompactionResidual(0, 12_000, 5_000, 42_512)
    expect(r.fixedOverhead).toBe(0)
    expect(r.keepRecent).toBe(0)
    expect(r.summary).toBe(0)
    expect(r.unexplained).toBe(0)
  })
})

describe('工具输出预截断（Feibo SHORT_TOOL_OUTPUT）', () => {
  test('短文本不改动，返回原串', () => {
    const text = 'hello tool output'
    expect(truncateToolResultText(text)).toBe(text)
  })

  test('超长文本保留头尾并标注省略字数', () => {
    const text = 'A'.repeat(20_000)
    const out = truncateToolResultText(text)
    expect(out.length).toBeLessThan(text.length)
    expect(out).toContain('工具输出已截断')
    expect(out.startsWith('A'.repeat(100))).toBe(true)
    expect(out.endsWith('A'.repeat(100))).toBe(true)
    expect(out.length).toBeLessThanOrEqual(PI_SHORT_TOOL_OUTPUT_CHARS + 80)
  })

  test('text part 数组只截断 text，未改动时保留原引用', () => {
    const short = [{ type: 'text', text: 'ok' }]
    expect(truncateToolResultContent(short)).toBe(short)

    const long = [{ type: 'text', text: 'B'.repeat(15_000) }, { type: 'image', url: 'x' }]
    const next = truncateToolResultContent(long)
    expect(next).not.toBe(long)
    expect(next[0]!.text).toContain('工具输出已截断')
    expect(next[1]).toEqual(long[1])
  })

  test('消息列表里只裁 toolResult，其它角色不动', () => {
    const messages = [
      { role: 'user', content: 'q' },
      { role: 'toolResult', content: 'C'.repeat(20_000) },
      { role: 'assistant', content: 'a' },
    ]
    const next = pruneOversizedToolResultsInMessages(messages)
    expect(next).not.toBe(messages)
    expect(next[0]).toBe(messages[0])
    expect(next[2]).toBe(messages[2])
    expect(typeof next[1]!.content === 'string' && next[1]!.content.includes('工具输出已截断')).toBe(true)
  })
})


test('idle watermark is 65% of effective window, below formal 90%', () => {
  expect(PI_IDLE_PRECOMPACT_WATERMARK_RATIO).toBe(0.65)
  expect(calculatePiIdlePrecompactWatermarkTokens(100_000)).toBe(65_000)
  expect(calculatePiIdlePrecompactWatermarkTokens(372_000, { trustedWindow: true })).toBe(Math.floor(372_000 * 0.65))
  expect(shouldScheduleIdlePrecompact({
    contextTokens: 65_000,
    contextWindow: 100_000,
    formalThresholdTokens: 90_000,
  })).toBe(true)
  expect(shouldScheduleIdlePrecompact({
    contextTokens: 64_999,
    contextWindow: 100_000,
    formalThresholdTokens: 90_000,
  })).toBe(false)
  expect(resolveIdlePrecompactDelayMs(95_000, 90_000)).toBe(PI_IDLE_PRECOMPACT_NEAR_FULL_DELAY_MS)
  expect(resolveIdlePrecompactDelayMs(70_000, 90_000)).toBe(PI_IDLE_PRECOMPACT_DELAY_MS)
})
