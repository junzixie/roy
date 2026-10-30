/**
 * DeepSeek 优化模式：历史推理尾截断 + 已排除路径锚点补偿。
 *
 * 背景：DeepSeek 的 OpenAI 兼容协议（chat-completions / responses）要求 assistant
 * 消息携带 reasoning_content。若历史每一轮的完整推理都回传，输入 token 会随轮次
 * 线性膨胀；若完全不回传，模型会丢失「已经试过什么、排除了什么」而反复走回头路。
 *
 * 解法与天枢 spark 一致：wire 层只回传每条历史推理的**尾部**（保留最近思路的连贯
 * 性），把被截掉的前段里「已排除的路径」提炼成锚点注入上下文。截断长度 N 在会话
 * 内冻结——同一会话的每条消息都用同一个 N，历史字节不随轮次漂移，前缀缓存才能命中。
 *
 * 与天枢的差异：天枢的锚点算法在闭源侧，这里按其公开语义自建。判定规则只认
 * 「明确排除」的表述，宁可漏提取，不要误判成排除（误判会让模型放弃本来可行的路径）。
 */

type ProviderPayload = Record<string, unknown>

/** 一条 wire 消息的最小结构（OpenAI 兼容协议的 messages 元素）。 */
interface WireMessage {
  role?: unknown
  content?: unknown
  reasoning_content?: unknown
  reasoning?: unknown
  reasoning_text?: unknown
  tool_calls?: unknown
}

/**
 * OpenAI 兼容协议承载历史推理的顶层字段名。
 *
 * Pi 的 openai-completions 转换按 thinking 块签名决定写哪个字段，实际取值就这三种
 * （见 pi-ai `OPENAI_COMPLETIONS_REASONING_FIELDS`），必须全部覆盖，否则换了中转站
 * 的字段名截断就静默失效。
 */
const REASONING_TEXT_FIELDS = ['reasoning_content', 'reasoning', 'reasoning_text'] as const

/** Responses 协议 input[] 里的推理 item。 */
interface ResponsesReasoningItem {
  type?: unknown
  summary?: unknown
  encrypted_content?: unknown
}

interface ResponsesSummaryPart {
  type?: unknown
  text?: unknown
}

export interface ReasoningCompactionSettings {
  /** 冻结的截断长度（字符数）。未设置时用 DEFAULT_TRUNCATE_CHARS。 */
  truncateChars?: number
  /** 只在思考开启时生效；关闭思考时根本没有 reasoning 需要处理。 */
  enabled?: boolean
  /**
   * 是否把「已排除路径」锚点补回上下文。
   *
   * 默认开启：推理尾截断丢掉的前段里，最值得保留的就是「这条路试过了、不行」这类
   * 排除结论。不补偿的话模型会重复走回头路，省下的 token 又花回去。
   * 无锚点时零字节差异，不构成额外成本。
   */
  injectAnchors?: boolean
}

/** 默认保留的推理尾部长度。约 800 tokens，够承接上一轮思路，又不至于把历史撑大。 */
export const DEFAULT_TRUNCATE_CHARS = 2000
/** 单条推理短于这个长度就不截断——截短了反而丢信息。 */
export const MIN_TRUNCATE_THRESHOLD = 2400
/** 锚点上限，与天枢 engine 侧一致，防止锚点块自己变成新的膨胀源。 */
export const MAX_ANCHORS = 20

/**
 * 「明确排除」的判定。
 *
 * 只匹配对路径/方案作出否定结论的句子。刻意不匹配「可能不行」「不确定」这类
 * 弱表述——那不是排除，当成排除会误导后续推理。
 */
const EXCLUSION_PATTERNS: RegExp[] = [
  // 中文：已经排除 / 排除了 / 可以排除 / 不是这里的问题
  /(?:已经?排除|排除掉|可以排除|应排除)[了：:]?\s*([^\n。；;]{2,120})/g,
  // 中文：不是 X 的问题 / 不在 X / 与 X 无关
  /(?:不是|并非|不在)\s*([^\n。；;]{2,80}?)\s*(?:的问题|导致|引起|造成)/g,
  /(?:与|和)\s*([^\n。；;]{2,80}?)\s*无关/g,
  // 中文：不需要改/不用动 X / 无需修改 X
  /(?:不需要|不用|无需|不必)(?:再)?(?:改|修改|改动|动|看|检查)\s*([^\n。；;]{2,80})/g,
  // 英文：rule out / ruled out / not the cause / unrelated to
  /(?:ruled?\s+out|rule\s+out)[:\s]+([^\n.;]{2,120})/gi,
  /not\s+the\s+(?:cause|problem|issue)\s+(?:of\s+)?([^\n.;]{2,80})/gi,
  /(?:unrelated\s+to|independent\s+of)\s+([^\n.;]{2,80})/gi,
]

