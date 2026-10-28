/**
 * 添加配置时的供应商预设分组
 *
 * 与 Arthur 的「添加供应商」菜单对齐：按供应商家族分组，点一下就带着默认地址
 * 和协议进入表单，不用先在下拉框里翻 20 多个选项。
 */

import type { ProviderType } from '@roy/shared'

export interface ProviderPreset {
  provider: ProviderType
  /** 分组名 */
  group: string
  /** 卡片上的补充说明，可选 */
  hint?: string
}

/** 分组顺序即菜单顺序。 */
export const PROVIDER_PRESET_GROUPS = [
  '订阅登录',
  '国际直连',
  '国内厂商',
  '自定义',
] as const

export const PROVIDER_PRESETS: ProviderPreset[] = [
  // 订阅登录：走 OAuth，不需要 API Key
  { provider: 'openai-codex', group: '订阅登录', hint: 'ChatGPT 订阅' },
  { provider: 'github-copilot', group: '订阅登录', hint: 'Copilot 订阅' },
  { provider: 'xai', group: '订阅登录', hint: 'Grok 订阅' },

  // 国际直连：需要 API Key，可能要走代理
  { provider: 'anthropic', group: '国际直连' },
  { provider: 'openai', group: '国际直连' },
  { provider: 'openai-responses', group: '国际直连', hint: 'Responses 协议' },
  { provider: 'google', group: '国际直连' },

  // 国内厂商：多数不需要代理
  { provider: 'deepseek', group: '国内厂商' },
  { provider: 'kimi-api', group: '国内厂商' },
  { provider: 'kimi-coding', group: '国内厂商', hint: 'Coding Plan' },
  { provider: 'zhipu', group: '国内厂商' },
  { provider: 'zhipu-coding', group: '国内厂商', hint: 'Coding Plan' },
  { provider: 'zhipu-coding-team', group: '国内厂商', hint: '团队版' },
  { provider: 'doubao', group: '国内厂商', hint: 'Coding Plan' },
  { provider: 'doubao-api', group: '国内厂商' },
  { provider: 'ark-coding-plan', group: '国内厂商', hint: 'Agent Plan' },
  { provider: 'qwen', group: '国内厂商' },
  { provider: 'qwen-token-plan', group: '国内厂商', hint: 'Token Plan' },
  { provider: 'minimax', group: '国内厂商' },
  { provider: 'xiaomi', group: '国内厂商' },
  { provider: 'xiaomi-token-plan', group: '国内厂商', hint: 'Token Plan' },

  // 自定义：任意兼容端点
  { provider: 'anthropic-compatible', group: '自定义', hint: 'Anthropic 协议' },
  { provider: 'opencode-go-openai', group: '自定义', hint: 'OpenAI 协议' },
  { provider: 'custom', group: '自定义', hint: 'OpenAI Chat Completions' },
]
