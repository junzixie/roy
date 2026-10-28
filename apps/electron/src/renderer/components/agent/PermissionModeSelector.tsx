/**
 * PermissionModeSelector — Agent 权限模式切换器
 *
 * 照 Arthur 的输入框：底栏显示「图标 + 模式名」，点开是一张带说明的菜单。
 * 四档同 Arthur：自动 / 每步都问 / 全自动 / 计划模式。
 * 每个会话独立维护自己的权限模式。
 */

import * as React from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { Check, Hand, ShieldCheck, Zap, Map as MapIcon, Gauge, Sparkles, Layers, type LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { agentPermissionModeMapAtom, agentDefaultPermissionModeAtom, sessionPersistedPermissionModeAtom, sessionExistsAtom, agentPlanModeSessionsAtom } from '@/atoms/agent-atoms'
import type { RoyPermissionMode } from '@roy/shared'
import { ROY_PERMISSION_MODE_ORDER } from '@roy/shared'
import { getDisplayedPermissionMode, updatePlanModeSessionSet } from '@/lib/agent-plan-mode'
import { WORK_MODE_ORDER, WORK_MODE_UI, readWorkMode, workModePatch, type AgentWorkMode } from '@/lib/agent-modes'
import { ensureProFeature } from '@/atoms/pro-activation'

// 底栏按钮只用文字颜色区分（照 Arthur）：自动灰、全自动红、其余主题色
const MODE_UI: Record<RoyPermissionMode, { icon: LucideIcon; label: string; desc: string; tone: string }> = {
  auto: {
    icon: ShieldCheck,
    label: '自动',
    desc: '看、查、在工作文件夹里改文件直接做；危险命令、动文件夹外的文件先问你',
    tone: 'text-foreground/60',
  },
  ask: {
    icon: Hand,
    label: '每步都问',
    desc: '改文件、跑命令前都先问你',
    tone: 'text-primary',
  },
  bypassPermissions: {
    icon: Zap,
    label: '全自动',
    desc: '什么都不问，放手让它干（电脑控制仍会确认）',
    tone: 'text-red-500',
  },
  plan: {
    icon: MapIcon,
    label: '计划模式',
    desc: '只看不改，先给你一份计划，你批准后再动手',
    tone: 'text-primary',
  },
}

// 工作模式：全局设置，和设置 → 权限里的「工作模式」是同一个值；运行方式（快速 / 隔离）只在设置里改
const WORK_MODE_ICON: Record<AgentWorkMode, LucideIcon> = { native: Gauge, standard: Layers, deepseek: Sparkles }

interface PermissionModeSelectorProps {
  sessionId: string
}

export function PermissionModeSelector({ sessionId }: PermissionModeSelectorProps): React.ReactElement | null {
  const [modeMap, setModeMap] = useAtom(agentPermissionModeMapAtom)
  const setPlanModeSessions = useSetAtom(agentPlanModeSessionsAtom)
  const planModeSessions = useAtomValue(agentPlanModeSessionsAtom)
  const defaultMode = useAtomValue(agentDefaultPermissionModeAtom)
  const persistedSessionMode = useAtomValue(sessionPersistedPermissionModeAtom(sessionId))
  const mode = modeMap.get(sessionId) ?? persistedSessionMode ?? defaultMode
  const planModeActive = planModeSessions.has(sessionId)
  const displayMode = getDisplayedPermissionMode(mode, planModeActive)
  const sessionExistsInList = useAtomValue(sessionExistsAtom(sessionId))

  // 初始化：如果当前 session 不在 Map 中，按 session meta.permissionMode → 默认完全自动 读回。
  // 只写入当前 session，不回写到 agentDefaultPermissionModeAtom，避免跨会话污染。
  React.useEffect(() => {
    if (!sessionExistsInList) return
    setModeMap((prev: Map<string, RoyPermissionMode>) => {
      if (prev.has(sessionId)) return prev
      const next = new Map(prev)
      next.set(sessionId, persistedSessionMode ?? defaultMode)
      return next
    })
  }, [sessionId, persistedSessionMode, sessionExistsInList, defaultMode, setModeMap])

  const applyMode = React.useCallback(async (nextMode: RoyPermissionMode) => {
    if (nextMode === displayMode) return
    const prevMode = mode
    const prevPlanModeActive = planModeActive

    // 乐观更新当前 session 的模式
    setModeMap((prev: Map<string, RoyPermissionMode>) => {
      const next = new Map(prev)
      next.set(sessionId, nextMode)
      return next
    })
    setPlanModeSessions((prev: Set<string>) => updatePlanModeSessionSet(prev, sessionId, nextMode === 'plan'))

    // 热切换运行中的当前 session；失败时回滚，保持 UI/后端一致
    try {
      await window.electronAPI.updateSessionPermissionMode(sessionId, nextMode)
    } catch (error) {
      console.error('[PermissionModeSelector] 运行中切换权限模式失败，回滚 UI:', error)
      setModeMap((prev: Map<string, RoyPermissionMode>) => {
        const next = new Map(prev)
        next.set(sessionId, prevMode)
        return next
      })
      setPlanModeSessions((prev: Set<string>) => updatePlanModeSessionSet(prev, sessionId, prevPlanModeActive || prevMode === 'plan'))
    }
  }, [displayMode, mode, planModeActive, sessionId, setModeMap, setPlanModeSessions])

  const [runMode, setRunMode] = React.useState<AgentWorkMode>('standard')
  const settingsRef = React.useRef<{ workMode?: string; agentMode?: string }>({})
  const loadRunMode = React.useCallback(() => {
    window.electronAPI.getSettings()
      .then((s) => { settingsRef.current = s as { workMode?: string; agentMode?: string }; setRunMode(readWorkMode(settingsRef.current)) })
      .catch(() => {})
  }, [])
  React.useEffect(() => { loadRunMode() }, [loadRunMode])

  const applyRunMode = React.useCallback(async (next: AgentWorkMode, skipProCheck = false): Promise<void> => {
    if (next === runMode) return
    // Pro 模式：没激活就弹激活码窗，激活成功后再继续切换
    if (next === 'deepseek' && !skipProCheck && !(await ensureProFeature('deepseek-mode', () => { void applyRunModeRef.current(next, true) }))) return
    const prev = runMode
    setRunMode(next)
    try {
      const patch = workModePatch(next, settingsRef.current)
      await window.electronAPI.updateSettings(patch)
      settingsRef.current = { ...settingsRef.current, ...patch }
      toast.success(`已切到${WORK_MODE_UI[next].label}，下一条消息生效`)
    } catch (error) {
      console.error('[PermissionModeSelector] 切换运行模式失败:', error)
      setRunMode(prev)
      toast.error('运行模式保存失败，请重试')
    }
  }, [runMode])
  // 激活成功的回调晚于本次渲染执行，用 ref 拿最新的 applyRunMode
  const applyRunModeRef = React.useRef(applyRunMode)
  applyRunModeRef.current = applyRunMode

  const current = MODE_UI[displayMode]
  const Icon = current.icon

  return (
    <DropdownMenu onOpenChange={(open) => { if (open) loadRunMode() }}>
      <DropdownMenuTrigger asChild>
        <button
          data-tour="permission-mode"
          type="button"
          title={`${current.label}：${current.desc}`}
          className={cn('flex h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-2 text-[12.5px] transition-colors hover:bg-foreground/[0.06] data-[state=open]:bg-foreground/[0.06]', current.tone)}
        >
          <Icon size={14} />
          {current.label}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="top"
        sideOffset={6}
        className="w-[300px] rounded-xl p-1 shadow-lg"
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          document.querySelector<HTMLElement>('.ProseMirror')?.focus()
        }}
      >
        <DropdownMenuLabel className="px-2.5 pb-1 pt-1.5 text-[11.5px] font-medium text-muted-foreground">工作模式</DropdownMenuLabel>
        {WORK_MODE_ORDER.map((m) => {
          const ui = WORK_MODE_UI[m]
          const ItemIcon = WORK_MODE_ICON[m]
          return (
            <DropdownMenuItem key={m} onSelect={() => void applyRunMode(m)} className="items-center gap-2 rounded-lg px-2.5 py-1.5">
              <span className="flex w-[14px] shrink-0">
                {m === runMode ? <Check size={14} className="text-emerald-600" /> : <ItemIcon size={14} className="text-foreground/45" />}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="flex items-center gap-1.5 text-[13px] font-medium text-foreground">{ui.label}{ui.pro && <span className="rounded bg-amber-500/15 px-1 py-px text-[10px] font-semibold text-amber-700 dark:text-amber-400">Pro</span>}</span>
                <span className="text-[11.5px] leading-4 text-muted-foreground">{ui.desc}</span>
              </span>
            </DropdownMenuItem>
          )
        })}
        <DropdownMenuSeparator className="my-1" />
        <DropdownMenuLabel className="px-2.5 pb-1 pt-1 text-[11.5px] font-medium text-muted-foreground">权限</DropdownMenuLabel>
        {ROY_PERMISSION_MODE_ORDER.map((m) => {
          const ui = MODE_UI[m]
          const ItemIcon = ui.icon
          return (
            <DropdownMenuItem key={m} onSelect={() => void applyMode(m)} className="items-center gap-2 rounded-lg px-2.5 py-1.5">
              <span className="flex w-[14px] shrink-0">
                {m === displayMode ? <Check size={14} className="text-emerald-600" /> : <ItemIcon size={14} className="text-foreground/45" />}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="text-[13px] font-medium text-foreground">{ui.label}</span>
                <span className="text-[11.5px] leading-4 text-muted-foreground">{ui.desc}</span>
              </span>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
