import { describe, expect, test } from 'bun:test'
import {
  downgradeForSimpleTurn,
  injectDeepSeekReasoningLevel,
  isSimpleUserTurn,
} from './pi-deepseek-reasoning-request-settings'
import { resolveReasoningProfile } from '@roy/shared'

const user = (text: string) => ({ messages: [{ role: 'user', content: [{ type: 'text', text }] }] })

const flashProfile = resolveReasoningProfile({ modelId: 'deepseek-v4-flash', transport: 'anthropic-messages' })
const proProfile = resolveReasoningProfile({ modelId: 'deepseek-v4-pro', transport: 'anthropic-messages' })

/** 走完「降档 → 注入请求体」全链路，读出真正发出去的 output_config.effort。 */
function effortFor(level: Parameters<typeof injectDeepSeekReasoningLevel>[1]['thinkingLevel'], payload: unknown) {
  const profile = flashProfile
  const body = injectDeepSeekReasoningLevel(payload, {
    profile,
    thinkingLevel: downgradeForSimpleTurn(level, payload),
  }) as { output_config?: { effort?: string } }
  return body.output_config?.effort
}

describe('DeepSeek 优化：简单回合降档', () => {
  test('短的普通消息降一档，只降不升', () => {
    expect(isSimpleUserTurn(user('**当前时间: Monday**\n\n你好'))).toBe(true)
    expect(downgradeForSimpleTurn('high', user('帮我打开默认项目'))).toBe('low')
    expect(downgradeForSimpleTurn('medium', user('谢谢'))).toBe('low')
    expect(downgradeForSimpleTurn('low', user('谢谢'))).toBe('low')
  })

  test('用户选的最高档、需要推理的话、工具循环中途都不降', () => {
    expect(downgradeForSimpleTurn('max', user('你好'))).toBe('max')
    expect(downgradeForSimpleTurn('xhigh', user('你好'))).toBe('xhigh')
    expect(downgradeForSimpleTurn('high', user('为什么登录会报错'))).toBe('high')
    expect(downgradeForSimpleTurn('high', user('字'.repeat(60)))).toBe('high')
    expect(downgradeForSimpleTurn('high', { messages: [{ role: 'user', content: [{ type: 'tool_result', content: 'ok' }] }] })).toBe('high')
  })

  /**
   * 回归：DeepSeek V4 没有 medium 档，旧的 high→medium 映射注入后仍发出 effort=high，
   * 降档等于没发生。这里断言真正落到请求体里的值，而不是中间档位名。
   */
  test('默认档 high 的简单回合必须真的把 effort 降到 low', () => {
    expect(effortFor('high', user('你好'))).toBe('low')
    expect(effortFor('medium', user('谢谢'))).toBe('low')
  })

  test('复杂回合保持原档位的 effort', () => {
    expect(effortFor('high', user('为什么登录会报错'))).toBe('high')
    expect(effortFor('max', user('你好'))).toBe('max')
    expect(effortFor('xhigh', user('你好'))).toBe('high')
  })

  test('Pro 模型降档后仍是可解析的 effort', () => {
    const body = injectDeepSeekReasoningLevel(user('你好'), {
      profile: proProfile,
      thinkingLevel: downgradeForSimpleTurn('high', user('你好')),
    }) as { output_config?: { effort?: string } }
    expect(['low', 'high', 'max']).toContain(body.output_config?.effort as string)
  })
})
