/**
 * 已发布历史字节冻结（Spark 模式 P1）
 *
 * 问题：Roy 在 `transformContext` 里对历史 toolResult 做分级裁剪。一条消息从
 * 「最近 6 条」跨到「中间段」、再从「中间段」跨到「更早段」时，字节各变一次，
 * 前缀缓存就在那条消息处断裂。会话越长、裁剪越频繁，累计命中率越低。
 *
 * 方案：把**已经发出去过的**消息字节记下来，下次组装时只要源消息内容没变，
 * 就原样返回当初的字节；只对尚未发布过的新消息执行裁剪。上游确实改写了历史
 * （压缩、倒带、图片隔离）时，从第一个不一致的位置开始重置，不做字节拼接。
 *
 * 语义边界：
 * - 冻结的是「内容不变就复用旧字节」，不是「永不裁剪」。压缩仍然会重排历史，
 *   那是刻意的一次性断点，由调用方计数。
 * - 不缓存对象身份，按内容哈希比对；消息被原地改写也能发现。
 */

import { hashValue } from './prefix-bytes'

export interface FrozenHistoryResult<T> {
  /** 最终要发出的消息数组 */
  messages: T[]
  /** 其中原样复用旧字节的条数 */
  frozen: number
  /** 上游改写历史的位置；null 表示没有发生重写 */
  rewroteAt: number | null
}

export class FrozenHistory<T> {
  private entries: Array<{ src: string; out: T }> = []
  /** entries[0] 对应的消息下标；超出窗口的历史不再保留快照 */
  private offset = 0

  constructor(
    private readonly hash: (value: T) => string = hashValue,
    /** 最多保留多少条快照。超长会话只冻结最近的一段，避免长期持有旧消息引用 */
    private readonly maxEntries = 400,
  ) {}

  get size(): number {
    return this.entries.length
  }

  /**
   * @param source 上游给的消息（尚未裁剪）
   * @param transformed 按现有策略裁剪后的结果；只对未发布的部分采用
   */
  apply(source: readonly T[], transformed: readonly T[]): FrozenHistoryResult<T> {
    const messages: T[] = []
    const nextEntries: Array<{ src: string; out: T }> = []
    let rewroteAt: number | null = null
    let frozen = 0

    for (let i = 0; i < source.length; i++) {
      const message = source[i] as T
      const srcHash = this.hash(message)
      const entry = this.entries[i - this.offset]
      const canReuse = rewroteAt === null && entry !== undefined && entry.src === srcHash
      if (canReuse) {
        messages.push(entry.out)
        nextEntries.push({ src: srcHash, out: entry.out })
        frozen++
        continue
      }
      if (rewroteAt === null && entry !== undefined && entry.src !== srcHash) {
        rewroteAt = i
      }
      const value = (transformed[i] ?? message) as T
      messages.push(value)
      nextEntries.push({ src: srcHash, out: value })
    }

    // 历史变短同样属于上游重写
    if (rewroteAt === null && source.length < this.offset + this.entries.length) {
      rewroteAt = source.length
    }
    this.entries = nextEntries.length > this.maxEntries
      ? nextEntries.slice(-this.maxEntries)
      : nextEntries
    this.offset = source.length - this.entries.length
    return { messages, frozen, rewroteAt }
  }

  /** 压缩/倒带后显式清空，避免把摘要后的新历史与旧快照拼在一起 */
  reset(): void {
    this.entries = []
    this.offset = 0
  }
}
