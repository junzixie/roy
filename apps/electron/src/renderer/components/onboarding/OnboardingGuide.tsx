/**
 * 新手引导 + 更新说明。
 *
 * 启动后（登录门槛之下，登录完成才看得到）按下面的规则二选一：
 * - 全新用户（没完成过引导且一个会话都没有）→ 新手引导，走完后记下当前版本
 * - 老用户升级 → 弹出从上次看过的版本到当前版本之间的更新说明
 * 两者都以设置里的 lastSeenChangelogVersion / onboardingCompleted 为准，存在主进程，不怕清缓存。
 */
import * as React from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { ArrowRight, Bot, Check, Keyboard, MessageSquarePlus, ShieldCheck, Sparkles, Store, Wand2, X } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { channelsAtom } from '@/atoms/chat-atoms'
import { onboardingGuideOpenAtom, settingsOpenAtom, settingsTabAtom, type SettingsTab } from '@/atoms/settings-tab'
import { changelogSince, type ChangelogEntry } from '@/lib/changelog'
import { CURRENT_ONBOARDING_VERSION, hasCompletedCurrentOnboarding } from '@/types/settings'

declare const __APP_VERSION__: string
const APP_VERSION = __APP_VERSION__

interface Step {
  icon: React.ElementType
  title: string
  body: React.ReactNode
  /** 要高亮的界面元素（CSS 选择器，按顺序找第一个在屏幕上的）；找不到就居中显示 */
  target?: string
  /** 卡片上的操作按钮：会先收起引导，做完（关掉设置）后回到这一步 */
  action?: { label: string; run: (openSettings: (tab: SettingsTab) => void) => void }
}

/** 引导里跳去设置时先把引导收起，设置关掉后回到这一步 */
const OpenSettingsContext = React.createContext<(tab: SettingsTab) => void>(() => {})

function ModelStatus(): React.ReactElement {
  const channels = useAtomValue(channelsAtom)
  const configured = channels.length > 0
  return (
    <div className={cn('mt-2 rounded-lg border px-3 py-2 text-[12.5px]', configured ? 'border-emerald-500/30 bg-emerald-500/[0.06]' : 'border-amber-500/30 bg-amber-500/[0.06]')}>
      {configured ? <><Check className="mr-1 inline size-4 text-emerald-500" />已配置 {channels.length} 个模型渠道</> : '还没有配置模型渠道，先配一个才能开始'}
    </div>
  )
}

const kbd = 'rounded border px-1 font-mono text-[11px]'

const STEPS: Step[] = [
  {
    icon: Sparkles,
    title: '欢迎使用 Roy',
    body: (
      <div className="space-y-2">
        <p>Roy 是本地优先的 AI 工作台：你说要做什么，它自己读文件、跑命令、改代码、查资料，把事情做完。</p>
        <p>会话、项目、技能和设置都保存在你电脑的 <span className="font-mono">~/.roy</span> 里。接下来在界面上带你认一下几个地方，大约一分钟。</p>
      </div>
    ),
  },
  {
    icon: Bot,
    title: '第一步：接上模型',
    target: '[data-tour="settings"]',
    body: (
      <div>
        <p>Roy 本身不带模型。点左下角这里打开设置 →「模型配置」，填一个模型渠道的 API Key：DeepSeek、Kimi、通义、智谱或你自己的中转站都行。</p>
        <ModelStatus />
      </div>
    ),
    action: { label: '去配置模型', run: (open) => open('channels') },
  },
  {
    icon: MessageSquarePlus,
    title: '第二步：新建一个任务',
    target: '[data-tour="new-task"]',
    body: <p>点「新建任务」开始。左侧可以按项目归类，每个项目指向你电脑上的一个工作文件夹，AI 只在里面动手。</p>,
  },
  {
    icon: Keyboard,
    title: '第三步：在这里说要做什么',
    target: '.roy-composer',
    body: (
      <ul className="list-disc space-y-1 pl-5">
        <li>直接描述目标，例如「把这个文件夹里的发票整理成一张表」。</li>
        <li>输入 <kbd className={kbd}>@</kbd> 引用文件、技能或其他会话。</li>
        <li>AI 干活时发的消息会先排队；点「工具后推送」让它做完当前这一步就看到。</li>
      </ul>
    ),
  },
  {
    icon: ShieldCheck,
    title: '第四步：决定 AI 能自己做多少',
    target: '[data-tour="permission-mode"]',
    body: <p>权限模式决定 AI 动手前要不要问你：「每步都问」最稳，「自动」省心，「计划模式」只出方案不动手。随时可以切换。</p>,
  },
  {
    icon: Store,
    title: '第五步：装技能和连接',
    target: '[data-tour="market"]',
    body: <p>「市场」里有现成的技能（写报告、做表格、整理资料…）、MCP 连接和伙伴，装好后在对话里输入 <kbd className={kbd}>@</kbd> 或直接说就会用上。</p>,
  },
  {
    icon: Wand2,
    title: '最后：账号、Pro 和帮助',
    target: '[data-tour="settings"]',
    body: (
      <ul className="list-disc space-y-1 pl-5">
        <li>设置 →「通用」最上面是你的档案和账号；电脑控制、手机远程等 Pro 功能用激活码开通。</li>
        <li>「软件更新」里看版本和每一版改了什么，也能重新打开这个引导。</li>
        <li>遇到问题：软件更新页 →「打开日志文件夹」，把 main.log 发给我们。</li>
      </ul>
    ),
  },
]

