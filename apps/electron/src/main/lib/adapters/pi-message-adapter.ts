import { hasLeakedProtocol, stripProtocol, visibleProtocolText } from './leaked-tool-protocol'
import { splitInlineThinking } from './inline-thinking'
/**
 * Pi Agent 消息兼容层。
 *
 * 主进程和渲染层仍使用 Claude SDK 兼容的 SDKMessage 协议；本模块集中处理
 * Pi AgentMessage 与 SDKMessage 之间的形状转换，避免 session 编排代码混入 UI 协议细节。
 */

import { randomUUID } from 'node:crypto'
import type { AgentMessage } from '@earendil-works/pi-agent-core'
import type { AssistantMessage, ToolResultMessage, UserMessage } from '@earendil-works/pi-ai/compat'
import type { SDKAssistantMessage, SDKMessage } from '@roy/shared'
import type { RuntimeGuardResultOverride } from '../agent-runtime-guards'
import { isMalformedResponseError, isTransientNetworkError } from '../error-patterns'
import { sanitizeToolResultImageContent } from '../image-content-validation'

function getPiEditItems(input: Record<string, unknown>): Array<Record<string, unknown>> {
  return Array.isArray(input.edits)
    ? input.edits.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    : []
}

function isMultiEditInput(piName: string, input: Record<string, unknown>): boolean {
  return piName === 'edit' && getPiEditItems(input).length > 1
}

export function displayToolName(piName: string, input?: Record<string, unknown>): string {
  switch (piName) {
    case 'read':
      return 'Read'
    case 'write':
      return 'Write'
    case 'edit':
      return input && isMultiEditInput(piName, input) ? 'MultiEdit' : 'Edit'
    case 'bash':
      return 'Bash'
    case 'powershell':
      return 'PowerShell'
    case 'grep':
      return 'Grep'
    case 'find':
      return 'Glob'
    case 'ls':
      return 'LS'
    default:
      return piName
  }
}

export function normalizePermissionInput(piName: string, input: Record<string, unknown>): Record<string, unknown> {
  switch (piName) {
    case 'read':
    case 'write':
      return { ...input, file_path: input.path }
    case 'edit': {
      const editItems = getPiEditItems(input)
      const firstEdit = editItems[0]
      return {
        ...input,
        file_path: input.path,
        edits: editItems.map((edit) => ({
          ...edit,
          old_string: edit.old_string ?? edit.oldText,
          new_string: edit.new_string ?? edit.newText,
        })),
        old_string: firstEdit?.old_string ?? firstEdit?.oldText,
        new_string: firstEdit?.new_string ?? firstEdit?.newText,
      }
    }
    case 'find':
      return { ...input, pattern: input.pattern }
    case 'ls':
      return { ...input, file_path: input.path ?? '.' }
    default:
      return input
  }
}

function normalizeToolUseInput(piName: string, input: Record<string, unknown>): Record<string, unknown> {
  switch (piName) {
    case 'read':
    case 'write':
      return { ...input, file_path: input.file_path ?? input.path }
    case 'edit': {
      const editItems = getPiEditItems(input)
      const firstEdit = editItems[0]
      const normalizedEdits = editItems.map((edit) => ({
        ...edit,
        old_string: edit.old_string ?? edit.oldText,
        new_string: edit.new_string ?? edit.newText,
      }))
      const joinedOld = normalizedEdits
        .map((edit, index) => `--- Edit ${index + 1} ---\n${String(edit.old_string ?? '')}`)
        .join('\n')
      const joinedNew = normalizedEdits
        .map((edit, index) => `--- Edit ${index + 1} ---\n${String(edit.new_string ?? '')}`)
        .join('\n')
      return {
        ...input,
        file_path: input.file_path ?? input.path,
        edits: normalizedEdits,
        old_string: input.old_string ?? (normalizedEdits.length > 1 ? joinedOld : firstEdit?.old_string ?? firstEdit?.oldText),
        new_string: input.new_string ?? (normalizedEdits.length > 1 ? joinedNew : firstEdit?.new_string ?? firstEdit?.newText),
      }
    }
    case 'find':
      return { ...input, pattern: input.pattern }
    case 'ls':
      return { ...input, file_path: input.file_path ?? input.path ?? '.' }
    default:
      return input
  }
}

