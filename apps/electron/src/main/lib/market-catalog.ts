/**
 * 市场目录（照 Arthur 的市场来源对齐）
 *
 * 技能：
 * - 随包分发的 WorkBuddy 技能 + 插件市场里的全部技能（跳过 .tmp 解压残留）
 * - 本机已有的技能目录（~/.claude/skills、~/.agents/skills），只读列出，安装时复制
 * - 在线合集：GitHub 公开技能合集，先走 jsDelivr 再走 GitHub，结果缓存一天
 * MCP：
 * - 随包分发的连接器清单（connectors.json + 每个连接器的 mcp.json）
 * - 官方 MCP 注册表在线搜索
 *
 * 所有联网请求都跟随全局代理（默认系统代理），并带超时。
 */

import { existsSync, realpathSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, normalize, relative, sep } from 'node:path'
import { randomUUID } from 'node:crypto'
import AdmZip from 'adm-zip'
import type { MarketSkillEntry, McpServerEntry } from '@roy/shared'
import { parseSkillFrontmatter } from './skill-market'
import { getFetchFn } from './proxy-fetch'
import { getEffectiveProxyUrl } from './proxy-settings-service'
import { getConfigDir } from './config-paths'

// ─── 通用 ───

const COLLECTION_LABELS: Record<string, string> = {
  skills: 'Roy 精选',
  'roy-experts': '专家',
  'codebuddy-plugins-official': '官方插件',
  cb_teams_marketplace: '团队协作',
  experts: '专家技能',
  'my-experts': '我的专家',
}

function isInside(child: string, parent: string): boolean {
  const rel = relative(parent, child)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

function safeSlug(name: string): string {
  return name.trim().replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^[.-]+/, '').slice(0, 80) || `skill-${Date.now().toString(36)}`
}

function readSkill(dir: string, slug: string, collection: string, group: string): MarketSkillEntry | null {
  try {
    const { meta, body } = parseSkillFrontmatter(readFileSync(join(dir, 'SKILL.md'), 'utf-8'))
    const metaAny = meta as Record<string, string | undefined>
    const zhDesc = metaAny.description_zh
    return {
      slug,
      name: (meta.name ?? '').trim() || basename(dir),
      description: ((zhDesc && /[\u4e00-\u9fff]/.test(zhDesc) ? zhDesc : meta.description) ?? '').replace(/\s+/g, ' ').trim().slice(0, 400),
      version: (meta.version ?? '').trim(),
      author: (meta.author ?? '').trim(),
      license: (meta.license ?? '').trim(),
      fileCount: 0,
      source: 'builtin',
      collection,
      group,
      body: body.slice(0, 6000),
    }
  } catch {
    return null
  }
}

/** 递归找含 SKILL.md 的目录；找到就不再往下钻（技能包内部的子技能算同一个）。 */
function findSkillDirs(dir: string, depth = 0, out: string[] = []): string[] {
  if (depth > 7) return out
  let entries: import('node:fs').Dirent[]
  try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return out }
  if (entries.some((e) => e.isFile() && e.name === 'SKILL.md')) { out.push(dir); return out }
  for (const e of entries) {
    if (!e.isDirectory()) continue
    if (e.name === 'node_modules' || e.name.startsWith('.') || /\.tmp$|\.tmp\b/.test(e.name)) continue
    findSkillDirs(join(dir, e.name), depth + 1, out)
  }
  return out
}

// ─── 内置 + 本机技能 ───

let builtinCache: { root: string; list: MarketSkillEntry[] } | null = null

const LOCAL_ROOTS = (): string[] => [join(homedir(), '.claude', 'skills'), join(homedir(), '.agents', 'skills')]

