/**
 * 市场的「精选 / 常用」两页（技能、MCP 共用）
 *
 * - 精选：一小撮最常用的，卡片排列，装上就能用
 * - 常用：按用途分组，每组 4～6 个
 * - 全部：还是原来那张完整列表（在 SkillMarket / ConnectorMarket 里）
 *
 * 名单写死在这里，运行时只保留包里 / 本机真实存在的那几个，缺的不显示。
 */

import React from 'react'
import { toast } from 'sonner'
import { ArrowRight, Check, KeyRound, Loader2 } from 'lucide-react'
import { Loading } from '@/components/ui/Loading'
import { cachedLoad } from '@/lib/load-cache'
import { cn } from '@/lib/utils'
import { AppIcon } from './app-icons'
import type { MarketSkillEntry, McpServerEntry } from '@roy/shared'

const errText = (e: unknown): string => String(e instanceof Error ? e.message : e).replace(/^Error invoking remote method[^:]*:\s*(Error:\s*)?/, '')

// ───────────────────────── 技能 ─────────────────────────

type SkillPick = { name: string; title: string; desc: string }

const SKILL_FEATURED: SkillPick[] = [
  { name: 'docx', title: 'Word 文档', desc: '写报告、方案、合同，读改现有 .docx' },
  { name: 'xlsx', title: 'Excel 表格', desc: '做带公式和图表的表，读改现有 .xlsx' },
  { name: 'pptx', title: 'PPT 演示', desc: '按大纲生成幻灯片，改现有 .pptx' },
  { name: 'pdf', title: 'PDF 处理', desc: '读取、合并、拆分、填表、加水印' },
  { name: 'deep-research', title: '深度调研', desc: '多轮搜索、交叉核对，出带出处的报告' },
  { name: 'summarize', title: '内容总结', desc: '长文、网页、视频字幕一键提炼要点' },
  { name: 'humanizer', title: '去 AI 味', desc: '把生硬的 AI 腔改成自然的人话' },
  { name: 'xiaohongshu', title: '小红书创作', desc: '选题、标题、正文和标签一条龙' },
  { name: 'frontend-design', title: '前端设计', desc: '做出好看、不千篇一律的网页界面' },
  { name: 'agent-browser', title: '浏览器操作', desc: '打开网页、点击、填表、抓取内容' },
  { name: 'skill-creator', title: '做技能', desc: '把你的做事方法写成可复用的技能' },
  { name: 'find-skills', title: '找技能', desc: '描述需求，帮你找合适的现成技能' },
]

