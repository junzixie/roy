import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import {
  normalizeReasoningLevel,
  resolveReasoningProfile,
  type AgentThinkingLevel,
  type ReasoningProfile,
} from '@roy/shared'

type ProviderPayload = Record<string, unknown>

export interface DeepSeekReasoningRequestSettings {
  profile?: ReasoningProfile
  thinkingLevel?: AgentThinkingLevel
  /** 每次请求读取，避免扩展闭包锁住启动时的档位。 */
  getThinkingLevel?: () => AgentThinkingLevel | undefined
  /** DeepSeek 优化模式：简单回合自动降一档思考强度（只降不升，用户选的最高档不动） */
  autoDowngrade?: boolean
}

/**
 * 简单回合降一档。
 *
 * DeepSeek V4 的档位只有 off / low / high / xhigh / max，没有 medium；`medium` 会被
 * normalizeDeepSeekV4Level 折回 high，所以不能拿它当中转档——否则 high→medium 注入后
 * 仍是 effort=high，等于没降。这里直接落到实际存在的档位。
 * xhigh / max 是用户明确要的最强档，不动。
 */
const DOWNGRADE: Partial<Record<AgentThinkingLevel, AgentThinkingLevel>> = { high: 'low', medium: 'low' }
const SIMPLE_TURN_MAX_CHARS = 40
/** 需要认真推理的词：出现就不降档 */
const COMPLEX_HINT = /(为什么|原因|分析|设计|架构|方案|重构|排查|调试|debug|bug|报错|错误|优化|性能|证明|推导|算法|比较|评估|review|审查|计划|规划)/i

/**
 * 本次请求是不是「简单回合」：最后一条是用户自己打的短文字（不是工具结果），
 * 且不含需要深入推理的词。工具循环中途的请求一律不降档，保证干活质量。
 */
export function isSimpleUserTurn(payload: unknown): boolean {
  if (!isProviderPayload(payload) || !Array.isArray(payload.messages)) return false
  const last = payload.messages[payload.messages.length - 1] as { role?: unknown; content?: unknown } | undefined
  if (!last || last.role !== 'user') return false
  let text = ''
  if (typeof last.content === 'string') text = last.content
  else if (Array.isArray(last.content)) {
    for (const block of last.content as Array<{ type?: unknown; text?: unknown }>) {
      if (block?.type === 'tool_result') return false
      if (block?.type === 'text' && typeof block.text === 'string') text = block.text
    }
  }
  // 每条消息前面会带实时环境信息，只看最后一段用户真正打的字
  const userText = text.split(/\n{2,}/).pop()?.trim() ?? ''
  return userText.length > 0 && userText.length <= SIMPLE_TURN_MAX_CHARS && !COMPLEX_HINT.test(userText)
}

/** 简单回合降一档；off / minimal / low / xhigh / max 保持不变 */
export function downgradeForSimpleTurn(level: AgentThinkingLevel | undefined, payload: unknown): AgentThinkingLevel | undefined {
  if (!level || !isSimpleUserTurn(payload)) return level
  return DOWNGRADE[level] ?? level
}

function isProviderPayload(payload: unknown): payload is ProviderPayload {
  return typeof payload === 'object' && payload !== null && !Array.isArray(payload)
}

/**
 * Rewrites Pi's generic Anthropic extended-thinking body to DeepSeek V4's
 * Anthropic-compatible protocol. DeepSeek ignores `thinking.budget_tokens`;
 * strength must be carried by `output_config.effort`.
 */
export function injectDeepSeekReasoningLevel(
  payload: unknown,
  settings: DeepSeekReasoningRequestSettings,
): unknown {
  if (!isProviderPayload(payload)) return payload

  const modelId = typeof payload.model === 'string' ? payload.model : undefined
  const profile = settings.profile ?? resolveReasoningProfile({
    modelId,
    transport: 'anthropic-messages',
  })
  const encoding = profile?.encodings['anthropic-messages']
  if (encoding?.kind !== 'deepseek-output-effort' || !settings.thinkingLevel) return payload

  const normalizedLevel = normalizeReasoningLevel(profile, settings.thinkingLevel)
  if (!normalizedLevel) return payload

  const { thinking: _upstreamThinking, output_config: _upstreamOutputConfig, ...body } = payload
  if (normalizedLevel === 'off') {
    return { ...body, thinking: { type: 'disabled' } }
  }

  const effort = encoding.effortMap[normalizedLevel]
  if (typeof effort !== 'string') return payload
  return {
    ...body,
    thinking: { type: 'enabled' },
    output_config: { effort },
  }
}

/** Pi inline extension for DeepSeek V4 Anthropic-compatible reasoning requests. */
export function createDeepSeekReasoningRequestExtension(
  settings: DeepSeekReasoningRequestSettings,
): (pi: ExtensionAPI) => void {
  return (pi) => {
    pi.on('before_provider_request', (event) => {
      const level = settings.getThinkingLevel?.() ?? settings.thinkingLevel
      const updatedPayload = injectDeepSeekReasoningLevel(event.payload, {
        ...settings,
        thinkingLevel: settings.autoDowngrade ? downgradeForSimpleTurn(level, event.payload) : level,
      })
      return updatedPayload === event.payload ? undefined : updatedPayload
    })
  }
}