export function listMarketSkills(workbuddyRoot: string): MarketSkillEntry[] {
  if (!builtinCache || builtinCache.root !== workbuddyRoot) {
    const list: MarketSkillEntry[] = []
    const add = (dir: string, collectionKey: string, group: string): void => {
      const slug = relative(workbuddyRoot, dir).split(sep).join('/')
      const entry = readSkill(dir, slug, COLLECTION_LABELS[collectionKey] ?? collectionKey, group)
      if (entry) list.push(entry)
    }
    for (const dir of findSkillDirs(join(workbuddyRoot, 'skills'))) add(dir, 'skills', 'Roy 精选')
    // 随包连接器里自带的技能（connectors/<市场>/connectors/<连接器>/skills/...）
    for (const dir of findSkillDirs(join(workbuddyRoot, 'connectors'))) {
      const parts = relative(join(workbuddyRoot, 'connectors'), dir).split(sep)
      const ci = parts.indexOf('connectors')
      add(dir, 'WorkBuddy 连接器技能', ci >= 0 ? parts[ci + 1] ?? '连接器' : parts[0] ?? '连接器')
    }
    const marketplaces = join(workbuddyRoot, 'plugins', 'marketplaces')
    if (existsSync(marketplaces)) {
      for (const m of readdirSync(marketplaces, { withFileTypes: true })) {
        if (!m.isDirectory() || m.name.includes('.tmp')) continue
        for (const dir of findSkillDirs(join(marketplaces, m.name))) {
          // 插件名：marketplaces/<m>/(plugins|external_plugins)/<plugin>/...
          const parts = relative(join(marketplaces, m.name), dir).split(sep)
          const pluginIdx = parts.findIndex((p) => p === 'plugins' || p === 'external_plugins')
          add(dir, m.name, pluginIdx >= 0 ? parts[pluginIdx + 1] ?? m.name : m.name)
        }
      }
    }
    builtinCache = { root: workbuddyRoot, list }
  }
  const local: MarketSkillEntry[] = []
  for (const root of LOCAL_ROOTS()) {
    if (!existsSync(root)) continue
    for (const e of readdirSync(root, { withFileTypes: true })) {
      if (!e.isDirectory()) continue
      const dir = join(root, e.name)
      if (!existsSync(join(dir, 'SKILL.md'))) continue
      const entry = readSkill(dir, `local:${dir}`, '本机已有', root.includes('.claude') ? 'Claude Code' : 'Agents')
      if (entry) local.push(entry)
    }
  }
  // 同名只留第一份（本机优先，因为可能是改过的版本）
  const seen = new Set<string>()
  return [...local, ...builtinCache.list].filter((s) => {
    const key = s.name.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** 市场条目 slug → 实际目录；只允许落在内置资源或本机技能目录里。 */
export function resolveMarketSkillDir(workbuddyRoot: string, slug: string): { dir: string; installSlug: string } {
  if (slug.startsWith('app:')) {
    const real = resolveAppSkillDir(slug)
    let nm = basename(real)
    try { nm = parseSkillFrontmatter(readFileSync(join(real, 'SKILL.md'), 'utf-8')).meta.name?.trim() || nm } catch { /* 用目录名 */ }
    return { dir: real, installSlug: safeSlug(nm) }
  }
  let dir: string
  if (slug.startsWith('local:')) {
    dir = normalize(slug.slice(6))
    if (!LOCAL_ROOTS().some((root) => isInside(dir, root))) throw new Error('技能位置不在允许的本机目录里')
  } else {
    const rel = slug.includes('/') ? slug : `skills/${slug}`
    dir = normalize(join(workbuddyRoot, ...rel.split('/')))
    if (!isInside(dir, workbuddyRoot) || dir.includes('.tmp')) throw new Error('技能位置不合法')
  }
  if (!existsSync(join(dir, 'SKILL.md'))) throw new Error('这个技能缺少 SKILL.md')
  dir = realpathSync(dir)
  const allowed = slug.startsWith('local:') ? LOCAL_ROOTS().filter(existsSync) : [workbuddyRoot]
  if (!allowed.some(root => isInside(dir, realpathSync(root)))) throw new Error('技能目录越界')
  let name = basename(dir)
  try { name = parseSkillFrontmatter(readFileSync(join(dir, 'SKILL.md'), 'utf-8')).meta.name?.trim() || name } catch { /* 用目录名 */ }
  return { dir, installSlug: safeSlug(name) }
}

// ─── 在线合集（GitHub） ───

export const REMOTE_SKILL_SOURCES = [
  { repo: 'anthropics/skills', name: 'Anthropic 官方技能', desc: 'Word / Excel / PPT / PDF、前端设计、MCP 构建、网页测试等官方技能' },
  { repo: 'JimLiu/baoyu-skills', name: '宝玉的内容创作', desc: '中文写作、翻译、内容改写' },
  { repo: 'op7418/Humanizer-zh', name: '去 AI 味（中文）', desc: '把 AI 写的中文改得更自然' },
  { repo: 'ComposioHQ/awesome-claude-skills', name: '综合精选', desc: '文档办公、营销、效率工具' },
  // 以下是原内置 WorkBuddy 包里大部分技能的上游开源仓库（MIT / Apache-2.0），改为在线获取而不是打进安装包
  { repo: 'obra/superpowers', name: 'Superpowers 工程流程', desc: '头脑风暴、写计划、执行计划、调试等工程方法（MIT）' },
  { repo: 'wshobson/agents', name: '专业代理与技能合集', desc: '后端、前端、运维、安全、数据等几百个专业技能（MIT）' },
  { repo: 'davepoon/buildwithclaude', name: 'Build with Claude 合集', desc: '社区整理的代理、命令和技能（MIT）' },
  { repo: 'anthropics/claude-plugins-official', name: 'Claude 官方插件目录', desc: 'Anthropic 维护的插件与技能目录（Apache-2.0）' },
  { repo: 'vercel-labs/agent-browser', name: '浏览器自动化', desc: 'Vercel 的 agent-browser 浏览器操作技能（Apache-2.0）' },
]

interface RemoteCache { at: number; repo: string; ref: string; files: string[]; skills: MarketSkillEntry[] }

export interface RemoteSkillSource { repo: string; name: string; desc: string; custom?: boolean }

const customSourcesFile = (): string => join(getConfigDir(), 'market-sources.json')

function readCustomSources(): RemoteSkillSource[] {
  try {
    const list = JSON.parse(readFileSync(customSourcesFile(), 'utf-8')) as RemoteSkillSource[]
    return Array.isArray(list) ? list.filter((x) => typeof x?.repo === 'string' && REPO_RE.test(x.repo)).map((x) => ({ ...x, custom: true })) : []
  } catch {
    return []
  }
}

const REPO_RE = /^[A-Za-z0-9_.-]{1,80}\/[A-Za-z0-9_.-]{1,100}$/

/** 在线合集 = 内置的几个 + 用户自己加的「用户名/仓库名」 */
export function getRemoteSources(): RemoteSkillSource[] {
  const seen = new Set(REMOTE_SKILL_SOURCES.map((s) => s.repo.toLowerCase()))
  return [...REMOTE_SKILL_SOURCES, ...readCustomSources().filter((s) => !seen.has(s.repo.toLowerCase()))]
}

export function addRemoteSource(input: string): RemoteSkillSource[] {
  const repo = String(input ?? '').trim()
    .replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '').replace(/\/+$/, '')
  if (!REPO_RE.test(repo)) throw new Error('请填「用户名/仓库名」，例如 anthropics/skills')
  if (getRemoteSources().some((s) => s.repo.toLowerCase() === repo.toLowerCase())) throw new Error('这个合集已经在列表里了')
  const list = [...readCustomSources(), { repo, name: repo.split('/')[1] ?? repo, desc: `GitHub：${repo}`, custom: true }]
  mkdirSync(dirname(customSourcesFile()), { recursive: true })
  writeFileSync(customSourcesFile(), JSON.stringify(list, null, 2))
  return getRemoteSources()
}

export function removeRemoteSource(repo: string): RemoteSkillSource[] {
  const list = readCustomSources().filter((s) => s.repo !== repo)
  mkdirSync(dirname(customSourcesFile()), { recursive: true })
  writeFileSync(customSourcesFile(), JSON.stringify(list, null, 2))
  try { rmSync(cacheFile(repo), { force: true }) } catch { /* 忽略 */ }
  return getRemoteSources()
}

async function http(): Promise<typeof fetch> {
  return getFetchFn(await getEffectiveProxyUrl())
}

async function getText(url: string, ms = 20000): Promise<string> {
  const f = await http()
  const r = await f(url, { headers: { 'user-agent': 'Roy' }, signal: AbortSignal.timeout(ms) })
  if (!r.ok) throw new Error(`${r.status}`)
  return r.text()
}

async function repoFiles(repo: string): Promise<{ ref: string; files: string[] }> {
  const errs: string[] = []
  for (const ref of ['main', 'master']) {
    try {
      const j = JSON.parse(await getText(`https://data.jsdelivr.com/v1/packages/gh/${repo}@${ref}?structure=flat`)) as { files?: Array<{ name: string }> }
      if (j.files?.length) return { ref, files: j.files.map((f) => f.name.replace(/^\//, '')) }
    } catch (e) { errs.push(String(e)) }
    try {
      const j = JSON.parse(await getText(`https://api.github.com/repos/${repo}/git/trees/${ref}?recursive=1`)) as { tree?: Array<{ type: string; path: string }> }
      if (j.tree?.length) return { ref, files: j.tree.filter((t) => t.type === 'blob').map((t) => t.path) }
    } catch (e) { errs.push(String(e)) }
  }
  throw new Error(`连不上 GitHub 和 jsDelivr，读不到「${repo}」（${errs[0] ?? '未知错误'}）`)
}

const MAX_REPO_ZIP_BYTES = 80 * 1024 * 1024
const repoZips = new Map<string, Promise<AdmZip | null>>()

/**
 * 整个仓库打包下载一次（codeload.github.com）。国内网络下 jsDelivr 常被重置、
 * raw.githubusercontent.com 常超时，而 codeload 通常能连上；一次下载后在内存里取文件。
 */
function repoZip(repo: string, ref: string): Promise<AdmZip | null> {
  const key = `${repo}@${ref}`
  let p = repoZips.get(key)
  if (!p) {
    p = (async () => {
      try {
        const f = await http()
        const r = await f(`https://codeload.github.com/${repo}/zip/refs/heads/${encodeURIComponent(ref)}`, { headers: { 'user-agent': 'Roy' }, signal: AbortSignal.timeout(90_000) })
        if (!r.ok) return null
        const len = Number(r.headers.get('content-length') ?? 0)
        if (len > MAX_REPO_ZIP_BYTES) return null
        const buf = Buffer.from(await r.arrayBuffer())
        return buf.length > MAX_REPO_ZIP_BYTES ? null : new AdmZip(buf)
      } catch {
        return null
      }
    })()
    repoZips.set(key, p)
    // 内存里只留 10 分钟，避免长期占用
    setTimeout(() => repoZips.delete(key), 10 * 60_000).unref?.()
  }
  return p
}

async function repoFileBuf(repo: string, ref: string, file: string): Promise<Buffer> {
  const zip = await repoZip(repo, ref)
  if (zip) {
    const entry = zip.getEntries().find((e) => !e.isDirectory && e.entryName.slice(e.entryName.indexOf('/') + 1) === file)
    if (entry) return entry.getData()
  }
  const enc = file.split('/').map(encodeURIComponent).join('/')
  const f = await http()
  for (const u of [`https://cdn.jsdelivr.net/gh/${repo}@${ref}/${enc}`, `https://raw.githubusercontent.com/${repo}/${ref}/${enc}`]) {
    try {
      const r = await f(u, { headers: { 'user-agent': 'Roy' }, signal: AbortSignal.timeout(30000) })
      if (r.ok) return Buffer.from(await r.arrayBuffer())
    } catch { /* 换下一个地址 */ }
  }
  throw new Error(`下载失败：${file}`)
}

const cacheFile = (repo: string): string => join(getConfigDir(), 'market-cache', `${repo.replace(/[\\/]/g, '__')}.json`)

export async function listRemoteSkills(repo: string, refresh = false): Promise<MarketSkillEntry[]> {
  if (!getRemoteSources().some((s) => s.repo === repo)) throw new Error('未知的在线合集')
  const cf = cacheFile(repo)
  if (!refresh && existsSync(cf)) {
    try {
      const c = JSON.parse(readFileSync(cf, 'utf-8')) as RemoteCache
      if (Date.now() - c.at < 86_400_000) return c.skills
    } catch { /* 重新拉 */ }
  }
  const { ref, files } = await repoFiles(repo)
  const dirs = files.filter((f) => /(^|\/)SKILL\.md$/.test(f)).map((f) => f.replace(/\/?SKILL\.md$/, '')).slice(0, 250)
  const label = getRemoteSources().find((s) => s.repo === repo)?.name ?? repo
  const skills: MarketSkillEntry[] = []
  const queue = [...dirs]
  await Promise.all(Array.from({ length: 6 }, async () => {
    for (let d = queue.shift(); d !== undefined; d = queue.shift()) {
      let meta: Record<string, string | undefined> = {}
      let body = ''
      try {
        const parsed = parseSkillFrontmatter((await repoFileBuf(repo, ref, d ? `${d}/SKILL.md` : 'SKILL.md')).toString('utf-8'))
        meta = parsed.meta as Record<string, string | undefined>
        body = parsed.body
      } catch { /* 读失败也列出，名字用文件夹名 */ }
      skills.push({
        slug: `remote:${repo}:${d}`,
        name: (meta.name ?? '').trim() || d.split('/').pop() || repo,
        description: (meta.description ?? '').replace(/\s+/g, ' ').trim().slice(0, 400),
        version: (meta.version ?? '').trim(), author: '', license: (meta.license ?? '').trim(),
        fileCount: files.filter((f) => (d ? f.startsWith(`${d}/`) : true)).length,
        source: 'builtin', collection: '在线合集', group: label,
        body: body.slice(0, 6000),
      })
    }
  }))
  skills.sort((a, b) => a.name.localeCompare(b.name))
  mkdirSync(dirname(cf), { recursive: true })
  writeFileSync(cf, JSON.stringify({ at: Date.now(), repo, ref, files, skills } satisfies RemoteCache))
  return skills
}

/** 把在线合集里的一个技能下载到临时目录，返回目录（调用方负责安装后删除）。 */
export async function downloadRemoteSkill(slug: string): Promise<{ dir: string; installSlug: string; cleanup: () => void }> {
  const m = slug.match(/^remote:([^:]+):([^]*)$/)
  if (!m) throw new Error('在线技能标识不合法')
  const repo = m[1]!, path = m[2]!
  if (!getRemoteSources().some(s => s.repo === repo)) throw new Error('未知的在线合集')
  let cache: RemoteCache
  try { cache = JSON.parse(readFileSync(cacheFile(repo), 'utf-8')) as RemoteCache } catch {
    await listRemoteSkills(repo, true)
    cache = JSON.parse(readFileSync(cacheFile(repo), 'utf-8')) as RemoteCache
  }
  const skill = cache.skills.find((s) => s.slug === slug)
  if (!skill) throw new Error('合集里没找到这个技能，刷新后再试')
  const files = cache.files.filter((f) => (path ? f.startsWith(`${path}/`) : true)).slice(0, 300)
  const root = join(tmpdir(), 'roy-market', randomUUID())
  const dir = join(root, 'skill')
  const cleanup = (): void => { try { rmSync(root, { recursive: true, force: true }) } catch { /* 忽略 */ } }
  try {
    for (const f of files) {
      const rel = path ? f.slice(path.length + 1) : f
      const out = normalize(join(dir, ...rel.split('/')))
      if (!isInside(out, dir)) continue
      mkdirSync(dirname(out), { recursive: true })
      writeFileSync(out, await repoFileBuf(repo, cache.ref, f))
    }
    if (!existsSync(join(dir, 'SKILL.md'))) throw new Error('下载下来没有 SKILL.md')
  } catch (e) {
    cleanup()
    throw e
  }
  return { dir, installSlug: safeSlug(skill.name), cleanup }
}

// ─── MCP：连接器 + 官方注册表 ───

export interface MarketMcpEntry {
  id: string
  name: string
  description: string
  examples: string[]
  source: 'connector' | 'registry' | 'local'
  /** 本机来源时的软件名 */
  origin?: string
  /** 写进工作区 mcp.json 的配置（不含 enabled） */
  server?: Omit<McpServerEntry, 'enabled'>
  /** 需要用户补的密钥 / 授权说明；为空表示装上就能用 */
  needs: string[]
  home?: string
}

let connectorCache: { root: string; list: MarketMcpEntry[] } | null = null

const PLACEHOLDER = /\$\{([A-Za-z0-9_]+)\}/g
const HAS_PLACEHOLDER = /\$\{[A-Za-z0-9_]+\}/

function toServer(raw: Record<string, unknown>): { server?: Omit<McpServerEntry, 'enabled'>; needs: string[] } {
  const needs: string[] = []
  const strip = (obj: unknown): Record<string, string> | undefined => {
    if (!obj || typeof obj !== 'object') return undefined
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const s = String(v ?? '')
      const vars = [...s.matchAll(PLACEHOLDER)].map((x) => x[1]!)
      if (vars.length) { needs.push(`${k}（${vars.join('、')}）`); out[k] = '' } else out[k] = s
    }
    return out
  }
  const t = String(raw.type ?? '').toLowerCase()
  if (typeof raw.command === 'string' || t === 'stdio') {
    if (typeof raw.command !== 'string') return { needs }
    return { server: { type: 'stdio', command: raw.command, args: Array.isArray(raw.args) ? raw.args.map(String) : [], env: strip(raw.env) }, needs }
  }
  if (typeof raw.url !== 'string' || HAS_PLACEHOLDER.test(raw.url)) return { needs }
  return { server: { type: t === 'sse' ? 'sse' : 'http', url: raw.url, headers: strip(raw.headers) }, needs }
}

export function listMarketConnectors(workbuddyRoot: string): MarketMcpEntry[] {
  if (connectorCache?.root === workbuddyRoot) return connectorCache.list
  const base = join(workbuddyRoot, 'connectors', 'connectors-marketplace')
  const list: MarketMcpEntry[] = []
  try {
    const data = JSON.parse(readFileSync(join(base, '.codebuddy-connector', 'connectors.json'), 'utf-8')) as { connectors?: Array<Record<string, unknown>> }
    for (const c of data.connectors ?? []) {
      const id = String(c.id ?? '')
      if (!/^[a-zA-Z0-9_.-]+$/.test(id)) continue
      const visible = Array.isArray(c.visible_in) ? c.visible_in.map(String) : []
      // 只给腾讯内网用的连接器不列
      if (visible.length && !visible.some((v) => v === 'cloudhosted' || v === 'selfhosted')) continue
      if (c.type === 'cli') continue
      let server: MarketMcpEntry['server']
      let needs: string[] = []
      try {
        const mcp = JSON.parse(readFileSync(join(base, 'connectors', id, 'mcp.json'), 'utf-8')) as { mcpServers?: Record<string, Record<string, unknown>> }
        const first = Object.values(mcp.mcpServers ?? {})[0]
        if (first) ({ server, needs } = toServer(first))
      } catch { /* 没有 mcp.json */ }
      if (!server) continue
      const auth = String(c.auth_mode ?? '')
      if (auth === 'oauth') needs.push('需要在 MCP 页完成授权登录')
      list.push({
        id,
        name: String(c.name ?? id),
        description: String(c.description_zh ?? c.description ?? '').replace(/\s+/g, ' ').slice(0, 300),
        examples: Array.isArray(c.examples_zh) ? c.examples_zh.map(String).slice(0, 4) : [],
        source: 'connector',
        server,
        needs,
      })
    }
  } catch (error) {
    console.error('[市场] 读取连接器清单失败:', error)
  }
  connectorCache = { root: workbuddyRoot, list }
  return list
}

export async function searchMcpRegistry(q = '', cursor = ''): Promise<{ list: MarketMcpEntry[]; next: string }> {
  const u = new URL('https://registry.modelcontextprotocol.io/v0/servers')
  u.searchParams.set('limit', '40')
  u.searchParams.set('version', 'latest')
  if (q) u.searchParams.set('search', q)
  if (cursor) u.searchParams.set('cursor', cursor)
  const f = await http()
  const r = await f(u.toString(), { signal: AbortSignal.timeout(20000) })
  if (!r.ok) throw new Error(`MCP 注册表返回 ${r.status}`)
  const j = await r.json() as { servers?: Array<Record<string, any>>; metadata?: { nextCursor?: string } }
  const list: MarketMcpEntry[] = []
  for (const it of j.servers ?? []) {
    const s = (it.server ?? it) as Record<string, any>
    const needs: string[] = []
    let server: MarketMcpEntry['server']
    const rem = (s.remotes ?? []).find((x: any) => /streamable-http|sse/.test(String(x.type ?? '')))
    const pkg = (s.packages ?? []).find((p: any) => p.registryType === 'npm' || p.registryType === 'pypi')
    if (rem?.url && !/\{/.test(rem.url)) {
      const hs = (rem.headers ?? []).filter((h: any) => h.isRequired)
      server = { type: rem.type === 'sse' ? 'sse' : 'http', url: rem.url, headers: hs.length ? Object.fromEntries(hs.map((h: any) => [h.name, ''])) : undefined }
      needs.push(...hs.map((h: any) => `${h.name}${h.description ? `（${h.description}）` : ''}`))
    } else if (pkg) {
      const ev = (pkg.environmentVariables ?? []).filter((e: any) => e.isRequired)
      server = pkg.registryType === 'npm'
        ? { type: 'stdio', command: 'npx', args: ['-y', pkg.version ? `${pkg.identifier}@${pkg.version}` : pkg.identifier] }
        : { type: 'stdio', command: 'uvx', args: [pkg.identifier] }
      if (ev.length) server.env = Object.fromEntries(ev.map((e: any) => [e.name, '']))
      needs.push(...ev.map((e: any) => `${e.name}${e.description ? `（${e.description}）` : ''}`))
      if ((pkg.packageArguments ?? []).some((a: any) => a.isRequired)) needs.push('还要填启动参数，见项目主页')
    }
    if (!server) continue
    const id = String(s.name ?? '')
    list.push({
      id,
      name: String(s.title || id.split('/').pop() || 'mcp'),
      description: String(s.description ?? '').slice(0, 300),
      examples: [],
      source: 'registry',
      server,
      needs,
      home: s.websiteUrl || s.repository?.url || '',
    })
  }
  return { list, next: j.metadata?.nextCursor ?? '' }
}

/** 把 MCP 名字变成工作区配置里可用的键 */
export function mcpServerKey(entry: Pick<MarketMcpEntry, 'id'>): string {
  return entry.id.split('/').pop()!.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 40) || 'mcp'
}


// ─── 本机其他软件的技能和 MCP（WorkBuddy / CodeBuddy / ZCode） ───
//
// 运行时直接读用户电脑上的目录，不打进安装包。
// 技能：只读列出，安装时复制到当前项目；正文点开时再读，避免一次传几千份正文。
// MCP：导入时把已经填好的 Key / Token / 密码全部清空，标成「要填 Key」，密钥不会复制进 Roy。

export interface AppSource { key: string; name: string; root: string; exists: boolean }

export function getAppSources(): AppSource[] {
  const h = homedir()
  return [
    { key: 'workbuddy', name: 'WorkBuddy（本机）', root: join(h, '.workbuddy') },
    { key: 'workbuddy-lib', name: 'WorkBuddy 技能库', root: join(h, 'WorkBuddy') },
    { key: 'codebuddy', name: 'CodeBuddy（本机）', root: join(h, '.codebuddy') },
    { key: 'zcode', name: 'ZCode（本机）', root: join(h, '.zcode') },
  ].map((s) => ({ ...s, exists: existsSync(s.root) }))
}

const SKIP_DIR = /^(node_modules|\.git|\.cache|cache|logs?|tmp|temp|__pycache__|\.venv|venv|dist|build)$/i

async function walkAsync(root: string, onDir: (dir: string, files: string[]) => boolean | void, maxDepth = 8): Promise<void> {
  const { readdir } = await import('node:fs/promises')
  const queue: Array<[string, number]> = [[root, 0]]
  let visited = 0
  while (queue.length) {
    const [dir, depth] = queue.shift()!
    if (++visited > 60000) break
    let entries: import('node:fs').Dirent[]
    try { entries = await readdir(dir, { withFileTypes: true }) } catch { continue }
    const files = entries.filter((e) => e.isFile()).map((e) => e.name)
    if (onDir(dir, files) === false) continue
    if (depth >= maxDepth) continue
    for (const e of entries) {
      if (!e.isDirectory() || SKIP_DIR.test(e.name) || e.name.includes('.tmp')) continue
      queue.push([join(dir, e.name), depth + 1])
    }
  }
}

const appSkillCache = new Map<string, { at: number; list: MarketSkillEntry[] }>()

export async function listAppSkills(key: string, refresh = false): Promise<MarketSkillEntry[]> {
  const src = getAppSources().find((s) => s.key === key)
  if (!src) throw new Error('未知的本机来源')
  if (!src.exists) return []
  const hit = appSkillCache.get(key)
  if (!refresh && hit && Date.now() - hit.at < 300_000) return hit.list
  const dirs: string[] = []
  await walkAsync(src.root, (dir, files) => {
    if (files.includes('SKILL.md')) { dirs.push(dir); return false }
    return true
  })
  const { readFile } = await import('node:fs/promises')
  const list: MarketSkillEntry[] = []
  const seen = new Set<string>()
  const queue = [...dirs]
  await Promise.all(Array.from({ length: 16 }, async () => {
    for (let dir = queue.shift(); dir !== undefined; dir = queue.shift()) {
      try {
        const { meta } = parseSkillFrontmatter((await readFile(join(dir, 'SKILL.md'), 'utf-8')).slice(0, 8000))
        const m = meta as Record<string, string | undefined>
        const name = (meta.name ?? '').trim() || basename(dir)
        const k = name.toLowerCase()
        if (seen.has(k)) continue
        seen.add(k)
        const rel = relative(src.root, dir).split(sep)
        const zhDesc = m.description_zh
        list.push({
          slug: `app:${key}:${rel.join('/')}`,
          name,
          description: ((zhDesc && /[\u4e00-\u9fff]/.test(zhDesc) ? zhDesc : meta.description) ?? '').replace(/\s+/g, ' ').trim().slice(0, 400),
          version: (meta.version ?? '').trim(), author: (meta.author ?? '').trim(), license: (meta.license ?? '').trim(),
          fileCount: 0, source: 'builtin', collection: src.name,
          group: rel.length > 2 ? rel[rel.length - 3] ?? '' : '',
          body: '',
        })
      } catch { /* 读不到就跳过 */ }
    }
  }))
  list.sort((a, b) => a.name.localeCompare(b.name))
  appSkillCache.set(key, { at: Date.now(), list })
  return list
}

function resolveAppSkillDir(slug: string): string {
  const m = slug.match(/^app:([a-z-]+):([^]*)$/)
  if (!m) throw new Error('本机技能标识不合法')
  const src = getAppSources().find((s) => s.key === m[1])
  if (!src || !src.exists) throw new Error('这个本机来源不存在了')
  const dir = normalize(join(src.root, ...m[2]!.split('/')))
  if (!isInside(dir, src.root) || dir.includes('.tmp')) throw new Error('技能位置不合法')
  if (!existsSync(join(dir, 'SKILL.md'))) throw new Error('这个技能缺少 SKILL.md')
  const real = realpathSync(dir)
  if (!isInside(real, realpathSync(src.root))) throw new Error('技能目录越界')
  return real
}

/** 点开详情时再读正文（本机来源列表里不带正文） */
export async function readMarketSkillBody(workbuddyRoot: string, slug: string): Promise<string> {
  const dir = slug.startsWith('app:') ? resolveAppSkillDir(slug) : resolveMarketSkillDir(workbuddyRoot, slug).dir
  const { readFile } = await import('node:fs/promises')
  return parseSkillFrontmatter(await readFile(join(dir, 'SKILL.md'), 'utf-8')).body.slice(0, 20000)
}

const SECRET_KEY = /key|token|secret|passw|pwd|auth|cookie|session|credential|bearer|access|private/i
const SECRET_VAL = /^(sk-|ghp_|gho_|github_pat_|xox[bp]-|AKIA|eyJ)|^[A-Za-z0-9_\-.]{24,}$/

/** 清掉配置里已经填好的密钥：值清空，键名记进 needs */
function scrubServer(raw: Record<string, unknown>): { server?: Omit<McpServerEntry, 'enabled'>; needs: string[] } {
  const needs: string[] = []
  const clean = (obj: unknown): Record<string, string> | undefined => {
    if (!obj || typeof obj !== 'object') return undefined
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const s = String(v ?? '')
      if (HAS_PLACEHOLDER.test(s) || SECRET_KEY.test(k) || SECRET_VAL.test(s.replace(/^Bearer\s+/i, ''))) {
        out[k] = ''
        needs.push(k)
      } else out[k] = s
    }
    return out
  }
  const t = String(raw.type ?? '').toLowerCase()
  if (typeof raw.command === 'string') {
    const args = (Array.isArray(raw.args) ? raw.args.map(String) : []).map((a, i, arr) => {
      const prev = arr[i - 1] ?? ''
      if (/^--?[\w-]*(key|token|secret|password)[\w-]*=/i.test(a)) { needs.push(a.split('=')[0]!); return `${a.split('=')[0]}=` }
      if (/^--?[\w-]*(key|token|secret|password)[\w-]*$/i.test(prev) || SECRET_VAL.test(a)) { if (!needs.includes(prev)) needs.push(prev || '启动参数里的密钥'); return '' }
      return a
    })
    return { server: { type: 'stdio', command: raw.command, args, env: clean(raw.env) }, needs }
  }
  const url = String(raw.url ?? raw.serverUrl ?? raw.httpUrl ?? '')
  if (!/^https?:\/\//i.test(url)) return { needs }
  let safeUrl = url
  try {
    const u = new URL(url)
    for (const p of [...u.searchParams.keys()]) if (SECRET_KEY.test(p) || SECRET_VAL.test(u.searchParams.get(p) ?? '')) { u.searchParams.set(p, ''); needs.push(`网址参数 ${p}`) }
    if (u.username || u.password) { u.username = ''; u.password = ''; needs.push('网址里的账号密码') }
    safeUrl = u.toString()
  } catch { return { needs } }
  return { server: { type: t === 'sse' ? 'sse' : 'http', url: safeUrl, headers: clean(raw.headers) }, needs }
}

const appMcpCache = new Map<string, { at: number; list: MarketMcpEntry[] }>()

export async function listAppMcp(refresh = false): Promise<MarketMcpEntry[]> {
  const hit = appMcpCache.get('all')
  if (!refresh && hit && Date.now() - hit.at < 300_000) return hit.list
  const { readFile } = await import('node:fs/promises')
  const list: MarketMcpEntry[] = []
  const seen = new Set<string>()
  for (const src of getAppSources()) {
    if (!src.exists) continue
    const files: string[] = []
    await walkAsync(src.root, (dir, fs) => {
      for (const f of fs) if (/^(\.?mcp|mcp_settings|mcp-config|mcp_config)\.json$/i.test(f)) files.push(join(dir, f))
    }, 7)
    for (const file of files) {
      let servers: Record<string, Record<string, unknown>> = {}
      try {
        const j = JSON.parse(await readFile(file, 'utf-8')) as Record<string, unknown>
        servers = (j.mcpServers ?? j.servers ?? {}) as Record<string, Record<string, unknown>>
      } catch { continue }
      if (!servers || typeof servers !== 'object') continue
      for (const [name, raw] of Object.entries(servers)) {
        if (!raw || typeof raw !== 'object') continue
        const { server, needs } = scrubServer(raw)
        if (!server) continue
        const sig = server.type === 'stdio' ? `${name}|${server.command}|${(server.args ?? []).join(' ')}` : `${name}|${server.url}`
        if (seen.has(sig.toLowerCase())) continue
        seen.add(sig.toLowerCase())
        const desc = String((raw as Record<string, unknown>).description ?? '')
        list.push({
          id: `${src.key}/${name}`,
          name,
          description: desc.slice(0, 300) || `来自 ${src.name} 的配置：${relative(src.root, file).split(sep).slice(0, 3).join('/')}`,
          examples: [],
          source: 'local',
          origin: src.name,
          server,
          needs: [...new Set(needs)],
        })
      }
    }
  }
  list.sort((a, b) => a.name.localeCompare(b.name))
  appMcpCache.set('all', { at: Date.now(), list })
  return list
}
