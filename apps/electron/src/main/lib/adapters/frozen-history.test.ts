import { describe, expect, test } from 'bun:test'
import { FrozenHistory } from './frozen-history'

interface Msg {
  role: string
  content: string
}

const user = (content: string): Msg => ({ role: 'user', content })
const assistant = (content: string): Msg => ({ role: 'assistant', content })
const tool = (content: string): Msg => ({ role: 'toolResult', content })

describe('FrozenHistory', () => {
  test('已发布的消息即使裁剪策略变了也复用旧字节', () => {
    const history = new FrozenHistory<Msg>()
    const source = [user('u1'), tool('BIG-TOOL-RESULT')]
    // 第一轮：策略不裁剪
    history.apply(source, [source[0]!, source[1]!])

    // 第二轮：策略想把 toolResult 裁到 3 字符，但这条已经发出去过
    const transformed = [source[0]!, tool('BIG')]
    const result = history.apply(source, transformed)
    expect(result.messages[1]!.content).toBe('BIG-TOOL-RESULT')
    expect(result.frozen).toBe(2)
    expect(result.rewroteAt).toBeNull()
  })

  test('新追加的消息才采用裁剪结果', () => {
    const history = new FrozenHistory<Msg>()
    const first = [user('u1')]
    history.apply(first, first)

    const source = [user('u1'), tool('NEW-BIG-RESULT')]
    const result = history.apply(source, [user('u1'), tool('NEW')])
    expect(result.messages[1]!.content).toBe('NEW')
    expect(result.frozen).toBe(1)
  })

  test('上游改写历史时从该位置重置，并报告位置', () => {
    const history = new FrozenHistory<Msg>()
    history.apply([user('u1'), assistant('a1')], [user('u1'), assistant('a1')])

    const rewritten = [user('u1'), assistant('SUMMARY')]
    const result = history.apply(rewritten, rewritten)
    expect(result.rewroteAt).toBe(1)
    expect(result.messages[1]!.content).toBe('SUMMARY')
  })

  test('历史变短时报告为新长度', () => {
    const history = new FrozenHistory<Msg>()
    history.apply([user('u1'), assistant('a1'), tool('t1')], [user('u1'), assistant('a1'), tool('t1')])

    const result = history.apply([user('u1')], [user('u1')])
    expect(result.rewroteAt).toBe(1)
  })

  test('reset 之后不再复用任何旧字节', () => {
    const history = new FrozenHistory<Msg>()
    history.apply([user('u1')], [user('u1')])
    history.reset()
    expect(history.size).toBe(0)
    const result = history.apply([user('u1')], [user('EDITED')])
    expect(result.messages[0]!.content).toBe('EDITED')
    expect(result.frozen).toBe(0)
  })
})

describe('FrozenHistory 窗口上限', () => {
  test('超过 maxEntries 只保留最近一段，更早的消息走裁剪结果', () => {
    const history = new FrozenHistory<Msg>(undefined as never, 2)
    const first = [user('u1'), user('u2')]
    history.apply(first, first)
    expect(history.size).toBe(2)

    const source = [user('u1'), user('u2'), user('u3')]
    history.apply(source, [user('u1-T'), user('u2-T'), user('u3-T')])
    expect(history.size).toBe(2)

    // 窗口收缩从下一次组装开始生效：最旧的一条不再有快照，采用裁剪结果
    const next = history.apply(source, [user('u1-T'), user('u2-T'), user('u3-T')])
    expect(next.messages[0]!.content).toBe('u1-T')
    expect(next.frozen).toBe(2)
  })
})