const SKILL_COMMON: Array<{ group: string; items: SkillPick[] }> = [
  { group: '办公文档', items: [
    { name: 'docx', title: 'Word 文档', desc: '报告、方案、合同、纪要' },
    { name: 'xlsx', title: 'Excel 表格', desc: '报表、预算、带公式的统计表' },
    { name: 'pptx', title: 'PPT 演示', desc: '汇报、路演、培训材料' },
    { name: 'pdf', title: 'PDF 处理', desc: '读、合并、拆分、填表' },
    { name: 'doc-coauthoring', title: '文档协作', desc: '和你一起一段段写长文档' },
    { name: 'theme-factory', title: '主题配色', desc: '给文档和幻灯片套统一风格' },
  ] },
  { group: '写作与内容', items: [
    { name: 'humanizer', title: '去 AI 味', desc: '改成自然的人话' },
    { name: 'xiaohongshu', title: '小红书创作', desc: '选题、标题、正文、标签' },
    { name: 'summarize', title: '内容总结', desc: '长内容提炼要点' },
    { name: 'brainstorming', title: '头脑风暴', desc: '先把想法问清楚再动手' },
    { name: 'internal-comms', title: '内部通知', desc: '周报、公告、团队沟通' },
    { name: 'brand-guidelines', title: '品牌规范', desc: '按品牌口吻和视觉出内容' },
  ] },
  { group: '资料与浏览', items: [
    { name: 'deep-research', title: '深度调研', desc: '多轮搜索、带出处' },
    { name: 'agent-browser', title: '浏览器操作', desc: '点网页、填表、抓内容' },
    { name: 'playwright', title: '网页自动化', desc: '批量操作网页、截图' },
    { name: 'obsidian', title: 'Obsidian 笔记', desc: '读写你的笔记库' },
    { name: 'github', title: 'GitHub', desc: '查仓库、Issue、PR' },
  ] },
  { group: '设计创作', items: [
    { name: 'frontend-design', title: '前端设计', desc: '好看的网页界面' },
    { name: 'ui-ux-pro-max', title: 'UI/UX 设计', desc: '配色、字体、交互规范' },
    { name: 'canvas-design', title: '海报设计', desc: '做海报、插图类静态图' },
    { name: 'web-artifacts-builder', title: '网页小作品', desc: '复杂一点的单页网页应用' },
    { name: 'algorithmic-art', title: '生成艺术', desc: '用代码画图案和动效' },
  ] },
  { group: '写代码', items: [
    { name: 'systematic-debugging', title: '系统排错', desc: '先找根因再改' },
    { name: 'test-driven-development', title: '先写测试', desc: '测试驱动开发' },
    { name: 'writing-plans', title: '写开发计划', desc: '大改动先拆成步骤' },
    { name: 'requesting-code-review', title: '代码审查', desc: '改完自查一遍' },
    { name: 'verification-before-completion', title: '完工前验证', desc: '跑过测试再说做完' },
    { name: 'webapp-testing', title: '网页测试', desc: '用浏览器测你做的网页' },
  ] },
  { group: '视频制作', items: [
    { name: 'remotion-best-practices', title: 'Remotion 视频', desc: '用 React 写可编程视频' },
    { name: 'remotion-create', title: '新建 Remotion', desc: '从零搭 Remotion 项目' },
    { name: 'remotion-render', title: '渲染成片', desc: '把合成渲成视频文件' },
    { name: 'hyperframes', title: 'HyperFrames', desc: '用网页做视频的入口' },
    { name: 'motion-graphics', title: '动效图形', desc: '做 MG 动画' },
    { name: 'faceless-explainer', title: '无素材解说', desc: '文章转解说视频' },
  ] },
  { group: '扩展 Roy', items: [
    { name: 'skill-creator', title: '做技能', desc: '把方法写成技能' },
    { name: 'find-skills', title: '找技能', desc: '帮你找现成技能' },
    { name: 'mcp-builder', title: '做 MCP', desc: '自己写一个 MCP 服务' },
    { name: 'writing-skills', title: '写好技能', desc: '技能写作规范' },
    { name: 'executing-plans', title: '执行计划', desc: '按步骤落地计划' },
    { name: 'verification-before-completion', title: '完工前验证', desc: '测过再说做完' },
  ] },
]

export function SkillPicks({
  mode, workspaceSlug, installedNames, onChanged, onShowAll, Icon,
}: {
  mode: 'featured' | 'common'
  workspaceSlug: string
  installedNames: Set<string>
  onChanged: () => void
  onShowAll: () => void
  Icon: React.ComponentType<{ category: string; name?: string }>
}): React.ReactElement {
  const [all, setAll] = React.useState<MarketSkillEntry[] | null>(null)
  const [busy, setBusy] = React.useState('')
  React.useEffect(() => {
    let alive = true
    cachedLoad<MarketSkillEntry[]>('skills:bundle', () => window.electronAPI.getMarketSkills(), false, 300000)
      .then((l) => { if (alive) setAll(l) })
      .catch((e) => { if (alive) { setAll([]); toast.error(`读取技能失败：${errText(e)}`) } })
    return () => { alive = false }
  }, [])

  const byName = React.useMemo(() => {
    const m = new Map<string, MarketSkillEntry>()
    for (const s of all ?? []) if (!m.has(s.name.toLowerCase())) m.set(s.name.toLowerCase(), s)
    return m
  }, [all])

  const install = async (s: MarketSkillEntry, title: string): Promise<void> => {
    if (!workspaceSlug) { toast.error('还没有可用项目，先建一个项目'); return }
    setBusy(s.slug)
    try {
      await window.electronAPI.installMarketSkill(workspaceSlug, s.slug)
      toast.success(`已安装「${title}」，在对话里输入 / 就能用`)
      onChanged()
    } catch (e) {
      const m = errText(e)
      toast.error(/已存在|AlreadyExists/i.test(m) ? `已经装过「${title}」` : `安装失败：${m}`)
    } finally {
      setBusy('')
    }
  }

  if (all === null) return <Loading text="正在读取技能" />

  const card = (p: SkillPick, group: string): React.ReactElement | null => {
    const s = byName.get(p.name)
    if (!s) return null
    const done = installedNames.has(s.name.toLowerCase())
    return (
      <PickCard
        key={p.name}
        icon={<Icon category={group} name={`${s.name} ${p.title}`} />}
        title={p.title}
        sub={s.name}
        desc={p.desc}
        done={done}
        doneText="已安装"
        actionText="安装"
        busy={busy === s.slug}
        disabled={!!busy}
        onAction={() => void install(s, p.title)}
      />
    )
  }

  return (
    <PicksFrame
      intro={mode === 'featured' ? '先装这几个就够日常用了，装好后在对话里输入 / 调用。' : '按用途挑，想看更多再去「全部」。'}
      onShowAll={onShowAll}
      allText="看全部技能"
    >
      {mode === 'featured'
        ? <Grid>{SKILL_FEATURED.map((p) => card(p, groupOf(p.name)))}</Grid>
        : SKILL_COMMON.map((g) => {
          const cards = g.items.map((p) => card(p, g.group)).filter(Boolean)
          return cards.length ? <Section key={g.group} title={g.group}><Grid>{cards}</Grid></Section> : null
        })}
    </PicksFrame>
  )
}

