/**
 * Roy 内置市场（随安装包分发，离线可用，不挂外链、不读本机其他软件）
 *
 * - 精选技能：卡片排列，按用途分组
 * - MCP：addRoyMcp 供仓库（McpRepo）添加；添加后先停用，带配套技能的顺带装上
 * - 技能仓库、MCP 仓库的列表见 SkillRepo.tsx / McpRepo.tsx
 *
 * 清单来自 resources/market/skills.json、mcp.json（scripts/market/assemble_market.py 生成）。
 */

import React from 'react'
import { toast } from 'sonner'
import { Loading } from '@/components/ui/Loading'
import { cachedLoad } from '@/lib/load-cache'
import { AppIcon } from './app-icons'
import { Grid, PickCard, PicksFrame, Section } from './MarketPicks'
import type { McpServerEntry } from '@roy/shared'

type Catalog = Awaited<ReturnType<typeof window.electronAPI.getRoyMarket>>
type RSkill = Catalog['skills'][number]
type RMcp = Catalog['mcp'][number]

const errText = (e: unknown): string => String(e instanceof Error ? e.message : e).replace(/^Error invoking remote method[^:]*:\s*(Error:\s*)?/, '')
export const royMcpKey = (id: string): string => id.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 100)

function useCatalog(): Catalog | null {
  const [cat, setCat] = React.useState<Catalog | null>(null)
  React.useEffect(() => {
    let alive = true
    cachedLoad<Catalog>('roy:market', () => window.electronAPI.getRoyMarket(), false, 600000)
      .then((c) => { if (alive) setCat(c) })
      .catch((e) => { if (alive) { setCat({ skills: [], mcp: [] }); toast.error(`读取市场失败：${errText(e)}`) } })
    return () => { alive = false }
  }, [])
  return cat
}

const ICON_CAT: Record<string, string> = { 数据与科研: '数据分析', 效率与产品: '知识与学习' }
const iconCat = (c: string): string => ICON_CAT[c] ?? c
const CAT_ORDER = ['文档办公', '内容写作', '设计创作', '视频制作', '写代码', '数据与科研', '效率与产品', '其他']

async function installSkill(workspaceSlug: string, slug: string, title: string): Promise<boolean> {
  if (!workspaceSlug) { toast.error('还没有可用项目，先建一个项目'); return false }
  try {
    await window.electronAPI.installMarketSkill(workspaceSlug, `roy:${slug}`)
    toast.success(`已安装「${title}」，在对话里输入 / 就能用`)
    return true
  } catch (e) {
    const m = errText(e)
    toast.error(/已存在|AlreadyExists/i.test(m) ? `已经装过「${title}」` : `安装失败：${m}`)
    return false
  }
}

function skillTag(s: RSkill): React.ReactNode {
  if (s.note) return <span className="text-amber-700 dark:text-amber-400" title={s.note}>{s.note.length > 22 ? '公司使用需授权' : s.note}</span>
  return <span className="text-foreground/40">{s.source} · {s.license}</span>
}

// ───────────────────────── 精选技能 ─────────────────────────

export function RoySkillFeatured({ workspaceSlug, installedNames, onChanged, onShowAll }: {
  workspaceSlug: string; installedNames: Set<string>; onChanged: () => void; onShowAll: () => void
}): React.ReactElement {
  const cat = useCatalog()
  const [busy, setBusy] = React.useState('')
  if (!cat) return <Loading text="正在读取技能" />
  const featured = cat.skills.filter((s) => s.featured)
  const groups = CAT_ORDER.map((c) => ({ c, items: featured.filter((s) => s.category === c) })).filter((g) => g.items.length)
  const run = async (s: RSkill): Promise<void> => {
    setBusy(s.slug)
    if (await installSkill(workspaceSlug, s.slug, s.featured?.zh ?? s.name)) onChanged()
    setBusy('')
  }
  return (
    <PicksFrame intro={`挑了 ${featured.length} 个最常用的，装好后在对话里输入 / 调用。全部随软件自带，不用联网下载。`} onShowAll={onShowAll} allText="看技能仓库">
      {groups.map((g) => (
        <Section key={g.c} title={g.c}>
          <Grid>
            {g.items.map((s) => (
              <PickCard
                key={s.slug}
                icon={<AppIcon name={`${s.slug} ${s.featured?.zh ?? ''}`} category={iconCat(s.category)} size={36} />}
                title={s.featured?.zh ?? s.name}
                sub={s.slug}
                desc={s.featured?.desc ?? s.description}
                tag={skillTag(s)}
                done={installedNames.has(s.slug.toLowerCase()) || installedNames.has(s.name.toLowerCase())}
                doneText="已安装"
                actionText="安装"
                busy={busy === s.slug}
                disabled={!!busy}
                onAction={() => void run(s)}
              />
            ))}
          </Grid>
        </Section>
      ))}
    </PicksFrame>
  )
}

// ───────────────────────── MCP 仓库 ─────────────────────────

export async function addRoyMcp(workspaceSlug: string, added: Record<string, McpServerEntry>, m: RMcp, skillInstalled: boolean): Promise<boolean> {
  if (!workspaceSlug) { toast.error('请先建一个项目'); return false }
  const key = royMcpKey(m.id)
  if (added[key]) { toast.info('已经添加过了，到「已安装」里管理'); return false }
  const needs = m.needs.length ? `\n需要填：${m.needs.join('；')}` : ''
  const note = m.note ? `\n说明：${m.note}` : ''
  if (!window.confirm(`把「${m.name}」添加到当前项目？\n添加后先保持停用，填好需要的信息后在「已安装」里打开。${needs}${note}`)) return false
  const cfg = await window.electronAPI.getWorkspaceMcpConfig(workspaceSlug)
  await window.electronAPI.saveWorkspaceMcpConfig(workspaceSlug, { servers: { ...cfg.servers, [key]: { ...m.server, enabled: false } as McpServerEntry } })
  if (m.skill && !skillInstalled && window.confirm(`「${m.name}」有一个配套技能「${m.skill}」，教 AI 怎么用它。顺便装上吗？`)) {
    try { await window.electronAPI.installMarketSkill(workspaceSlug, `roy:${m.skill}`) } catch (e) {
      if (!/已存在|AlreadyExists/i.test(errText(e))) toast.error(`配套技能安装失败：${errText(e)}`)
    }
  }
  toast.success(m.needs.length ? '已添加（停用中），填好 Key 后在「已安装」里打开' : '已添加（停用中），在「已安装」里打开就能用')
  return true
}
