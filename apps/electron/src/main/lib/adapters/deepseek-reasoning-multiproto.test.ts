import { describe, expect, test } from 'bun:test'
import {
  collectAnchorsFromPayload,
  compactRequestReasoning,
  DEFAULT_TRUNCATE_CHARS,
  injectExcludedPaths,
  MIN_TRUNCATE_THRESHOLD,
  truncateReasoningContent,
  truncateResponsesReasoningItem,
} from './deepseek-reasoning-compaction'
import { createDeepSeekReasoningBridgeExtension } from './deepseek-reasoning-bridge'

const LONG = 'A'.repeat(5000)
const SHORT = 'B'.repeat(1000)

describe('chat-completions 三种推理字段名', () => {
  for (const field of ['reasoning_content', 'reasoning', 'reasoning_text'] as const) {
    test(`${field} 被截断`, () => {
      const out = truncateReasoningContent({ role: 'assistant', [field]: LONG }) as any
      expect(out[field].length).toBeLessThan(2100)
      expect(out[field].startsWith('[前 3000 字推理已省略]')).toBe(true)
    })
  }

  test('短推理不动，且返回原引用', () => {
    const msg = { role: 'assistant', reasoning_content: SHORT }
    expect(truncateReasoningContent(msg)).toBe(msg)
  })

  test('多个字段同时存在时全部截断', () => {
    const out = truncateReasoningContent({
      role: 'assistant',
      reasoning_content: LONG,
      reasoning_text: LONG,
    }) as any
    expect(out.reasoning_content.length).toBeLessThan(2100)
    expect(out.reasoning_text.length).toBeLessThan(2100)
  })

  test('不改原对象', () => {
    const msg = { role: 'assistant', reasoning_content: LONG }
    truncateReasoningContent(msg)
    expect(msg.reasoning_content).toBe(LONG)
  })
})

describe('responses 协议 reasoning item', () => {
  const item = {
    type: 'reasoning',
    id: 'rs_abc',
    status: 'completed',
    summary: [{ type: 'summary_text', text: LONG }],
  }

  test('summary 正文被截断，id/status/type 原样保留', () => {
    const out = truncateResponsesReasoningItem(item) as any
    expect(out.summary[0].text.length).toBeLessThan(2100)
    expect(out.id).toBe('rs_abc')
    expect(out.status).toBe('completed')
    expect(out.type).toBe('reasoning')
  })

  test('带 encrypted_content 的 item 一律跳过', () => {
    const enc = { ...item, encrypted_content: 'xxx' }
    expect(truncateResponsesReasoningItem(enc)).toBe(enc)
  })

  test('非 reasoning item 不动', () => {
    const msg = { type: 'message', role: 'assistant', content: [] }
    expect(truncateResponsesReasoningItem(msg)).toBe(msg)
  })

  test('短 summary 不动', () => {
    const short = { ...item, summary: [{ type: 'summary_text', text: SHORT }] }
    expect(truncateResponsesReasoningItem(short)).toBe(short)
  })
})

describe('compactRequestReasoning 适配两种 payload 形状', () => {
  test('chat-completions 形状', () => {
    const payload = {
      model: 'deepseek-v4.1-flash',
      messages: [
        { role: 'user', content: '问题' },
        { role: 'assistant', content: '答', reasoning_content: LONG },
      ],
    }
    const out = compactRequestReasoning(payload) as any
    expect(out).not.toBe(payload)
    expect(out.messages[1].reasoning_content.length).toBeLessThan(2100)
  })

  test('responses 形状', () => {
    const payload = {
      model: 'deepseek-v4.1-flash',
      input: [
        { role: 'user', content: '问题' },
        { type: 'reasoning', id: 'rs_1', summary: [{ type: 'summary_text', text: LONG }] },
      ],
    }
    const out = compactRequestReasoning(payload) as any
    expect(out).not.toBe(payload)
    expect(out.input[1].summary[0].text.length).toBeLessThan(2100)
    expect(out.input[1].id).toBe('rs_1')
  })

  test('无长推理时返回原引用（零改动）', () => {
    const payload = { messages: [{ role: 'assistant', reasoning_content: SHORT }] }
    expect(compactRequestReasoning(payload)).toBe(payload)
  })

  test('enabled:false 时完全不动', () => {
    const payload = { messages: [{ role: 'assistant', reasoning_content: LONG }] }
    expect(compactRequestReasoning(payload, { enabled: false })).toBe(payload)
  })
})

