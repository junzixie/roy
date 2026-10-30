/**
 * Assistant 回合的展示分层（对齐 Roy / FeiBo）：
 * - 中间过程（思考、工具调用、过程说明）收进一个「执行过程」组；
 * - 末尾的连续正文作为最终答复，独立完整展示。
 *
 * 纯函数、不依赖 React，便于测试；ProcessBlockGroup 负责渲染。
 */
import type { SDKContentBlock, SDKTextBlock, SDKThinkingBlock, SDKToolUseBlock } from '@roy/shared'

export interface IndexedContentBlock {
  block: SDKContentBlock
  /** 原始下标，作为渲染 key，保证流式更新时身份稳定。 */
  index: number
}

export type AssistantTurnRenderItem =
  | { type: 'block'; item: IndexedContentBlock }
  | { type: 'process-group'; items: IndexedContentBlock[] }

export interface BuildAssistantTurnRenderItemsOptions {
  isStreaming?: boolean
  /** 界面上不单独渲染的工具（如任务进度工具），不能挡住最终答复。 */
  hiddenToolNames?: ReadonlySet<string>
}

function textOf(block: SDKContentBlock): string | undefined {
  if (block.type === 'text') return (block as SDKTextBlock).text ?? ''
  if (block.type === 'thinking') return (block as SDKThinkingBlock).thinking ?? ''
  return undefined
}

function normalizeForCompare(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/** 空白正文、空白思考不渲染，也不计入「N 条消息」。 */
export function isBlankContentBlock(block: SDKContentBlock): boolean {
  const text = textOf(block)
  return text !== undefined && text.trim() === ''
}

function isHiddenTool(block: SDKContentBlock, hidden?: ReadonlySet<string>): boolean {
  return block.type === 'tool_use' && !!hidden?.has((block as SDKToolUseBlock).name)
}

/**
 * 过滤空白块，并去掉与相邻正文内容完全相同的思考块
 * （部分渠道会把同一段话同时放进 thinking 与 text，界面上会重复出现）。
 */
/** 单段正文若是「整段复制粘贴翻倍」，收成一半。 */
function collapseSelfDuplicatedText(raw: string): string {
  const text = raw.trim()
  if (text.length < 8) return raw
  const mid = Math.floor(text.length / 2)
  const left = text.slice(0, mid).trim()
  const right = text.slice(mid).trim()
  if (left && left === right) return text.slice(0, mid)
  // 中间多一个空行的翻倍：A\n\nA
  const parts = text.split(/\n\n+/)
  if (parts.length === 2 && normalizeForCompare(parts[0] ?? '') === normalizeForCompare(parts[1] ?? '') && (parts[0] ?? '').trim()) {
    return parts[0]!.trimEnd()
  }
  return raw
}

export function cleanAssistantBlocks(blocks: SDKContentBlock[]): IndexedContentBlock[] {
  const indexed = blocks
    .map((block, index) => {
      if (block.type === 'text') {
        const collapsed = collapseSelfDuplicatedText((block as SDKTextBlock).text ?? '')
        if (collapsed !== (block as SDKTextBlock).text) {
          return { block: { ...block, text: collapsed } as SDKContentBlock, index }
        }
      }
      return { block, index }
    })
    .filter(({ block }) => !isBlankContentBlock(block))

  const withoutEchoedThinking = indexed.filter(({ block }, i) => {
    if (block.type !== 'thinking') return true
    const own = normalizeForCompare(textOf(block) ?? '')
    const neighbours = [indexed[i - 1], indexed[i + 1]]
    return !neighbours.some((n) => n?.block.type === 'text' && normalizeForCompare(textOf(n.block) ?? '') === own)
  })

  // 续写误把完整答复再贴一遍时，同一回合会出现相邻两段相同正文；只留后面更完整的那段。
  const result: IndexedContentBlock[] = []
  for (const item of withoutEchoedThinking) {
    if (item.block.type !== 'text') {
      result.push(item)
      continue
    }
    const curr = normalizeForCompare(textOf(item.block) ?? '')
    const prev = result[result.length - 1]
    if (prev?.block.type === 'text') {
      const prevText = normalizeForCompare(textOf(prev.block) ?? '')
      if (prevText && curr && (curr === prevText || curr.startsWith(prevText))) {
        result[result.length - 1] = item
        continue
      }
      if (prevText && curr && prevText.startsWith(curr)) {
        continue
      }
    }
    result.push(item)
  }
  return result
}

/**
 * 找出最终答复的起点：末尾连续的正文块。
 * 跳过末尾不可见的工具（例如答完后更新任务进度），否则整段答复都会被折叠。
 * 返回 cleaned 数组中的位置；没有最终答复时返回 null。
 */
function findFinalAnswerRange(
  cleaned: IndexedContentBlock[],
  hidden?: ReadonlySet<string>,
): { start: number; end: number } | null {
  let end = cleaned.length
  while (end > 0 && isHiddenTool(cleaned[end - 1]!.block, hidden)) end -= 1
  if (end === 0 || cleaned[end - 1]!.block.type !== 'text') return null
  let start = end - 1
  while (start > 0 && cleaned[start - 1]!.block.type === 'text') start -= 1
  return { start, end }
}

function processGroup(items: IndexedContentBlock[], hidden?: ReadonlySet<string>): AssistantTurnRenderItem[] {
  // 只剩不可见工具时不生成空的「执行过程」行。
  if (!items.some(({ block }) => !isHiddenTool(block, hidden))) return []
  return [{ type: 'process-group', items }]
}

export function buildAssistantTurnRenderItems(
  blocks: SDKContentBlock[],
  options: BuildAssistantTurnRenderItemsOptions = {},
): AssistantTurnRenderItem[] {
  const { hiddenToolNames: hidden } = options
  const cleaned = cleanAssistantBlocks(blocks)
  if (cleaned.length === 0) return []

  // 面向用户的正文永远留在原位置；只把连续的思考/工具收进过程组。
  const result: AssistantTurnRenderItem[] = []
  let pending: IndexedContentBlock[] = []
  const flush = (): void => {
    result.push(...processGroup(pending, hidden))
    pending = []
  }
  for (const item of cleaned) {
    if (isHiddenTool(item.block, hidden)) continue
    if (item.block.type === 'text') {
      flush()
      result.push({ type: 'block', item })
    } else pending.push(item)
  }
  flush()
  return result
}

/** 复制按钮只复制最终答复；没有独立最终答复时退回全部正文。 */
export function collectFinalAnswerText(_items: AssistantTurnRenderItem[], allBlocks: SDKContentBlock[]): string {
  const cleaned = cleanAssistantBlocks(allBlocks)
  const range = findFinalAnswerRange(cleaned)
  const finalTexts = range ? cleaned.slice(range.start, range.end)
    .map(({ block }) => (block as SDKTextBlock).text.trim()).filter(Boolean) : []
  if (finalTexts.length) return finalTexts.join('\n\n')
  return allBlocks.filter((b) => b.type === 'text')
    .map((b) => (b as SDKTextBlock).text.trim()).filter(Boolean).join('\n\n')
}
