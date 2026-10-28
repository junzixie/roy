/** 标题生成 Prompt */
export const TITLE_PROMPT = '根据用户的第一条消息，生成一个简短的对话标题（10字以内）。只输出标题，不要有任何其他内容、标点符号或引号。如果消息内容过短或无明确主题，直接使用原始消息作为标题。\n\n用户消息：'

/** 短消息阈值：低于此长度直接使用原文作为标题 */
export const SHORT_MESSAGE_THRESHOLD = 4

/** 最大标题长度 */
export const MAX_TITLE_LENGTH = 20

/**
 * 标题不能比这更长。
 * 输出预算不足时模型会把 prompt 原样回显或先长篇解释，再被截断成 20 字当成标题
 * （实际记录：「我们需要回答用户。任务：根据用户第一条消」）。这类结果宁可用首行兜底。
 */
const MAX_PLAUSIBLE_TITLE_LENGTH = 24

/** 回显 prompt 的特征词：命中就说明模型在复述要求，不是在给标题。 */
const ECHOED_TITLE_PROMPT = /(?:对话标题|用户的第一条消息|用户第一条消息|只输出标题|生成一个简短的?对话?标题|根据用户|respond with only|generate a (?:short )?title|conversation title)/i

const TITLE_PUNCTUATION = /^["'“”‘’「《]+|["'“”‘’」》]+$/g
const MARKDOWN_PREFIX = /^(?:[#>*\-\d.)]\s*)+/
const WHITESPACE = /\s+/g

/**
 * 从模型返回的原始标题内容中提取文本。
 *
 * OpenAI 兼容端点（如 OpenCode Go）对推理模型可能把 `message.content` 返回为
 * 字符串、内容块数组（`[{ type: 'text', text: '...' }]`）或空值。逐个归一为
 * 纯文本，避免 `.trim()` 在非字符串上抛异常，导致整个标题生成在 catch 里静默丢弃。
 */
function extractTitleText(title: unknown): string {
  if (typeof title === 'string') return title
  if (Array.isArray(title)) {
    return title
      .map((block) => {
        if (block && typeof block === 'object' && typeof (block as { text?: unknown }).text === 'string') {
          return (block as { text: string }).text
        }
        return ''
      })
      .join('')
      .trim()
  }
  if (title && typeof title === 'object' && typeof (title as { text?: unknown }).text === 'string') {
    return (title as { text: string }).text
  }
  return ''
}

/** 清理模型返回的标题。兼容字符串与内容块数组，非文本内容返回 null。 */
export function sanitizeGeneratedTitle(title: string | unknown): string | null {
  const text = extractTitleText(title)
  const cleaned = text.trim().replace(TITLE_PUNCTUATION, '').trim()
  if (!cleaned) return null
  // 标题必须是单行短文本；换行、过长、复述 prompt 都说明模型没按要求回答。
  if (/[\r\n]/.test(cleaned)) return null
  if (cleaned.length > MAX_PLAUSIBLE_TITLE_LENGTH) return null
  if (ECHOED_TITLE_PROMPT.test(cleaned)) return null
  return cleaned.slice(0, MAX_TITLE_LENGTH) || null
}

/**
 * 无法调用标题模型时，基于首条用户消息生成一个稳定兜底标题。
 *
 * ChatGPT (Codex) OAuth 使用 Pi SDK 的 Codex Responses 协议，不适配当前
 * @roy/core 的 Chat Completions / Messages 标题请求，因此需要本地兜底，
 * 避免会话长期停留在“新 Agent 会话”。
 */
export function createFallbackTitle(userMessage: string): string | null {
  const firstLine = userMessage
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)
    ?? userMessage.trim()

  const cleaned = firstLine
    .replace(MARKDOWN_PREFIX, '')
    .replace(WHITESPACE, ' ')
    .trim()

  return cleaned.slice(0, MAX_TITLE_LENGTH) || null
}
