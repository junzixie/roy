/**
 * PartnersTab — 伙伴主体，两种用法：
 * - mode="market"：市场 → 伙伴，列出全部伙伴，可安装
 * - mode="installed"：侧栏「伙伴」，只列已安装的；一个没装时显示空页，引导去市场
 * 详情弹窗两边共用。数据是本地内置目录，不走云端市场。
 */

import * as React from 'react'
import { toast } from 'sonner'
import { useSetAtom } from 'jotai'
import { Check, Pencil, Plus, Store, Trash2, UsersRound } from 'lucide-react'
import { PARTNER_CATALOG, PARTNER_CATEGORIES, getPartner, type PartnerDefinition } from '@roy/shared'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { usePartners } from '@/atoms/partners'
import { activeViewAtom } from '@/atoms/active-view'
import { PartnerAvatar } from './partner-icons'

function matches(p: PartnerDefinition, q: string): boolean {
  if (!q) return true
  return [p.name, p.title, p.description, p.category, ...p.tags].some((x) => x.toLowerCase().includes(q))
}

const GRID = 'grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]'

export function PartnersTab({ search, mode = 'market' }: { search: string; mode?: 'market' | 'installed' }): React.ReactElement {
  const { settings, install, uninstall, setEnabled, setActive, saveCustom, removeCustom } = usePartners()
  const setActiveView = useSetAtom(activeViewAtom)
  const [editing, setEditing] = React.useState<PartnerDefinition | null>(null)
  const custom = settings.custom ?? []
  const [category, setCategory] = React.useState<string>('全部')
  const [detailId, setDetailId] = React.useState<string | null>(null)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const q = search.trim().toLowerCase()
  const installed = new Set(settings.installed)
  const disabled = new Set(settings.disabled ?? [])

  const run = async (id: string, fn: () => Promise<void>, ok: string): Promise<void> => {
    setBusyId(id)
    try {
      await fn()
      toast.success(ok)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setBusyId(null)
    }
  }

  const openMarket = (): void => {
    localStorage.setItem('roy.market.initialTab', 'partners')
    window.dispatchEvent(new CustomEvent('roy:market-tab', { detail: 'partners' }))
    setActiveView('market')
  }
  const newPartner = (): void => setEditing({ id: `custom-${Date.now().toString(36)}`, category: '我的伙伴', name: '', icon: '', title: '', description: '', tags: [], examples: [], prompt: '' })

  const installedAll = settings.installed.map((id) => getPartner(id, custom)).filter((p): p is PartnerDefinition => !!p)
  const pool = mode === 'installed' ? installedAll : [...PARTNER_CATALOG, ...custom]
  const categories = ['全部', ...PARTNER_CATEGORIES.filter((c) => mode === 'market' || pool.some((p) => p.category === c)), ...(pool.some((p) => p.category === '我的伙伴') ? ['我的伙伴'] : [])]
  const visible = pool.filter((p) => (category === '全部' || p.category === category) && matches(p, q))
  const detail = detailId ? getPartner(detailId, custom) : undefined

  const card = (p: PartnerDefinition): React.ReactElement => {
    const isInstalled = installed.has(p.id)
    return (
      <div
        key={p.id}
        role="button"
        tabIndex={0}
        onClick={() => setDetailId(p.id)}
        onKeyDown={(e) => { if (e.key === 'Enter') setDetailId(p.id) }}
        className="flex min-w-0 cursor-pointer items-center gap-3 rounded-xl border border-border/60 bg-content-area p-3.5 text-left transition-colors hover:bg-foreground/[0.03]"
      >
        <PartnerAvatar icon={p.icon} category={p.category} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5 text-[14px] font-medium leading-5 text-foreground">
            <span className="truncate">{p.name}</span>
            {settings.active === p.id && <span className="shrink-0 rounded bg-primary/10 px-1.5 text-[11px] font-normal text-primary">当前</span>}
            {isInstalled && disabled.has(p.id) && <span className="shrink-0 rounded bg-muted px-1.5 text-[11px] font-normal text-muted-foreground">已停用</span>}
          </div>
          <div className="mt-0.5 truncate text-[12.5px] leading-[18px] text-muted-foreground">{p.description}</div>
        </div>
        {mode === 'installed' ? null : isInstalled ? (
          <span className="flex shrink-0 items-center gap-1 text-[12px] text-muted-foreground"><Check size={13} />已安装</span>
        ) : (
          <button
            type="button"
            disabled={busyId === p.id}
            onClick={(e) => { e.stopPropagation(); void run(p.id, () => install(p.id), `已安装「${p.name}」`) }}
            className="shrink-0 rounded-lg border border-border px-3 py-1 text-[12.5px] font-medium text-foreground/80 transition-colors hover:bg-foreground/[0.05] disabled:opacity-50"
          >
            安装
          </button>
        )}
      </div>
    )
  }

  const empty = mode === 'installed' && installedAll.length === 0

  return (
    <div className="space-y-4">
      {empty ? (
        <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
          <span className="grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground"><UsersRound size={22} /></span>
          <div className="text-[14px] font-medium text-foreground">还没有安装伙伴</div>
          <p className="max-w-sm text-[12.5px] leading-5 text-muted-foreground">去市场挑一位装上，在输入框里选中它，Agent 就会按它的身份和做事方式帮你干活。</p>
          <div className="mt-1 flex gap-2">
            <button type="button" onClick={openMarket} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90"><Store size={14} />去市场挑选</button>
            <button type="button" onClick={newPartner} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-1.5 text-[13px] text-foreground/80 hover:bg-foreground/[0.05]"><Plus size={14} />自己新建</button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
              {categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={cn(
                    'rounded-lg px-3 py-1 text-[13px] transition-colors',
                    category === c ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
            {mode === 'installed' && (
              <button type="button" onClick={openMarket} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[13px] text-foreground/80 hover:bg-foreground/[0.05]"><Store size={14} />去市场添加</button>
            )}
            <button type="button" onClick={newPartner} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90">
              <Plus size={14} />新建伙伴
            </button>
          </div>

          <section>
            <h3 className="mb-2.5 text-[14px] font-semibold text-foreground">
              {q ? `搜索结果（${visible.length}）` : `${category === '全部' ? (mode === 'installed' ? '已安装' : '全部伙伴') : category}（${visible.length}）`}
            </h3>
            {visible.length ? (
              <div className={GRID}>{visible.map(card)}</div>
            ) : (
              <div className="py-12 text-center text-sm text-muted-foreground">没有找到相关伙伴</div>
            )}
          </section>
        </>
      )}

      <Dialog open={!!detail} onOpenChange={(open) => { if (!open) setDetailId(null) }}>
        <DialogContent className="flex max-h-[85vh] max-w-lg flex-col gap-0 overflow-hidden p-0">
          {detail && (
            <>
              <DialogHeader className="shrink-0 space-y-0 border-b border-border/60 px-6 pb-4 pr-12 pt-5 text-left">
                <DialogTitle className="flex items-center gap-3 leading-normal">
                  <PartnerAvatar icon={detail.icon} category={detail.category} size={44} />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-[16px] leading-6">{detail.name}</span>
                    <span className="line-clamp-2 text-[12.5px] font-normal leading-[18px] text-muted-foreground">{detail.title} · {detail.category}</span>
                  </span>
                </DialogTitle>
                <DialogDescription className="sr-only">{detail.description}</DialogDescription>
              </DialogHeader>

              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4 text-[13px] leading-5">
                <p className="text-foreground/80">{detail.description}</p>
                {detail.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {detail.tags.map((t) => <span key={t} className="rounded bg-muted px-2 py-0.5 text-[12px] text-muted-foreground">{t}</span>)}
                  </div>
                )}
                {detail.examples.length > 0 && (
                  <div>
                    <div className="mb-1.5 text-[12px] text-muted-foreground">可以这样问它</div>
                    <ul className="space-y-1.5">
                      {detail.examples.map((ex) => <li key={ex} className="break-words rounded-lg bg-muted/50 px-3 py-2 text-foreground/80">{ex}</li>)}
                    </ul>
                  </div>
                )}
                {!!detail.skillIds?.length && (
                  <div>
                    <div className="mb-1.5 text-[12px] text-muted-foreground">绑定的技能</div>
                    <div className="flex flex-wrap gap-1.5">{detail.skillIds.map((s) => <span key={s} className="rounded border border-border px-2 py-0.5 font-mono text-[12px] text-foreground/70">{s}</span>)}</div>
                  </div>
                )}
                {installed.has(detail.id) ? (
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2.5">
                    <div className="min-w-0">
                      <div className="font-medium">启用</div>
                      <div className="text-[12px] text-muted-foreground">停用后不会出现在输入框的伙伴列表里</div>
                    </div>
                    <Switch
                      checked={!disabled.has(detail.id)}
                      disabled={busyId === detail.id}
                      onCheckedChange={(v) => void run(detail.id, () => setEnabled(detail.id, v), v ? '已启用' : '已停用')}
                    />
                  </div>
                ) : (
                  <p className="text-[12px] text-muted-foreground">安装后，在输入框右下角选中它，就能把相关工作交给这位伙伴。伙伴只改变做事方式，不会多给权限。</p>
                )}
              </div>

              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border/60 bg-dialog px-6 py-3">
                {installed.has(detail.id) ? (
                  <>
                    {detail.id.startsWith('custom-') && <>
                      <button type="button" onClick={() => { setEditing(detail); setDetailId(null) }} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-[13px] hover:bg-foreground/[0.05]"><Pencil size={13} />编辑</button>
                      <button type="button" disabled={busyId === detail.id} onClick={() => { if (window.confirm(`删除自定义伙伴「${detail.name}」？`)) void run(detail.id, async () => { await removeCustom(detail.id); setDetailId(null) }, '已删除伙伴') }} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-[13px] text-destructive hover:bg-destructive/5"><Trash2 size={13} />删除</button>
                    </>}
                    <span className="flex-1" />
                    <button
                      type="button"
                      disabled={busyId === detail.id}
                      onClick={() => void run(detail.id, async () => { await uninstall(detail.id); setDetailId(null) }, `已卸载「${detail.name}」`)}
                      className="rounded-lg border border-border px-3 py-1.5 text-[13px] text-foreground/70 hover:bg-foreground/[0.05] disabled:opacity-50"
                    >
                      卸载
                    </button>
                    <button
                      type="button"
                      disabled={busyId === detail.id || disabled.has(detail.id) || settings.active === detail.id}
                      onClick={() => void run(detail.id, () => setActive(detail.id), `已切到「${detail.name}」，下一条消息生效`)}
                      className="rounded-lg bg-primary px-3 py-1.5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      {settings.active === detail.id ? '正在使用' : '设为当前伙伴'}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={busyId === detail.id}
                    onClick={() => void run(detail.id, () => install(detail.id), `已安装「${detail.name}」`)}
                    className="rounded-lg bg-primary px-4 py-1.5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    安装
                  </button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={!!editing} onOpenChange={(open) => { if (!open) setEditing(null) }}>
        <DialogContent className="max-h-[88vh] max-w-xl overflow-y-auto">
          {editing && <PartnerEditor value={editing} onCancel={() => setEditing(null)} onSave={(next) => void run(next.id, async () => { await saveCustom(next); setEditing(null) }, '伙伴已保存')} />}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function PartnerEditor({ value, onSave, onCancel }: { value: PartnerDefinition; onSave: (next: PartnerDefinition) => void; onCancel: () => void }): React.ReactElement {
  const [draft, setDraft] = React.useState({ ...value, skillsText: (value.skillIds ?? []).join('，'), tagsText: value.tags.join('，'), examplesText: value.examples.join('\n') })
  const field = 'mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] outline-none focus:border-primary'
  const submit = (): void => {
    const name = draft.name.trim(), prompt = draft.prompt.trim()
    if (!name || !prompt) { toast.error('请填写伙伴名称和人设提示词'); return }
    const skillIds = [...new Set(draft.skillsText.split(/[，,\n]/).map(x => x.trim()).filter(Boolean))]
    if (skillIds.length > 16 || skillIds.some(id => !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(id))) { toast.error('最多绑定 16 个技能，请填写技能标识（字母、数字、横线、下划线或点）'); return }
    onSave({ skillIds, id: draft.id, category: '我的伙伴', name, icon: draft.icon.trim() || name.slice(0, 1), title: draft.title.trim() || '自定义伙伴', description: draft.description.trim() || draft.title.trim() || '自定义伙伴', tags: draft.tagsText.split(/[，,\n]/).map(x => x.trim()).filter(Boolean).slice(0, 8), examples: draft.examplesText.split('\n').map(x => x.trim()).filter(Boolean).slice(0, 8), prompt })
  }
  return <>
    <DialogHeader className="pr-8 text-left"><DialogTitle className="leading-normal">{value.name ? '编辑伙伴' : '新建伙伴'}</DialogTitle></DialogHeader>
    <div className="grid gap-3 text-[13px]">
      <div className="flex items-center gap-3"><PartnerAvatar icon={draft.icon || draft.name.slice(0, 1)} category="我的伙伴" size={48} /><label className="flex-1">名称<input className={field} maxLength={40} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="如：AI 新闻编辑" /></label><label className="w-24">头像字<input className={field} maxLength={2} value={draft.icon} onChange={e => setDraft({ ...draft, icon: e.target.value })} placeholder="自动" /></label></div>
      <label>一句话身份<input className={field} maxLength={80} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} placeholder="如：每天筛选并改写 AI 新闻" /></label>
      <label>简介<input className={field} maxLength={240} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} /></label>
      <label>擅长标签<input className={field} value={draft.tagsText} onChange={e => setDraft({ ...draft, tagsText: e.target.value })} placeholder="用逗号分隔，如：新闻，摘要，ai-news-skill" /></label>
      <label>绑定技能标识<input className={field} value={draft.skillsText} onChange={e => setDraft({ ...draft, skillsText: e.target.value })} placeholder="如 ai-news，用逗号分隔" /><span className="block mt-1 text-xs text-muted-foreground">填写当前工作区已安装技能的标识；选择此伙伴后，会按原技能权限调用。不会自动安装技能。</span></label>
      <label>人设提示词<textarea className={`${field} min-h-36 resize-y`} maxLength={8000} value={draft.prompt} onChange={e => setDraft({ ...draft, prompt: e.target.value })} placeholder="写清身份、做事步骤、输出格式和需要遵守的限制" /></label>
      <label>示例问题（一行一个）<textarea className={`${field} min-h-20 resize-y`} value={draft.examplesText} onChange={e => setDraft({ ...draft, examplesText: e.target.value })} /></label>
      <div className="flex justify-end gap-2"><button type="button" onClick={onCancel} className="rounded-lg border border-border px-4 py-1.5">取消</button><button type="button" onClick={submit} className="rounded-lg bg-primary px-4 py-1.5 font-medium text-primary-foreground">保存并安装</button></div>
    </div>
  </>
}