/** 从锚点候选里剔除纯噪音（过短、纯标点、纯空白）。 */
function isMeaningfulAnchor(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed.length < 4 || trimmed.length > 160) return false
  // 至少含一个字母/数字/汉字，排除「。。。」这类
  return /[\p{L}\p{N}]/u.test(trimmed)
}

function normalizeAnchor(text: string): string {
  return text.trim().replace(/\s+/g, ' ').replace(/[，,。.;；:：]+$/, '')
}

/**
 * 从一段完整推理中提取「已排除的路径」。
 *
 * 只扫被截断丢弃的前段——尾段本来就会原样回传给模型，重复提取只会浪费锚点配额。
 * 返回去重后的锚点文本，保首见顺序。
 */
export function extractExcludedAnchors(
  reasoning: string,
  truncateChars: number = DEFAULT_TRUNCATE_CHARS,
): string[] {
  if (!reasoning) return []
  // 尾段会原样保留在 wire 上，不需要补偿
  const head = reasoning.length > truncateChars
    ? reasoning.slice(0, reasoning.length - truncateChars)
    : ''
  if (!head) return []

  const seen = new Set<string>()
  const anchors: string[] = []
  for (const pattern of EXCLUSION_PATTERNS) {
    // 有 /g 的正则复用 lastIndex，每次从头扫
    pattern.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = pattern.exec(head)) !== null) {
      const candidate = normalizeAnchor(match[1] ?? '')
      if (!isMeaningfulAnchor(candidate)) continue
      const key = candidate.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      anchors.push(candidate)
      if (anchors.length >= MAX_ANCHORS) return anchors
    }
  }
  return anchors
}

/**
 * 把一个推理字符串截到尾部 N 字符，并在头部留标记。
 *
 * 短于阈值的原样返回 `undefined`，让调用方走零改动路径。
 */
function truncateText(
  text: string,
  truncateChars: number,
): { text: string; droppedChars: number } | undefined {
  if (text.length <= Math.max(truncateChars, MIN_TRUNCATE_THRESHOLD)) return undefined
  const tail = text.slice(text.length - truncateChars)
  const droppedChars = text.length - truncateChars
  return { text: `[前 ${droppedChars} 字推理已省略]\n${tail}`, droppedChars }
}

/**
 * 对单条 wire 消息做尾截断（copy-on-write，绝不改原对象）。
 *
 * 覆盖 chat-completions 的三种推理字段名。截断保留尾部并在头部留一个短标记，
 * 让模型知道这里被裁过——否则它会以为推理本来就这么短。
 */
export function truncateReasoningContent(
  message: WireMessage,
  truncateChars: number = DEFAULT_TRUNCATE_CHARS,
): WireMessage {
  let result = message
  for (const field of REASONING_TEXT_FIELDS) {
    const value = result[field]
    if (typeof value !== 'string') continue
    const truncated = truncateText(value, truncateChars)
    if (!truncated) continue
    // 每次都基于上一次的结果复制，避免多个字段时互相覆盖
    result = { ...result, [field]: truncated.text }
  }
  return result
}

/**
 * 对 Responses 协议的一条 input item 做推理截断。
 *
 * Responses 的历史推理是 `{type:'reasoning', id, summary:[{type:'summary_text', text}]}`，
 * 与 chat-completions 的平铺字段完全不同。`id` / `status` / `type` 必须原样保留，
 * 它们用于和后续 item 配对；只动 `summary[].text` 正文。
 *
 * 带 `encrypted_content` 的 item 一律跳过：那是服务端加密载荷，改了会导致校验失败。
 */
