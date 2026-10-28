/**
 * 追问建议：AI 在回复最后一行写 <!--suggest:建议1|建议2|建议3-->，
 * 显示时藏起来，回复生成完后在最新一条回复下面做成按钮。
 */

const COMPLETE = /<!--\s*suggest:([\s\S]*?)-->/gi
/** 流式输出时还没写完的半截标记（从 <!-- 开始到结尾），先藏起来，避免闪出半截 */
const PARTIAL = /<!--(?:\s*s(?:u(?:g(?:g(?:e(?:s(?:t(?::[^>]*)?)?)?)?)?)?)?)?\s*-?-?$/i

/** 去掉建议标记（完整的和流式中的半截） */
export function stripFollowUpSuggestions(text: string): string {
  if (!text.includes('<!')) return text
  return text.replace(COMPLETE, '').replace(PARTIAL, '').replace(/\s+$/, '')
}

/** 解析最后一个建议标记，最多 3 条，每条不超过 30 个字符 */
export function parseFollowUpSuggestions(text: string): string[] {
  let last: string | undefined
  for (const m of text.matchAll(COMPLETE)) last = m[1]
  if (!last) return []
  const items = last.split('|').map((s) => s.trim()).filter((s) => s.length > 0 && s.length <= 30)
  return [...new Set(items)].slice(0, 3)
}
