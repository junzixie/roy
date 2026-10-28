/**
 * 设置 · 电脑控制（对齐 Arthur 的「电脑控制」设置页）
 *
 * - 看屏幕：AI 能截屏了解当前界面；默认开启
 * - 允许 AI 操控电脑：默认关；打开后每一轮的第一次动作前会弹窗问你，Ctrl+Alt+End 可停
 * - 操作记录：每一次动作同步留当前截图；保留 7 天
 *
 * 总开关与「跳过每次确认」只放在本页；权限设置页仅跳转过来，避免两处同一开关。
 */
import * as React from 'react'
import { SettingsSection, SettingsCard, SettingsToggle } from './primitives'
import { Crown } from 'lucide-react'
import { ensureProFeature } from '@/atoms/pro-activation'

type JournalEntry = { t: number; session: string; op: string; args: Record<string, unknown>; fx: number | null; fy: number | null; image?: string }

function describe(e: JournalEntry): string {
  const a = e.args ?? {}
  if (typeof a.text === 'string') return `${e.op}：${a.text}`
  if (typeof a.keys === 'string') return `${e.op}：${a.keys}`
  if (typeof a.window === 'string') return `${e.op}：${a.window}`
  if (typeof a.target === 'string') return `${e.op}：${a.target}`
  return e.op
}