type Rect = { top: number; left: number; width: number; height: number }

function findTarget(selector?: string): Rect | null {
  if (!selector) return null
  for (const el of Array.from(document.querySelectorAll(selector))) {
    const r = (el as HTMLElement).getBoundingClientRect()
    if (r.width > 4 && r.height > 4 && r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth) {
      return { top: r.top, left: r.left, width: r.width, height: r.height }
    }
  }
  return null
}

const CARD_W = 340
const PAD = 6

/** 主界面分步指引：把目标位置挖亮，旁边放说明卡片 */
function GuideTour({ open, index, setIndex, onFinish }: { open: boolean; index: number; setIndex: (index: number) => void; onFinish: () => void }): React.ReactElement | null {
  const step = STEPS[index]!
  const openSettings = React.useContext(OpenSettingsContext)
  const [rect, setRect] = React.useState<Rect | null>(null)
  const [vp, setVp] = React.useState({ w: window.innerWidth, h: window.innerHeight })
  const cardRef = React.useRef<HTMLDivElement>(null)
  const [cardH, setCardH] = React.useState(220)

  React.useEffect(() => {
    if (!open) return
    const update = (): void => { setRect(findTarget(step.target)); setVp({ w: window.innerWidth, h: window.innerHeight }) }
    update()
    // 侧栏折叠、窗口缩放、动画都会移动目标：定时跟一下
    const timer = window.setInterval(update, 400)
    window.addEventListener('resize', update)
    return () => { window.clearInterval(timer); window.removeEventListener('resize', update) }
  }, [open, step.target])

  React.useLayoutEffect(() => {
    if (cardRef.current) setCardH(cardRef.current.offsetHeight)
  }, [open, index, rect])

  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onFinish()
      if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); index < STEPS.length - 1 ? setIndex(index + 1) : onFinish() }
      if (e.key === 'ArrowLeft' && index > 0) setIndex(index - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, index, setIndex, onFinish])

  if (!open) return null

  // 卡片位置：目标右侧放得下就放右侧，否则下方 / 上方；都不行就居中
  let cardTop = vp.h / 2 - cardH / 2
  let cardLeft = vp.w / 2 - CARD_W / 2
  if (rect) {
    const gap = 14
    if (rect.left + rect.width + gap + CARD_W < vp.w - 12) {
      cardLeft = rect.left + rect.width + gap
      cardTop = rect.top + rect.height / 2 - cardH / 2
    } else if (rect.top + rect.height + gap + cardH < vp.h - 12) {
      cardTop = rect.top + rect.height + gap
      cardLeft = rect.left + rect.width / 2 - CARD_W / 2
    } else {
      cardTop = rect.top - gap - cardH
      cardLeft = rect.left + rect.width / 2 - CARD_W / 2
    }
    cardTop = Math.max(12, Math.min(cardTop, vp.h - cardH - 12))
    cardLeft = Math.max(12, Math.min(cardLeft, vp.w - CARD_W - 12))
  }
  const Icon = step.icon
  const last = index === STEPS.length - 1

  return (
    <div className="fixed inset-0 z-[150]" role="dialog" aria-modal="true" aria-label={`新手引导：${step.title}`}>
      {rect ? (
        <div
          className="pointer-events-none absolute rounded-xl transition-all duration-200"
          // 描边用固定的亮蓝：主题主色在浅色是黑、深色是白，压在遮罩上都看不清
          style={{ top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2, boxShadow: '0 0 0 2px #3b82f6, 0 0 0 6px rgba(59,130,246,0.25), 0 0 0 9999px rgba(0,0,0,0.6)' }}
        />
      ) : (
        <div className="absolute inset-0 bg-black/55" />
      )}
      {/* 挡住其他点击，避免引导过程中误操作 */}
      <div className="absolute inset-0" onClick={(e) => e.stopPropagation()} />
      <div
        ref={cardRef}
        className="absolute rounded-xl border border-border bg-background p-4 text-[13.5px] leading-relaxed text-foreground shadow-2xl transition-[top,left] duration-200"
        style={{ top: cardTop, left: cardLeft, width: CARD_W }}
      >
        <div className="mb-2 flex items-center gap-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="size-4" /></div>
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold">{step.title}</div>
            <div className="text-[11.5px] text-muted-foreground">新手引导 · {index + 1} / {STEPS.length}</div>
          </div>
          <button type="button" aria-label="关闭引导" onClick={onFinish} className="rounded p-1 text-foreground/40 hover:bg-foreground/[0.06] hover:text-foreground"><X className="size-4" /></button>
        </div>
        <div className="text-foreground/85">{step.body}</div>
        {step.action && (
          <Button size="sm" className="mt-3 w-full" onClick={() => step.action!.run(openSettings)}>{step.action.label}</Button>
        )}
        <div className="mt-3 flex items-center justify-between">
          <div className="flex gap-1.5" aria-hidden>
            {STEPS.map((_, i) => (
              <span key={i} className={cn('h-1.5 rounded-full transition-all', i === index ? 'w-4 bg-primary' : 'w-1.5 bg-foreground/15')} />
            ))}
          </div>
          <div className="flex gap-1.5">
            {index === 0
              ? <Button variant="ghost" size="sm" onClick={onFinish}>跳过</Button>
              : <Button variant="ghost" size="sm" onClick={() => setIndex(index - 1)}>上一步</Button>}
            <Button size="sm" variant={step.action ? 'outline' : 'default'} onClick={() => (last ? onFinish() : setIndex(index + 1))}>
              {last ? '开始使用' : <>下一步<ArrowRight className="ml-1 size-3.5" /></>}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function ChangelogEntryView({ entry }: { entry: ChangelogEntry }): React.ReactElement {
  return (
    <div className="space-y-2.5">
      {entry.sections.map((section) => (
        <div key={section.title}>
          <div className="mb-1 text-[12px] font-medium text-muted-foreground">{section.title}</div>
          <ul className="list-disc space-y-1 pl-5 text-[13px] leading-relaxed">
            {section.items.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      ))}
    </div>
  )
}

function WhatsNewDialog({ entries, onClose }: { entries: ChangelogEntry[]; onClose: () => void }): React.ReactElement {
  const latest = entries[0]
  return (
    <Dialog open={entries.length > 0} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent className="max-w-lg">
        <div>
          <DialogTitle className="text-base">Roy 已更新到 v{APP_VERSION}</DialogTitle>
          <DialogDescription className="mt-1 text-[12.5px]">{latest?.headline}</DialogDescription>
        </div>
        <div className="max-h-[55vh] space-y-5 overflow-y-auto pr-1">
          {entries.map((entry) => (
            <div key={entry.version} className="space-y-2">
              {entries.length > 1 && (
                <div className="flex items-baseline gap-2 border-b border-border/50 pb-1">
                  <span className="font-mono text-[13px] font-medium">v{entry.version}</span>
                  <span className="text-[11.5px] text-muted-foreground">{entry.date}</span>
                </div>
              )}
              <ChangelogEntryView entry={entry} />
            </div>
          ))}
        </div>
        <div className="flex justify-end">
          <Button size="sm" onClick={onClose}>知道了</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function FirstRunDialogs(): React.ReactElement | null {
  const [guideOpen, setGuideOpen] = useAtom(onboardingGuideOpenAtom)
  const [stepIndex, setStepIndex] = React.useState(0)
  const [pausedForSettings, setPausedForSettings] = React.useState(false)
  const settingsOpen = useAtomValue(settingsOpenAtom)
  const setSettingsTab = useSetAtom(settingsTabAtom)
  const setSettingsOpen = useSetAtom(settingsOpenAtom)
  const [whatsNew, setWhatsNew] = React.useState<ChangelogEntry[]>([])

  // 从关于页「重新查看新手引导」打开时从第一步开始
  const prevGuideOpen = React.useRef(guideOpen)
  React.useEffect(() => {
    if (guideOpen && !prevGuideOpen.current && !pausedForSettings) setStepIndex(0)
    prevGuideOpen.current = guideOpen
  }, [guideOpen, pausedForSettings])

  const openSettingsFromGuide = React.useCallback((tab: SettingsTab) => {
    setPausedForSettings(true)
    setGuideOpen(false)
    setSettingsTab(tab)
    setSettingsOpen(true)
  }, [setGuideOpen, setSettingsOpen, setSettingsTab])

  React.useEffect(() => {
    if (pausedForSettings && !settingsOpen) {
      setGuideOpen(true)
      setPausedForSettings(false)
    }
  }, [pausedForSettings, settingsOpen, setGuideOpen])
  // 登录门槛还在时不能弹：模态框会抢走焦点，登录表单就点不了了
  const [signedIn, setSignedIn] = React.useState(false)
  React.useEffect(() => {
    const load = (): void => {
      void window.electronAPI.accountGet().then((v) => setSignedIn(v.signedIn)).catch(() => setSignedIn(false))
    }
    load()
    return window.electronAPI.onAccountChanged(load)
  }, [])

  React.useEffect(() => {
    if (!signedIn) return
    let cancelled = false
    void (async () => {
      try {
        const settings = await window.electronAPI.getSettings()
        const lastSeen = settings.lastSeenChangelogVersion
        if (hasCompletedCurrentOnboarding(settings) || lastSeen) {
          const entries = changelogSince(lastSeen, APP_VERSION)
          if (!lastSeen || entries.length === 0) {
            // 第一次记录版本（老用户首次装上带更新说明的版本）或没有新说明：静默记下
            if (lastSeen !== APP_VERSION) await window.electronAPI.updateSettings({ lastSeenChangelogVersion: APP_VERSION })
            if (!lastSeen && !cancelled) setWhatsNew(changelogSince('0.0.0', APP_VERSION).slice(0, 1))
            return
          }
          if (!cancelled) setWhatsNew(entries)
          return
        }
        // 没完成引导：有会话记录的是老用户（以前的版本没有引导），直接记为完成并展示本版说明
        const sessions = await window.electronAPI.listAgentSessions().catch(() => [])
        if (sessions.length > 0) {
          await window.electronAPI.updateSettings({
            onboardingCompleted: true,
            onboardingVersion: CURRENT_ONBOARDING_VERSION,
            lastSeenChangelogVersion: APP_VERSION,
          })
          if (!cancelled) setWhatsNew(changelogSince('0.0.0', APP_VERSION).slice(0, 1))
          return
        }
        if (!cancelled) setGuideOpen(true)
      } catch (error) {
        console.warn('[新手引导] 读取设置失败，本次跳过:', error)
      }
    })()
    return () => { cancelled = true }
  }, [signedIn, setGuideOpen])

  const finishGuide = React.useCallback(() => {
    setGuideOpen(false)
    void window.electronAPI.updateSettings({
      onboardingCompleted: true,
      onboardingVersion: CURRENT_ONBOARDING_VERSION,
      lastSeenChangelogVersion: APP_VERSION,
    }).catch(() => { /* 下次再显示也无妨 */ })
  }, [setGuideOpen])

  const closeWhatsNew = React.useCallback(() => {
    setWhatsNew([])
    void window.electronAPI.updateSettings({ lastSeenChangelogVersion: APP_VERSION }).catch(() => {})
  }, [])

  return (
    <>
      <OpenSettingsContext.Provider value={openSettingsFromGuide}>
        <GuideTour open={guideOpen && signedIn} index={stepIndex} setIndex={setStepIndex} onFinish={finishGuide} />
      </OpenSettingsContext.Provider>
      {!guideOpen && !pausedForSettings && <WhatsNewDialog entries={whatsNew} onClose={closeWhatsNew} />}
    </>
  )
}
