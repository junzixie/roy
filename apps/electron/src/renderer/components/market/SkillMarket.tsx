/**
 * 技能市场（照 Arthur 的技能市场一比一排版）
 *
 * - 子页只有三个：精选 / 仓库 / 已安装 N
 *   - 精选：Roy 精选 + 本机常用（都是挑过的，放一页）
 *   - 仓库：所有能装的技能放在一个仓库里（Roy 技能仓库、在线合集、ZCode 官方），用户自己按来源 / 分类筛选，见 SkillRepo.tsx
 */

import React from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { toast } from 'sonner'
import {
  BarChart3, Bot, Check, ChevronDown, Clapperboard, Code2, FileText, FolderOpen, Globe, Loader2,
  Megaphone, Palette, PenLine, Plus, RotateCw, Search, Sparkles, Trash2, Workflow, X, type LucideIcon,
} from 'lucide-react'
import { Loading } from '@/components/ui/Loading'
import { SkillPicks } from './MarketPicks'
import { RoySkillFeatured } from './RoyMarket'
import { AppIcon } from './app-icons'
import { SkillRepo, type RepoSource } from './SkillRepo'
import { Switch } from '@/components/ui/switch'
import { localizeSkill } from '@/lib/skill-zh'
import { cn } from '@/lib/utils'
import { workspaceCapabilitiesVersionAtom } from '@/atoms/agent-atoms'
import type { MarketSkillEntry, SkillMeta } from '@roy/shared'

const CATEGORY_RULES: Array<[string, RegExp]> = [
  ['视频制作', /video|remotion|hyperframes|faceless|clapper|分镜|视频|配音/i],
  ['设计创作', /design|\bui\b|\bux\b|figma|brand|palette|layout|visual|image|art|设计|配色|排版|海报|插图/i],
  ['写代码', /code|coding|debug|test|refactor|frontend|backend|sql|api|git|typescript|python|react|代码|编程/i],
  ['文档办公', /docx|xlsx|pptx|pdf|word|excel|ppt|slide|office|文档|表格|纪要|邮件/i],
  ['内容写作', /write|writing|copy|article|blog|translate|humaniz|写作|润色|翻译|文章|公众号|小红书/i],
  ['数据分析', /data|analy|chart|csv|metric|数据|分析|报表|图表/i],
  ['浏览器与自动化', /browser|playwright|scrap|crawl|automat|workflow|自动化|爬/i],
]

/** 技能归类：先用中文名表里的分组，没有再按名字和说明里的关键词猜 */
export function categoryOf(s: MarketSkillEntry): string {
  const g = localizeSkill({ slug: s.slug, name: s.name, description: s.description }).group
  if (g && g !== '其他') return g
  const text = `${s.name} ${s.slug} ${s.description}`
  return CATEGORY_RULES.find(([, re]) => re.test(text))?.[0] ?? '其他'
}

const CATEGORY_ICON: Record<string, LucideIcon> = {
  视频制作: Clapperboard, 设计创作: Palette, 写代码: Code2, 工程流程: Workflow, 文档办公: FileText,
  内容写作: PenLine, 数据分析: BarChart3, 浏览器与自动化: Globe, 知识与学习: Sparkles, 'Roy 平台': Bot, 自媒体: Megaphone,
}

/** 技能图标：先认品牌 / 文档类型，认不出再按分类上色（照 ZCode 插件页） */
export function SkillIconTile({ category, name = '' }: { category: string; name?: string }): React.ReactElement {
  return <AppIcon name={name} category={CATEGORY_ICON[category] ? category : '其他'} size={36} />
}

const errText = (e: unknown): string => String(e instanceof Error ? e.message : e).replace(/^Error invoking remote method[^:]*:\s*(Error:\s*)?/, '')

