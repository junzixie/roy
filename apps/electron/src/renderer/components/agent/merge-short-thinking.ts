/**
 * 「细节」模式：把短思考并到紧跟着的命令行里。
 *
 * DeepSeek 等模型每次调用工具前都会先想一小段，「细节」模式下每段思考单独占一行，
 * 和命令行交替出现，看起来很碎。这里只合并满足下面条件的思考：
 * - 已经想完（不是这一轮还在输出的那个块）；
 * - 不长（默认不超过 300 字、4 行）；
 * - 后面紧跟一条普通工具调用（中间只隔着界面上隐藏的任务进度工具）。
 * 长思考、还在想的思考、后面接正文或子代理的思考，照旧单独一行。
 * 合并后思考内容不会丢：挂在命令行上，悬停可看，点开命令时显示在结果上方。
 */

export interface MergeShortThinkingOptions {
  /** 这一轮还在输出的块下标（-1 表示没有）。 */
  liveIndex: number
  /** 界面上不显示的工具（任务进度），合并时跳过它们找下一条命令。 */
  hiddenToolNames?: ReadonlySet<string>
  maxChars?: number
  maxLines?: number
}

export interface MergeShortThinkingResult {
  /** 不再单独渲染的思考块下标。 */
  skip: Set<number>
  /** 工具块下标 → 挂在它上面的思考文字（多段按顺序用空行连接）。 */
  leading: Map<number, string>
}

interface BlockLike {
  type: string
  thinking?: unknown
  name?: unknown
  text?: unknown
}

const SUBAGENT_TOOLS = new Set(['Agent', 'Task'])

export const SHORT_THINKING_MAX_CHARS = 300
export const SHORT_THINKING_MAX_LINES = 4

export function isShortThinking(text: string, maxChars = SHORT_THINKING_MAX_CHARS, maxLines = SHORT_THINKING_MAX_LINES): boolean {
  const trimmed = text.replace(/\n{3,}/g, '\n\n').trim()
  if (!trimmed) return false
  return trimmed.length <= maxChars && trimmed.split('\n').length <= maxLines
}

export function mergeShortThinking(blocks: readonly BlockLike[], options: MergeShortThinkingOptions): MergeShortThinkingResult {
  const skip = new Set<number>()
  const leading = new Map<number, string>()
  const hidden = options.hiddenToolNames
  const maxChars = options.maxChars ?? SHORT_THINKING_MAX_CHARS
  const maxLines = options.maxLines ?? SHORT_THINKING_MAX_LINES

  let pending: Array<{ index: number; text: string }> = []
  const flush = (): void => { pending = [] }

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!
    if (block.type === 'thinking') {
      const text = typeof block.thinking === 'string' ? block.thinking : ''
      // 空思考本来就不显示，不影响相邻关系。
      if (!text.trim()) continue
      if (i === options.liveIndex || !isShortThinking(text, maxChars, maxLines)) {
        flush()
        continue
      }
      pending.push({ index: i, text: text.replace(/\n{3,}/g, '\n\n').trim() })
      continue
    }
    if (block.type === 'tool_use') {
      const name = typeof block.name === 'string' ? block.name : ''
      if (hidden?.has(name)) continue
      if (pending.length > 0 && !SUBAGENT_TOOLS.has(name)) {
        for (const p of pending) skip.add(p.index)
        leading.set(i, pending.map((p) => p.text).join('\n\n'))
      }
      flush()
      continue
    }
    // 正文、其他块：前面的思考保持单独一行。
    if (block.type === 'text' && typeof block.text === 'string' && !block.text.trim()) continue
    flush()
  }
  return { skip, leading }
}
