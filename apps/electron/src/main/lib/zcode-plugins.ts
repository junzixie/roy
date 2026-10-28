/**
 * ZCode 官方插件（照 ZCode 插件页列出来，装进 Roy 当前项目）
 *
 * - 清单：ZCode 官方插件源 zcode-plugins-official（https://cdn-zcode.z.ai/zcode/official-plugin/marketplace.json）。
 *   Roy 直接从官方 CDN 拉取并缓存（6 小时刷新一次），本机装了 ZCode 时也会读它的副本，取较新的那份；
 *   没装 ZCode 也能用。
 * - 插件文件：优先用 ZCode 本机缓存；没有缓存的，按清单里的地址下载 zip，
 *   校验清单里的 sha256 后解压到 Roy 自己的配置目录（不往 ZCode 目录里写东西）。
 * - 安装：插件里的技能复制到当前项目；能在 Roy 里跑的 MCP 转成 Roy 的格式交给界面添加（默认停用）。
 * - Roy 用不了的部分：ZCode 侧栏界面（ui）、ZCode 命令和钩子、要 ZCode 账号登录的 MCP，会标出来，不假装能用。
 */

import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, normalize, relative } from 'node:path'
import AdmZip from 'adm-zip'
import type { McpServerEntry } from '@roy/shared'
import { getConfigDir } from './config-paths'
import { getFetchFn } from './proxy-fetch'
import { getEffectiveProxyUrl } from './proxy-settings-service'

const MARKET_FILE = (): string => join(homedir(), '.zcode', 'cli', 'plugins', 'marketplaces', 'zcode-plugins-official', 'marketplace.json')
/** ZCode 官方插件源（zcode-plugins-official） */
export const ZCODE_MARKET_URL = 'https://cdn-zcode.z.ai/zcode/official-plugin/marketplace.json'
const ROY_MARKET_CACHE = (): string => join(getConfigDir(), 'zcode-plugins', 'marketplace.json')
const MARKET_REFRESH_MS = 6 * 60 * 60 * 1000
const MAX_MARKET_BYTES = 5 * 1024 * 1024
const CACHE_DIR = (): string => join(homedir(), '.zcode', 'cli', 'plugins', 'cache', 'zcode-plugins-official')
const OWN_DIR = (): string => join(getConfigDir(), 'zcode-plugins')
const DATA_DIR = (name: string): string => join(getConfigDir(), 'zcode-plugins-data', name)

const ALLOWED_HOST = 'cdn-zcode.z.ai'
const MAX_ZIP_BYTES = 120 * 1024 * 1024

/** ZCode 插件页最上面那一块（没有标题的） */
const FEATURED = ['pdf', 'presentations', 'spreadsheets', 'documents', 'jupyter-notebook', 'typst-workbench', 'zotero', 'blender']

const CATEGORY_ZH: Record<string, string> = {
  'developer-tools': '开发者工具',
  utilities: '实用工具',
  productivity: '生产力',
  finance: '金融',
}
export const ZCODE_CATEGORY_ORDER = ['推荐', '开发者工具', '实用工具', '生产力', '金融', '其他']

interface RawPlugin {
  name: string
  displayName?: string
  displayName_i18n?: Record<string, string>
  description?: string
  description_i18n?: Record<string, string>
  version?: string
  category?: string
  componentTypes?: string[]
  requiresPaidPlan?: boolean
  homepage?: string
  source?: { url?: string; sha256?: string; path?: string }
  _artifact?: { size?: number; sha256?: string }
}

export interface ZcodeMcpItem {
  key: string
  name: string
  server: Omit<McpServerEntry, 'enabled'>
  needs: string[]
}

export interface ZcodePluginEntry {
  name: string
  title: string
  description: string
  category: string
  version: string
  components: string[]
  paid: boolean
  /** 文件在哪：ZCode 缓存 / Roy 已下载 / 需要下载 */
  where: 'zcode' | 'roy' | 'download'
  /** 插件里 Roy 能用的技能名（文件不在本机时为空，下载后才知道） */
  skillNames: string[]
  /** Roy 能跑的 MCP 个数 */
  mcpCount: number
  /** Roy 能不能用；不能用时 reason 说明原因 */
  usable: boolean
  reason?: string
  /** 能用但有部分用不了时的提示 */
  note?: string
}

