/**
 * 渠道请求协议推导
 *
 * Arthur 的模型配置把「供应商」和「请求协议」拆成两件事：同一个 baseURL 可能
 * 同时支持 /chat/completions、/responses、/v1/messages。Roy 原来只有 provider，
 * 协议由 provider 隐含决定；这里补一个显式的 api 字段，并给存量渠道一个
 * 稳定的推导规则，保证升级后原有配置照常工作。
 */

import type { ChannelApi, ProviderType } from '../types/channel'

/** 走 Anthropic Messages 协议的供应商。 */
const ANTHROPIC_MESSAGES_PROVIDERS: ReadonlySet<ProviderType> = new Set<ProviderType>([
  'anthropic',
  'anthropic-compatible',
  'deepseek',
  'kimi-api',
  'kimi-coding',
  'zhipu-coding',
  'zhipu-coding-team',
  'ark-coding-plan',
  'minimax',
  'xiaomi',
  'xiaomi-token-plan',
  'qwen-anthropic',
  'qwen-token-plan',
])

/** 走 OpenAI Responses 协议的供应商。 */
const RESPONSES_PROVIDERS: ReadonlySet<ProviderType> = new Set<ProviderType>([
  'openai-responses',
  'openai-codex',
])

/**
 * 按 provider 推导协议。
 *
 * 只用于「没有显式 api 的存量渠道」，新建渠道由用户在表单里选或自动检测。
 */
export function inferChannelApi(provider: ProviderType): ChannelApi {
  if (RESPONSES_PROVIDERS.has(provider)) return 'responses'
  if (ANTHROPIC_MESSAGES_PROVIDERS.has(provider)) return 'anthropic-messages'
  return 'chat-completions'
}

/** 解析渠道实际使用的协议：显式 api 优先，否则按 provider 推导。 */
export function resolveChannelApi(channel: {
  provider: ProviderType
  api?: ChannelApi
}): ChannelApi {
  return channel.api ?? inferChannelApi(channel.provider)
}

/** 各协议打到 baseURL 后面的路径，用于表单里的「请求打到哪个路径」和实际请求预览。 */
export const CHANNEL_API_PATHS: Record<ChannelApi, string> = {
  'chat-completions': '/chat/completions',
  responses: '/responses',
  'anthropic-messages': '/v1/messages',
}

/** 表单里展示的协议名（与 Arthur 的措辞一致）。 */
export const CHANNEL_API_LABELS: Record<ChannelApi, string> = {
  'chat-completions': 'Chat Completions',
  responses: 'Responses',
  'anthropic-messages': 'Anthropic Messages',
}

/** 选择协议时的说明，和 Arthur 的提示保持一致。 */
export const CHANNEL_API_HINTS: Record<ChannelApi, string> = {
  'chat-completions': '最通用：国内模型、DeepSeek、大多数中转站都用它。拿不准就选这个。',
  responses: 'OpenAI 新一代接口，只有明确支持 /responses 的服务才可用。',
  'anthropic-messages': 'Claude 系列和部分中转站的 Anthropic 兼容端点走这个。',
}

/** 拼出实际请求地址，给表单做预览。 */
export function buildChannelPreviewUrl(baseUrl: string, api: ChannelApi): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '')
  if (!trimmed) return ''
  const path = CHANNEL_API_PATHS[api]
  // Anthropic 的路径自带 /v1，避免拼成 /v1/v1/messages
  if (api === 'anthropic-messages' && /\/v1$/.test(trimmed)) {
    return `${trimmed}/messages`
  }
  return `${trimmed}${path}`
}

/** Claude 自家协议：新建时仍默认 Anthropic Messages */
const CLAUDE_PROVIDERS: ReadonlySet<ProviderType> = new Set<ProviderType>(['anthropic', 'anthropic-compatible'])

/**
 * 原默认地址是 Anthropic 兼容端点、但官方也提供 Chat Completions 的供应商：
 * 新建时改用 Chat Completions，并换成对应的地址。
 * 编程套餐 / Token Plan 里官方只确认了 Anthropic 端点的，不在这里，保持原样。
 */
const CHAT_COMPLETIONS_URLS: Partial<Record<ProviderType, string>> = {
  deepseek: 'https://api.deepseek.com/v1',
  'kimi-api': 'https://api.moonshot.cn/v1',
  'zhipu-coding': 'https://open.bigmodel.cn/api/coding/paas/v4',
  'zhipu-coding-team': 'https://open.bigmodel.cn/api/coding/paas/v4',
  'ark-coding-plan': 'https://ark.cn-beijing.volces.com/api/coding/v3',
  minimax: 'https://api.minimaxi.com/v1',
  'qwen-anthropic': 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  xiaomi: 'https://api.xiaomimimo.com/v1',
}

/**
 * 新建渠道 / 切换供应商时的默认协议与地址。
 * 规则：除 Claude 外默认 Chat Completions（和 FeiBo、各家官方原生格式一致）；
 * 只改「新建时的默认值」，存量渠道仍按 resolveChannelApi，不会被悄悄改掉。
 */
export function defaultNewChannelSetup(provider: ProviderType, fallbackUrl: string): { api: ChannelApi; baseUrl: string } {
  if (CLAUDE_PROVIDERS.has(provider)) return { api: 'anthropic-messages', baseUrl: fallbackUrl }
  if (RESPONSES_PROVIDERS.has(provider)) return { api: 'responses', baseUrl: fallbackUrl }
  if (!ANTHROPIC_MESSAGES_PROVIDERS.has(provider)) return { api: 'chat-completions', baseUrl: fallbackUrl }
  const chatUrl = CHAT_COMPLETIONS_URLS[provider]
  return chatUrl ? { api: 'chat-completions', baseUrl: chatUrl } : { api: 'anthropic-messages', baseUrl: fallbackUrl }
}
