import type { SDKMessage, SDKUserMessage } from '@roy/shared'
import { isUserInputMessage } from '@roy/session-core'

/** 保留落盘顺序，用共同消息定位实时片段；无共同锚点时才按轮次起点兼容旧记录。 */
export function mergeTranscript(persisted: SDKMessage[], live: SDKMessage[], keyOf: (m: SDKMessage) => string): SDKMessage[] {
  if (!live.length) return persisted
  const result = persisted.slice()

  // 逐条 live 都要在历史里定位；原实现对每条都从头 findIndex 整段历史，找不到锚点时
  // 还要对后续每条 live 再各扫一遍，最坏 O(live² × persisted)，而这笔开销落在每个
  // 流式帧上。live 多于一条时才建表：单条 live 的查找本身就是一次线性扫描，
  // 建表反而是纯额外成本，而流式期间绝大多数帧只有一条回复在涨。
  let index: Map<string, number> | null = null
  if (live.length > 1) {
    index = new Map()
    for (let i = 0; i < result.length; i++) {
      const key = keyOf(result[i]!)
      if (!index.has(key)) index.set(key, i)
    }
  }

  /** 在 from 处插入后同步索引：from 及其之后的首次出现位置都变了，需重算。 */
  const reindexAfterInsert = (from: number): void => {
    if (!index) return
    for (const [key, position] of index) {
      if (position >= from) index.delete(key)
    }
    for (let i = from; i < result.length; i++) {
      const key = keyOf(result[i]!)
      if (!index.has(key)) index.set(key, i)
    }
  }

  const findExisting = (key: string): number => index ? (index.get(key) ?? -1) : result.findIndex((m) => keyOf(m) === key)

  let cursor = -1
  for (let n = 0; n < live.length; n++) {
    const message = live[n]!
    const key = keyOf(message)
    const existing = findExisting(key)
    if (existing >= 0) {
      result[existing] = message
      cursor = existing
      continue
    }
    let nextAnchor = -1
    for (let j = n + 1; j < live.length; j++) {
      nextAnchor = findExisting(keyOf(live[j]!))
      if (nextAnchor >= 0) break
    }
    const record = message as Record<string, unknown>
    const runStart = record._royLiveRunStartedAt ?? record._createdAt
    let insertion = nextAnchor >= 0 ? nextAnchor : cursor >= 0 ? cursor + 1 : result.length
    if (nextAnchor < 0 && cursor < 0 && typeof runStart === 'number') {
      // 本轮回复应落在“开启它的那条提问”之后。边界取第一条晚于轮次起点的提问，
      // 回复插在它前面；但若没有任何提问早于轮次起点，说明这是首轮，本条回复属于
      // 最早的那条提问，必须插在它之后。
      //
      // 旧记录把提问落盘时间取成 Date.now()，比轮次起点晚几毫秒，于是首轮提问会
      // 被误当成“下一条提问”，回复被插到提问上方。首轮判定正是为这种记录兜底。
      const createdAtOf = (m: SDKMessage): number | undefined => {
        const value = (m as Record<string, unknown>)._createdAt
        return typeof value === 'number' ? value : undefined
      }
      const firstInputIndex = result.findIndex((m) => m.type === 'user' && isUserInputMessage(m as SDKUserMessage))
      const firstInputAt = firstInputIndex >= 0 ? createdAtOf(result[firstInputIndex]!) : undefined
      const hasEarlierInput = firstInputAt !== undefined && firstInputAt <= runStart
      if (firstInputIndex >= 0 && !hasEarlierInput) {
        insertion = firstInputIndex + 1
      } else {
        const boundary = result.findIndex((m) => m.type === 'user' && isUserInputMessage(m as SDKUserMessage)
          && createdAtOf(m) !== undefined && createdAtOf(m)! > runStart)
        if (boundary >= 0) insertion = boundary
      }
    }
    result.splice(insertion, 0, message)
    cursor = insertion
    reindexAfterInsert(insertion)
  }
  return result
}