function isInside(child: string, parent: string): boolean {
  const rel = relative(parent, child)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

function cmpVer(a: string, b: string): number {
  const pa = a.split(/[.-]/).map((x) => Number.parseInt(x, 10) || 0)
  const pb = b.split(/[.-]/).map((x) => Number.parseInt(x, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d) return d
  }
  return 0
}

function latestDir(base: string): string | undefined {
  if (!existsSync(base)) return undefined
  const vers = readdirSync(base, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => e.name)
  if (!vers.length) return undefined
  vers.sort(cmpVer)
  return join(base, vers[vers.length - 1]!)
}

function parseMarket(text: string): RawPlugin[] {
  const d = JSON.parse(text) as { plugins?: RawPlugin[] }
  return Array.isArray(d.plugins) ? d.plugins.filter((p) => p && typeof p.name === 'string' && /^[a-z0-9][a-z0-9._-]{0,80}$/i.test(p.name)) : []
}

/** 本机 ZCode 副本与 Roy 自己从 CDN 拉的缓存，取修改时间较新、能解析的那份 */
function marketSources(): string[] {
  return [ROY_MARKET_CACHE(), MARKET_FILE()]
    .filter((f) => existsSync(f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
}

/**
 * 合并各份清单：CDN 上的官方清单不含 ZCode 安装包自带的那批插件（pdf、presentations 等），
 * 本机 ZCode 的 marketplace.json 两者都有。按插件名合并，同名取较新那份清单里的条目。
 */
function readMarket(): RawPlugin[] {
  const merged = new Map<string, RawPlugin>()
  for (const f of marketSources()) {
    try {
      for (const p of parseMarket(readFileSync(f, 'utf-8'))) if (!merged.has(p.name)) merged.set(p.name, p)
    } catch { /* 换下一份 */ }
  }
  return [...merged.values()]
}

export function zcodeAvailable(): boolean {
  return marketSources().length > 0
}

let refreshing: Promise<void> | null = null

/** 从 ZCode 官方 CDN 拉最新清单（6 小时内拉过就跳过；force 时强制刷新）。失败不影响已有缓存。 */
export function refreshZcodeMarket(force = false): Promise<void> {
  const cache = ROY_MARKET_CACHE()
  if (!force && existsSync(cache) && Date.now() - statSync(cache).mtimeMs < MARKET_REFRESH_MS) return Promise.resolve()
  refreshing ??= (async () => {
    try {
      const fetchFn = getFetchFn(await getEffectiveProxyUrl())
      const res = await fetchFn(ZCODE_MARKET_URL, { signal: AbortSignal.timeout(20_000), headers: { Accept: 'application/json' } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const text = await res.text()
      if (text.length > MAX_MARKET_BYTES) throw new Error('清单过大')
      if (!parseMarket(text).length) throw new Error('清单为空')
      mkdirSync(dirname(cache), { recursive: true })
      const tmp = `${cache}.${randomUUID()}.tmp`
      writeFileSync(tmp, text, 'utf-8')
      renameSync(tmp, cache)
      console.log('[ZCode 插件] 已从官方源刷新插件清单')
    } catch (error) {
      console.warn('[ZCode 插件] 刷新官方插件清单失败，继续使用已有清单:', error instanceof Error ? error.message : error)
    } finally {
      refreshing = null
    }
  })()
  return refreshing
}

function titleOf(p: RawPlugin): string {
  const t = p.displayName_i18n?.['zh-CN'] || p.displayName || p.name
  // 清单里没写显示名的（github、cloudbase-skills），照 ZCode 页面首字母大写
  return /^[a-z0-9-]+$/.test(t) ? t.split('-').map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w)).join(' ') : t
}

/** 插件目录：Roy 下载过的优先（版本跟清单一致），否则用 ZCode 本机缓存 */
function pluginDir(p: RawPlugin): { dir: string; where: 'zcode' | 'roy' } | undefined {
  const own = latestDir(join(OWN_DIR(), p.name))
  if (own && (!p.version || basename(own) === p.version)) return { dir: own, where: 'roy' }
  const cached = latestDir(join(CACHE_DIR(), p.name))
  if (cached) return { dir: cached, where: 'zcode' }
  if (own) return { dir: own, where: 'roy' }
  return undefined
}

/** 插件里的技能目录；*-viewer 是 ZCode 侧栏预览用的，Roy 用不了 */
function skillDirs(dir: string): string[] {
  const base = join(dir, 'skills')
  if (!existsSync(base)) return []
  return readdirSync(base, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !/-viewer$/i.test(e.name) && existsSync(join(base, e.name, 'SKILL.md')))
    .map((e) => join(base, e.name))
}

function skillName(dir: string): string {
  try {
    const m = readFileSync(join(dir, 'SKILL.md'), 'utf-8').slice(0, 4000).match(/^---[\s\S]*?^name:\s*["']?([^"'\r\n]+)["']?\s*$/m)
    return (m?.[1] ?? basename(dir)).trim()
  } catch {
    return basename(dir)
  }
}

/** 把插件的 .mcp.json 转成 Roy 的 MCP 配置；要 ZCode 账号的跳过 */
function readMcp(name: string, dir: string): { usable: ZcodeMcpItem[]; blocked: string[] } {
  const f = join(dir, '.mcp.json')
  const out = { usable: [] as ZcodeMcpItem[], blocked: [] as string[] }
  if (!existsSync(f)) return out
  let servers: Record<string, Record<string, unknown>> = {}
  try {
    servers = (JSON.parse(readFileSync(f, 'utf-8')) as { mcpServers?: typeof servers }).mcpServers ?? {}
  } catch {
    return out
  }
  for (const [sid, raw] of Object.entries(servers)) {
    if (!raw || typeof raw !== 'object') continue
    const text = JSON.stringify(raw)
    const auth = raw.auth as { type?: string } | undefined
    if (auth?.type === 'zcode_official' || text.includes('${ZCODE_BASE_URL}') || text.includes('${ZCODE_')) {
      out.blocked.push(sid)
      continue
    }
    const needs: string[] = []
    const sub = (v: string): string => v
      .replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, dir)
      .replace(/\$\{CLAUDE_PLUGIN_DATA\}/g, DATA_DIR(name))
      .replace(/\$\{user_config\.([A-Za-z0-9_]+)\}/g, (_, k: string) => { needs.push(k); return '' })
    const env: Record<string, string> = {}
    for (const [k, v] of Object.entries((raw.env as Record<string, unknown>) ?? {})) {
      if (typeof v !== 'string') continue
      const val = sub(v)
      if (val.includes('${')) continue // 其他宿主变量 Roy 没有，留空让它用默认值
      env[k] = val
    }
    const key = `zcode-${name}-${sid}`.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 100)
    const label = Object.keys(servers).length > 1 ? `${name} · ${sid}` : name
    if (typeof raw.url === 'string') {
      const url = sub(raw.url)
      if (url.includes('${')) { out.blocked.push(sid); continue }
      out.usable.push({ key, name: label, server: { type: (raw.type === 'sse' ? 'sse' : 'http') as McpServerEntry['type'], url }, needs: [...new Set(needs)] })
    } else if (typeof raw.command === 'string') {
      const args = Array.isArray(raw.args) ? raw.args.filter((a): a is string => typeof a === 'string').map(sub) : []
      if (args.some((a) => a.includes('${'))) { out.blocked.push(sid); continue }
      // ZCode 写的是 python3，Windows 上一般叫 python
      const command = process.platform === 'win32' && raw.command === 'python3' ? 'python' : sub(raw.command)
      const server: Omit<McpServerEntry, 'enabled'> = { type: 'stdio' as McpServerEntry['type'], command, args }
      if (Object.keys(env).length) server.env = env
      out.usable.push({ key, name: label, server, needs: [...new Set(needs)] })
    }
  }
  return out
}

export function listZcodePlugins(): ZcodePluginEntry[] {
  const list: ZcodePluginEntry[] = []
  for (const p of readMarket()) {
    const comps = p.componentTypes ?? []
    const local = pluginDir(p)
    const skills = local ? skillDirs(local.dir) : []
    const mcp = local ? readMcp(p.name, local.dir) : { usable: [], blocked: [] }
    let usable: boolean
    let reason: string | undefined
    if (local) {
      usable = skills.length > 0 || mcp.usable.length > 0
    } else {
      // 文件不在本机：按清单猜，下载后再按实际内容判断
      usable = comps.includes('skill') || (comps.includes('mcp') && !p.requiresPaidPlan)
    }
    if (!usable) {
      reason = p.name === 'node-repl-host' ? 'ZCode 内部组件，不单独使用'
        : mcp.blocked.length || p.requiresPaidPlan ? '要登录 ZCode 编程套餐账号才能用'
          : comps.includes('ui') || comps.includes('command') ? '只有 ZCode 侧栏界面和命令，Roy 用不了'
            : '没有 Roy 能用的技能或 MCP'
    }
    const notes: string[] = []
    if (usable && (comps.includes('ui') || comps.includes('hook') || comps.includes('command'))) notes.push('ZCode 侧栏界面 / 命令不会装')
    if (usable && (mcp.blocked.length || (p.requiresPaidPlan && comps.includes('mcp')))) notes.push('其中的 MCP 要 ZCode 账号')
    list.push({
      name: p.name,
      title: titleOf(p),
      description: (p.description_i18n?.['zh-CN'] || p.description || '').replace(/\s+/g, ' ').trim().slice(0, 400),
      category: FEATURED.includes(p.name) ? '推荐' : CATEGORY_ZH[p.category ?? ''] ?? '其他',
      version: p.version ?? (local ? basename(local.dir) : ''),
      components: comps,
      paid: !!p.requiresPaidPlan,
      where: local?.where ?? 'download',
      skillNames: skills.map(skillName),
      mcpCount: mcp.usable.length,
      usable,
      reason,
      note: notes.join('；') || undefined,
    })
  }
  list.sort((a, b) => ZCODE_CATEGORY_ORDER.indexOf(a.category) - ZCODE_CATEGORY_ORDER.indexOf(b.category)
    || (a.category === '推荐' ? FEATURED.indexOf(a.name) - FEATURED.indexOf(b.name) : 0))
  return list
}

/** 没有本机文件时下载：只认 ZCode 官方 CDN，校验 sha256，防 zip 路径穿越 */
async function downloadPlugin(p: RawPlugin): Promise<string> {
  const url = p.source?.url ?? ''
  const sha = (p.source?.sha256 || p._artifact?.sha256 || '').toLowerCase()
  let host = ''
  try { host = new URL(url).hostname } catch { /* 下面报错 */ }
  if (host !== ALLOWED_HOST || !url.startsWith('https://')) throw new Error('这个插件的下载地址不是 ZCode 官方地址，没有下载')
  if (!/^[a-f0-9]{64}$/.test(sha)) throw new Error('清单里没有校验码，没有下载')
  if ((p._artifact?.size ?? 0) > MAX_ZIP_BYTES) throw new Error('插件太大，没有下载')

  const fetchFn = getFetchFn(await getEffectiveProxyUrl())
  const res = await fetchFn(url, { signal: AbortSignal.timeout(90_000) })
  if (!res.ok) throw new Error(`下载失败（HTTP ${res.status}）`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length > MAX_ZIP_BYTES) throw new Error('插件太大，没有安装')
  const got = createHash('sha256').update(buf).digest('hex')
  if (got !== sha) throw new Error('下载的文件和清单里的校验码对不上，已丢弃')

  const version = p.version || 'latest'
  const target = join(OWN_DIR(), p.name, version)
  const tmp = join(OWN_DIR(), `.tmp-${randomUUID()}`)
  mkdirSync(tmp, { recursive: true })
  try {
    const zip = new AdmZip(buf)
    for (const e of zip.getEntries()) {
      const dest = normalize(join(tmp, e.entryName))
      if (!isInside(dest, tmp)) throw new Error('插件压缩包里有不安全的路径，已停止安装')
      if (e.isDirectory) { mkdirSync(dest, { recursive: true }); continue }
      mkdirSync(dirname(dest), { recursive: true })
      writeFileSync(dest, e.getData())
    }
    // 压缩包里可能还包了一层插件名目录
    let root = tmp
    const inner = p.source?.path ? join(tmp, p.source.path) : ''
    if (inner && isInside(inner, tmp) && existsSync(inner)) root = inner
    else {
      const top = readdirSync(tmp, { withFileTypes: true })
      if (top.length === 1 && top[0]!.isDirectory()) root = join(tmp, top[0]!.name)
    }
    rmSync(target, { recursive: true, force: true })
    mkdirSync(dirname(target), { recursive: true })
    renameSync(root, target)
    return target
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

export interface ZcodePreparedPlugin {
  title: string
  skills: Array<{ dir: string; slug: string; name: string }>
  mcp: ZcodeMcpItem[]
  blockedMcp: string[]
}

/** 准备好插件文件（必要时下载），返回能装进 Roy 的技能和 MCP */
export async function prepareZcodePlugin(name: string): Promise<ZcodePreparedPlugin> {
  const p = readMarket().find((x) => x.name === name)
  if (!p) throw new Error('ZCode 清单里没有这个插件')
  let dir = pluginDir(p)?.dir
  if (!dir) dir = await downloadPlugin(p)
  const skills = skillDirs(dir).map((d) => ({ dir: d, slug: basename(d), name: skillName(d) }))
  const mcp = readMcp(p.name, dir)
  if (!skills.length && !mcp.usable.length) {
    throw new Error(mcp.blocked.length ? '这个插件的 MCP 要登录 ZCode 账号，Roy 用不了' : '这个插件只有 ZCode 的界面和命令，没有 Roy 能用的技能或 MCP')
  }
  if (mcp.usable.length) mkdirSync(DATA_DIR(p.name), { recursive: true })
  return { title: titleOf(p), skills, mcp: mcp.usable, blockedMcp: mcp.blocked }
}
