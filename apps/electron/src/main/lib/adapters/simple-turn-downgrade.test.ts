import { describe, expect, test } from 'bun:test'
import {
  DEEPSEEK_SIMPLE_TURN_DOWNGRADE,
  DEFAULT_SIMPLE_TURN_DOWNGRADE,
  isSimpleTurn,
  resolveSimpleTurnLevel,
} from './simple-turn-downgrade'
import { injectOpenAIReasoningLevel } from './pi-openai-reasoning-request-settings'
import { resolveReasoningProfile, type AgentThinkingLevel } from '@roy/shared'

const userTurn = (text: string) => ({ messages: [{ role: 'user', content: text }] })

describe('简单回合判定（标准模式口径）', () => {
  test('短指令算简单回合', () => {
    expect(isSimpleTurn(userTurn('继续'))).toBe(true)
    expect(isSimpleTurn(userTurn('好'))).toBe(true)
    expect(isSimpleTurn(userTurn('改一下'))).toBe(true)
  })

  test('含推理诉求的词不算简单回合', () => {
    for (const text of ['帮我分析一下', '修复这个 bug', '优化性能', '实现这个功能', '写个测试']) {
      expect(isSimpleTurn(userTurn(text))).toBe(false)
    }
  })

  test('长消息不算简单回合', () => {
    expect(isSimpleTurn(userTurn('继续'.repeat(30)))).toBe(false)
  })

  test('工具结果回合不降档（模型正在干活）', () => {
    const payload = {
      messages: [{
        role: 'user',
        content: [{ type: 'tool_result', content: '文件内容' }],
      }],
    }
    expect(isSimpleTurn(payload)).toBe(false)
  })

  test('最后一条不是 user 时不降档', () => {
    expect(isSimpleTurn({ messages: [{ role: 'assistant', content: 'hi' }] })).toBe(false)
    expect(isSimpleTurn({ messages: [] })).toBe(false)
  })

  test('只看最后一段文字，前面的环境信息不算用户意图', () => {
    const payload = userTurn('当前时间: 2026-10-28\n工作目录: E:\\proj\n\n继续')
    expect(isSimpleTurn(payload)).toBe(true)
  })

  test('带 /g 的复杂词正则不会因 lastIndex 漏匹配', () => {
    const hint = /bug|分析/g
    const payload = userTurn('分析一下')
    expect(isSimpleTurn(payload, { complexHint: hint })).toBe(false)
    // 第二次调用必须给出一致结果（复用同一正则实例）
    expect(isSimpleTurn(payload, { complexHint: hint })).toBe(false)
  })
})

describe('档位计算', () => {
  const ds = { downgradeMap: DEEPSEEK_SIMPLE_TURN_DOWNGRADE }

  test('DeepSeek high 降到 low（不能降到不存在的 medium）', () => {
    expect(resolveSimpleTurnLevel('high', userTurn('继续'), ds)).toBe('low')
  })

  test('OpenAI high 降到 medium（该档位真实存在）', () => {
    expect(resolveSimpleTurnLevel('high', userTurn('继续'))).toBe('medium')
  })

  test('xhigh 在 DeepSeek 上不动，在 OpenAI 上降到 high', () => {
    expect(resolveSimpleTurnLevel('xhigh', userTurn('继续'), ds)).toBeUndefined()
    expect(resolveSimpleTurnLevel('xhigh', userTurn('继续'))).toBe('high')
  })

  test('max 是用户明确要的最强档，哪个 provider 都不动', () => {
    expect(resolveSimpleTurnLevel('max', userTurn('继续'))).toBeUndefined()
    expect(resolveSimpleTurnLevel('max', userTurn('继续'), ds)).toBeUndefined()
  })

  test('off / low 保持不动', () => {
    expect(resolveSimpleTurnLevel('off', userTurn('继续'))).toBeUndefined()
    expect(resolveSimpleTurnLevel('low', userTurn('继续'))).toBeUndefined()
  })

  test('复杂回合返回 undefined（不干预）', () => {
    expect(resolveSimpleTurnLevel('high', userTurn('分析一下架构'))).toBeUndefined()
  })

  test('无当前档位时不干预', () => {
    expect(resolveSimpleTurnLevel(undefined, userTurn('继续'))).toBeUndefined()
  })

  test('DeepSeek 降档表的目标档位必须真实存在（键可以是 external 传入的 medium）', () => {
    // 键 medium 只是兼容外部传入的档位名（会被 normalize 折回 high），
    // 真正要紧的是**目标**不能是不存在的档位，否则等于没降。
    const deepseekLevels = ['off', 'low', 'high', 'xhigh', 'max']
    for (const to of Object.values(DEEPSEEK_SIMPLE_TURN_DOWNGRADE)) {
      expect(deepseekLevels).toContain(to)
    }
  })

  test('OpenAI 降档表只落在真实存在的档位', () => {
    const openaiLevels = ['off', 'low', 'medium', 'high', 'xhigh', 'max']
    for (const [from, to] of Object.entries(DEFAULT_SIMPLE_TURN_DOWNGRADE)) {
      expect(openaiLevels).toContain(from)
      expect(openaiLevels).toContain(to)
    }
  })
})

describe('标准模式端到端：effort 真的降下来', () => {
  const gpt5 = resolveReasoningProfile({ modelId: 'gpt-5.5', transport: 'openai-responses' })

  test('profile 可解析', () => {
    expect(gpt5).toBeDefined()
    expect(gpt5?.encodings['openai-responses']).toBeDefined()
  })

  test('high 档 + 简单回合 → 请求体 effort 变 medium', () => {
    const payload = { ...userTurn('继续'), reasoning: {} }
    const level = (resolveSimpleTurnLevel('high', payload) ?? 'high') as AgentThinkingLevel
    const out = injectOpenAIReasoningLevel(payload, {
      profile: gpt5,
      thinkingLevel: level,
    }) as Record<string, unknown>
    expect((out.reasoning as Record<string, unknown>).effort).toBe('medium')
  })

  test('复杂回合 effort 保持原档', () => {
    const payload = { ...userTurn('分析一下这个架构'), reasoning: {} }
    const level = (resolveSimpleTurnLevel('high', payload) ?? 'high') as AgentThinkingLevel
    const out = injectOpenAIReasoningLevel(payload, {
      profile: gpt5,
      thinkingLevel: level,
    }) as Record<string, unknown>
    expect((out.reasoning as Record<string, unknown>).effort).toBe('high')
  })
})
