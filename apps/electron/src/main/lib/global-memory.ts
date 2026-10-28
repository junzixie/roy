/**
 * 全局长期记忆（Pro）：跨所有项目记住用户的稳定偏好与个人信息。
 *
 * - 项目记忆在各工作区的 memory/ 下，只在那个项目里生效；这里是 ~/.roy/memory/profile.md，所有会话都能看到
 * - 只记稳定、跨项目有用的东西：称呼、语言和回复风格、常用工具与技术栈、工作习惯、明确说过的「以后都这样」
 * - 不记密码、密钥、身份证号等敏感信息，也不记某个项目特有的事实（那些写项目记忆）
 * - 写入前保留 .bak，超过上限拒绝（让 AI 先精简）
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { getConfigDir } from './config-paths'
import { writeTextFileAtomic } from './safe-file'

export const GLOBAL_MEMORY_MAX_CHARS = 12_000
/** 注入系统提示词的最大长度，避免记忆越写越长拖慢每一轮 */
export const GLOBAL_MEMORY_PROMPT_CHARS = 4_000

const TEMPLATE = '# 全局记忆\n\n<!-- Roy 会在这里记下跨项目都有用的偏好；你也可以直接编辑。 -->\n'

export function globalMemoryDir(): string {
  return join(getConfigDir(), 'memory')
}

export function globalMemoryPath(): string {
  return join(globalMemoryDir(), 'profile.md')
}

export function readGlobalMemory(): { content: string; updatedAt: number | null } {
  const file = globalMemoryPath()
  if (!existsSync(file)) return { content: '', updatedAt: null }
  try {
    return { content: readFileSync(file, 'utf-8'), updatedAt: statSync(file).mtimeMs }
  } catch {
    return { content: '', updatedAt: null }
  }
}

/** 敏感信息粗筛：明显的密钥、密码、证件号不让写进全局记忆 */
export function findSensitive(text: string): string | null {
  if (/sk-[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text)) return '看起来包含 API Key 或私钥'
  if (/(密码|password|passwd|口令)\s*[:：=]\s*\S{4,}/i.test(text)) return '看起来包含密码'
  if (/\b\d{17}[\dXx]\b/.test(text)) return '看起来包含身份证号'
  return null
}

export function writeGlobalMemory(content: string): { chars: number } {
  const text = content.replace(/\r\n/g, '\n').trimEnd() + '\n'
  if (text.length > GLOBAL_MEMORY_MAX_CHARS) throw new Error(`全局记忆最多 ${GLOBAL_MEMORY_MAX_CHARS} 字，现在 ${text.length} 字。请先合并、删掉过时的条目再保存。`)
  const sensitive = findSensitive(text)
  if (sensitive) throw new Error(`没有保存：${sensitive}。全局记忆不记密码、密钥、证件号等敏感信息。`)
  mkdirSync(globalMemoryDir(), { recursive: true })
  const file = globalMemoryPath()
  if (existsSync(file)) { try { copyFileSync(file, `${file}.bak`) } catch { /* 备份失败不阻塞 */ } }
  writeTextFileAtomic(file, text)
  return { chars: text.length }
}

/** 追加一条记忆（带日期），自动建文件 */
export function appendGlobalMemory(entry: string, now = new Date()): { chars: number } {
  const line = entry.trim().replace(/^[-*]\s*/, '')
  if (!line) throw new Error('要记住的内容是空的')
  const current = readGlobalMemory().content || TEMPLATE
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  return writeGlobalMemory(`${current.trimEnd()}\n- ${line}（${date}）\n`)
}

/** 系统提示词里的全局记忆段（调用方负责判断 Pro） */
export function buildGlobalMemoryPromptSection(): string {
  const { content } = readGlobalMemory()
  const body = content.trim()
  const shown = body.length > GLOBAL_MEMORY_PROMPT_CHARS ? `${body.slice(0, GLOBAL_MEMORY_PROMPT_CHARS)}\n…（后面还有，需要时用 global_memory 的 read 读取全文）` : body
  return `## 全局记忆（跨项目）
下面是用户在所有项目里都适用的长期偏好和信息（\`${globalMemoryPath()}\`）。把它当作对用户的了解来使用，但当前对话里用户的明确要求优先。
- 只有「跨项目都成立、稳定、用户明确表达或反复出现」的信息才用 \`global_memory\` 写入：称呼、语言和回复风格、常用工具与技术栈、工作习惯、用户说过的「以后都这样」。单次行为不要推断成偏好；某个项目特有的事实写项目记忆，不写这里。
- 绝不写入密码、密钥、证件号、他人隐私等敏感信息。写入后用一句话告诉用户记下了什么；用户要求忘掉时用 replace 删除对应条目。
${shown ? `\n<global_memory>\n${shown}\n</global_memory>` : '\n（目前还是空的。）'}`
}