export function restorePiInput(
  piName: string,
  original: Record<string, unknown>,
  updated?: Record<string, unknown>,
): Record<string, unknown> {
  if (!updated) return original
  switch (piName) {
    case 'read':
    case 'write':
      return { ...original, ...updated, path: updated.file_path ?? updated.path ?? original.path }
    case 'edit':
      return { ...original, ...updated, path: updated.file_path ?? updated.path ?? original.path }
    default:
      return { ...original, ...updated }
  }
}

function normalizeToolResultContent(content: unknown): unknown {
  if (!Array.isArray(content)) return content
  const normalized = content.map((item) => {
    if (!item || typeof item !== 'object') return item
    const record = item as Record<string, unknown>
    if (record.type === 'text' && typeof record.text === 'string') {
      return { type: 'text', text: record.text }
    }
    if (record.type === 'image') {
      return record
    }
    return record
  })
  return sanitizeToolResultImageContent(normalized as Parameters<typeof sanitizeToolResultImageContent>[0])
}

function contentToText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content.map((block) => {
      if (block && typeof block === 'object' && 'type' in block && block.type === 'text' && 'text' in block) {
        return typeof block.text === 'string' ? block.text : ''
      }
      return ''
    }).join('')
  }
  return ''
}

export function isAssistantPiMessage(message: AgentMessage): message is AssistantMessage {
  return !!message && typeof message === 'object' && 'role' in message && message.role === 'assistant'
}

/** Pi's terminal error and any generated assistant content are independent fields. */
export function getPiAssistantErrorDetails(message: SDKAssistantMessage): {
  detailedMessage: string
  originalError: string
} {
  const errorMessage = message.error?.message?.trim() || 'Unknown error'
  return { detailedMessage: errorMessage, originalError: errorMessage }
}

/** Pi can generate text before a stream failure; preserve it as normal assistant output. */
export function hasPiAssistantTextContent(message: SDKAssistantMessage): boolean {
  return message.message.content.some(
    (block) => block.type === 'text' && 'text' in block && typeof block.text === 'string' && block.text.trim().length > 0,
  )
}

/** Copy Pi's generated output without the terminal transport/provider failure. */
export function stripPiAssistantError(message: SDKAssistantMessage): SDKAssistantMessage {
  const contentMessage = { ...message }
  delete contentMessage.error
  return contentMessage
}

export function isAbortedAssistantMessage(message: AgentMessage): message is AssistantMessage {
  return isAssistantPiMessage(message) && message.stopReason === 'aborted'
}

export function dropTrailingAbortedAssistant(messages: AgentMessage[]): AgentMessage[] {
  const lastMessage = messages[messages.length - 1]
  return lastMessage && isAbortedAssistantMessage(lastMessage) ? messages.slice(0, -1) : messages
}

function usageFromAssistant(message: AssistantMessage): {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
} {
  return {
    input_tokens: message.usage?.input ?? 0,
    output_tokens: message.usage?.output ?? 0,
    cache_read_input_tokens: message.usage?.cacheRead ?? 0,
    cache_creation_input_tokens: message.usage?.cacheWrite ?? 0,
  }
}

// 说明：本函数产出的消息 parent_tool_use_id 恒为 null。Pi 的事件模型（AgentEvent）不存在
// 子代理/sidechain 概念，AgentMessage 也无父子关联字段，故 pi 会话的所有消息都是主线。
// 渲染层（SDKMessageRenderer 的 childBlocksMap/agentToolIds 分组）不是死代码：迁移前用旧
// claude-sdk 持久化的历史会话 JSONL 里子代理消息带非空 parent_tool_use_id，打开老会话时仍
// 依赖该逻辑正确嵌套显示，不可删除。
/** 催模型继续时发的内部提示，用标签包起来，界面上不显示 */
export const ROY_STALL_NUDGE_TAG = 'roy_stall_nudge'

