import { describe, expect, test } from 'bun:test'
import { setSessionMessagesCache } from './session-messages-cache'

function msgs(count: number, tag = 'm') {
  return Array.from({ length: count }, (_, index) => `${tag}${index}`)
}

describe('会话消息缓存淘汰', () => {
  test('按条目数上限淘汰最旧的，保留最近写入的', () => {
    let cache = new Map<string, string[]>()
    for (let i = 0; i < 5; i += 1) {
      cache = setSessionMessagesCache(cache, `s${i}`, msgs(1), { maxSessions: 3, maxMessages: 1_000_000 })
    }
    expect([...cache.keys()]).toEqual(['s2', 's3', 's4'])
  })

  test('单个巨型会话不会被自己挤出缓存（原 bug：打开 5000 条会话每次都重新读盘）', () => {
    let cache = new Map<string, string[]>()
    cache = setSessionMessagesCache(cache, 'big', msgs(5000), { maxSessions: 20, maxMessages: 20000 })
    expect(cache.has('big')).toBe(true)

    cache = setSessionMessagesCache(cache, 'small', msgs(3), { maxSessions: 20, maxMessages: 20000 })
    expect(cache.has('big')).toBe(true)
    expect(cache.has('small')).toBe(true)
  })

  test('消息总量超限时按最旧开始淘汰，但当前会话始终保留', () => {
    let cache = new Map<string, string[]>()
    cache = setSessionMessagesCache(cache, 'a', msgs(400), { maxSessions: 20, maxMessages: 500 })
    cache = setSessionMessagesCache(cache, 'b', msgs(400), { maxSessions: 20, maxMessages: 500 })
    // 800 条超过 500 上限，a 应被淘汰
    expect(cache.has('a')).toBe(false)
    expect(cache.has('b')).toBe(true)
  })

  test('重复访问会把会话移到最近，延长其存活', () => {
    let cache = new Map<string, string[]>()
    cache = setSessionMessagesCache(cache, 'a', msgs(1), { maxSessions: 2, maxMessages: 1_000_000 })
    cache = setSessionMessagesCache(cache, 'b', msgs(1), { maxSessions: 2, maxMessages: 1_000_000 })
    // 再次访问 a，a 变为最新
    cache = setSessionMessagesCache(cache, 'a', msgs(1), { maxSessions: 2, maxMessages: 1_000_000 })
    cache = setSessionMessagesCache(cache, 'c', msgs(1), { maxSessions: 2, maxMessages: 1_000_000 })
    expect([...cache.keys()]).toEqual(['a', 'c'])
  })
})
