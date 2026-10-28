import { describe, expect, test } from 'bun:test'
import { AgentStreamForwarder, THINKING_PARTIAL_INTERVAL_MS } from './agent-stream-forwarder'

function setup() {
  let now = 1_000_000
  const timers: { at: number; cb: () => void; dead?: boolean }[] = []
  const f = new AgentStreamForwarder({
    now: () => now,
    schedule: (cb, ms) => { const t = { at: now + ms, cb }; timers.push(t); return t as never },
    cancel: (t) => { (t as unknown as { dead: boolean }).dead = true },
  })
  const sent: unknown[] = []
  const advance = (ms: number) => {
    now += ms
    for (const t of timers) if (!t.dead && t.at <= now) { t.dead = true; t.cb() }
  }
  const delta = (type: string) => ({ sessionId: 's', payload: { kind: 'sdk_delta', delta: { uuid: 'u', deltas: [{ type, delta: 'x' }] } } }) as never
  return { f, sent, advance, delta, send: (e: unknown) => sent.push(e) }
}

describe('思考推送降频', () => {
  test('第一批立刻发，之后只有思考时按慢节奏推', () => {
    const { f, sent, advance, delta, send } = setup()
    f.forward(delta('thinking_delta'), send, true)
    advance(0)
    expect(sent.length).toBe(1)
    f.forward(delta('thinking_delta'), send, true)
    advance(100)
    expect(sent.length).toBe(1)
    advance(THINKING_PARTIAL_INTERVAL_MS)
    expect(sent.length).toBe(2)
  })
  test('开始出正文后马上按正常频率推', () => {
    const { f, sent, advance, delta, send } = setup()
    f.forward(delta('thinking_delta'), send, true)
    advance(0)
    f.forward(delta('thinking_delta'), send, true)
    advance(10)
    f.forward(delta('text_delta'), send, true)
    advance(60)
    expect(sent.length).toBe(2)
  })
})
