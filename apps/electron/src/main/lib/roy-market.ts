/**
 * Roy 内置市场（随安装包分发，离线可用，不读本机其他软件、不联网）
 *
 * resources/market/
 *   skills.json + skills/<slug>/     技能（精选 + 仓库，带原授权文件）
 *   mcp.json    + mcp/<sid>/         MCP 服务端（npm 包打成单文件 / ZCode 插件整包移植）
 *
 * MCP 配置里的占位符在启动时才换成本机路径，安装位置变了也能用：
 *   ${ROY_NODE}   Roy 自带的 Node 运行环境（Electron 以 Node 模式运行），别人电脑不用装 Node.js
 *   ${ROY_MCP}    resources/market/mcp
 *   ${WORKSPACE}  当前项目文件夹
 *   ${ROY_DATA}   Roy 配置目录（记忆等数据写这里，不写进安装目录）
 */

import { app } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { join, normalize, resolve, sep } from 'node:path'
import type { McpServerEntry } from '@roy/shared'
import { getAgentWorkspacePath, getConfigDir } from './config-paths'

export interface RoyMarketSkill {
  slug: string
  name: string
  description: string
  source: string
  license: string
  category: string
  featured: { zh: string; desc: string } | null
  note: string
  kb: number
}

export interface RoyMarketMcp {
  id: string
  name: string
  description: string
  group: string
  license: string
  author: string
  server: McpServerEntry
  needs: string[]
  note: string
  origin: 'npm' | 'zcode' | 'remote'
  skill: string | null
  tools: number | null
  featured: boolean
}

export function getRoyMarketDir(): string {
  if (process.env.ROY_MARKET_DIR) return process.env.ROY_MARKET_DIR
  return app.isPackaged ? join(process.resourcesPath, 'market') : join(__dirname, 'resources', 'market')
}

let cache: { skills: RoyMarketSkill[]; mcp: RoyMarketMcp[] } | undefined

function readJson<T>(file: string): T[] {
  try {
    const value = JSON.parse(readFileSync(file, 'utf-8')) as unknown
    return Array.isArray(value) ? value as T[] : []
  } catch (error) {
    console.warn('[Roy 市场] 读取清单失败:', file, error instanceof Error ? error.message : error)
    return []
  }
}

export function getRoyMarketCatalog(): { skills: RoyMarketSkill[]; mcp: RoyMarketMcp[] } {
  if (!cache) {
    const dir = getRoyMarketDir()
    cache = { skills: readJson<RoyMarketSkill>(join(dir, 'skills.json')), mcp: readJson<RoyMarketMcp>(join(dir, 'mcp.json')) }
  }
  return cache
}

/** 市场技能 slug（"roy:<slug>"）→ 技能目录；只认清单里有的，防止路径穿越 */
export function resolveRoyMarketSkillDir(marketSlug: string): { dir: string; installSlug: string } {
  const slug = marketSlug.replace(/^roy:/, '')
  if (!/^[a-z0-9][a-z0-9._-]{0,80}$/i.test(slug)) throw new Error('技能标识不合法')
  if (!getRoyMarketCatalog().skills.some((s) => s.slug === slug)) throw new Error('市场里没有这个技能')
  const root = resolve(getRoyMarketDir(), 'skills')
  const dir = resolve(root, slug)
  if (!dir.startsWith(root + sep) || !existsSync(join(dir, 'SKILL.md'))) throw new Error('技能文件缺失，请重新安装 Roy')
  return { dir, installSlug: slug }
}

export function readRoyMarketSkillBody(marketSlug: string): string {
  const { dir } = resolveRoyMarketSkillDir(marketSlug)
  return readFileSync(join(dir, 'SKILL.md'), 'utf-8')
}

/** ${ROY_MCP}/a/b 换完后在 Windows 上统一成反斜杠 */
function normalizeMarketPath(value: string): string {
  return value.startsWith(join(getRoyMarketDir(), 'mcp')) ? normalize(value) : value
}

const PLACEHOLDER = /\$\{(ROY_NODE|ROY_MCP|WORKSPACE|ROY_DATA)\}/

/** 配置里有没有内置市场的占位符 */
export function usesRoyMarketPlaceholders(entry: Pick<McpServerEntry, 'command' | 'args' | 'env'>): boolean {
  return [entry.command ?? '', ...(entry.args ?? []), ...Object.values(entry.env ?? {})].some((v) => PLACEHOLDER.test(v))
}

/**
 * 把内置市场 MCP 的占位符换成本机实际路径。没有占位符的配置原样返回。
 * ${ROY_NODE} 换成 Roy 自己的可执行文件，并加 ELECTRON_RUN_AS_NODE=1 让它按 Node 运行。
 */
export function resolveRoyMarketMcpEntry<T extends Pick<McpServerEntry, 'command' | 'args' | 'env'>>(entry: T, workspaceSlug?: string): T {
  if (!usesRoyMarketPlaceholders(entry)) return entry
  const mcpDir = join(getRoyMarketDir(), 'mcp')
  let workspace = ''
  const map = (value: string): string => normalizeMarketPath(value.replace(new RegExp(PLACEHOLDER.source, 'g'), (_, key: string) => {
    if (key === 'ROY_NODE') return process.execPath
    if (key === 'ROY_MCP') return mcpDir
    if (key === 'ROY_DATA') return getConfigDir()
    if (!workspace) workspace = workspaceSlug ? getAgentWorkspacePath(workspaceSlug) : app.getPath('home')
    return workspace
  }))
  const usesNode = entry.command === '${ROY_NODE}'
  const env = Object.fromEntries(Object.entries(entry.env ?? {}).map(([k, v]) => [k, map(v)]))
  if (usesNode) env.ELECTRON_RUN_AS_NODE = '1'
  return {
    ...entry,
    command: entry.command ? map(entry.command) : entry.command,
    args: entry.args?.map(map),
    env,
  }
}
