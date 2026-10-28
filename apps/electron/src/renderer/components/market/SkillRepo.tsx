/**
 * 技能市场 →「仓库」：所有能装的技能放进一个仓库，用户自己筛选
 *
 * - 来源：Roy 技能仓库（随包）/ 在线合集（WorkBuddy、本机软件、GitHub 合集，可再细分到某个合集、加自定义合集）/ ZCode 官方插件
 * - 筛选：搜索、来源、分类、只看没装的、推荐 / 名称排序
 * - 同名技能只留一份（Roy 仓库优先）；ZCode 只列 Roy 能用、和 Roy 不重复的插件（见 ZcodePlugins zcodeListed）
 * - 在线合集同时最多读 4 个，读到一个先显示一个
 */

import React from 'react'
import { toast } from 'sonner'
import { Check, ChevronDown, Loader2, Plus, RotateCw, Search, Trash2, X } from 'lucide-react'
import { Loading } from '@/components/ui/Loading'
import { cachedLoad } from '@/lib/load-cache'
import { localizeSkill } from '@/lib/skill-zh'
import { cn } from '@/lib/utils'
import type { MarketSkillEntry } from '@roy/shared'
import { categoryOf, SkillIconTile } from './SkillMarket'
import { installZcodePluginWithMcp, zcodeListed, type ZcodePlugin } from './ZcodePlugins'

export type RepoSource = 'all' | 'roy' | 'market' | 'zcode'

type RoyCatalog = Awaited<ReturnType<typeof window.electronAPI.getRoyMarket>>
type RemoteSource = { repo: string; name: string; desc: string; custom?: boolean }
type AppSource = { key: string; name: string; exists: boolean }

interface Row {
  key: string
  source: Exclude<RepoSource, 'all'>
  /** 显示在标签上的来源（在线合集里是具体合集名） */
  origin: string
  title: string
  name: string
  desc: string
  category: string
  /** 判断装没装用的名字（小写） */
  match: string[]
  /** 安装 / 读 SKILL.md 用：Roy 是 roy:slug，在线合集是 slug，ZCode 是插件名 */
  id: string
  body?: string
  meta: string[]
  plugin?: ZcodePlugin
}

const SOURCE_LABEL: Record<Exclude<RepoSource, 'all'>, string> = { roy: 'Roy 技能仓库', market: '在线合集', zcode: 'ZCode 官方' }
/** ZCode 的分类对到技能仓库的分类 */
const ZCODE_CATEGORY: Record<string, string> = { 开发者工具: '写代码', 金融: '金融', '游戏/3D': '设计创作' }
const ALL_COLL = '__all'

const errText = (e: unknown): string => String(e instanceof Error ? e.message : e).replace(/^Error invoking remote method '[^']*':\s*(Error:\s*)?/, '')
const hasZh = (text: string): boolean => /[一-鿿]/.test(text)

function Body({ id, body }: { id: string; body?: string }): React.ReactElement {
  const [text, setText] = React.useState<string | null>(body?.trim() ? body : null)
  React.useEffect(() => {
    if (body?.trim() || id.startsWith('remote:')) { setText(body ?? ''); return }
    let alive = true
    window.electronAPI.getMarketSkillBody(id).then((t) => { if (alive) setText(t) }).catch((e) => { if (alive) setText(`读取失败：${errText(e)}`) })
    return () => { alive = false }
  }, [id, body])
  if (text === null) return <Loading compact text="正在读 SKILL.md" />
  return (
    <pre className="max-h-[420px] overflow-y-auto overscroll-contain whitespace-pre-wrap break-words font-sans text-[12.5px] leading-6 text-foreground/70">
      {text.trim() || '这个技能的 SKILL.md 没有正文'}
    </pre>
  )
}