export function ComputerSettings(): React.ReactElement {
  const isWindows = React.useMemo(() => navigator.userAgent.includes('Windows'), [])
  const [screenCapture, setScreenCapture] = React.useState(true)
  const [computerUse, setComputerUse] = React.useState(false)
  const [isPro, setIsPro] = React.useState(false)
  /** 账号状态读完前不显示 Pro 提示，免得 Pro 用户打开时闪一下 */
  const [proChecked, setProChecked] = React.useState(false)
  const [computerNoPrompt, setComputerNoPrompt] = React.useState(false)
  const [journal, setJournal] = React.useState<JournalEntry[] | null>(null)
  const [open, setOpen] = React.useState<JournalEntry | null>(null)
  const [error, setError] = React.useState('')

  const loadJournal = React.useCallback(() => {
    void window.electronAPI.computerJournalList().then(setJournal).catch(() => setJournal([]))
  }, [])

  React.useEffect(() => {
    window.electronAPI.getSettings().then((s) => {
      const v = s as { screenCaptureEnabled?: boolean; computerUseEnabled?: boolean; computerUseNoPrompt?: boolean }
      setScreenCapture(v.screenCaptureEnabled !== false)
      setComputerUse(v.computerUseEnabled === true)
      void window.electronAPI.accountGet().then((a) => setIsPro(a.features.includes('computer-control'))).catch(() => undefined).finally(() => setProChecked(true))
      setComputerNoPrompt(v.computerUseNoPrompt === true)
    }).catch(() => undefined)
    loadJournal()
  }, [loadJournal])

  const save = (patch: Record<string, unknown>, apply: () => void): void => {
    setError('')
    void window.electronAPI.updateSettings(patch as never).then(apply).catch(() => setError('保存失败，请重试'))
  }

  return (
    <div className="space-y-8">
      {proChecked && !isPro && (
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-5 py-4">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-500/15 text-amber-600"><Crown size={20} /></div>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold text-foreground">Pro 用户专享</div>
            <div className="mt-0.5 text-[12.5px] leading-5 text-muted-foreground">让 AI 直接点鼠标、敲键盘、切换窗口，替你在其他软件里把事情做完。激活 Roy Pro 后可用；「看屏幕」免费版也能用。</div>
          </div>
          <button
            type="button"
            onClick={() => void ensureProFeature('computer-control', () => setIsPro(true)).then((ok) => { if (ok) setIsPro(true) })}
            className="h-9 shrink-0 rounded-lg bg-amber-500 px-4 text-[13px] font-medium text-white hover:bg-amber-600"
          >
            激活 Pro
          </button>
        </div>
      )}
      <SettingsSection title="电脑控制" description="让 AI 看屏幕、操控鼠标键盘。改完后下一轮对话生效。权限设置页里的「电脑操控」会跳到这里。">
        <SettingsCard>
          <SettingsToggle
            label="看屏幕"
            description="AI 可以截当前屏幕或某个窗口（例如微信消息、某个页面现在显示什么）。截图会发给当前模型；模型能看图时才有视觉理解"
            checked={screenCapture}
            onCheckedChange={(v) => save({ screenCaptureEnabled: v }, () => setScreenCapture(v))}
          />
          <SettingsToggle
            label={isPro ? '允许 AI 操控电脑' : '允许 AI 操控电脑（Pro）'}
            description={(isWindows
              ? (computerUse
                ? '已开启：AI 可以点鼠标、敲键盘、切换窗口。每一轮的第一次动作前会弹窗问你；紧急时按 Ctrl+Alt+End 暂停。每一次动作都会记在下方「操作记录」'
                : '开启后 AI 能直接操作鼠标和键盘（不只是看截图）。默认关闭，打开后下一轮对话生效')
              : '目前只支持 Windows') + (isPro ? '' : '。电脑控制需要激活 Pro，打开时会提示输入激活码')}
            checked={computerUse}
            disabled={!isWindows}
            onCheckedChange={(v) => {
              // 打开时没激活 Pro：弹激活码窗，激活成功后再打开
              const enable = (): void => save({ computerUseEnabled: v }, () => setComputerUse(v))
              if (v && !isPro) { void ensureProFeature('computer-control', () => { setIsPro(true); enable() }).then((ok) => { if (ok) { setIsPro(true); enable() } }); return }
              enable()
            }}
          />
          {isWindows && computerUse && (
            <SettingsToggle
              label="跳过每次确认"
              description={computerNoPrompt
                ? '已关闭确认：AI 会直接开始点击和打字，不再弹窗；Ctrl+Alt+End 仍可随时暂停；每一次仍会记入操作记录'
                : '关闭后 AI 操作每轮会先问你一次，再开始动手；适合不放心的场景。打开则适合你已信任的自动任务；关闭时每轮第一次动作前仍会询问'}
              checked={computerNoPrompt}
              onCheckedChange={(checked) => {
                save({ computerUseNoPrompt: checked }, () => setComputerNoPrompt(checked))
              }}
            />
          )}
          {error && <p role="alert" className="px-4 pb-3 text-xs text-destructive">{error}</p>}
        </SettingsCard>
      </SettingsSection>

      {isWindows && computerUse && <EngineSection />}

      <AppNotesSection />

      <SettingsSection title="操作记录" description="AI 每做一次电脑动作都会留一条记录和动作前的截图，可点开看点击位置。保留 7 天">
        <div className="mb-3 flex items-center gap-2">
          <button type="button" onClick={loadJournal} className="h-8 rounded-md border border-border px-3 text-[12.5px] hover:bg-foreground/[0.05]">刷新</button>
          <button type="button" onClick={() => void window.electronAPI.computerJournalOpenDir()} className="h-8 rounded-md border border-border px-3 text-[12.5px] hover:bg-foreground/[0.05]">打开文件夹</button>
          <button type="button" onClick={() => void window.electronAPI.computerStop()} className="h-8 rounded-md border border-border px-3 text-[12.5px] hover:bg-foreground/[0.05]">立刻停止 AI 操控</button>
          <button
            type="button"
            onClick={() => { void window.electronAPI.computerJournalClear().then(loadJournal) }}
            className="ml-auto h-8 rounded-md px-3 text-[12.5px] text-destructive hover:bg-destructive/10"
          >清空记录</button>
        </div>
        <SettingsCard>
          {journal === null ? (
            <div className="px-4 py-6 text-center text-[12.5px] text-muted-foreground">正在读取…</div>
          ) : journal.length === 0 ? (
            <div className="px-4 py-6 text-center text-[12.5px] text-muted-foreground">还没有操作记录</div>
          ) : (
            <div className="divide-y divide-border/60">
              {journal.map((e) => (
                <button
                  key={`${e.t}-${e.op}`}
                  type="button"
                  onClick={() => setOpen(e)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-foreground/[0.03]"
                >
                  <span className="w-[120px] shrink-0 text-[12px] tabular-nums text-muted-foreground">{new Date(e.t).toLocaleString()}</span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{describe(e)}</span>
                  {e.image && <img src={e.image} alt="" className="h-9 w-16 shrink-0 rounded border border-border/60 object-cover" />}
                </button>
              ))}
            </div>
          )}
        </SettingsCard>
      </SettingsSection>

      <WebNotesSection />

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-8" onClick={() => setOpen(null)}>
          <div className="max-h-full max-w-[90vw] overflow-auto rounded-xl bg-background p-3 shadow-xl" onClick={(ev) => ev.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between gap-4 text-[13px]">
              <span className="text-foreground">{describe(open)}</span>
              <span className="text-muted-foreground">{new Date(open.t).toLocaleString()}</span>
            </div>
            {open.image ? (
              <div className="relative">
                <img src={open.image} alt="动作前的截图" className="block max-w-[85vw] rounded" />
                {open.fx != null && open.fy != null && (
                  <span
                    className="absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-red-500 shadow"
                    style={{ left: `${open.fx * 100}%`, top: `${open.fy * 100}%` }}
                  />
                )}
              </div>
            ) : (
              <div className="p-6 text-[12.5px] text-muted-foreground">这一步没有截图</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/** 网站笔记：AI 在某个网站操作成功后记下的要点，下次自动任务再去同一网站会自动带上 */
function WebNotesSection(): React.ReactElement {
  const [notes, setNotes] = React.useState<Array<{ site: string; text: string }> | null>(null)
  const [saved, setSaved] = React.useState('')
  React.useEffect(() => {
    void window.electronAPI.webNotesList().then(setNotes).catch(() => setNotes([]))
  }, [])
  const save = (site: string, text: string): void => {
    void window.electronAPI.webNotesSave(site, text)
      .then((list) => { setNotes(list); setSaved(text.trim() ? `${site} 已保存` : `${site} 已删除`) })
      .catch((e: unknown) => setSaved(e instanceof Error ? e.message : '保存失败'))
  }
  return (
    <SettingsSection title="网站笔记" description="Roy 在某个网站操作成功后记下的要点（按钮文案、坑等）；下次自动任务再去同一网站会自动带上。你也可以直接改；站点名可删">
      <SettingsCard>
        {notes === null ? (
          <div className="px-4 py-6 text-center text-[12.5px] text-muted-foreground">正在读取…</div>
        ) : notes.length === 0 ? (
          <div className="px-4 py-6 text-center text-[12.5px] text-muted-foreground">还没有记过网站笔记</div>
        ) : (
          <div className="divide-y divide-border/60">
            {notes.map((n) => (
              <div key={n.site} className="px-4 py-3">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[13px] font-medium text-foreground">{n.site}</span>
                  <button type="button" onClick={() => save(n.site, '')} className="text-[12px] text-destructive hover:underline">删除</button>
                </div>
                <textarea
                  defaultValue={n.text}
                  rows={Math.min(8, n.text.split('\n').length + 1)}
                  onBlur={(e) => { if (e.target.value.trim() !== n.text.trim()) save(n.site, e.target.value) }}
                  className="w-full resize-y rounded-md border border-input bg-transparent px-2.5 py-1.5 text-[12.5px] leading-5 outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                />
              </div>
            ))}
          </div>
        )}
        {saved && <p className="px-4 pb-3 text-[12px] text-muted-foreground">{saved}</p>}
      </SettingsCard>
    </SettingsSection>
  )
}

/** 软件操作经验：AI 操作某个软件后记下的「怎么做最顺」，下次先读 */
function AppNotesSection(): React.ReactElement {
  const [notes, setNotes] = React.useState<Array<{ slug: string; chars: number; updatedAt: number }> | null>(null)
  const load = React.useCallback(() => {
    void window.electronAPI.computerAppNotesList().then(setNotes).catch(() => setNotes([]))
  }, [])
  React.useEffect(load, [load])
  const label = (slug: string): string => {
    const name = slug.replace(/-windows$/, '')
    return ({ wechat: '微信', wecom: '企业微信', dingtalk: '钉钉', feishu: '飞书' } as Record<string, string>)[name] ?? name
  }
  return (
    <SettingsSection title="软件操作经验" description="AI 操作某个软件时发现的好用方法和坑会记在这里，下次操作同一个软件先读，越用越熟。只记方法，不记聊天内容和个人信息；不想要哪条，在文件夹里删掉对应文件即可">
      <div className="mb-3 flex items-center gap-2">
        <button type="button" onClick={load} className="h-8 rounded-md border border-border px-3 text-[12.5px] hover:bg-foreground/[0.05]">刷新</button>
        <button type="button" onClick={() => void window.electronAPI.computerAppNotesOpenDir()} className="h-8 rounded-md border border-border px-3 text-[12.5px] hover:bg-foreground/[0.05]">打开文件夹</button>
      </div>
      <SettingsCard>
        {notes === null ? (
          <div className="px-4 py-6 text-center text-[12.5px] text-muted-foreground">正在读取…</div>
        ) : notes.length === 0 ? (
          <div className="px-4 py-6 text-center text-[12.5px] text-muted-foreground">还没有积累经验。微信自带一份基础经验，AI 用过之后会补充</div>
        ) : (
          <div className="divide-y divide-border/60">
            {notes.map((n) => (
              <div key={n.slug} className="flex items-center justify-between px-4 py-2.5 text-[12.5px]">
                <span className="font-medium text-foreground">{label(n.slug)}</span>
                <span className="text-muted-foreground">{n.chars} 字 · {new Date(n.updatedAt).toLocaleString('zh-CN')}</span>
              </div>
            ))}
          </div>
        )}
      </SettingsCard>
    </SettingsSection>
  )
}

type CuaStatus = Awaited<ReturnType<typeof window.electronAPI.computerCuaStatus>>

/** 执行引擎：装了 Cua Driver 就用它（后台操作、不抢前台），没装用 Roy 自带的 */
function EngineSection(): React.ReactElement {
  const [status, setStatus] = React.useState<CuaStatus | null>(null)
  const [engine, setEngine] = React.useState<'auto' | 'roy'>('auto')
  const [installing, setInstalling] = React.useState(false)
  const [progress, setProgress] = React.useState('')
  const [error, setError] = React.useState('')

  const load = React.useCallback(() => {
    void window.electronAPI.computerCuaStatus().then(setStatus).catch(() => setStatus(null))
  }, [])
  React.useEffect(() => {
    load()
    void window.electronAPI.getSettings().then((s) => setEngine((s as { computerUseEngine?: 'auto' | 'roy' }).computerUseEngine === 'roy' ? 'roy' : 'auto')).catch(() => undefined)
    return window.electronAPI.onComputerCuaInstallProgress(setProgress)
  }, [load])

  const install = (): void => {
    setInstalling(true)
    setError('')
    setProgress('准备下载…')
    void window.electronAPI.computerCuaInstall()
      .then((next) => { setStatus(next); setProgress('') })
      .catch((e: unknown) => setError(String(e instanceof Error ? e.message : e).replace(/^Error invoking remote method[^:]*:\s*(Error:\s*)?/, '')))
      .finally(() => setInstalling(false))
  }
  const changeEngine = (next: 'auto' | 'roy'): void => {
    setEngine(next)
    void window.electronAPI.updateSettings({ computerUseEngine: next } as never).catch(() => setError('保存失败，请重试'))
  }

  const usingCua = engine === 'auto' && status?.installed
  return (
    <SettingsSection title="执行引擎" description="Cua Driver 能在后台操作被挡住的窗口：不抢前台、不动你的鼠标键盘，每一步都能读回结果核对。装了就优先用它，没装用 Roy 自带的。改完下一轮对话生效">
      <SettingsCard>
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <div className="text-[13.5px] font-medium text-foreground">
              当前使用：{usingCua ? 'Cua Driver（后台操作）' : 'Roy 自带'}
            </div>
            <div className="mt-0.5 text-[12px] text-muted-foreground">
              {status === null
                ? '正在检测…'
                : status.installed
                  ? `已安装 Cua Driver ${status.version ?? ''}`.trim()
                  : '还没有安装 Cua Driver。安装包约 36 MB，来自 Cua 官方 GitHub 发布页，安装前会核对文件哈希和 Cua AI, Inc. 的数字签名；不开机自启，用时才启动'}
            </div>
            {progress && <div className="mt-1 text-[12px] text-primary">{progress}</div>}
            {error && <div role="alert" className="mt-1 text-[12px] text-destructive">{error}</div>}
          </div>
          {status && !status.installed && status.supported && (
            <button type="button" disabled={installing} onClick={install} className="h-8 shrink-0 rounded-md bg-primary px-3 text-[12.5px] text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
              {installing ? '安装中…' : '安装 Cua Driver'}
            </button>
          )}
        </div>
        {status?.installed && (
          <SettingsToggle
            label="优先使用 Cua Driver"
            description={engine === 'auto' ? '已开启：电脑控制走 Cua，在后台操作窗口' : '已关闭：只用 Roy 自带的方式（遇到 Cua 不兼容的软件时可以临时关掉）'}
            checked={engine === 'auto'}
            onCheckedChange={(v) => changeEngine(v ? 'auto' : 'roy')}
          />
        )}
      </SettingsCard>
    </SettingsSection>
  )
}