export function SkillMarket({ workspaceSlug }: { workspaceSlug: string }): React.ReactElement {
  const [sub, setSub] = React.useState<'featured' | 'repo' | 'installed'>('featured')
  /** 从精选页「看全部」跳进仓库时预选的来源；仓库里用户可以自己改 */
  const [repoSource, setRepoSource] = React.useState<RepoSource>('all')
  const [installedList, setInstalledList] = React.useState<SkillMeta[] | null>(null)
  const capabilitiesVersion = useAtomValue(workspaceCapabilitiesVersionAtom)
  const bumpCapabilities = useSetAtom(workspaceCapabilitiesVersionAtom)

  const reloadInstalled = React.useCallback(() => {
    if (!workspaceSlug) { setInstalledList([]); return }
    void window.electronAPI.getWorkspaceSkills(workspaceSlug).then(setInstalledList).catch(() => setInstalledList([]))
  }, [workspaceSlug])
  React.useEffect(() => { reloadInstalled() }, [reloadInstalled, capabilitiesVersion])

  const installedNames = React.useMemo(() => new Set((installedList ?? []).flatMap((s) => [s.slug.toLowerCase(), s.name.toLowerCase()])), [installedList])
  const changed = React.useCallback(() => { bumpCapabilities((v) => v + 1) }, [bumpCapabilities])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-5 border-b border-border/60 px-6">
        {([['featured', '精选'], ['repo', '仓库'], ['installed', `已安装 ${installedList?.length ?? ''}`]] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setSub(id)}
            className={cn('-mb-px border-b-2 py-2 text-[13.5px] transition-colors', sub === id ? 'border-foreground font-medium text-foreground' : 'border-transparent text-foreground/50 hover:text-foreground')}
          >
            {label}
          </button>
        ))}
      </div>
      {sub === 'featured'
        ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <RoySkillFeatured workspaceSlug={workspaceSlug} installedNames={installedNames} onChanged={changed} onShowAll={() => { setRepoSource('roy'); setSub('repo') }} />
            <div className="px-6 pt-2 text-[13px] font-medium text-foreground/70">本机常用</div>
            <SkillPicks key="common" mode="common" workspaceSlug={workspaceSlug} installedNames={installedNames} onChanged={changed} onShowAll={() => { setRepoSource('market'); setSub('repo') }} Icon={SkillIconTile} />
          </div>
        )
        : sub === 'repo'
          ? <SkillRepo workspaceSlug={workspaceSlug} installedNames={installedNames} onChanged={changed} initialSource={repoSource} />
          : <InstalledList workspaceSlug={workspaceSlug} list={installedList} onChanged={changed} />}
    </div>
  )
}

function InstalledList({ workspaceSlug, list, onChanged }: { workspaceSlug: string; list: SkillMeta[] | null; onChanged: () => void }): React.ReactElement {
  const [q0, setQ] = React.useState('')
  const [busy, setBusy] = React.useState<string | null>(null)
  const q = q0.trim().toLowerCase()
  if (!workspaceSlug) return <div className="py-16 text-center text-[13px] text-foreground/45">还没有项目，先建一个项目再装技能</div>
  if (list === null) return <Loading text="正在读取已安装的技能" />
  const shown = list.filter((s) => !q || `${s.name} ${s.slug} ${s.description ?? ''} ${localizeSkill(s).title}`.toLowerCase().includes(q))

  const run = async (slug: string, fn: () => Promise<unknown>, ok: string): Promise<void> => {
    setBusy(slug)
    try {
      await fn()
      toast.success(ok)
      onChanged()
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 px-6 pb-3 pt-3.5">
        <label className="flex h-8 flex-1 items-center gap-2 rounded-lg border border-border bg-background px-2.5 focus-within:border-foreground/30">
          <Search size={14} className="shrink-0 text-foreground/40" />
          <input value={q0} onChange={(e) => setQ(e.target.value)} placeholder="搜已安装的技能" className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-foreground/35" />
        </label>
        <span className="text-[12.5px] text-foreground/45">当前项目共 {list.length} 个，停用的不会交给 AI</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-8">
        {shown.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border py-16 text-center text-[13px] text-foreground/45">{q ? '没搜到' : '还没装技能，去「技能市场」挑几个'}</div>
        ) : (
          <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border bg-background">
            {shown.map((s, i) => {
              const zh = localizeSkill(s)
              return (
                <div key={s.slug} className="flex items-center gap-3 px-4 py-3">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-foreground/[0.05] text-[11.5px] tabular-nums text-foreground/50">{i + 1}</span>
                  <SkillIconTile category={categoryOf({ slug: s.slug, name: s.name, description: s.description ?? '' } as MarketSkillEntry)} name={`${s.name} ${s.slug}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-baseline gap-2">
                      <span className={cn('truncate text-[14px] font-medium', !s.enabled && 'text-foreground/45')}>{zh.title}</span>
                      {zh.title !== s.name && <span className="truncate font-mono text-[11.5px] text-foreground/40">{s.name}</span>}
                    </div>
                    <p className="mt-0.5 line-clamp-1 text-[12.5px] text-foreground/55">{zh.desc}</p>
                  </div>
                  <button type="button" title="打开技能文件夹" onClick={() => void window.electronAPI.openWorkspaceSkillFolder(workspaceSlug, s.slug)} className="rounded-md p-1.5 text-foreground/45 hover:bg-foreground/[0.06] hover:text-foreground"><FolderOpen size={14} /></button>
                  <button
                    type="button"
                    title="卸载"
                    disabled={busy === s.slug}
                    onClick={() => { if (window.confirm(`卸载「${zh.title}」？会删掉当前项目里的这个技能文件夹。`)) void run(s.slug, () => window.electronAPI.deleteWorkspaceSkill(workspaceSlug, s.slug), `已卸载「${zh.title}」`) }}
                    className="rounded-md p-1.5 text-foreground/45 hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                  >
                    <Trash2 size={14} />
                  </button>
                  <Switch
                    checked={s.enabled}
                    disabled={busy === s.slug}
                    onCheckedChange={(v) => void run(s.slug, () => window.electronAPI.toggleWorkspaceSkill(workspaceSlug, s.slug, v), v ? '已启用' : '已停用')}
                  />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