const ICON_GROUP: Record<string, string> = {
  办公文档: '文档办公', 写作与内容: '内容写作', 资料与浏览: '浏览器与自动化', 设计创作: '设计创作', 写代码: '写代码', 视频制作: '视频制作', '扩展 Roy': '工程流程',
}
function groupOf(name: string): string {
  const g = SKILL_COMMON.find((x) => x.items.some((i) => i.name === name))?.group ?? ''
  return ICON_GROUP[g] ?? '其他'
}

// ───────────────────────── MCP ─────────────────────────

type McpEntry = Awaited<ReturnType<typeof window.electronAPI.getMarketConnectors>>[number]
type McpPick = { id: string; title: string; desc: string }

const npx = (pkg: string): Omit<McpServerEntry, 'enabled'> => ({ type: 'stdio', command: 'npx', args: ['-y', pkg] } as Omit<McpServerEntry, 'enabled'>)

/** 通用、免 Key 的几个（需要电脑装了 Node.js） */
const MCP_FEATURED_STATIC: Array<McpEntry & { title: string }> = [
  { id: 'playwright', title: '浏览器自动化', name: 'Playwright', description: '让 AI 打开网页、点击、填表、截图，适合查资料和网页操作', examples: [], source: 'registry', server: npx('@playwright/mcp@latest'), needs: [], home: 'https://github.com/microsoft/playwright-mcp' },
  { id: 'chrome-devtools', title: 'Chrome 调试', name: 'Chrome DevTools', description: '看网页报错、网络请求和性能，调网页时用', examples: [], source: 'registry', server: npx('chrome-devtools-mcp@latest'), needs: [], home: 'https://github.com/ChromeDevTools/chrome-devtools-mcp' },
  { id: 'context7', title: '查最新文档', name: 'Context7', description: '写代码时查各类库的最新官方文档，少用过时写法', examples: [], source: 'registry', server: npx('@upstash/context7-mcp'), needs: [], home: 'https://github.com/upstash/context7' },
  { id: 'sequential-thinking', title: '分步思考', name: 'Sequential Thinking', description: '复杂问题拆成一步步想，适合规划和分析', examples: [], source: 'registry', server: npx('@modelcontextprotocol/server-sequential-thinking'), needs: [], home: 'https://github.com/modelcontextprotocol/servers' },
  { id: 'memory', title: '长期记忆', name: 'Memory', description: '把人物、事实记成知识图谱，下次对话还记得', examples: [], source: 'registry', server: npx('@modelcontextprotocol/server-memory'), needs: [], home: 'https://github.com/modelcontextprotocol/servers' },
]
/** 精选里来自随包连接器的 */
const MCP_FEATURED_BUNDLE: McpPick[] = [
  { id: 'github', title: 'GitHub', desc: '管理仓库、Issue、PR' },
  { id: 'tencent-docs', title: '腾讯文档', desc: '新建、编辑、查找在线文档' },
  { id: 'notion', title: 'Notion', desc: '读写 Notion 页面和数据库' },
]