export function SkillRepo({ workspaceSlug, installedNames, onChanged, initialSource = 'all' }: {
  workspaceSlug: string; installedNames: Set<string>; onChanged: () => void; initialSource?: RepoSource
}): React.ReactElement {
  const [source, setSource] = React.useState<RepoSource>(initialSource)
  React.useEffect(() => { setSource(initialSource) }, [initialSource])
  const [coll, setColl] = React.useState(ALL_COLL)
  const [q0, setQ] = React.useState('')
  const q = React.useDeferredValue(q0.trim().toLowerCase())
  const [cat, setCat] = React.useState('全部')
  const [sort, setSort] = React.useState<'rec' | 'name'>('rec')
  const [onlyNew, setOnlyNew] = React.useState(false)
  const [open, setOpen] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState('')
  const [limit, setLimit] = React.useState(80)
  const [adding, setAdding] = React.useState('')

  // ── 三个来源各自加载，互不等待 ──
  const [roy, setRoy] = React.useState<Row[] | null>(null)
  const [zcode, setZcode] = React.useState<Row[] | null>(null)
  const [market, setMarket] = React.useState<Row[] | null>(null)
  const [progress, setProgress] = React.useState<{ done: number; total: number } | null>(null)
  const [errs, setErrs] = React.useState<string[]>([])
  const [remotes, setRemotes] = React.useState<RemoteSource[]>([])
  const [apps, setApps] = React.useState<AppSource[]>([])
  const [sourcesReady, setSourcesReady] = React.useState(false)
  const reqId = React.useRef(0)

  /** ZCode 插件清单；装完要重读：不在本机的插件下载后才知道里面有哪些技能 */
  const loadZcode = React.useCallback((alive: () => boolean = () => true) => {
    window.electronAPI.getZcodePlugins()
      .then((d) => {
        if (!alive()) return
        setZcode(d.available ? d.list.filter(zcodeListed).map((p) => ({
          key: `zcode:${p.name}`, source: 'zcode', origin: SOURCE_LABEL.zcode,
          title: p.title, name: p.name, desc: p.description || '暂无说明',
          category: ZCODE_CATEGORY[p.category] ?? categoryOf({ slug: p.name, name: p.title, description: p.description } as MarketSkillEntry),
          match: p.skillNames.map((n) => n.toLowerCase()), id: p.name,
          meta: [p.paid ? 'ZCode 编程套餐' : '', p.mcpCount ? `带 ${p.mcpCount} 个 MCP` : '', p.where === 'download' ? '需下载' : '', p.note ?? ''].filter(Boolean),
          plugin: p,
        })) : [])
      })
      .catch(() => { if (alive()) setZcode((old) => old ?? []) })
  }, [])

  React.useEffect(() => {
    let alive = true
    cachedLoad<RoyCatalog>('roy:market', () => window.electronAPI.getRoyMarket(), false, 600000)
      .then((c) => {
        if (!alive) return
        setRoy(c.skills.map((s) => ({
          key: `roy:${s.slug}`, source: 'roy', origin: SOURCE_LABEL.roy,
          title: s.featured?.zh ?? s.name, name: s.slug, desc: s.featured?.desc ?? s.description,
          category: s.category === '数据与科研' ? '数据分析' : s.category === '效率与产品' ? '知识与学习' : s.category,
          match: [s.slug.toLowerCase(), s.name.toLowerCase()], id: `roy:${s.slug}`,
          meta: [s.license, s.note ?? ''].filter(Boolean),
        })))
      })
      .catch((e) => { if (alive) { setRoy([]); setErrs((x) => [...x, `Roy 技能仓库：${errText(e)}`]) } })
    loadZcode(() => alive)
    void Promise.all([
      window.electronAPI.getMarketRemoteSources().then(setRemotes).catch(() => setRemotes([])),
      window.electronAPI.getMarketAppSources().then((l) => setApps(l.filter((x) => x.exists))).catch(() => setApps([])),
    ]).finally(() => { if (alive) setSourcesReady(true) })
    return () => { alive = false }
  }, [loadZcode])

  const loadMarket = React.useCallback(async (refresh = false) => {
    const id = ++reqId.current
    setErrs((x) => x.filter((e) => e.startsWith('Roy 技能仓库')))
    const toRows = (l: MarketSkillEntry[], origin: (s: MarketSkillEntry) => string): Row[] => l.map((s) => {
      const zh = localizeSkill({ slug: s.slug, name: s.name, description: s.description })
      return {
        key: `market:${s.slug}`, source: 'market', origin: origin(s),
        title: zh.title, name: s.name, desc: zh.desc, category: categoryOf(s),
        match: [s.name.toLowerCase()], id: s.slug, body: s.body,
        meta: [s.version ? `v${s.version}` : '', s.license ?? '', s.fileCount > 0 ? `${s.fileCount} 个文件` : ''].filter(Boolean),
      }
    })
    const tasks: Array<{ label: string; run: () => Promise<Row[]> }> = [
      { label: 'WorkBuddy 技能', run: () => cachedLoad<MarketSkillEntry[]>('skills:bundle', () => window.electronAPI.getMarketSkills(), refresh, 300000).then((l) => toRows(l, (s) => (s.collection === '本机已有' ? '本机已有' : 'WorkBuddy 技能'))) },
      ...apps.map((a) => ({ label: a.name, run: () => cachedLoad<MarketSkillEntry[]>('skills:app:' + a.key, () => window.electronAPI.getMarketAppSkills(a.key, refresh), refresh, 300000).then((l) => toRows(l, () => a.name)) })),
      ...remotes.map((r) => ({ label: r.name, run: () => cachedLoad<MarketSkillEntry[]>('skills:remote:' + r.repo, () => window.electronAPI.getMarketRemoteSkills(r.repo, refresh), refresh, 300000).then((l) => toRows(l, () => r.name)) })),
    ]
    setProgress({ done: 0, total: tasks.length })
    const got: Row[][] = []
    let done = 0
    const queue = [...tasks]
    const worker = async (): Promise<void> => {
      for (let t = queue.shift(); t; t = queue.shift()) {
        try { got.push(await t.run()) } catch (e) { if (id === reqId.current) setErrs((x) => [...x, `${t!.label}：${errText(e)}`]) }
        done++
        if (id !== reqId.current) return
        setProgress({ done, total: tasks.length })
        setMarket(got.flat())
      }
    }
    await Promise.all([1, 2, 3, 4].map(worker))
    if (id !== reqId.current) return
    setMarket(got.flat())
    setProgress(null)
  }, [apps, remotes])

  const sourceKey = remotes.map((r) => r.repo).join('|') + apps.map((a) => a.key).join('|')
  React.useEffect(() => {
    if (!sourcesReady) return
    void loadMarket()
    return () => { reqId.current++ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourcesReady, sourceKey])

  // ── 合并、去重、筛选 ──
  const merged = React.useMemo(() => {
    const seen = new Set<string>()
    const out: Row[] = []
    for (const r of [...(roy ?? []), ...(market ?? [])]) {
      const k = r.name.toLowerCase()
      if (seen.has(k)) continue
      seen.add(k)
      out.push(r)
    }
    return [...out, ...(zcode ?? [])]
  }, [roy, market, zcode])

  const origins = React.useMemo(() => [...new Set((market ?? []).map((r) => r.origin))], [market])
  const isInstalled = React.useCallback((r: Row) => r.match.length > 0 && (r.source === 'zcode' ? r.match.every((n) => installedNames.has(n)) : r.match.some((n) => installedNames.has(n))), [installedNames])

  const bySource = React.useMemo(() => merged.filter((r) => (source === 'all' || r.source === source) && (source !== 'market' || coll === ALL_COLL || r.origin === coll)), [merged, source, coll])
  const cats = React.useMemo(() => {
    const n = new Map<string, number>()
    for (const r of bySource) n.set(r.category, (n.get(r.category) ?? 0) + 1)
    return [...n].sort((a, b) => b[1] - a[1]).map(([c]) => c)
  }, [bySource])
  React.useEffect(() => { if (cat !== '全部' && !progress && !cats.includes(cat)) setCat('全部') }, [cats, cat, progress])
  React.useEffect(() => { setLimit(80) }, [source, coll, cat, q, onlyNew, sort])

  const list = React.useMemo(() => {
    const rank: Record<Row['source'], number> = { roy: 0, market: 1, zcode: 2 }
    const filtered = bySource.filter((r) => (cat === '全部' || r.category === cat)
      && (!onlyNew || !isInstalled(r))
      && (!q || `${r.title} ${r.name} ${r.desc} ${r.origin} ${r.category}`.toLowerCase().includes(q)))
    return sort === 'name'
      ? [...filtered].sort((a, b) => a.title.localeCompare(b.title, 'zh'))
      : [...filtered].sort((a, b) => rank[a.source] - rank[b.source] || Number(!hasZh(a.title + a.desc)) - Number(!hasZh(b.title + b.desc)))
  }, [bySource, cat, onlyNew, q, sort, isInstalled])

  const install = async (r: Row): Promise<void> => {
    if (!workspaceSlug) { toast.error('还没有可用项目，先建一个项目'); return }
    setBusy(r.key)
    try {
      if (r.plugin) {
        if (await installZcodePluginWithMcp(workspaceSlug, r.plugin)) { onChanged(); loadZcode() }
        return
      }
      await window.electronAPI.installMarketSkill(workspaceSlug, r.id)
      toast.success(`已安装「${r.title}」，在对话里输入 / 就能用`)
      onChanged()
    } catch (e) {
      const m = errText(e)
      toast.error(/已存在|AlreadyExists/i.test(m) ? `已经装过「${r.title}」` : `安装失败：${m}`)
    } finally {
      setBusy('')
    }
  }

  const addRemote = async (): Promise<void> => {
    const repo = adding.trim()
    if (!repo) return
    try {
      const next = await window.electronAPI.addMarketRemoteSource(repo)
      setRemotes(next)
      setAdding('')
      const added = next[next.length - 1]
      if (added) { setSource('market'); setColl(added.name) }
      toast.success('已加入合集，正在读取')
    } catch (e) {
      toast.error(errText(e))
    }
  }
  const customSel = remotes.find((r) => r.custom && r.name === coll)
  const removeRemote = async (r: RemoteSource): Promise<void> => {
    if (!window.confirm(`移除合集「${r.name}」？已经装好的技能不受影响。`)) return
    try { setRemotes(await window.electronAPI.removeMarketRemoteSource(r.repo)); setColl(ALL_COLL) } catch (e) { toast.error(errText(e)) }
  }

  const loading = roy === null || zcode === null || market === null
  const counts = { roy: roy?.length ?? 0, market: merged.filter((r) => r.source === 'market').length, zcode: zcode?.length ?? 0 }
  const select = 'h-8 rounded-lg border border-border bg-background px-2 text-[12.5px] text-foreground/75 outline-none'

  return (
    <div className="roy-page-enter flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 space-y-2.5 px-6 pb-3 pt-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex h-8 min-w-[240px] flex-1 items-center gap-2 rounded-lg border border-border bg-background px-2.5 focus-within:border-foreground/30">
            <Search size={14} className="shrink-0 text-foreground/40" />
            <input value={q0} onChange={(e) => setQ(e.target.value)} placeholder="搜技能：名字、说明、合集（中文英文都行）" className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-foreground/35" />
            {q0 && <button type="button" onClick={() => setQ('')} className="text-foreground/40 hover:text-foreground"><X size={13} /></button>}
          </label>
          <select value={source} onChange={(e) => { setSource(e.target.value as RepoSource); setColl(ALL_COLL) }} className={select}>
            <option value="all">全部来源</option>
            <option value="roy">{SOURCE_LABEL.roy}（{counts.roy}）</option>
            <option value="market">{SOURCE_LABEL.market}（{counts.market}）</option>
            <option value="zcode">{SOURCE_LABEL.zcode}（{counts.zcode}）</option>
          </select>
          {source === 'market' && (
            <select value={coll} onChange={(e) => setColl(e.target.value)} className={select} title="在线合集里再细分到某一个合集">
              <option value={ALL_COLL}>全部合集</option>
              {origins.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          )}
          {customSel && <button type="button" onClick={() => void removeRemote(customSel)} title="移除这个自定义合集" className="rounded-md p-1.5 text-foreground/45 hover:bg-destructive/10 hover:text-destructive"><Trash2 size={14} /></button>}
          <div className="flex h-8 items-center rounded-lg border border-border p-0.5">
            {([['rec', '推荐'], ['name', '名称']] as const).map(([id, label]) => (
              <button key={id} type="button" onClick={() => setSort(id)} className={cn('h-full rounded-md px-2.5 text-[12.5px]', sort === id ? 'bg-foreground/[0.08] font-medium text-foreground' : 'text-foreground/55 hover:text-foreground')}>{label}</button>
            ))}
          </div>
          <label className="flex h-8 cursor-pointer items-center gap-1.5 px-1 text-[12.5px] text-foreground/65">
            <input type="checkbox" checked={onlyNew} onChange={(e) => setOnlyNew(e.target.checked)} className="accent-foreground" />只看没装的
          </label>
          <button type="button" disabled={!!progress} onClick={() => void loadMarket(true)} className="flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[12.5px] text-foreground/70 hover:bg-foreground/[0.04] disabled:opacity-50">
            <RotateCw size={13} className={progress ? 'animate-spin' : ''} />刷新
          </button>
        </div>

        {cats.length > 1 && (
          <div className="flex flex-wrap items-center gap-1">
            {['全部', ...cats].map((c) => (
              <button key={c} type="button" onClick={() => setCat(c)} className={cn('rounded-md px-2.5 py-1 text-[12.5px]', cat === c ? 'bg-foreground/[0.08] font-medium text-foreground' : 'text-foreground/55 hover:bg-foreground/[0.04] hover:text-foreground')}>{c}</button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3 text-[12.5px] text-foreground/45">
          <span>共 {list.length} 个{list.length !== merged.length ? `（仓库里一共 ${merged.length} 个）` : ''}</span>
          {progress && progress.total > 1 && <Loading compact text={`正在读在线合集 ${progress.done}/${progress.total}`} />}
          <span className="flex-1" />
          <label className="inline-flex h-7 items-center gap-1 rounded-full border border-dashed border-border px-2.5 text-[12px] text-foreground/50 focus-within:border-foreground/40" title="把 GitHub 上的技能合集加进在线合集">
            <Plus size={12} />
            <input value={adding} onChange={(e) => setAdding(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void addRemote() }} placeholder="加合集：用户名/仓库名" className="w-36 bg-transparent outline-none placeholder:text-foreground/40" />
          </label>
        </div>
        {errs.length > 0 && (
          <div role="alert" className="rounded-lg border border-destructive/20 bg-destructive/[0.04] px-3 py-2 text-[12.5px] text-destructive">
            {errs.map((e) => <div key={e}>{e}</div>)}
            <div className="mt-1 text-foreground/50">其他来源照常显示；检查网络或代理后点「刷新」重试。</div>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-8">
        {loading && list.length === 0 ? (
          <Loading text="正在读取技能仓库" />
        ) : list.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border py-16 text-center text-[13px] text-foreground/45">
            {progress ? '还在读，稍等一下' : q ? '没搜到这个技能' : onlyNew ? '这里的技能都装过了' : '没有符合条件的技能'}
          </div>
        ) : (
          <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border bg-background">
            {list.slice(0, limit).map((r, i) => {
              const done = isInstalled(r)
              const expanded = open === r.key
              return (
                <div key={r.key}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setOpen(expanded ? null : r.key)}
                    onKeyDown={(e) => { if (e.key === 'Enter') setOpen(expanded ? null : r.key) }}
                    className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-foreground/[0.025]"
                  >
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-foreground/[0.05] text-[11.5px] tabular-nums text-foreground/50">{i + 1}</span>
                    <SkillIconTile category={r.category} name={`${r.name} ${r.title}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-baseline gap-2">
                        <span className="truncate text-[14px] font-medium text-foreground">{r.title}</span>
                        {r.title !== r.name && <span className="truncate font-mono text-[11.5px] text-foreground/40">{r.name}</span>}
                      </div>
                      <p className="mt-0.5 line-clamp-1 text-[12.5px] leading-5 text-foreground/55" title={r.desc}>{r.desc}</p>
                      <div className="mt-1 flex flex-wrap gap-1 text-[11px] text-foreground/50">
                        <span className="rounded-full bg-foreground/[0.05] px-2 py-px">{r.origin}</span>
                        <span className="rounded-full bg-foreground/[0.05] px-2 py-px">{r.category}</span>
                      </div>
                    </div>
                    {done ? (
                      <span className="flex shrink-0 items-center gap-1 text-[12.5px] text-emerald-600 dark:text-emerald-400"><Check size={13} />已安装</span>
                    ) : (
                      <button
                        type="button"
                        disabled={!!busy}
                        onClick={(e) => { e.stopPropagation(); void install(r) }}
                        className="flex h-7 shrink-0 items-center gap-1 rounded-lg bg-emerald-600 px-3 text-[12.5px] font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                      >
                        {busy === r.key && <Loader2 size={12} className="animate-spin" />}{busy === r.key ? '安装中' : '安装'}
                      </button>
                    )}
                    <ChevronDown size={15} className={cn('shrink-0 text-foreground/35 transition-transform', expanded && 'rotate-180')} />
                  </div>
                  {expanded && (
                    <div className="border-t border-border/50 bg-foreground/[0.015] px-4 py-3 pl-[76px]">
                      {r.meta.length > 0 && (
                        <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-foreground/45">
                          {r.meta.map((m) => <span key={m}>{m}</span>)}
                        </div>
                      )}
                      {r.plugin
                        ? <p className="text-[12.5px] leading-6 text-foreground/70">{r.desc}。安装会装上插件里的技能和能在 Roy 里跑的 MCP，ZCode 自己的侧栏界面和命令不会装。</p>
                        : <Body id={r.id} body={r.body} />}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
        {limit < list.length && (
          <button type="button" onClick={() => setLimit((n) => n + 80)} className="mx-auto mt-4 block rounded-lg border border-border px-4 py-1.5 text-[12.5px] text-foreground/70 hover:bg-foreground/[0.04]">
            再显示 80 个（还剩 {list.length - limit} 个）
          </button>
        )}
      </div>
    </div>
  )
}