export function truncateResponsesReasoningItem(
  item: unknown,
  truncateChars: number = DEFAULT_TRUNCATE_CHARS,
): unknown {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return item
  const reasoningItem = item as ResponsesReasoningItem
  if (reasoningItem.type !== 'reasoning') return item
  if (reasoningItem.encrypted_content) return item
  if (!Array.isArray(reasoningItem.summary)) return item

  let changed = false
  const summary = (reasoningItem.summary as ResponsesSummaryPart[]).map((part) => {
    if (!part || typeof part !== 'object') return part
    if (part.type !== 'summary_text' || typeof part.text !== 'string') return part
    const truncated = truncateText(part.text, truncateChars)
    if (!truncated) return part
    changed = true
    return { ...part, text: truncated.text }
  })
  return changed ? { ...reasoningItem, summary } : item
}

/** payload.messages 是否是可处理的数组。 */
function isProviderPayload(payload: unknown): payload is ProviderPayload {
  return typeof payload === 'object' && payload !== null && !Array.isArray(payload)
}

/**
 * 对整个请求 body 做推理截断，覆盖两种 wire 形状。
 *
 * - chat-completions：`messages[].reasoning_content`（及其同义字段）
 * - responses：`input[]` 里 `type:'reasoning'` 的 `summary[].text`
 *
 * 两者互斥出现，但同一份代码都试一遍没有副作用——不匹配的分支原样返回。
 * 返回新 payload（有改动时），无改动返回原引用，便于调用方判断是否需要替换。
 */
export function compactRequestReasoning(
  payload: unknown,
  settings: ReasoningCompactionSettings = {},
): unknown {
  if (settings.enabled === false) return payload
  if (!isProviderPayload(payload)) return payload

  const truncateChars = settings.truncateChars ?? DEFAULT_TRUNCATE_CHARS
  let changed = false
  let next: ProviderPayload = payload

  if (Array.isArray(payload.messages)) {
    const messages = (payload.messages as WireMessage[]).map((message) => {
      if (!message || typeof message !== 'object') return message
      if (message.role !== 'assistant') return message
      const updated = truncateReasoningContent(message, truncateChars)
      if (updated !== message) changed = true
      return updated
    })
    if (changed) next = { ...next, messages }
  }

  if (Array.isArray(payload.input)) {
    let inputChanged = false
    const input = (payload.input as unknown[]).map((item) => {
      const updated = truncateResponsesReasoningItem(item, truncateChars)
      if (updated !== item) inputChanged = true
      return updated
    })
    if (inputChanged) {
      changed = true
      next = { ...next, input }
    }
  }

  return changed ? next : payload
}

/**
 * 从完整消息历史收集锚点（供注入上下文用）。
 *
 * 与 wire 截断共用同一个 N：两者必须精确互补，N 不同会导致重复注入或漏补偿。
 */
export function collectAnchorsFromMessages(
  messages: readonly WireMessage[],
  truncateChars: number = DEFAULT_TRUNCATE_CHARS,
): string[] {
  const seen = new Set<string>()
  const anchors: string[] = []
  for (const message of messages) {
    if (!message || message.role !== 'assistant') continue
    const reasoning = message.reasoning_content
    if (typeof reasoning !== 'string' || !reasoning) continue
    for (const anchor of extractExcludedAnchors(reasoning, truncateChars)) {
      const key = anchor.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      anchors.push(anchor)
      if (anchors.length >= MAX_ANCHORS) return anchors
    }
  }
  return anchors
}

/**
 * 从 Responses 协议的 input[] 里收集已排除路径锚点。
 *
 * 与 chat-completions 同构：只扫 `summary[].text`，跳过带 `encrypted_content`
 * 的 item（无法解密，也就无从提取）。
 */
export function collectAnchorsFromResponsesInput(
  input: readonly unknown[],
  truncateChars: number = DEFAULT_TRUNCATE_CHARS,
): string[] {
  const seen = new Set<string>()
  const anchors: string[] = []
  for (const item of input) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const reasoningItem = item as ResponsesReasoningItem
    if (reasoningItem.type !== 'reasoning') continue
    if (reasoningItem.encrypted_content) continue
    if (!Array.isArray(reasoningItem.summary)) continue
    for (const part of reasoningItem.summary as ResponsesSummaryPart[]) {
      if (!part || typeof part !== 'object') continue
      if (typeof part.text !== 'string' || !part.text) continue
      for (const anchor of extractExcludedAnchors(part.text, truncateChars)) {
        const key = anchor.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        anchors.push(anchor)
        if (anchors.length >= MAX_ANCHORS) return anchors
      }
    }
  }
  return anchors
}

