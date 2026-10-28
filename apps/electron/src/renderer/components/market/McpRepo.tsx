/**
 * MCP 市场 →「仓库」：所有能加的 MCP 放进一个仓库，用户自己筛选
 *
 * - 来源：Roy MCP 仓库（随包，用 Roy 自带运行环境）/ 本机软件（WorkBuddy、CodeBuddy、ZCode 里配过的，密钥已清空）/ 官方 MCP 注册表（在线搜索、分页）
 * - 筛选：搜索、来源、只看免 Key、只看没加的
 * - 本机和 Roy 仓库在本地搜；官方注册表停止输入 0.5 秒后去服务器搜
 * - 同一个标识只留一份（Roy 仓库优先）；添加后先保持停用，填好 Key 后在「已安装」里打开
 */

import React from 'react'
import { toast } from 'sonner'
import { Check, ChevronDown, ExternalLink, KeyRound, Loader2, RotateCw, Search, X } from 'lucide-react'
import { Loading } from '@/components/ui/Loading'
import { cachedLoad } from '@/lib/load-cache'
import { cn } from '@/lib/utils'
import type { McpServerEntry } from '@roy/shared'
import { AppIcon } from './app-icons'
import { addMcpToWorkspace } from './MarketPicks'
import { addRoyMcp, royMcpKey } from './RoyMarket'

export type McpRepoSource = 'all' | 'roy' | 'local' | 'registry'

type Entry = Awaited<ReturnType<typeof window.electronAPI.getMarketAppMcp>>[number]
type RoyCatalog = Awaited<ReturnType<typeof window.electronAPI.getRoyMarket>>
type RMcp = RoyCatalog['mcp'][number]

interface Row {
  key: string
  source: Exclude<McpRepoSource, 'all'>
  origin: string
  name: string
  id: string
  desc: string
  needs: string[]
  remote: boolean
  run: string
  examples: string[]
  note?: string
  home?: string
  roy?: RMcp
  entry?: Entry
}

const SOURCE_LABEL: Record<Exclude<McpRepoSource, 'all'>, string> = { roy: 'Roy MCP 仓库', local: '本机软件', registry: '官方注册表' }
const errText = (e: unknown): string => String(e instanceof Error ? e.message : e).replace(/^Error invoking remote method '[^']*':\s*(Error:\s*)?/, '')

function runOf(server?: { type?: string; command?: string; args?: string[]; url?: string }): string {
  if (!server) return ''
  if (server.type === 'stdio') return [server.command, ...(server.args ?? [])].join(' ').replace(/\$\{ROY_NODE\}/g, 'Roy 自带运行环境').replace(/\$\{ROY_MCP\}/g, '…')
  return server.url ?? ''
}

const fromEntry = (x: Entry, source: Row['source']): Row => ({
  key: `${source}:${x.id}`, source, origin: source === 'local' ? (x.origin ?? SOURCE_LABEL.local) : SOURCE_LABEL.registry,
  name: x.name, id: x.id, desc: x.description || '暂无说明', needs: x.needs, remote: x.server?.type !== 'stdio',
  run: runOf(x.server), examples: x.examples, home: x.home, entry: x,
})

