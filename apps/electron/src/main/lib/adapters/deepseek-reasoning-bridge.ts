/**
 * DeepSeek 优化模式扩展：推理回传链路。
 *
 * 两件事，必须一起做才成立：
 *
 * 1. **补签名**（`context` 钩子）：Roy 落库的 thinking 块不带 `thinkingSignature`，
 *    Pi 的 openai-completions 转换只有在签名为 reasoning 字段名时才会把思考写进
 *    `reasoning_content`；缺签名时 `requiresReasoningContentOnAssistantMessages`
 *    只补一个空字符串。补上签名后历史推理才会真正回传，配合第 2 步不会把输入撑爆。
 *
 * 2. **尾截断**（`before_provider_request` 钩子）：回传时只保留每条推理的尾部，
 *    截断长度按会话冻结，历史字节不随轮次漂移。
 *
 * 关闭其一都会退化成坏结果：只补签名不截断 → 输入 token 线性膨胀；只截断不补签名
 * → 没有内容可截，等于什么都没做。
 */
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import {
  collectAnchorsFromPayload,
  compactRequestReasoning,
  DEFAULT_TRUNCATE_CHARS,
  pinExcludedPaths,
  type PinnedExcludedPaths,
  type ReasoningCompactionSettings,
} from './deepseek-reasoning-compaction'

/** Pi 的 agent 消息结构（只取本扩展关心的部分）。 */
interface AgentMessageLike {
  role?: unknown
  content?: unknown
}

interface ContentBlockLike {
  type?: unknown
  thinking?: unknown
  thinkingSignature?: unknown
}

/**
 * 给缺少签名的 thinking 块补上 DeepSeek 的 reasoning 字段名。
 *
 * Pi 的转换逻辑（openai-completions）用 `thinkingSignature` 决定思考写进哪个字段：
 * 只有签名落在 `reasoning_content` / `reasoning` / `reasoning_text` 三者之一时才会写入。
 * Roy 写入会话时丢掉了这个字段，这里按 provider 语义补回——不对其他 provider 生效，
 * 因为 Anthropic / Gemini 的签名是真实的不透明令牌，伪造会导致请求被拒。
 */
export function restoreThinkingSignatures<T extends AgentMessageLike>(
  messages: readonly T[],
  signature: string = 'reasoning_content',
): { messages: T[]; changed: boolean } {
  let changed = false
  const next = messages.map((message) => {
    if (!message || message.role !== 'assistant' || !Array.isArray(message.content)) return message
    let messageChanged = false
    const content = (message.content as ContentBlockLike[]).map((block) => {
      if (!block || block.type !== 'thinking') return block
      const existing = block.thinkingSignature
      // 已有非空签名就尊重原值：那是模型真实返回的，不是我们该改的
      if (typeof existing === 'string' && existing.trim().length > 0) return block
      // 空思考块补签名没有意义，反而会让 Pi 写出一条空的 reasoning_content
      if (typeof block.thinking !== 'string' || block.thinking.trim().length === 0) return block
      messageChanged = true
      return { ...block, thinkingSignature: signature }
    })
    if (!messageChanged) return message
    changed = true
    return { ...message, content }
  })
  return { messages: next, changed }
}

export interface DeepSeekReasoningBridgeSettings extends ReasoningCompactionSettings {
  /**
   * 是否把历史推理回传给模型。
   *
   * **默认关闭**。开启后 Pi 会真的把每条历史 assistant 的 reasoning 写进请求，
   * 而 Roy 在此之前一直是 0（thinking 块无签名 → Pi 只补空字符串）。实测 115 轮会话
   * 全量回传会在末轮多出约 47k tokens 输入，即使截到 N=400 仍多约 96k（跨会话累计），
   * 是净增成本而不是节省。
   *
   * 它能买到的是跨轮推理连贯性（模型知道自己已经排除过哪些路径），值不值这个价由
   * 用户按任务定。开启时截断必定同时生效，作为成本护栏。
   */
  restoreSignatures?: boolean
  /**
   * 补偿块定稿表。扩展每个用户回合都会重建，定稿表必须由调用方按会话持有并传入，
   * 否则新回合会丢掉上一回合 user 消息上的补偿块，前缀在那里断开。
   */
  pinnedExcludedPaths?: PinnedExcludedPaths
  // injectAnchors 已上移到 ReasoningCompactionSettings（诊断模块也要读它），
  // 这里不再重复声明，避免两处类型各自漂移。
}

/** DeepSeek 优化模式的请求链路扩展。 */
export function createDeepSeekReasoningBridgeExtension(
  settings: DeepSeekReasoningBridgeSettings = {},
): (pi: ExtensionAPI) => void {
  const truncateChars = settings.truncateChars ?? DEFAULT_TRUNCATE_CHARS
  const injectAnchors = settings.injectAnchors !== false

  return (pi) => {
    // 每条 user 消息的补偿块只定一次，之后原样补回，见 pinExcludedPaths
    const pinned: PinnedExcludedPaths = settings.pinnedExcludedPaths ?? new Map()
    // 默认不补签名：补了就等于开启历史推理回传，那是净增输入成本。
    // 只有用户显式开启时才接管 context。
    if (settings.restoreSignatures === true) {
      pi.on('context', (event) => {
        const { messages, changed } = restoreThinkingSignatures(event.messages)
        return changed ? { messages } : undefined
      })
    }

    pi.on('before_provider_request', (event) => {
      // 顺序不能反：必须先按完整推理提取锚点，再做截断。
      // 反过来就只能从被截剩的尾部提取，前段的排除结论已经丢了。
      const anchors = injectAnchors
        ? collectAnchorsFromPayload(event.payload, truncateChars)
        : []
      const compacted = compactRequestReasoning(event.payload, {
        enabled: settings.enabled,
        truncateChars,
      })
      const injected = injectAnchors ? pinExcludedPaths(compacted, anchors, pinned) : compacted
      return injected === event.payload ? undefined : injected
    })
  }
}