const MCP_COMMON: Array<{ group: string; items: McpPick[] }> = [
  { group: '文档与知识库', items: [
    { id: 'tencent-docs', title: '腾讯文档', desc: '在线文档、表格' },
    { id: 'kdocs', title: '金山文档 / WPS', desc: 'WPS 云文档' },
    { id: 'notion', title: 'Notion', desc: '页面和数据库' },
    { id: 'ima-mcp', title: 'ima 知识库', desc: '搜索、写入知识库' },
    { id: 'lexiang', title: '乐享知识库', desc: '企业知识文档' },
  ] },
  { group: '邮件与表单', items: [
    { id: 'qq-mail', title: 'QQ 邮箱', desc: '收发、搜索邮件' },
    { id: 'tencent-survey', title: '腾讯问卷', desc: '建问卷、看结果' },
    { id: 'jinshuju', title: '金数据', desc: '表单和数据收集' },
  ] },
  { group: '网盘', items: [
    { id: 'baidu-netdisk', title: '百度网盘', desc: '浏览、保存文件' },
    { id: 'tencent-weiyun', title: '微云', desc: '取用、整理文件' },
  ] },
  { group: '设计', items: [
    { id: 'canva', title: 'Canva 可画', desc: '海报、封面、演示稿' },
    { id: 'mastergo-vibe-mcp', title: 'MasterGo', desc: '在设计稿上直接改' },
  ] },
  { group: '开发与部署', items: [
    { id: 'github', title: 'GitHub', desc: '仓库、Issue、PR' },
    { id: 'cloudbase', title: '腾讯云 CloudBase', desc: '云开发、部署' },
    { id: 'edgeone-pages', title: 'EdgeOne 部署', desc: '一键发布网页' },
  ] },
  { group: '查资料', items: [
    { id: 'qcc-company', title: '企查查', desc: '工商信息核验' },
    { id: 'tyc-mcp', title: '天眼查', desc: '企业数据' },
    { id: 'pkulaw', title: '北大法宝', desc: '法律法规检索' },
    { id: 'wind-finance', title: '万得金融', desc: '股票、基金、宏观数据' },
  ] },
]

const keyOf = (id: string): string => id.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 100)

export async function addMcpToWorkspace(workspaceSlug: string, added: Record<string, McpServerEntry>, entry: McpEntry): Promise<boolean> {
  if (!workspaceSlug) { toast.error('请先建一个项目'); return false }
  if (!entry.server) return false
  const key = keyOf(entry.id)
  if (added[key]) { toast.info('已经添加过了，到「已添加」里管理'); return false }
  if (!window.confirm(`把「${entry.name}」添加到当前项目？\n第三方 MCP 可能访问你的数据或在本机运行命令。添加后先保持停用，检查配置后再打开。${entry.needs.length ? `\n需要填：${entry.needs.join('；')}` : ''}`)) return false
  const cfg = await window.electronAPI.getWorkspaceMcpConfig(workspaceSlug)
  await window.electronAPI.saveWorkspaceMcpConfig(workspaceSlug, { servers: { ...cfg.servers, [key]: { ...entry.server, enabled: false } as McpServerEntry } })
  toast.success(entry.needs.length ? '已添加（停用中），填好 Key 后在「已添加」里打开' : '已添加（停用中），在「已添加」里打开就能用')
  return true
}