export function McpRepo({ workspaceSlug, added, installedSkills, onChanged }: {
  workspaceSlug: string; added: Record<string, McpServerEntry>; installedSkills: Set<string>; onChanged: () => void
}): React.ReactElement {
  const [source, setSource] = React.useState<McpRepoSource>('all')
  const [q0, setQ] = React.useState('')
  const q = React.useDeferredValue(q0.trim().toLowerCase())
  const [onlyFree, setOnlyFree] = React.useState(false)
  const [onlyNew, setOnlyNew] = React.useState(false)
  const [open, setOpen] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState('')
  const [limit, setLimit] = React.useState(80)

  const [roy, setRoy] = React.useState<Row[] | null>(null)
  const [local, setLocal] = React.useState<Row[] | null>(null)
  const [registry, setRegistry] = React.useState<Row[] | null>(null)
  const [next, setNext] = React.useState('')
  const [registryBusy, setRegistryBusy] = React.useState(false)
  const [errs, setErrs] = React.useState<Record<string, string>>({})
  const serial = React.useRef(0)

  const loadLocal = React.useCallback((refresh = false) => {
    cachedLoad('mcp:app', () => window.electronAPI.getMarketAppMcp(refresh), refresh, 300000)
      .then((l) => { setLocal(l.filter((x) => x.server).map((x) => fromEntry(x, 'local'))); setErrs((e) => ({ ...e, local: '' })) })
      .catch((e) => { setLocal([]); setErrs((x) => ({ ...x, local: `本机软件：${errText(e)}` })) })
  }, [])

  const loadRegistry = React.useCallback(async (query: string, cursor = '') => {
    const request = ++serial.current
    setRegistryBusy(true)
    try {
      // 走代理时第一次连官方注册表偶尔直接断开，自动再试一次，免得一打开就报错
      const r = await window.electronAPI.searchMcpRegistry(query, cursor)
        .catch(() => new Promise<Awaited<ReturnType<typeof window.electronAPI.searchMcpRegistry>>>((resolve, reject) => {
          window.setTimeout(() => { window.electronAPI.searchMcpRegistry(query, cursor).then(resolve, reject) }, 1500)
        }))
      if (request !== serial.current) return
      const rows = r.list.filter((x) => x.server).map((x) => fromEntry(x, 'registry'))
      setRegistry((old) => (cursor && old ? [...new Map([...old, ...rows].map((x) => [x.key, x])).values()] : rows))
      setNext(r.next)
      setErrs((e) => ({ ...e, registry: '' }))
    } catch (e) {
      if (request === serial.current) { setRegistry((old) => old ?? []); setErrs((x) => ({ ...x, registry: `官方注册表：${errText(e)}` })) }
    } finally {
      if (request === serial.current) setRegistryBusy(false)
    }
  }, [])

  React.useEffect(() => {
    let alive = true
    cachedLoad<RoyCatalog>('roy:market', () => window.electronAPI.getRoyMarket(), false, 600000)
      .then((c) => {
        if (!alive) return
        setRoy(c.mcp.map((m) => ({
          key: `roy:${m.id}`, source: 'roy', origin: SOURCE_LABEL.roy, name: m.name, id: m.id, desc: m.description,
          needs: m.needs, remote: m.server.type !== 'stdio', run: runOf(m.server), examples: [], note: m.note,
          roy: m,
        })))
      })
      .catch((e) => { if (alive) { setRoy([]); setErrs((x) => ({ ...x, roy: `Roy MCP 仓库：${errText(e)}` })) } })
    loadLocal()
    return () => { alive = false }
  }, [loadLocal])

  // 官方注册表在服务器上搜：停止输入 0.5 秒后再请求
  const wantRegistry = source === 'all' || source === 'registry'
  React.useEffect(() => {
    if (!wantRegistry) return
    const t = window.setTimeout(() => void loadRegistry(q0.trim()), registry === null ? 0 : 500)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantRegistry, q0, loadRegistry])

  const isAdded = React.useCallback((r: Row) => !!added[royMcpKey(r.id)], [added])

  const list = React.useMemo(() => {
    const seen = new Set<string>()
    const out: Row[] = []
    for (const r of [...(roy ?? []), ...(local ?? []), ...(registry ?? [])]) {
      const k = royMcpKey(r.id).toLowerCase()
      if (seen.has(k)) continue
      seen.add(k)
      out.push(r)
    }
    return out.filter((r) => (source === 'all' || r.source === source)
      && (!onlyFree || r.needs.length === 0)
      && (!onlyNew || !isAdded(r))
      // 注册表的结果已经按关键词在服务器搜过，不再本地过滤
      && (r.source === 'registry' || !q || `${r.name} ${r.id} ${r.desc} ${r.origin}`.toLowerCase().includes(q)))
  }, [roy, local, registry, source, onlyFree, onlyNew, q, isAdded])
  React.useEffect(() => { setLimit(80) }, [source, onlyFree, onlyNew, q])

  const add = async (r: Row): Promise<void> => {
    setBusy(r.key)
    try {
      const ok = r.roy
        ? await addRoyMcp(workspaceSlug, added, r.roy, !!r.roy.skill && installedSkills.has(r.roy.skill.toLowerCase()))
        : r.entry ? await addMcpToWorkspace(workspaceSlug, added, r.entry) : false
      if (ok) onChanged()
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setBusy('')
    }
  }

  const refresh = (): void => {
    loadLocal(true)
    if (wantRegistry) void loadRegistry(q0.trim())
  }

  const loading = roy === null || local === null || (wantRegistry && registry === null)
  const errList = Object.values(errs).filter(Boolean)
  const select = 'h-8 rounded-lg border border-border bg-background px-2 text-[12.5px] text-foreground/75 outline-none'

  return (
    <div className="roy-page-enter flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 space-y-2.5 px-6 pb-3 pt-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex h-8 min-w-[240px] flex-1 items-center gap-2 rounded-lg border border-border bg-background px-2.5 focus-within:border-foreground/30">
            <Search size={14} className="shrink-0 text-foreground/40" />
            <input value={q0} onChange={(e) => setQ(e.target.value)} placeholder="搜 MCP：名字、用途（官方注册表用英文关键词更准）" className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-foreground/35" />
            {q0 && <button type="button" onClick={() => setQ('')} className="text-foreground/40 hover:text-foreground"><X size={13} /></button>}
          </label>
          <select value={source} onChange={(e) => setSource(e.target.value as McpRepoSource)} className={select}>
            <option value="all">全部来源</option>
            <option value="roy">{SOURCE_LABEL.roy}（{roy?.length ?? 0}）</option>
            <option value="local">{SOURCE_LABEL.local}（{local?.length ?? 0}）</option>
            <option value="registry">{SOURCE_LABEL.registry}</option>
          </select>
          <label className="flex h-8 cursor-pointer items-center gap-1.5 px-1 text-[12.5px] text-foreground/65">
            <input type="checkbox" checked={onlyFree} onChange={(e) => setOnlyFree(e.target.checked)} className="accent-foreground" />只看免 Key
          </label>
          <label className="flex h-8 cursor-pointer items-center gap-1.5 px-1 text-[12.5px] text-foreground/65">
            <input type="checkbox" checked={onlyNew} onChange={(e) => setOnlyNew(e.target.checked)} className="accent-foreground" />只看没装的
          </label>
          <button type="button" disabled={registryBusy} onClick={refresh} className="flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[12.5px] text-foreground/70 hover:bg-foreground/[0.04] disabled:opacity-50">
            <RotateCw size={13} className={registryBusy ? 'animate-spin' : ''} />刷新
          </button>
        </div>
        <div className="flex items-center gap-3 text-[12.5px] text-foreground/45">
          <span>共 {list.length} 个 MCP{wantRegistry && next ? '（官方注册表还有更多，翻到底加载）' : ''}</span>
          {registryBusy && registry !== null && <Loading compact text="正在搜官方注册表" />}
        </div>
        {(source === 'local' || source === 'all') && <div className="text-[12px] text-foreground/45">本机软件里的 MCP 配置已清空 Key、Token、密码，添加后要自己重新填。添加的 MCP 先保持停用，检查后在「已安装」里打开。</div>}
        {errList.length > 0 && (
          <div role="alert" className="rounded-lg border border-destructive/20 bg-destructive/[0.04] px-3 py-2 text-[12.5px] text-destructive">
            {errList.map((e) => <div key={e}>{e}</div>)}
            <div className="mt-1 text-foreground/50">其他来源照常显示；检查网络或代理后点「刷新」重试。</div>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-8">
        {loading && list.length === 0 ? (
          <Loading text="正在读取 MCP 仓库" />
        ) : list.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border py-16 text-center text-[13px] text-foreground/45">{q0 ? '没搜到' : '没有符合条件的 MCP'}</div>
        ) : (
          <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border bg-background">
            {list.slice(0, limit).map((r, i) => {
              const done = isAdded(r)
              const expanded = open === r.key
              return (
                <div key={r.key}>
                  <div role="button" tabIndex={0} onClick={() => setOpen(expanded ? null : r.key)} onKeyDown={(e) => { if (e.key === 'Enter') setOpen(expanded ? null : r.key) }} className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-foreground/[0.025]">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-foreground/[0.05] text-[11.5px] tabular-nums text-foreground/50">{i + 1}</span>
                    <AppIcon name={`${r.id} ${r.name}`} category="MCP" size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-baseline gap-2">
                        <span className="truncate text-[14px] font-medium">{r.name}</span>
                        {r.name !== r.id && <span className="truncate font-mono text-[11.5px] text-foreground/40">{r.id}</span>}
                      </div>
                      <p className="mt-0.5 line-clamp-1 text-[12.5px] leading-5 text-foreground/55" title={r.desc}>{r.desc}</p>
                      <div className="mt-1 flex flex-wrap gap-1 text-[11px] text-foreground/50">
                        <span className="rounded-full bg-foreground/[0.05] px-2 py-px">{r.origin}</span>
                        <span className="rounded-full bg-foreground/[0.05] px-2 py-px">{r.remote ? '远程服务' : '本机运行'}</span>
                        {r.needs.length > 0
                          ? <span className="flex items-center gap-0.5 rounded-full bg-amber-500/10 px-2 py-px text-amber-700 dark:text-amber-400"><KeyRound size={10} />要填 Key / 授权</span>
                          : <span className="rounded-full bg-emerald-500/10 px-2 py-px text-emerald-700 dark:text-emerald-400">免 Key</span>}
                      </div>
                    </div>
                    {done ? (
                      <span className="flex shrink-0 items-center gap-1 text-[12.5px] text-emerald-600 dark:text-emerald-400"><Check size={13} />已安装</span>
                    ) : (
                      <button type="button" disabled={!!busy} onClick={(e) => { e.stopPropagation(); void add(r) }} className="flex h-7 shrink-0 items-center gap-1 rounded-lg bg-emerald-600 px-3 text-[12.5px] font-medium text-white hover:bg-emerald-700 disabled:opacity-60">
                        {busy === r.key && <Loader2 size={12} className="animate-spin" />}{busy === r.key ? '添加中' : '添加'}
                      </button>
                    )}
                    <ChevronDown size={15} className={cn('shrink-0 text-foreground/35 transition-transform', expanded && 'rotate-180')} />
                  </div>
                  {expanded && (
                    <div className="space-y-2 border-t border-border/50 bg-foreground/[0.015] px-4 py-3 pl-[76px] text-[12.5px] text-foreground/70">
                      <p className="leading-6">{r.desc}</p>
                      {r.note && <div>说明：{r.note}</div>}
                      {r.examples.length > 0 && (
                        <div>
                          <div className="mb-1 text-[11.5px] text-foreground/45">可以这样用</div>
                          <ul className="space-y-1">{r.examples.map((ex) => <li key={ex} className="rounded-md bg-foreground/[0.04] px-2.5 py-1">{ex}</li>)}</ul>
                        </div>
                      )}
                      {r.needs.length > 0 && <div><span className="text-foreground/45">需要填：</span>{r.needs.join('；')}</div>}
                      <div className="break-all font-mono text-[11.5px] text-foreground/50">{r.run}</div>
                      {r.home && <button type="button" onClick={(e) => { e.stopPropagation(); void window.electronAPI.openExternal?.(r.home!) }} className="inline-flex items-center gap-1 text-foreground/60 underline-offset-2 hover:underline"><ExternalLink size={12} />项目主页</button>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
        {limit < list.length && (
          <button type="button" onClick={() => setLimit((n) => n + 80)} className="mx-auto mt-4 block rounded-lg border border-border px-4 py-1.5 text-[12.5px] text-foreground/70 hover:bg-foreground/[0.04]">再显示 80 个（还剩 {list.length - limit} 个）</button>
        )}
        {wantRegistry && next && limit >= list.length && (
          <button type="button" disabled={registryBusy} onClick={() => void loadRegistry(q0.trim(), next)} className="mx-auto mt-4 block rounded-lg border border-border px-4 py-1.5 text-[12.5px] text-foreground/70 hover:bg-foreground/[0.04] disabled:opacity-50">{registryBusy ? '正在加载…' : '加载官方注册表下一页'}</button>
        )}
      </div>
    </div>
  )
}