describe('锚点提取与注入', () => {
  test('从 chat-completions 前段提取排除结论', () => {
    const reasoning = `已经排除了 config.ts 这条路径\n${LONG}`
    const payload = { messages: [{ role: 'assistant', reasoning_content: reasoning }] }
    expect(collectAnchorsFromPayload(payload)).toContain('config.ts 这条路径')
  })

  test('从 responses summary 提取排除结论', () => {
    const payload = {
      input: [{
        type: 'reasoning',
        id: 'rs_1',
        summary: [{ type: 'summary_text', text: `已排除 auth.ts 的写法\n${LONG}` }],
      }],
    }
    expect(collectAnchorsFromPayload(payload)).toContain('auth.ts 的写法')
  })

  test('注入到 messages 末尾的 user 消息', () => {
    const payload = {
      messages: [
        { role: 'user', content: '第一问' },
        { role: 'assistant', content: '答' },
        { role: 'user', content: '第二问' },
      ],
    }
    const out = injectExcludedPaths(payload, ['config.ts']) as any
    expect(out.messages[2].content).toContain('<excluded-paths')
    expect(out.messages[2].content).toContain('config.ts')
    // 前面的历史一个字节都不能动，否则前缀缓存失效
    expect(out.messages[0]).toEqual(payload.messages[0])
    expect(out.messages[1]).toEqual(payload.messages[1])
  })

  test('末条不是 user（工具循环中）就跳过，绝不插到中间', () => {
    const payload = {
      messages: [
        { role: 'user', content: '问题' },
        { role: 'assistant', content: '答', tool_calls: [{ id: 't1' }] },
        { role: 'tool', content: '工具结果' },
      ],
    }
    // 向中间的 user 消息追加会让它之后的内容全部失去缓存，必须放弃
    expect(injectExcludedPaths(payload, ['a.ts'])).toBe(payload)
  })

  test('注入到 responses input 末尾', () => {
    const payload = {
      input: [
        { role: 'user', content: [{ type: 'input_text', text: '问题' }] },
      ],
    }
    const out = injectExcludedPaths(payload, ['a.ts']) as any
    expect(JSON.stringify(out.input[0].content)).toContain('<excluded-paths')
    expect(out.input[0].content[1].type).toBe('input_text')
  })

  test('无锚点时零字节差异', () => {
    const payload = { messages: [{ role: 'user', content: '问题' }] }
    expect(injectExcludedPaths(payload, [])).toBe(payload)
  })

  test('已注入过就不重复追加', () => {
    const payload = {
      messages: [{ role: 'user', content: '问题\n\n<excluded-paths note="x">\n- a\n</excluded-paths>' }],
    }
    expect(injectExcludedPaths(payload, ['b.ts'])).toBe(payload)
  })
})

describe('扩展挂载后的端到端行为', () => {
  const buildHook = () => {
    const hooks: Record<string, (event: unknown) => unknown> = {}
    const pi = { on: (n: string, h: (event: unknown) => unknown) => { hooks[n] = h } } as any
    createDeepSeekReasoningBridgeExtension({ restoreSignatures: false })(pi)
    return hooks
  }

  test('默认只挂 before_provider_request', () => {
    expect(Object.keys(buildHook())).toEqual(['before_provider_request'])
  })

  test('真实形状 payload：既截断又补锚点', () => {
    const payload = {
      model: 'deepseek-v4.1-flash',
      messages: [
        { role: 'user', content: '第一问' },
        { role: 'assistant', content: '答', reasoning_content: `已排除 old.ts\n${LONG}` },
        { role: 'user', content: '第二问' },
      ],
    }
    const res = buildHook()['before_provider_request']!({ payload }) as any
    expect(res).toBeDefined()
    // 推理被截断
    expect(res.messages[1].reasoning_content.length).toBeLessThan(2200)
    // 锚点补回到最后一条 user 消息
    expect(res.messages[2].content).toContain('old.ts')
    expect(res.messages[2].content).toContain('<excluded-paths')
  })

  test('工具循环轮次（末条是 tool）只截断不注入', () => {
    const payload = {
      messages: [
        { role: 'user', content: '第一问' },
        { role: 'assistant', reasoning_content: `已排除 old.ts\n${LONG}` },
        { role: 'tool', content: '结果' },
      ],
    }
    const res = buildHook()['before_provider_request']!({ payload }) as any
    expect(res).toBeDefined()
    expect(res.messages[1].reasoning_content.length).toBeLessThan(2200)
    // 中间的 user 消息不能被改
    expect(res.messages[0].content).toBe('第一问')
  })

  test('injectAnchors:false 时只截断不注入', () => {
    const hooks: Record<string, (event: unknown) => unknown> = {}
    const pi = { on: (n: string, h: (event: unknown) => unknown) => { hooks[n] = h } } as any
    createDeepSeekReasoningBridgeExtension({ restoreSignatures: false, injectAnchors: false })(pi)
    const payload = {
      messages: [
        { role: 'assistant', reasoning_content: `已排除 old.ts\n${LONG}` },
        { role: 'user', content: '第二问' },
      ],
    }
    const res = hooks['before_provider_request']!({ payload }) as any
    expect(res.messages[1].content).toBe('第二问')
    expect(res.messages[0].reasoning_content.length).toBeLessThan(2200)
  })

  test('完全无改动时返回 undefined', () => {
    const payload = { messages: [{ role: 'user', content: '短问题' }] }
    expect(buildHook()['before_provider_request']!({ payload })).toBeUndefined()
  })

  test('阈值边界：正好等于阈值不截断', () => {
    const edge = 'C'.repeat(Math.max(DEFAULT_TRUNCATE_CHARS, MIN_TRUNCATE_THRESHOLD))
    const msg = { role: 'assistant', reasoning_content: edge }
    expect(truncateReasoningContent(msg)).toBe(msg)
  })
})
