/**
 * Roy 内置模型渠道（「Roy 官方」，一个渠道里放全部模型，参照 Proma Cloud）
 *
 * 请求发到 Roy 服务器（120.26.161.126），用登录令牌鉴权；服务器按模型选上游 key、校验余额、按用量扣点数。
 * 客户端不含任何上游 key 和计费逻辑。
 * 模型清单需与服务器 llm-proxy.mjs 的 GROUPS 保持一致（服务器只放行那里列出的模型）。
 */

import type { ChannelModel } from '@roy/shared'
import { ROY_SERVER_HOST } from './roy-server-cert'

/** custom 渠道的 baseUrl 是完整请求地址（见 migrateCompatibleChannelBaseUrl） */
export const BUILTIN_CHANNEL_ENDPOINT = `https://${ROY_SERVER_HOST}:8443/v1/llm/chat/completions`

export const BUILTIN_CHANNEL_ID_PREFIX = 'builtin-'
export const BUILTIN_CHANNEL_ID = 'builtin-roy'
/** 没设视觉助手时，当前模型看不了图就交给它看（能看图、单价低） */
export const BUILTIN_VISION_MODEL_ID = 'gemini-3.8-flash'

export interface BuiltinChannelPreset {
  id: string
  name: string
  models: ChannelModel[]
}

/** vision 不填时按模型名自动判断；自动判断认不出的（如 GPT-6 系列）在这里写明 */
const m = (id: string, name: string, contextWindow: number, vision?: boolean): ChannelModel => ({
  id, name, enabled: true, source: 'manual', contextWindow, ...(vision === undefined ? {} : { vision }),
})

export const BUILTIN_CHANNELS: BuiltinChannelPreset[] = [
  {
    id: BUILTIN_CHANNEL_ID,
    name: 'Roy 官方',
    models: [
      // 国产
      m('deepseek-v4.1-flash', 'DeepSeek V4.1 Flash', 1_000_000),
      m('deepseek-v4-pro', 'DeepSeek V4 Pro', 1_000_000),
      m('glm-5.3', 'GLM-5.3', 1_000_000),
      m('glm-5.2', 'GLM-5.2', 1_000_000),
      m('kimi-k3', 'Kimi K3', 262_144),
      m('kimi-k3.1-pro', 'Kimi K3.1 Pro', 262_144),
      // OpenAI
      m('gpt-6.1-sol', 'GPT-6.1 Sol', 372_000, true),
      m('gpt-6-sol', 'GPT-6 Sol', 372_000, true),
      m('gpt-6-astra', 'GPT-6 Astra', 372_000, true),
      m('gpt-5.6-sol', 'GPT-5.6 Sol', 372_000),
      m('gpt-5.6-terra', 'GPT-5.6 Terra', 372_000),
      // Anthropic
      m('claude-opus-5-5', 'Claude Opus 5.5', 200_000),
      m('claude-sonnet-5-5', 'Claude Sonnet 5.5', 200_000),
      m('claude-opus-5', 'Claude Opus 5', 200_000),
      m('claude-sonnet-5', 'Claude Sonnet 5', 200_000),
      m('claude-opus-4-8', 'Claude Opus 4.8', 200_000),
      m('claude-sonnet-4-6', 'Claude Sonnet 4.6', 200_000),
      m('claude-haiku-4-5', 'Claude Haiku 4.5', 200_000),
      // xAI
      m('grok-4.7', 'Grok 4.7', 500_000),
      m('grok-4.6', 'Grok 4.6', 500_000),
      m('grok-4.5', 'Grok 4.5', 500_000),
      // Google
      m('gemini-3.8-flash', 'Gemini 3.8 Flash', 1_000_000),
      m('gemini-3.7-flash', 'Gemini 3.7 Flash', 1_000_000),
      m('gemini-3.5-flash', 'Gemini 3.5 Flash', 1_000_000),
      m('gemini-3.1-pro-preview', 'Gemini 3.1 Pro Preview', 1_000_000),
    ],
  },
]

export function isBuiltinChannelId(channelId: string | undefined): boolean {
  return Boolean(channelId?.startsWith(BUILTIN_CHANNEL_ID_PREFIX))
}
