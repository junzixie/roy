/**
 * DeepSeek 推理流里混入 `</thinking>` 的修复
 *
 * 实测（2026-10-30，deepseek-v4.1-flash，openai-completions）：模型会在 reasoning_content
 * 里自己写一个 `</thinking>`，然后把本该进 content 的正文继续写在 reasoning_content 里，
 * content 为空、stopReason=stop。界面上只剩一个折叠的「思考过程」，看起来像回答停住了。
 *
 * 这里在 provider 流的最终消息上修正：标签之后的内容挪成正文 text 块，紧跟在该思考块后面
 * （仍在 toolCall 之前）。修正后的消息才会被 Pi 落库，历史里不再带这个标签，避免模型照着学。
 *
 * 只在消息没有任何非空正文时才拆：已有正文时，标签后那段通常还是写作计划，挪出来反而会把
 * 推理暴露给用户。
 */
import type { AssistantMessage, AssistantMessageEvent } from '@earendil-works/pi-ai'

const LEAKED_CLOSE_TAG = /<\/think(?:ing)?>/i

interface ContentBlockLike {
  type?: unknown
  text?: unknown
  thinking?: unknown
}

/** 把思考块里 `</thinking>` 之后的内容挪成正文；无需修正时返回原引用。 */
export function splitLeakedThinkingTag<T extends { content: unknown }>(message: T): T {
  if (!Array.isArray(message.content)) return message
  const blocks = message.content as ContentBlockLike[]
  const hasText = blocks.some((block) => block?.type === 'text' && typeof block.text === 'string' && block.text.trim().length > 0)
  if (hasText) return message

  let changed = false
  const next: ContentBlockLike[] = []
  for (const block of blocks) {
    if (block?.type !== 'thinking' || typeof block.thinking !== 'string') {
      next.push(block)
      continue
    }
    const match = LEAKED_CLOSE_TAG.exec(block.thinking)
    const tail = match ? block.thinking.slice(match.index + match[0].length).trim() : ''
    if (!match || !tail) {
      next.push(block)
      continue
    }
    changed = true
    const head = block.thinking.slice(0, match.index).trimEnd()
    if (head) next.push({ ...block, thinking: head })
    next.push({ type: 'text', text: tail })
  }
  return changed ? { ...message, content: next } : message
}

interface ResultStream extends AsyncIterable<AssistantMessageEvent> {
  result(): Promise<AssistantMessage>
}

/** 包一层 provider 流：增量照常转发，只修正 done 事件与 result() 的最终消息。 */
export function withLeakedThinkingTagSplit<F extends (model: never, context: never, options?: never) => unknown>(streamFn: F): F {
  const call = streamFn as unknown as (...args: unknown[]) => ResultStream | Promise<ResultStream>
  const wrapped = async (...args: unknown[]): Promise<ResultStream> => {
    const source = await call(...args)
    let fixed: Promise<AssistantMessage> | undefined
    const result = (): Promise<AssistantMessage> => {
      fixed ??= source.result().then((message) => splitLeakedThinkingTag(message))
      return fixed
    }
    return {
      async *[Symbol.asyncIterator]() {
        for await (const event of source) {
          if (event.type === 'done') {
            const message = splitLeakedThinkingTag(event.message)
            if (message !== event.message) {
              console.warn('[DeepSeek] 推理流里混入 </thinking>，已把标签后的内容移回正文')
            }
            fixed ??= Promise.resolve(message)
            yield { ...event, message }
          } else {
            yield event
          }
        }
      },
      result,
    }
  }
  return wrapped as unknown as F
}