/** 检测单/双竖线、全角/半角和空格变体；代码示例不触发恢复。 */
export function hasLeakedToolMarkup(text: string): boolean { return hasLeakedProtocol(text) }
export function stripLeakedToolMarkup(text: string): string { return stripProtocol(text).replace(/\n{3,}/g, '\n\n').trim() }
export function isInternalStallNudge(text: string): boolean { return text.trimStart().startsWith(`<${ROY_STALL_NUDGE_TAG}>`) }

/**
 * 「我这就去做」却没调工具：只看结尾一句，避免误伤正常的总结。
 *
 * 中文侧不能只认「这就/马上」：模型更常写「我再确认一下」「我再看下」「我再核对」，
 * 这类句子在原来的正则里被判成正常结束，于是任务停在半路（实测原话：
 * 「我再确认 Roy 打出去的包里有没有带它。」——判为 stop，一句提醒都没发）。
 */
const PROMISE_TAIL_RE = /(?:\blet me\b|\blet's\b|\bi(?:'ll| will)\b|\bnow (?:check|run|verify|install|read)\b|我(?:这就|马上|现在就|先来|来|再(?:去|看|查|看一下|查一下|确认|核对|检查|看看|试试|过一遍))|接下来(?:我)?(?:去|会|先)|然后(?:我)?(?:再|去|会))[^\n]{0,160}[:：]?\s*$/i

/**
 * 结尾已经交代了完成情况 / 只剩可选补充，不算「只说不做」。
 * 例如「以上已全部完成，如需我再补充细节请说」「结论如下」——这些是真收尾。
 */
const COMPLETION_TAIL_RE = /(?:已完成|全部完成|都做完了|全部做完|结论|总结如下|以上|没有(?:其他|别的|剩余)|无其他|待办|遗留|如有需要|如果需要|需要的话|请说|你定|由你决定)/

export type StalledTurnKind = 'leaked-tool-markup' | 'echoed-thinking' | 'promise-only' | 'thought-overflow' | 'output-truncated' | 'empty-output'

/**
 * 一轮正常结束（stopReason=stop）但没有结构化工具调用时，判断是不是「卡住了」：
 * - 正文里漏出了工具调用原文（DSML）
 * - 正文和思考一字不差（中转站把思考又当正文发了一遍）
 * - 正文只是一句「我这就去做」
 * - 整轮没有任何文本、思考或工具调用（上游返回空 end_turn）
 * 照 FeiBo 的做法，这种情况提醒模型一次去真正调用工具，而不是当成任务完成。
 */