export function McpPicks({
  mode, workspaceSlug, added, onChanged, onShowAll,
}: {
  mode: 'featured' | 'common'
  workspaceSlug: string
  added: Record<string, McpServerEntry>
  onChanged: () => void
  onShowAll: () => void
}): React.ReactElement {
  const [list, setList] = React.useState<McpEntry[] | null>(null)
  const [busy, setBusy] = React.useState('')
  React.useEffect(() => {
    let alive = true
    cachedLoad('connectors', () => window.electronAPI.getMarketConnectors(), false, 300000)
      .then((l) => { if (alive) setList(l) })
      .catch((e) => { if (alive) { setList([]); toast.error(`读取连接器失败：${errText(e)}`) } })
    return () => { alive = false }
  }, [])
  const byId = React.useMemo(() => new Map((list ?? []).map((x) => [x.id, x])), [list])

  const add = async (entry: McpEntry): Promise<void> => {
    setBusy(entry.id)
    try {
      if (await addMcpToWorkspace(workspaceSlug, added, entry)) onChanged()
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setBusy('')
    }
  }

  if (list === null) return <Loading text="正在读取 MCP" />

  const card = (entry: McpEntry | undefined, title: string, desc: string, note?: string): React.ReactElement | null => {
    if (!entry?.server) return null
    return (
      <PickCard
        key={entry.id}
        icon={<AppIcon name={`${entry.id} ${entry.name} ${title}`} category="MCP" size={36} />}
        title={title}
        sub={entry.name !== title ? entry.name : undefined}
        desc={desc}
        tag={entry.needs.length ? <span className="inline-flex items-center gap-0.5 text-amber-700 dark:text-amber-400"><KeyRound size={10} />要授权</span> : <span className="text-emerald-700 dark:text-emerald-400">{note ?? '不用 Key'}</span>}
        done={!!added[keyOf(entry.id)]}
        doneText="已添加"
        actionText="添加"
        busy={busy === entry.id}
        disabled={!!busy}
        onAction={() => void add(entry)}
      />
    )
  }

  return (
    <PicksFrame
      intro={mode === 'featured' ? '通用的几个先放这里；添加后默认停用，在「已添加」里打开。前五个需要电脑装了 Node.js。' : '按用途挑，国内常用服务优先；更多去「全部」。'}
      onShowAll={onShowAll}
      allText="看全部 MCP"
    >
      {mode === 'featured'
        ? <Grid>
          {MCP_FEATURED_STATIC.map((x) => card(x, x.title, x.description, '不用 Key · 需 Node.js'))}
          {MCP_FEATURED_BUNDLE.map((p) => card(byId.get(p.id), p.title, p.desc))}
        </Grid>
        : MCP_COMMON.map((g) => {
          const cards = g.items.map((p) => card(byId.get(p.id), p.title, p.desc)).filter(Boolean)
          return cards.length ? <Section key={g.group} title={g.group}><Grid>{cards}</Grid></Section> : null
        })}
    </PicksFrame>
  )
}

// ───────────────────────── 共用排版 ─────────────────────────

export function PicksFrame({ intro, onShowAll, allText, children }: { intro: string; onShowAll: () => void; allText: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div className="roy-page-enter min-h-0 flex-1 overflow-y-auto px-6 pb-8 pt-3.5">
      <div className="mb-3 flex items-center text-[12.5px] text-foreground/50">
        <span>{intro}</span>
        <span className="flex-1" />
        <button type="button" onClick={onShowAll} className="inline-flex items-center gap-1 text-foreground/60 hover:text-foreground">{allText}<ArrowRight size={13} /></button>
      </div>
      <div className="space-y-5">{children}</div>
    </div>
  )
}

export function Section({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
  return (
    <section>
      <h3 className="mb-2 text-[13px] font-medium text-foreground/75">{title}</h3>
      {children}
    </section>
  )
}

export function Grid({ children }: { children: React.ReactNode }): React.ReactElement {
  return <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-2.5">{children}</div>
}

export function PickCard({
  icon, title, sub, desc, tag, done, doneText, actionText, busy, disabled, onAction,
}: {
  icon: React.ReactNode
  title: string
  sub?: string
  desc: string
  tag?: React.ReactNode
  done: boolean
  doneText: string
  actionText: string
  busy: boolean
  disabled: boolean
  onAction: () => void
}): React.ReactElement {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-background px-3.5 py-3 transition-colors hover:border-foreground/20">
      {icon}
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-1.5">
          <span className="truncate text-[13.5px] font-medium text-foreground">{title}</span>
          {sub && <span className="truncate font-mono text-[11px] text-foreground/35">{sub}</span>}
        </div>
        <p className="mt-0.5 line-clamp-2 text-[12px] leading-[18px] text-foreground/55" title={desc}>{desc}</p>
        {tag && <div className="mt-0.5 text-[11px]">{tag}</div>}
      </div>
      {done ? (
        <span className="flex shrink-0 items-center gap-1 text-[12px] text-emerald-600 dark:text-emerald-400"><Check size={13} />{doneText}</span>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={onAction}
          className={cn('flex h-7 shrink-0 items-center gap-1 rounded-lg bg-emerald-600 px-3 text-[12.5px] font-medium text-white hover:bg-emerald-700 disabled:opacity-60')}
        >
          {busy && <Loader2 size={12} className="animate-spin" />}{busy ? `${actionText}中` : actionText}
        </button>
      )}
    </div>
  )
}