/** 从整个请求 body 收集锚点（自动适配两种 wire 形状）。 */
export function collectAnchorsFromPayload(
  payload: unknown,
  truncateChars: number = DEFAULT_TRUNCATE_CHARS,
): string[] {
  if (!isProviderPayload(payload)) return []
  const fromMessages = Array.isArray(payload.messages)
    ? collectAnchorsFromMessages(payload.messages as WireMessage[], truncateChars)
    : []
  if (fromMessages.length > 0) return fromMessages
  return Array.isArray(payload.input)
    ? collectAnchorsFromResponsesInput(payload.input as unknown[], truncateChars)
    : []
}

/** 渲染成注入上下文的 XML 块；无锚点返回空串（零字节差异）。 */
export function renderExcludedPaths(anchors: readonly string[]): string {
  if (anchors.length === 0) return ''
  const items = anchors.map((anchor) => `- ${escapeXml(anchor)}`).join('\n')
  return `<excluded-paths note="推理截断补偿：以下路径已在早前推理中显式排除，勿重复尝试">\n${items}\n</excluded-paths>`
}

/** 已注入标记，防止同一请求被重复追加。 */
const EXCLUDED_PATHS_MARKER = '<excluded-paths'

/** 判断一段已渲染的文本是否已经带过补偿块。 */
function alreadyInjected(text: string): boolean {
  return text.includes(EXCLUDED_PATHS_MARKER)
}

/**
 * 把补偿块追加到请求**最后一条**消息的尾部。
 *
 * 只追加到末条，且末条必须是 user：
 *
 * - 追加在末尾 → 前面所有字节一字不动，前缀缓存继续命中。
 * - 若末条不是 user（工具循环中是 toolResult），直接跳过。向中间某条历史 user
 *   消息追加会让它之后的内容全部失效，每轮重新计费，得不偿失。锚点在新一轮
 *   提问时最有用，那时末条正好就是 user。
 *
 * 覆盖两种 wire 形状：chat-completions 的 `messages[]` 与 responses 的 `input[]`。
 * 无锚点或无可追加位置时返回原引用（零字节差异）。
 */
export function injectExcludedPaths(
  payload: unknown,
  anchors: readonly string[],
): unknown {
  const block = renderExcludedPaths(anchors)
  if (!block) return payload
  if (!isProviderPayload(payload)) return payload

  const appendToMessages = (): ProviderPayload | undefined => {
    if (!Array.isArray(payload.messages)) return undefined
    const messages = payload.messages as WireMessage[]
    if (messages.length === 0) return undefined
    const index = messages.length - 1
    const message = messages[index]
    if (!message || typeof message !== 'object' || message.role !== 'user') return undefined
    const content = message.content
    if (typeof content === 'string') {
      if (alreadyInjected(content)) return undefined
      const next = [...messages]
      next[index] = { ...message, content: `${content}\n\n${block}` }
      return { ...payload, messages: next }
    }
    if (Array.isArray(content)) {
      const parts = content as Array<Record<string, unknown>>
      const lastText = [...parts].reverse().find((part) => part?.type === 'text' && typeof part.text === 'string')
      if (lastText && alreadyInjected(String(lastText.text))) return undefined
      const next = [...messages]
      next[index] = { ...message, content: [...parts, { type: 'text', text: block }] }
      return { ...payload, messages: next }
    }
    return undefined
  }

  const appendToInput = (): ProviderPayload | undefined => {
    if (!Array.isArray(payload.input)) return undefined
    const input = payload.input as Array<Record<string, unknown>>
    if (input.length === 0) return undefined
    const index = input.length - 1
    const item = input[index]
    if (!item || typeof item !== 'object' || item.role !== 'user') return undefined
    const content = item.content
    if (typeof content === 'string') {
      if (alreadyInjected(content)) return undefined
      const next = [...input]
      next[index] = { ...item, content: `${content}\n\n${block}` }
      return { ...payload, input: next }
    }
    if (Array.isArray(content)) {
      const parts = content as Array<Record<string, unknown>>
      const lastText = [...parts].reverse().find((part) => typeof part?.text === 'string')
      if (lastText && alreadyInjected(String(lastText.text))) return undefined
      const next = [...input]
      next[index] = { ...item, content: [...parts, { type: 'input_text', text: block }] }
      return { ...payload, input: next }
    }
    return undefined
  }

  return appendToMessages() ?? appendToInput() ?? payload
}

function escapeXml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