/** 正文是否像被 max_tokens 截断（而不是完整短答被误标 length） */
function looksOutputTruncated(body: string): boolean {
  const text = body.trim()
  if (!text) return true
  // 明确完整收尾
  if (/[。！？.!?]["'”’）)\]]*$/.test(text)) return false
  if (/```\s*$/.test(text)) return false
  // 悬空标点/连接词：像话没说完（优先于短答豁免）
  if (text.length >= 16 && /[，,；;：:、]$/.test(text)) return true
  if (text.length >= 16 && /(以及|并且|例如|比如|包括|如下)$/.test(text)) return true
  // 短答即使没句号也不续写（Sol 等渠道常误报 length，续写会把全文再贴一遍）
  if (text.length < 80) return false
  // 较长却无终标 → 像被截断
  return text.length >= 200
}

export function detectStalledTurn(message: AgentMessage | undefined): StalledTurnKind | undefined {
  if (!message || !isAssistantPiMessage(message)) return undefined
  if (message.content.some((b) => b.type === 'toolCall')) return undefined
  if (['stop', 'length', 'toolUse'].includes(message.stopReason) && hasLeakedToolMarkup(message.content.filter(b => b.type === 'text').map(b => b.text).join(''))) return 'leaked-tool-markup'
  // 输出上限：思考吃光 → thought-overflow；正文看起来被截断 → 自动续写一轮
  // 注意：部分渠道（如 gpt-*-sol）会误报 stopReason=length；完整短答不要续写，
  // 否则模型常把整段答复再写一遍，同一气泡里正文翻倍。
  if ((message.stopReason as string) === 'length') {
    const body = message.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim()
    const thought = message.content.filter((b) => b.type === 'thinking').map((b) => b.thinking).join('').trim()
    if (thought.length > 0 && body.length < 200) return 'thought-overflow'
    if (looksOutputTruncated(body)) return 'output-truncated'
    return undefined
  }
  if (message.stopReason !== 'stop') return undefined
  const text = message.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim()
  const thinking = message.content.filter((b) => b.type === 'thinking').map((b) => b.thinking).join('').trim()
  // 上游返回空 end_turn（无文本、无思考、无工具调用）：界面会停在上一轮，用户看到的就是「用着用着自己断了」
  if (text.length === 0 && thinking.length === 0) return 'empty-output'
  if (hasLeakedToolMarkup(text)) return 'leaked-tool-markup'
  if (thinking.length > 0 && text === thinking) return 'echoed-thinking'
  if (text.length > 0 && text.length < 1500) {
    const tail = text.slice(-220)
    if (PROMISE_TAIL_RE.test(tail) && !COMPLETION_TAIL_RE.test(tail)) return 'promise-only'
  }
  return undefined
}

/** 把卡住那一轮的正文清理掉再放回上下文，免得模型看到自己的原文又照抄一遍 */
export function cleanStalledAssistant(message: AssistantMessage): AssistantMessage {
  const thinking = message.content.filter((b) => b.type === 'thinking').map((b) => b.thinking).join('').trim()
  return {
    ...message,
    content: message.content
      .map((b) => {
        if (b.type === 'thinking') return { ...b, thinking: stripLeakedToolMarkup(b.thinking) }
        if (b.type !== 'text') return b
        const cleaned = stripLeakedToolMarkup(b.text)
        return cleaned === thinking ? { ...b, text: '' } : { ...b, text: cleaned }
      })
      .filter((b) => b.type !== 'text' || b.text.trim().length > 0),
  }
}

export function buildStallNudge(kind: StalledTurnKind): string {
  if (kind === 'thought-overflow') {
    return `<${ROY_STALL_NUDGE_TAG}>（系统提示）你上一轮的思考太长，把输出上限用完了，没有给出答复或工具调用。不要再完整规划整个任务：只想清楚第一步，然后立刻调用工具去做；如果已经能回答，就直接简短回答。</${ROY_STALL_NUDGE_TAG}>`
  }
  if (kind === 'output-truncated') {
    return `<${ROY_STALL_NUDGE_TAG}>（系统提示）你上一轮因输出上限被截断，答复不完整。请从断点直接续写：不要重复已输出内容，不要重新开场；需要工具就立刻调用，否则把剩余结论写完。</${ROY_STALL_NUDGE_TAG}>`
  }
  if (kind === 'empty-output') {
    return `<${ROY_STALL_NUDGE_TAG}>（系统提示）你上一轮返回了空内容：没有任何正文、思考或工具调用，用户什么也没收到。请直接继续当前任务：需要执行就调用工具，已经能回答就给出简短结论。不要只输出空白。</${ROY_STALL_NUDGE_TAG}>`
  }
  const why = kind === 'leaked-tool-markup'
    ? '你把工具调用写成了正文文字，系统不会执行正文里的命令。'
    : kind === 'echoed-thinking'
      ? '你上一条只输出了思考过程，没有给出答复，也没有调用工具。'
      : '你说了要去做下一步，但没有调用任何工具，任务没有往下走。'
  return `<${ROY_STALL_NUDGE_TAG}>（系统提示）${why}仅在当前确实提供工具且任务需要时，使用正式工具调用接口执行尚未执行的下一步。不得把正文协议当作已执行记录，不得重复已经成功的操作；如果没有可用工具、预算已到或任务已经完成，直接用中文说明结果或阻塞。不要再输出 DSML 标签，不要重复之前的思考。</${ROY_STALL_NUDGE_TAG}>`
}

export function convertPiMessage(
  message: AgentMessage,
  sessionId: string,
  channelModelId?: string,
  options: { uuid?: string; notice?: string } = {},
): SDKMessage | null {
  if (!message || typeof message !== 'object' || !('role' in message)) return null

  if (message.role === 'user') {
    const user = message as UserMessage
    const userText = contentToText(user.content)
    if (isInternalStallNudge(userText)) return null
    return {
      type: 'user',
      message: {
        content: [{ type: 'text', text: contentToText(user.content) }],
      },
      parent_tool_use_id: null,
      session_id: sessionId,
      uuid: options.uuid ?? randomUUID(),
    } as unknown as SDKMessage
  }

  if (message.role === 'assistant') {
    const assistant = message as AssistantMessage
    // 只有 stopReason === 'error' 才把 errorMessage 提升为终态 error 字段；
    // 其它终态即使带 errorMessage 也只记录日志，避免误报失败。
    const isTerminalError = assistant.stopReason === 'error'
    const errorType = assistant.errorMessage && isMalformedResponseError(assistant.errorMessage)
      ? 'service_error'
      : assistant.errorMessage && isTransientNetworkError(assistant.errorMessage)
        ? 'network_error'
        : 'provider_error'
    if (assistant.errorMessage && !isTerminalError) {
      console.warn(
        `[pi-adapter] 忽略非终态 errorMessage（stopReason=${assistant.stopReason}）: ${assistant.errorMessage}`,
      )
    }
    const thinkingText = assistant.content.filter((b) => b.type === 'thinking').map((b) => b.thinking).join('').trim()
    const hasToolCall = assistant.content.some((b) => b.type === 'toolCall')
    const visibleBlocks = assistant.content.filter((block) => !(
      block.type === 'text' && !hasToolCall && thinkingText.length > 0 && block.text.trim() === thinkingText
    ))
    return {
      type: 'assistant',
      message: {
        content: [...(options.notice ? [{ type: 'text', text: options.notice + '\n\n' }] : []), ...visibleBlocks.flatMap((block) => {
          if (block.type === 'text') return splitInlineThinking(visibleProtocolText(block.text))
          if (block.type === 'thinking') return { type: 'thinking', thinking: block.thinking }
          if (block.type === 'toolCall') {
            return {
              type: 'tool_use',
              id: block.id,
              name: displayToolName(block.name, block.arguments as Record<string, unknown>),
              input: normalizeToolUseInput(block.name, block.arguments as Record<string, unknown>),
            }
          }
          return block as unknown as Record<string, unknown>
        })],
        usage: usageFromAssistant(assistant),
        model: assistant.model,
        stop_reason: assistant.stopReason,
      },
      parent_tool_use_id: null,
      session_id: sessionId,
      uuid: options.uuid ?? randomUUID(),
      ...(assistant.errorMessage && isTerminalError && {
        error: { message: assistant.errorMessage, errorType },
      }),
      ...(channelModelId && { _channelModelId: channelModelId }),
    } as unknown as SDKMessage
  }

  if (message.role === 'toolResult') {
    const toolResult = message as ToolResultMessage
    return {
      type: 'user',
      message: {
        content: [{
          type: 'tool_result',
          tool_use_id: toolResult.toolCallId,
          content: normalizeToolResultContent(toolResult.content),
          is_error: toolResult.isError,
        }],
      },
      tool_use_result: toolResult.details,
      parent_tool_use_id: null,
      session_id: sessionId,
      uuid: randomUUID(),
    } as unknown as SDKMessage
  }

  return null
}

export function hasToolResult(message: SDKMessage): boolean {
  if (message.type !== 'user') return false
  const content = (message as { message?: { content?: Array<{ type?: string }> } }).message?.content
  return Array.isArray(content) && content.some((block) => block.type === 'tool_result')
}

/**
 * 当前上下文占用：取这一轮最后一次真正带用量的模型调用。
 * result.usage 是整轮所有调用的累加值（调用 10 次就是 10 倍），只能算费用和今日用量，
 * 不能当成「现在上下文有多大」，否则 1M 窗口会显示成 2.3M / 234%。
 */
export function lastCallContextUsage(assistants: AssistantMessage[]): {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
} | undefined {
  for (let i = assistants.length - 1; i >= 0; i--) {
    const u = assistants[i]?.usage
    if (!u) continue
    const context = (u.input ?? 0) + (u.cacheRead ?? 0) + (u.cacheWrite ?? 0)
    if (context <= 0) continue
    return {
      input_tokens: u.input ?? 0,
      output_tokens: u.output ?? 0,
      cache_read_input_tokens: u.cacheRead ?? 0,
      cache_creation_input_tokens: u.cacheWrite ?? 0,
    }
  }
  return undefined
}

export function convertResultMessage(
  messages: AgentMessage[],
  sessionId: string,
  override?: RuntimeGuardResultOverride,
): SDKMessage {
  const assistants = messages.filter((m): m is AssistantMessage =>
    !!m && typeof m === 'object' && 'role' in m && m.role === 'assistant')
  const costValues = assistants
    .map((msg) => msg.usage?.cost?.total)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  const usage = assistants.reduce(
    (acc, msg) => ({
      input_tokens: acc.input_tokens + (msg.usage?.input ?? 0),
      output_tokens: acc.output_tokens + (msg.usage?.output ?? 0),
      cache_read_input_tokens: acc.cache_read_input_tokens + (msg.usage?.cacheRead ?? 0),
      cache_creation_input_tokens: acc.cache_creation_input_tokens + (msg.usage?.cacheWrite ?? 0),
    }),
    { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  )
  const contextUsage = lastCallContextUsage(assistants)
  const lastAssistant = assistants[assistants.length - 1]
  // 不执行正文中泄漏的工具协议，也不把重复的思考内容视为任务成功。
  // 只检测已确认的重复模式，避免把正常解释 DSML 的回答误判为异常。
  const finalText = lastAssistant?.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim() ?? ''
  const finalThinking = lastAssistant?.content.filter((b) => b.type === 'thinking').map((b) => b.thinking).join('').trim() ?? ''
  const hasStructuredTool = lastAssistant?.content.some((b) => b.type === 'toolCall') ?? false
  const duplicatedThinking = lastAssistant?.stopReason === 'stop'
    && !hasStructuredTool && finalThinking.length > 0 && finalText === finalThinking
  const leakedMarkup = !!lastAssistant && ['stop', 'length', 'toolUse'].includes(lastAssistant.stopReason) && !hasStructuredTool && hasLeakedToolMarkup(finalText)
  const stalledKind = detectStalledTurn(lastAssistant)
  const unresolvedPromise = stalledKind === 'promise-only'
  const protocolError = duplicatedThinking || leakedMarkup || unresolvedPromise
    ? '模型未正常完成本轮，或返回了未解析的工具调用文本；该文本没有被执行。自动纠正未成功或本阶段不能继续，已停止自动重试。已完成操作保留，请核对未完成项后再继续。'
    : undefined
  // 空 end_turn 不能报成功：否则界面停在上一轮，用户只看到「自己断了」而没有任何提示。
  const emptyOutputError = stalledKind === 'empty-output'
    ? '模型本轮返回了空内容（正常结束但没有任何正文、思考或工具调用），任务没有往下走。可直接重试或切换模型。'
    : undefined
  const aborted = lastAssistant?.stopReason === 'aborted'
  const assistantError = lastAssistant?.stopReason === 'error' ? (lastAssistant.errorMessage || '模型请求失败，未返回错误详情') : aborted ? '请求已取消，未自动重新执行任务' : (protocolError ?? emptyOutputError)
  const terminalReason = override?.terminalReason ?? (aborted ? 'aborted' : assistantError ? 'error' : lastAssistant?.stopReason === 'length' ? 'max_tokens' : 'completed')
  return {
    type: 'result',
    subtype: override?.subtype ?? (assistantError ? 'error_during_execution' : terminalReason === 'max_tokens' ? 'max_tokens' : 'success'),
    usage,
    ...(contextUsage ? { context_usage: contextUsage } : {}),
    total_cost_usd: costValues.length > 0 ? costValues.reduce((sum, cost) => sum + cost, 0) : undefined,
    terminal_reason: terminalReason,
    errors: override?.errors ?? (assistantError ? [assistantError] : undefined),
    session_id: sessionId,
  } as unknown as SDKMessage
}
