/**
 * 会话导出 Markdown（移植自 Arthur src/lib/export.ts）：你说的、Roy 回答的、用过的工具一目了然。
 */

import type { SDKMessage } from '@roy/shared'

const TOOL_ZH: Record<string, string> = {
  bash: '运行命令', powershell: '运行命令', Bash: '运行命令',
  write: '写文件', Write: '写文件', edit: '改文件', Edit: '改文件', read: '读文件', Read: '读文件',
  grep: '搜索内容', find: '查找文件', ls: '列目录',
  web_search: '搜索网页', web_fetch: '读网页', use_skill: '加载技能',
  screen_capture: '看屏幕', computer_screenshot: '看屏幕', computer_click: '点击', computer_type: '打字', computer_key: '按键',
  workflow_run: '运行工作流', workflow_list: '查看工作流',
}

function toolLabel(name: string): string {
  if (TOOL_ZH[name]) return TOOL_ZH[name]!
  if (name.startsWith('mcp__')) {
    const [, server, tool] = name.split('__')
    return `MCP ${server ?? ''} · ${tool ?? ''}`
  }
  if (name.startsWith('Browser')) return `浏览器 ${name.slice('Browser'.length)}`
  return name
}

function toolBrief(input: Record<string, unknown> | undefined): string {
  if (!input) return ''
  const key = ['command', 'path', 'file_path', 'url', 'query', 'pattern', 'name', 'workflow', 'text', 'target'].find(k => typeof input[k] === 'string' && (input[k] as string).trim())
  if (!key) return ''
  const value = (input[key] as string).replace(/\s+/g, ' ').trim()
  return value.length > 160 ? `${value.slice(0, 160)}…` : value
}

/** 去掉 Roy 注入给模型的上下文块（workspace_state、mentioned_tools、skill 正文、system-reminder 等） */
export function stripInjectedContext(text: string): string {
  return text
    .replace(/<(workspace_state|working_directory|mentioned_tools|referenced_sessions|system-reminder|skill|attached_files|user_context)[^>]*>[\s\S]*?<\/\1>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function buildSessionMarkdown(title: string, messages: readonly SDKMessage[], exportedAt = new Date()): string {
  const lines: string[] = [`# ${title || '未命名会话'}`, '', `> 由 Roy 导出于 ${exportedAt.toLocaleString('zh-CN')}`, '']
  let lastRole = ''
  for (const raw of messages) {
    const m = raw as { type?: string; message?: { content?: unknown }; isSynthetic?: boolean; parent_tool_use_id?: string | null }
    if (m.parent_tool_use_id) continue
    const content = Array.isArray(m.message?.content) ? m.message!.content as Array<Record<string, unknown>> : []
    if (m.type === 'user') {
      if (m.isSynthetic) continue
      const text = stripInjectedContext(content.filter(b => b.type === 'text' && typeof b.text === 'string').map(b => b.text as string).join('\n'))
      if (!text) continue
      lines.push('## 你', '', text, '')
      lastRole = 'user'
    } else if (m.type === 'assistant') {
      const parts: string[] = []
      for (const b of content) {
        if (b.type === 'text' && typeof b.text === 'string' && b.text.trim()) parts.push(b.text.trim())
        else if (b.type === 'tool_use' && typeof b.name === 'string') {
          const brief = toolBrief(b.input as Record<string, unknown> | undefined)
          parts.push(`> 🔧 ${toolLabel(b.name)}${brief ? `：\`${brief.replace(/`/g, "'")}\`` : ''}`)
        }
      }
      if (!parts.length) continue
      if (lastRole !== 'assistant') lines.push('## Roy', '')
      lines.push(parts.join('\n\n'), '')
      lastRole = 'assistant'
    }
  }
  return `${lines.join('\n').trimEnd()}\n`
}

/** 文件名里去掉 Windows 不允许的字符 */
export function safeExportFileName(title: string): string {
  const name = (title || '会话').replace(/[\\/:*?"<>|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
  return `${name || '会话'}.md`
}
