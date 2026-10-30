import { describe, expect, test } from 'bun:test'
import type { AssistantMessage, AssistantMessageEvent } from '@earendil-works/pi-ai'
import { isRetryableAssistantError } from '@earendil-works/pi-ai/compat'
import { resolveStreamStallSettings, withStreamStallWatchdog, type StreamStallSettings } from './stream-stall-watchdog'

const fast: StreamStallSettings = { firstEventMs: 60, idleMs: 40, graceMs: 30 }
const model = { api: 'openai-completions', provider: 'test', id: 'm' }

function message(stopReason: AssistantMessage['stopReason'], text = '', errorMessage?: string): AssistantMessage {
  return {
    role: 'assistant',
    content: text ? [{ type: 'text', text }] : [],
    api: 'openai-completions',
    provider: 'test',
    model: 'm',
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    stopReason,
    ...(errorMessage ? { errorMessage } : {}),
    timestamp: Date.now(),
  } as unknown as AssistantMessage
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

interface Step { wait: number; event: AssistantMessageEvent }

/** 假的 provider 流：按脚本发事件；收到中止信号时像 Pi 一样以 aborted 收尾（ignoreAbort 时假装自己也卡死）。 */
function fakeStream(steps: Step[], signal: AbortSignal | undefined, ignoreAbort = false) {
  let resolveResult: (m: AssistantMessage) => void = () => {}
  const result = new Promise<AssistantMessage>((resolve) => { resolveResult = resolve })
  async function* run(): AsyncGenerator<AssistantMessageEvent> {
    for (const step of steps) {
      const aborted = await Promise.race([
        sleep(step.wait).then(() => false),
        new Promise<boolean>((resolve) => signal?.addEventListener('abort', () => resolve(true), { once: true })),
      ])
      if (aborted || signal?.aborted) {
        if (ignoreAbort) await new Promise(() => {})
        const error = message('aborted', '', 'Request was aborted')
        resolveResult(error)
        yield { type: 'error', reason: 'aborted', error }
        return
      }
      if (step.event.type === 'done') resolveResult(step.event.message)
      if (step.event.type === 'error') resolveResult(step.event.error)
      yield step.event
    }
  }
  return { [Symbol.asyncIterator]: run, result: () => result }
}

async function collect(stream: AsyncIterable<AssistantMessageEvent>): Promise<AssistantMessageEvent[]> {
  const events: AssistantMessageEvent[] = []
  for await (const event of stream) events.push(event)
  return events
}

const partial = message('stop', '半截')
const start: AssistantMessageEvent = { type: 'start', partial }
const delta: AssistantMessageEvent = { type: 'text_delta', contentIndex: 0, delta: '字', partial }
const done: AssistantMessageEvent = { type: 'done', reason: 'stop', message: message('stop', '完整答复') }

describe('模型流卡住看门狗', () => {
  test('开始输出后长时间没有新数据：主动断开，以可重试的 timeout 错误结束', async () => {
    const fn = withStreamStallWatchdog((_m: typeof model, _c: unknown, o?: { signal?: AbortSignal }) => fakeStream([
      { wait: 5, event: start },
      { wait: 5, event: delta },
      { wait: 5_000, event: done },
    ], o?.signal), fast)
    const stream = await fn(model, {}, {})
    const events = await collect(stream)
    const last = events.at(-1)!
    expect(last.type).toBe('error')
    const final = await stream.result()
    expect(final.stopReason).toBe('error')
    expect(final.errorMessage).toContain('timeout')
    expect(isRetryableAssistantError(final)).toBe(true)
    // 已收到的部分内容保留在错误消息里，后续由重试覆盖
    expect(final.content).toEqual(partial.content)
  })

  test('一直没有第一个事件：按首包阈值断开', async () => {
    const fn = withStreamStallWatchdog((_m: typeof model, _c: unknown, o?: { signal?: AbortSignal }) => fakeStream([
      { wait: 5_000, event: start },
    ], o?.signal), fast)
    const started = Date.now()
    const stream = await fn(model, {}, {})
    await collect(stream)
    expect(Date.now() - started).toBeGreaterThanOrEqual(55)
    expect((await stream.result()).errorMessage).toContain('timeout')
  })

  test('持续有数据的正常回答不受影响', async () => {
    const steps: Step[] = [{ wait: 5, event: start }]
    for (let i = 0; i < 6; i++) steps.push({ wait: 25, event: delta })
    steps.push({ wait: 25, event: done })
    const fn = withStreamStallWatchdog((_m: typeof model, _c: unknown, o?: { signal?: AbortSignal }) => fakeStream(steps, o?.signal), fast)
    const stream = await fn(model, {}, {})
    const events = await collect(stream)
    expect(events).toHaveLength(8)
    expect((await stream.result()).stopReason).toBe('stop')
  })

  test('用户点停止：仍是 aborted，不变成可重试错误', async () => {
    const user = new AbortController()
    const fn = withStreamStallWatchdog((_m: typeof model, _c: unknown, o?: { signal?: AbortSignal }) => fakeStream([
      { wait: 5, event: start },
      { wait: 5_000, event: done },
    ], o?.signal), fast)
    const stream = await fn(model, {}, { signal: user.signal })
    setTimeout(() => user.abort(), 15)
    await collect(stream)
    const final = await stream.result()
    expect(final.stopReason).toBe('aborted')
    expect(isRetryableAssistantError(final)).toBe(false)
  })

  test('断开后底层流也不收尾：过了收尾时间直接结束，不会一直挂着', async () => {
    const fn = withStreamStallWatchdog((_m: typeof model, _c: unknown, o?: { signal?: AbortSignal }) => fakeStream([
      { wait: 5, event: start },
      { wait: 5_000, event: done },
    ], o?.signal, true), fast)
    const stream = await fn(model, {}, {})
    const events = await collect(stream)
    expect(events.at(-1)?.type).toBe('error')
    expect((await stream.result()).errorMessage).toContain('timeout')
  })

  test('上游自己报的错原样交出', async () => {
    const upstream = message('error', '', 'Provider finish_reason: content_filter')
    const fn = withStreamStallWatchdog((_m: typeof model, _c: unknown, o?: { signal?: AbortSignal }) => fakeStream([
      { wait: 5, event: start },
      { wait: 5, event: { type: 'error', reason: 'error', error: upstream } },
    ], o?.signal), fast)
    const stream = await fn(model, {}, {})
    await collect(stream)
    expect((await stream.result()).errorMessage).toBe('Provider finish_reason: content_filter')
  })

  test('环境变量可以调整或关闭空闲阈值', () => {
    expect(resolveStreamStallSettings({})).toMatchObject({firstEventMs:240_000,idleMs:180_000,requestMs:0})
    expect(resolveStreamStallSettings({ ROY_STREAM_STALL_SECONDS: '0' }).idleMs).toBe(0)
    expect(resolveStreamStallSettings({ ROY_STREAM_STALL_SECONDS: '200' })).toMatchObject({ idleMs: 200_000, firstEventMs: 240_000 })
    expect(resolveStreamStallSettings({ ROY_STREAM_STALL_SECONDS: 'abc' }).idleMs).toBe(180_000)
    const original = () => fakeStream([], undefined)
    expect(withStreamStallWatchdog(original, { firstEventMs: 1, idleMs: 0, graceMs: 1 })).toBe(original)
  })
})

test('连接函数本身不返回也有上限', async () => {
  const fn=withStreamStallWatchdog((async()=>await new Promise(()=>{})) as never, fast)
  await expect((fn as unknown as (...a: unknown[])=>Promise<unknown>)(model,{},{})).rejects.toThrow('timeout')
})
test('持续思考事件也不能绕过单次请求时间预算', async () => {
  const fn=withStreamStallWatchdog((_m: typeof model,_c: unknown,o?: {signal?:AbortSignal})=>fakeStream(Array.from({length:100},()=>({wait:10,event:delta})),o?.signal), {...fast,requestMs:65})
  const stream=await fn(model,{},{});await collect(stream)
  expect((await stream.result()).stopReason).toBe('error')
})

test('start事件不提前缩短首包等待', async () => {
  const fn=withStreamStallWatchdog((_m:typeof model,_c:unknown,o?:{signal?:AbortSignal})=>fakeStream([{wait:1,event:start},{wait:85,event:delta},{wait:5,event:done}],o?.signal),{firstEventMs:180,idleMs:40,graceMs:10,requestMs:0})
  const stream=await fn(model,{},{});await collect(stream)
  expect((await stream.result()).stopReason).toBe('stop')
})
test('持续输出超过首包时长也能完成', async () => {
  const steps:Step[]=Array.from({length:15},()=>({wait:15,event:delta}));steps.push({wait:5,event:done})
  const fn=withStreamStallWatchdog((_m:typeof model,_c:unknown,o?:{signal?:AbortSignal})=>fakeStream(steps,o?.signal),{firstEventMs:80,idleMs:80,graceMs:10,requestMs:0})
  const stream=await fn(model,{},{});await collect(stream)
  expect((await stream.result()).stopReason).toBe('stop')
})
test('只有空start事件不能无限续命', async () => {
  const fn=withStreamStallWatchdog((_m:typeof model,_c:unknown,o?:{signal?:AbortSignal})=>fakeStream(Array.from({length:50},()=>({wait:10,event:start})),o?.signal),{firstEventMs:80,idleMs:40,graceMs:10})
  const stream=await fn(model,{},{});await collect(stream)
  expect((await stream.result()).stopReason).toBe('error')
})
test('底层忽略取消，用户停止仍结束', async () => {
  const user=new AbortController()
  const fn=withStreamStallWatchdog((_m:typeof model,_c:unknown,o?:{signal?:AbortSignal})=>fakeStream([{wait:1,event:start},{wait:5000,event:done}],o?.signal,true),fast)
  const stream=await fn(model,{}, {signal:user.signal});setTimeout(()=>user.abort(),15)
  await collect(stream);expect((await stream.result()).stopReason).toBe('aborted')
})
test('连接阶段忽略取消也能及时退出', async () => {
  const user=new AbortController()
  const fn=withStreamStallWatchdog((async()=>await new Promise(()=>{})) as never,{firstEventMs:5000,idleMs:100,graceMs:10})
  const promise=(fn as unknown as (...args:unknown[])=>Promise<unknown>)(model,{}, {signal:user.signal})
  setTimeout(()=>user.abort(),10)
  await expect(promise).rejects.toThrow('Request aborted')
})
test('真实重试函数：连续三次流超时后自动恢复', async () => {
  const { retryAssistantCall }=await import('@earendil-works/pi-ai/compat')
  let calls=0
  const result=await retryAssistantCall(async()=>++calls<=3?message('error','','Stream idle timeout'):message('stop','恢复完成'),{enabled:true,maxRetries:3,baseDelayMs:0},undefined)
  expect(calls).toBe(4);expect(result.stopReason).toBe('stop')
})
