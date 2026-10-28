/**
 * Roy AI 工具台舞台：中央大球 + 芯片 + 指令栏；状态文案在输入框下方。
 * 点球=唤醒或打断；操作和交流留在当前助手页。
 */
import * as React from 'react'
import {
  FolderOpen,
  FolderPlus,
  MessageSquare,
  Mic,
  Sparkles,
  Wrench,
  CalendarDays,
  ExternalLink,
  Circle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { RoyWorkbenchOrb, type RoyOrbState } from './RoyWorkbenchOrb'
import { RoyWorkbenchVoicePanel } from './RoyWorkbenchVoicePanel'
import { ROY_WORKBENCH_SKINS, type RoyWorkbenchSkin } from '@/lib/roy-workbench-prefs'
import { cn } from '@/lib/utils'

export type WorkbenchChip = {
  id: string
  label: string
  prompt?: string
  action?: 'open_chat' | 'create_project_prompt' | 'voice_hint'
  icon?: 'spark' | 'folder' | 'calendar' | 'wrench' | 'mic' | 'chat'
}

const DEFAULT_CHIPS: WorkbenchChip[] = [
  { id: 'today', label: '今天该做什么', prompt: '根据我当前的项目和习惯，帮我排一下今天最该做的几件事，并给出可执行的下一步。', icon: 'calendar' },
  { id: 'new-project', label: '新建一个任务', action: 'create_project_prompt', icon: 'folder' },
  { id: 'write', label: '帮我写文档', prompt: '我想写一份文档，先问我主题、受众和篇幅，再给出大纲。', icon: 'spark' },
  { id: 'debug', label: '一起排查问题', prompt: '我遇到一个技术问题，请用系统化调试的方式带我找根因（先问现象与复现）。', icon: 'wrench' },
  { id: 'skills', label: '看看有什么技能', prompt: '介绍一下我现在能用的技能和市场里值得装的几项，按场景分组。', icon: 'spark' },
  { id: 'voice', label: '点我说话', action: 'voice_hint', icon: 'mic' },
]

const ICONS = {
  spark: Sparkles,
  folder: FolderPlus,
  calendar: CalendarDays,
  wrench: Wrench,
  mic: Mic,
  chat: MessageSquare,
} as const

export function RoyWorkbenchStage({
  orbState,
  skin,
  onSkinChange,
  statusLine,
  detailLine,
  wakeHint,
  workspaceName,
  modelLabel,
  recentProjects,
  chips = DEFAULT_CHIPS,
  onOpenChat,
  onOrbActivate,
  onChip,
  onCommandSubmit,
  onOpenFullSession,
  onSelectProject,
  onOpenVoiceSettings,
  onToggleVoiceTalk,
  voiceTalkActive = false,
  history = [], muted = false, onToggleMuted, onEndConversation, conversationActive = false, stopping = false,
}: {
  orbState: RoyOrbState
  skin: RoyWorkbenchSkin
  onSkinChange: (skin: RoyWorkbenchSkin) => void
  statusLine: string
  detailLine?: string
  /** 唤醒提示，如「说小爱同学或点球」 */
  wakeHint?: string
  workspaceName?: string | null
  modelLabel?: string | null
  recentProjects: Array<{ id: string; name: string }>
  chips?: WorkbenchChip[]
  onOpenChat: () => void
  onOrbActivate?: () => void
  onChip: (chip: WorkbenchChip) => void
  onCommandSubmit?: (text: string) => void | Promise<void>
  onOpenFullSession?: () => void
  onSelectProject?: (id: string) => void
  onOpenVoiceSettings?: () => void
  onToggleVoiceTalk?: () => void
  history?: Array<{ id: number; role: 'user' | 'assistant'; text: string }>
  muted?: boolean
  onToggleMuted?: () => void
  onEndConversation?: () => void
  voiceTalkActive?: boolean
  conversationActive?: boolean
  stopping?: boolean
}): React.ReactElement {
  const historyRef = React.useRef<HTMLElement>(null)
  const followingRef = React.useRef(true)
  React.useEffect(() => { const el = historyRef.current; if (el && followingRef.current) el.scrollTop = el.scrollHeight }, [history])
  const [commandDraft, setCommandDraft] = React.useState('')
  const [voiceOpen, setVoiceOpen] = React.useState(false)
  const [projectsOpen, setProjectsOpen] = React.useState(false)

  const submitCommand = React.useCallback(() => {
    const trimmed = commandDraft.trim()
    if (!trimmed) {
      onOpenChat()
      return
    }
    setCommandDraft('')
    if (onCommandSubmit) void Promise.resolve(onCommandSubmit(trimmed))
    else onOpenChat()
  }, [commandDraft, onCommandSubmit, onOpenChat])

  const statusColor =
    orbState === 'offline'
      ? 'text-muted-foreground'
      : orbState === 'busy' || orbState === 'thinking' || orbState === 'speaking'
        ? 'text-amber-500'
        : orbState === 'listening' || orbState === 'awake'
          ? 'text-emerald-500'
          : 'text-emerald-500'

  return (
    <div
      data-roy-skin={skin}
      className={cn(
        'relative flex h-full min-h-0 flex-1 flex-col overflow-hidden',
        skin === 'aivy' && 'bg-[radial-gradient(ellipse_at_50%_32%,rgba(20,184,166,0.14),transparent_58%),hsl(var(--background))]',
        skin === 'mineral' && 'bg-[radial-gradient(ellipse_at_50%_32%,rgba(45,95,136,0.14),transparent_58%),hsl(var(--background))]',
        skin === 'ink' && 'bg-[radial-gradient(ellipse_at_50%_28%,rgba(15,23,42,0.4),transparent_52%),hsl(var(--background))]',
        skin === 'aurora' && 'bg-[radial-gradient(ellipse_at_50%_32%,hsl(var(--primary)/0.1),transparent_58%),hsl(var(--background))]',
      )}
    >
      <header className="relative z-20 flex flex-wrap items-center gap-2 border-b border-border/40 bg-background/40 px-4 py-2.5 backdrop-blur-md">
        <div className="flex min-w-0 items-center gap-2.5">
          <Circle size={10} className={cn('shrink-0 fill-current', statusColor)} />
          <div className="min-w-0">
            <div className="text-[14px] font-medium text-foreground">Roy</div>
            <div className="truncate text-[11px] text-muted-foreground">
              语音与行动助手
              {workspaceName ? ` · ${workspaceName}` : ''}
              {modelLabel ? ` · ${modelLabel}` : ''}
            </div>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
          <div className="flex items-center gap-0.5 rounded-lg border border-border/60 bg-background/50 p-0.5" role="group" aria-label="外观">
            {ROY_WORKBENCH_SKINS.map((s) => (
              <button
                key={s.id}
                type="button"
                title={s.hint}
                onClick={() => onSkinChange(s.id)}
                className={cn(
                  'h-7 rounded-md px-2 text-[11px]',
                  skin === s.id ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted/50',
                )}
              >
                {s.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => {
              setProjectsOpen((v) => !v)
              setVoiceOpen(false)
            }}
            className={cn(
              'inline-flex h-8 items-center gap-1 rounded-lg border border-border/70 bg-background/60 px-2.5 text-[12px] hover:bg-muted/50',
              projectsOpen && 'border-primary/40 bg-primary/5',
            )}
          >
            <FolderOpen size={13} />
            项目
            {projectsOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>

          <button
            type="button"
            onClick={() => {
              setVoiceOpen((v) => !v)
              setProjectsOpen(false)
            }}
            className={cn(
              'inline-flex h-8 items-center gap-1 rounded-lg border border-border/70 bg-background/60 px-2.5 text-[12px] hover:bg-muted/50',
              voiceOpen && 'border-primary/40 bg-primary/5',
            )}
          >
            <Mic size={13} />
            语音
            {voiceOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>

          <button
            type="button"
            onClick={onOpenChat}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-foreground px-2.5 text-[12px] text-background hover:opacity-90"
          >
            <MessageSquare size={13} />
            执行详情
          </button>
          {onOpenFullSession ? (
            <button
              type="button"
              onClick={onOpenFullSession}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/70 px-2.5 text-[12px] text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            >
              <ExternalLink size={12} />
              打开完整会话
            </button>
          ) : null}
        </div>
      </header>

      {projectsOpen ? (
        <div className="absolute right-4 top-[3.25rem] z-30 w-[min(20rem,calc(100%-2rem))] rounded-xl border border-border/70 bg-background/95 p-3 shadow-xl backdrop-blur-md">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">最近项目</div>
          {recentProjects.length === 0 ? (
            <p className="text-[12px] text-muted-foreground">还没有其它项目。可用芯片「新建一个任务」，会在默认项目下开新会话。</p>
          ) : (
            <ul className="max-h-56 space-y-0.5 overflow-auto">
              {recentProjects.slice(0, 10).map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectProject?.(p.id)
                      setProjectsOpen(false)
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] hover:bg-muted/60"
                  >
                    <FolderOpen size={13} className="shrink-0 text-muted-foreground" />
                    <span className="truncate">{p.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {voiceOpen ? (
        <div className="absolute right-4 top-[3.25rem] z-30 w-[min(22rem,calc(100%-2rem))] rounded-xl border border-border/70 bg-background/95 p-3 shadow-xl backdrop-blur-md">
          <RoyWorkbenchVoicePanel onOpenSettings={onOpenVoiceSettings} />
        </div>
      ) : null}

      <main
        data-testid="assistant-main"
        className="relative z-10 flex min-h-0 flex-1 flex-col items-center overflow-hidden px-4"
        style={{ containerType: 'size' }}
        onClick={() => { if (voiceOpen || projectsOpen) { setVoiceOpen(false); setProjectsOpen(false) } }}
      >
        <div data-testid="orb-stage" data-engaged={conversationActive} style={{ containerType: 'size' }} className="relative flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden transition-all duration-700 motion-reduce:transition-none">
          <RoyWorkbenchOrb state={orbState} skin={skin} engaged={conversationActive} onActivate={onOrbActivate ?? onOpenChat} />
          <span className={cn('pointer-events-none absolute bottom-2 rounded-full border px-3 py-1 text-[11px] backdrop-blur-md', conversationActive ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600' : 'border-border/40 bg-background/40 text-muted-foreground')}>
            {conversationActive ? '● 正在交流中' : '点球或点击开始交流'}
          </span>
        </div>
        {history.length > 0 ? <section ref={historyRef} data-testid="conversation-history" aria-label="交流记录" aria-live="polite" tabIndex={0}
          onScroll={() => { const el = historyRef.current; if (el) followingRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 28 }}
          className="my-2 h-[112px] max-h-[22cqh] w-full max-w-2xl shrink-0 space-y-1 overflow-y-auto overscroll-contain rounded-2xl border border-border/40 bg-background/60 px-4 py-2 text-[13px] leading-6 backdrop-blur-md">
          {history.map(item => <div key={item.id} className="whitespace-pre-wrap break-words"><span className={cn('mr-2 text-xs font-medium', item.role === 'user' ? 'text-emerald-600' : 'text-primary')}>{item.role === 'user' ? '你' : '罗伊'}</span>{item.text || '正在理解…'}</div>)}
        </section> : null}
        <div className="flex shrink-0 items-center justify-center gap-2 pb-2 text-xs">
          <button type="button" className="inline-flex min-h-9 shrink-0 items-center whitespace-nowrap rounded-xl border-0 bg-muted/35 px-3 py-1.5 text-muted-foreground no-underline shadow-none hover:bg-muted/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/60" onClick={onToggleMuted}>{muted ? '开启语音回复' : '静音回复'}</button>
          <button type="button" aria-label={conversationActive ? '结束交流 / 停止' : '开始交流'} aria-pressed={conversationActive} disabled={stopping}
            data-testid="conversation-toggle"
            className={cn('inline-flex min-h-9 shrink-0 items-center whitespace-nowrap rounded-xl border-0 px-4 py-1.5 font-medium no-underline shadow-none transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/60 disabled:opacity-60', conversationActive ? 'bg-red-500/10 text-red-600 hover:bg-red-500/20' : 'bg-muted/35 text-foreground hover:bg-muted/60')}
            onClick={conversationActive ? onEndConversation : onToggleVoiceTalk}>{stopping ? '正在停止…' : conversationActive ? '结束交流 / 停止' : '开始交流'}</button>
        </div>
        <footer data-testid="assistant-footer" className="flex w-full shrink-0 flex-col items-center gap-1.5 bg-background/35 pb-1 pt-2 backdrop-blur-md">
        <div className="flex w-full max-w-4xl flex-wrap items-center justify-center gap-1.5 pb-1">
          {chips.map((chip) => {
            const Icon = ICONS[chip.icon ?? 'chat']
            return (
              <button
                key={chip.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onChip(chip)
                }}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border-0 bg-muted/35 px-3 text-[12px] text-foreground no-underline shadow-none transition-colors hover:bg-primary/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/60"
              >
                <Icon size={13} className="shrink-0 text-primary/80" />
                <span className="whitespace-nowrap">{chip.label}</span>
              </button>
            )
          })}
        </div>

        <div className="flex w-full max-w-xl flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
          <form
            className="flex w-full items-center gap-2 rounded-2xl border border-border/70 bg-background/75 px-3 py-2 shadow-sm backdrop-blur-sm"
            onSubmit={(e) => {
              e.preventDefault()
              submitCommand()
            }}
          >
            <MessageSquare size={14} className="shrink-0 text-muted-foreground" />
            <input
              value={commandDraft}
              onChange={(e) => setCommandDraft(e.target.value)}
              placeholder="也可以输入指令，例如：打开软件、查天气、创建项目"
              className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/80"
              aria-label="助手指令"
            />
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                onToggleVoiceTalk?.()
              }}
              className={cn(
                'inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border/80 transition',
                voiceTalkActive
                  ? 'bg-primary/15 text-primary border-primary/40'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
              )}
              aria-label={voiceTalkActive ? '停止说话' : '点击说话'}
              title={voiceTalkActive ? '停止听写' : '点击说话'}
            >
              <Mic size={14} />
            </button>
            <button
              type="submit"
              className="inline-flex h-8 items-center rounded-lg bg-foreground px-3 text-[12px] text-background hover:opacity-90"
            >
              发送
            </button>
          </form>

          {/* 系统在线等状态：放在聊天框下面，不挡球 */}
          <div className="px-1 text-center">
            <div className={cn('text-[13px] font-medium tracking-wide', statusColor.replace('text-', 'text-').replace('500', '600/90'))}>
              <span className={cn('inline-flex items-center gap-1.5', statusColor)}>
                <Circle size={7} className="fill-current" />
                {statusLine}
              </span>
            </div>
            {detailLine && history.length === 0 ? (
              <div className="mt-0.5 text-[11.5px] text-muted-foreground">{detailLine.slice(0, 240)}</div>
            ) : null}
            {wakeHint ? (
              <div className="mt-0.5 text-[11px] text-muted-foreground/80">{wakeHint}</div>
            ) : null}
          </div>
        </div>
        </footer>
      </main>
    </div>
  )
}

export { DEFAULT_CHIPS }