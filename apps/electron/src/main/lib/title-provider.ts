/**
 * 起标题这类杂活用哪个协议：跟渠道显式选的协议走，和真实对话保持一致。
 * 例：DeepSeek 渠道接的是中转站、协议选了 chat-completions，起标题不能再按 DeepSeek 默认走 /v1/messages，
 * 否则中转站分组不允许时会 403（对话正常、标题一直失败）。
 */
import type { ProviderType } from '@roy/shared'

export function titleProviderFor(provider: ProviderType, api?: string): ProviderType {
  if (api === 'chat-completions') return 'openai'
  if (api === 'responses') return 'openai-responses'
  return provider
}
