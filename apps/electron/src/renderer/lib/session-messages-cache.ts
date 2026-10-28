/**
 * 会话消息缓存的 LRU 淘汰策略。
 *
 * 单独拆出来是为了能在测试里直接验证：它不依赖 jotai，只是对
 * Map<string, T[]> 做「条目数 + 总消息数」双限额淘汰。
 */

export const AGENT_MSG_CACHE_MAX = 20
/** 缓存里保留的消息总条数上限（比条目数更贴近真实内存占用）。 */
export const AGENT_MSG_CACHE_MAX_MESSAGES = 20000

/**
 * 写入会话消息缓存并执行 LRU 淘汰。
 *
 * - 用 Map 的插入顺序当作最近使用顺序：删除后重新 set 会移到末尾。
 * - 双限额：条目数超限或消息总量超限时，从最旧开始淘汰。
 * - 永远保留刚写入的 sessionId：否则打开一个 5000 条的巨型会话时，
 *   它会立刻被自己挤出去，导致每次点击都重新读盘（这正是原 bug）。
 */
export function setSessionMessagesCache<T>(
  prev: Map<string, T[]>,
  sessionId: string,
  messages: T[],
  options: { maxSessions?: number; maxMessages?: number } = {},
): Map<string, T[]> {
  const maxSessions = options.maxSessions ?? AGENT_MSG_CACHE_MAX
  const maxMessages = options.maxMessages ?? AGENT_MSG_CACHE_MAX_MESSAGES

  const next = new Map(prev)
  next.delete(sessionId)
  next.set(sessionId, messages)

  let totalMessages = 0
  for (const list of next.values()) totalMessages += list.length

  for (const oldest of next.keys()) {
    if (next.size <= 1) break
    const overCount = next.size > maxSessions
    const overMessages = totalMessages > maxMessages
    if (!overCount && !overMessages) break
    // 不淘汰当前正在写入的会话。
    if (oldest === sessionId) continue

    const removed = next.get(oldest)
    next.delete(oldest)
    totalMessages -= removed?.length ?? 0
  }

  return next
}
