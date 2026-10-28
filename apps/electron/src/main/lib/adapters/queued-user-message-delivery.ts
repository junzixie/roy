/**
 * 运行中插话的「送达」识别。
 *
 * 插话（steer / 打断发送）在用户按下发送时就进了 Pi 的队列，但模型真正看到它是在
 * 当前工具批次跑完、下一次请求之前。Pi 会在那一刻为这条 user 消息发出 message_end。
 * 适配层据此发一个 roy_user_message_delivered 标记，编排层在这个位置落盘，
 * 重新打开会话时插话就出现在它真实生效的位置，而不是整轮回答的最前面。
 */

export const USER_MESSAGE_DELIVERED_SUBTYPE = 'roy_user_message_delivered'

export interface PendingQueuedUserMessage {
  uuid: string
  text: string
}

/** Pi user 消息的纯文本（字符串或 text 块拼接）。 */
export function piUserMessageText(message: unknown): string {
  const content = (message as { content?: unknown } | undefined)?.content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter((b): b is { type: 'text'; text: string } => !!b && (b as { type?: unknown }).type === 'text' && typeof (b as { text?: unknown }).text === 'string')
    .map((b) => b.text)
    .join('\n')
}

function same(a: string, b: string): boolean {
  const x = a.trim()
  const y = b.trim()
  if (!x || !y) return false
  if (x === y) return true
  // Pi 可能在前后追加环境块；只要一方完整包含另一方就算同一条
  return x.length >= 8 && y.length >= 8 && (x.includes(y) || y.includes(x))
}

/**
 * 在待送达列表里找与这条 user 消息匹配的插话；找到则从列表移除并返回其 uuid。
 * 首轮 prompt 不在列表里，自然不会匹配。
 */
export function takeDeliveredQueuedMessage(
  pending: PendingQueuedUserMessage[],
  deliveredText: string,
): string | undefined {
  const index = pending.findIndex((item) => same(item.text, deliveredText))
  if (index < 0) return undefined
  const [hit] = pending.splice(index, 1)
  return hit?.uuid
}
