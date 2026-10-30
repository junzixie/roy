/**
 * 前缀字节工具（Spark 模式）
 *
 * 缓存命中的前提是「同一段历史每次序列化成同样的字节」。这里提供两个纯函数：
 * - `stableSerialize`：键名排序后的确定性序列化，避免对象键序变化被当成内容变化；
 * - `hashValue`：取前 16 位十六进制，够做碎裂归因，也不会把日志撑大。
 *
 * 刻意不做对象身份缓存（WeakMap memo）：消息对象可能被上游原地改写，
 * 按身份复用哈希会把「字节已变」误判成「没变」，正好掩盖要查的问题。
 */

import { createHash } from 'node:crypto'

export function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    const serialized = JSON.stringify(value)
    return serialized === undefined ? 'null' : serialized
  }
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`
  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(',')}}`
}

export function hashValue(value: unknown): string {
  return createHash('sha256').update(stableSerialize(value)).digest('hex').slice(0, 16)
}
