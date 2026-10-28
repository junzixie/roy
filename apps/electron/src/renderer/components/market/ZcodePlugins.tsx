/**
 * ZCode 官方插件：哪些放进技能仓库（zcodeListed），以及安装（技能装进当前项目，能在 Roy 里跑的 MCP 一起装上并连好）。
 * 列表界面在技能仓库（SkillRepo.tsx）里，和 Roy 技能仓库、在线合集放在一起。
 */

import { toast } from 'sonner'
import type { McpServerEntry } from '@roy/shared'

type Plugin = Awaited<ReturnType<typeof window.electronAPI.getZcodePlugins>>['list'][number]

/**
 * 和「技能与 MCP → 推荐连接」重复的服务：那边一处配置（MCP / 官方 CLI + 登录），这里不再重复列出，
 * 免得同一个 GitHub 在技能、MCP、推荐连接里出现三次。
 */
const COVERED_BY_INTEGRATIONS: Record<string, string> = { github: 'GitHub', 'lark-cli': '飞书', 'dingtalk-cli': '钉钉', 'wecom-cli': '企业微信' }

const errText = (e: unknown): string => String(e instanceof Error ? e.message : e).replace(/^Error invoking remote method[^:]*:\s*(Error:\s*)?/, '')

export type ZcodePlugin = Plugin

/** 和 Roy 能力重复、或只在 ZCode 里有意义的插件，不放进技能仓库 */
const ZCODE_HIDDEN = new Set([
  // ZCode 自己的使用指南、插件 / 技能开发工具、旧会话恢复，只对 ZCode 有用
  'zcode-guide', 'plugin-creator', 'restore-legacy-sessions', 'skill-creator', 'zcode-mcp-app-dev', 'node-repl-host',
  // ZCode 内置浏览器 / 电脑控制 / 搜图 / 交互视图（Roy 有自己的）
  'browser-use', 'computer-use', 'image-search', 'visualize', 'video2code',
  // Word / 表格 / PPT / PDF：Roy 已经自带 docx、xlsx、pptx、pdf 技能
  'documents', 'spreadsheets', 'presentations', 'pdf',
])

/** 技能仓库里列不列这个 ZCode 插件：去掉上面那些、ZCode 面板应用（*craft）、Roy 用不了的、已整合到推荐连接的 */
export function zcodeListed(p: Plugin): boolean {
  return p.usable && !ZCODE_HIDDEN.has(p.name) && !/craft$/.test(p.name) && !COVERED_BY_INTEGRATIONS[p.name]
}

/** 装 ZCode 插件：技能装进当前项目，能在 Roy 里跑的 MCP 一起装上并连好（要填配置的先停用） */
export async function installZcodePluginWithMcp(workspaceSlug: string, p: Plugin): Promise<boolean> {
  if (!workspaceSlug) { toast.error('还没有可用项目，先建一个项目'); return false }
  if (p.where === 'download' && !window.confirm(`「${p.title}」不在本机，要先从 ZCode 官方地址下载（会核对清单里的校验码）。继续吗？`)) return false
  try {
    const r = await window.electronAPI.installZcodePlugin(workspaceSlug, p.name)
    let mcpConnected = 0
    let mcpPending = 0
    const mcpFailed: string[] = []
    if (r.mcp.length) {
      const cfg = await window.electronAPI.getWorkspaceMcpConfig(workspaceSlug)
      const fresh = r.mcp.filter((m) => !cfg.servers[m.key])
      // 照 ZCode：点「安装」就把插件自带的 MCP 一起装上并连好（真实握手 + 工具发现），不再逐个确认。
      // 需要填账号/密钥的 MCP 先以停用状态加进来，到「已安装」里补全后再打开。
      for (const m of fresh) {
        const ready = m.needs.length === 0
        const res = await window.electronAPI.installMcpAndValidate(workspaceSlug, m.key, { ...m.server, enabled: ready } as McpServerEntry)
        if (!res.installed) continue
        if (!ready) mcpPending += 1
        else if (res.verification.success) mcpConnected += 1
        else mcpFailed.push(`${m.name}：${res.verification.message || '连接失败'}`)
      }
    }
    const parts: string[] = []
    if (r.installed.length) parts.push(`装好 ${r.installed.length} 个技能`)
    if (r.existed.length) parts.push(`${r.existed.length} 个以前装过`)
    if (mcpConnected) parts.push(`连上 ${mcpConnected} 个 MCP`)
    if (mcpPending) parts.push(`${mcpPending} 个 MCP 要先填配置`)
    if (mcpFailed.length) toast.error(`MCP 没连上：${mcpFailed.join('；')}`)
    if (r.blockedMcp.length) parts.push(`${r.blockedMcp.length} 个 MCP 要 ZCode 账号，没加`)
    if (r.failed.length) toast.error(`部分没装上：${r.failed.join('；')}`)
    toast.success(`「${r.title}」${parts.join('，') || '没有新内容'}${r.installed.length ? '，在对话里输入 / 就能用' : ''}`)
    return true
  } catch (e) {
    toast.error(`安装失败：${errText(e)}`)
    return false
  }
}
