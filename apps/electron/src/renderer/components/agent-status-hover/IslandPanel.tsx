/**
 * 灵动岛胶囊
 *
 * 常驻屏幕顶部居中，显示当前 Agent 的总体状态：
 * - 左侧圆点表示相位（运行中/等待交互/完成/出错）
 * - 中间是当前会话标题与细节
 * - 右侧是会话数量
 *
 * 数据来自主进程推送的 NativeAgentIslandSnapshot，和托盘悬停面板同源，
 * 所以两处状态永远一致。
 */

import * as React from 'react'
import type { AgentIslandPhase, NativeAgentIslandSnapshot } from '@roy/shared'
import { cn } from '@/lib/utils'

const PHASE_META: Record<AgentIslandPhase, { label: string; dot: string; glow: string }> = {
  idle: { label: '空闲', dot: 'bg-white/35', glow: '' },
  running: { label: '执行中', dot: 'bg-sky-400', glow: 'shadow-[0_0_10px_rgba(56,189,248,0.65)]' },
  'needs-interaction': { label: '等你确认', dot: 'bg-amber-400', glow: 'shadow-[0_0_10px_rgba(251,191,36,0.65)]' },
  completed: { label: '已完成', dot: 'bg-emerald-400', glow: 'shadow-[0_0_10px_rgba(52,211,153,0.6)]' },
  error: { label: '出错了', dot: 'bg-red-400', glow: 'shadow-[0_0_10px_rgba(248,113,113,0.65)]' },
}

/** 多个会话时优先展示最需要注意的那个。 */
const PRIORITY: AgentIslandPhase[] = ['needs-interaction', 'error', 'running', 'completed', 'idle']

export function IslandPanel(): React.ReactElement | null {
  const [snapshot, setSnapshot] = React.useState<NativeAgentIslandSnapshot | null>(null)
  const [visible, setVisible] = React.useState(false)

  React.useEffect(() => {
    const off = window.electronAPI.onWindowsAgentIslandPushSnapshot((next) => {
      setSnapshot(next)
      // 首帧先透明，再切到可见，触发一次滑入动画
      requestAnimationFrame(() => setVisible(true))
    })
    return off
  }, [])

  const sessions = snapshot?.state.sessions ?? []
  if (sessions.length === 0) return null

  const top = [...sessions].sort(
    (a, b) => PRIORITY.indexOf(a.phase) - PRIORITY.indexOf(b.phase),
  )[0]
  // 上面已保证 sessions 非空，这里只为满足类型收窄
  if (!top) return null
  const meta = PHASE_META[top.phase]

  return (
    <div className="flex h-full w-full items-start justify-center pt-1.5">
      <div
        className={cn(
          'flex h-[44px] w-full max-w-[400px] items-center gap-2.5 rounded-full px-3',
          // 底色写死成深色，不跟主题走：Tailwind 3 没有 /92 这一档透明度，之前的类名没生成，胶囊是透明的
          // 透明窗口里 backdrop-blur 会糊出灰边，去掉；阴影收小，免得被窗口边缘切成硬边
          'border border-white/10 text-white',
          'transition-all duration-300 ease-out',
          visible ? 'translate-y-0 opacity-100' : '-translate-y-3 opacity-0',
        )}
        style={{ background: 'rgb(24, 24, 27)', boxShadow: '0 3px 10px rgba(0,0,0,0.35)' }}
      >
        <span className={cn('size-2 shrink-0 rounded-full', meta.dot, meta.glow)} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12.5px] font-medium leading-4">{top.title || '新任务'}</div>
          <div className={cn('truncate text-[11px] leading-4', top.phase === 'error' ? 'text-red-300/90' : 'text-white/60')} title={top.detail}>
            {top.detail || meta.label}
          </div>
        </div>
        {sessions.length > 1 && (
          <span className="shrink-0 rounded-full bg-white/10 px-1.5 py-0.5 text-[10.5px] tabular-nums text-white/70">
            {sessions.length}
          </span>
        )}
        <span className="shrink-0 text-[11px] text-white/45">{meta.label}</span>
      </div>
    </div>
  )
}
