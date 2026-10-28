/**
 * DeepSeek 在 OpenAI 兼容协议下的请求微调。
 *
 * effort 本身由 Pi 的 thinkingLevelMap 负责写入（`reasoning_effort` /
 * `reasoning.effort`），这里只做优化模式特有的一件事：**简单回合自动降一档**。
 * 复用 Anthropic 路径已经验证过的降档判定，避免两套渠道对「什么算简单回合」给出
 * 不同答案。
 */
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import {
  normalizeReasoningLevel,
  type AgentThinkingLevel,
  type ReasoningProfile,
  type ReasoningTransport,
} from '@roy/shared'
import { downgradeForSimpleTurn } from './pi-deepseek-reasoning-request-settings'

type ProviderPayload = Record<string, unknown>

export interface DeepSeekOpenAIReasoningSettings {
  profile?: ReasoningProfile
  transport: Extract<ReasoningTransport, 'openai-completions' | 'openai-responses'>
  thinkingLevel?: AgentThinkingLevel
  /** 每次请求读取，避免扩展闭包锁住启动时的档位。 */
  getThinkingLevel?: () => AgentThinkingLevel | undefined
  /** DeepSeek 优化模式：简单回合自动降一档思考强度 */
  autoDowngrade?: boolean
}

function isProviderPayload(payload: unknown): payload is ProviderPayload {
  return typeof payload === 'object' && payload !== null && !Array.isArray(payload)
}

function isRecord(value: unknown): value is ProviderPayload {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 按目标协议写入 effort。
 *
 * 两种协议的字段位置不同：chat-completions 用顶层 `reasoning_effort`（并需要
 * `thinking: { type: enabled }` 显式开启），responses 用嵌套的 `reasoning.effort`。
 * 未降档时返回原引用，让调用方走「无改动」分支，避免制造无意义的 body 变更。
 */
export function injectDeepSeekOpenAIReasoningLevel(
  payload: unknown,
  settings: DeepSeekOpenAIReasoningSettings,
): unknown {
  if (!isProviderPayload(payload) || !settings.profile || !settings.thinkingLevel) return payload

  const normalizedLevel = normalizeReasoningLevel(settings.profile, settings.thinkingLevel)
  if (!normalizedLevel) return payload
  const encoding = settings.profile.encodings[settings.transport]
  if (!encoding) return payload

  const effort = encoding.effortMap[normalizedLevel]
  // off 由 Pi 自行处理（不带 effort 即关闭思考），这里不覆写
  if (typeof effort !== 'string') return payload

  if (settings.transport === 'openai-completions') {
    if (payload.reasoning_effort === effort && isRecord(payload.thinking)) return payload
    return {
      ...payload,
      thinking: { type: 'enabled' },
      reasoning_effort: effort,
    }
  }

  const existingReasoning = isRecord(payload.reasoning) ? payload.reasoning : {}
  if (existingReasoning.effort === effort) return payload
  return { ...payload, reasoning: { ...existingReasoning, effort } }
}

/** Pi inline extension：DeepSeek 在 OpenAI 兼容协议下的自动降档。 */
export function createDeepSeekOpenAIReasoningExtension(
  settings: DeepSeekOpenAIReasoningSettings,
): (pi: ExtensionAPI) => void {
  return (pi) => {
    pi.on('before_provider_request', (event) => {
      if (settings.autoDowngrade !== true) return undefined
      const level = settings.getThinkingLevel?.() ?? settings.thinkingLevel
      const downgraded = downgradeForSimpleTurn(level, event.payload)
      // 没降档就不碰 payload：effort 已由 Pi 的 thinkingLevelMap 写好
      if (downgraded === level) return undefined
      const updated = injectDeepSeekOpenAIReasoningLevel(event.payload, {
        ...settings,
        thinkingLevel: downgraded,
      })
      return updated === event.payload ? undefined : updated
    })
  }
}
