/**
 * 点右上角 × 时的「关闭 Roy」弹窗（应用内自绘，替代系统 TaskDialog）
 *
 * 主进程发 window:close-prompt（带 id）→ 这里先回 ack，再等用户选；
 * 选完回 window:close-prompt:result。主进程 1.5 秒内收不到 ack 才退回系统弹窗。
 */
import * as React from 'react'
import { Minimize2, Power, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type Choice = 'tray' | 'quit' | 'cancel'

export function CloseWindowDialog(): React.ReactElement | null {
  const [reqId, setReqId] = React.useState<string | null>(null)
  const [remember, setRemember] = React.useState(true)
  const [focusIdx, setFocusIdx] = React.useState(0)

  React.useEffect(() => {
    return window.electronAPI.onCloseWindowPrompt((id) => {
      window.electronAPI.closeWindowPromptAck(id)
      setRemember(true)
      setFocusIdx(0)
      setReqId(id)
    })
  }, [])

  const answer = React.useCallback((choice: Choice) => {
    if (!reqId) return
    window.electronAPI.closeWindowPromptResult(reqId, choice, choice !== 'cancel' && remember)
    setReqId(null)
  }, [reqId, remember])

  React.useEffect(() => {
    if (!reqId) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') { e.preventDefault(); answer('cancel') }
      else if (e.key === 'Enter') { e.preventDefault(); answer(focusIdx === 0 ? 'tray' : 'quit') }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setFocusIdx((i) => (i === 0 ? 1 : 0)) }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [reqId, answer, focusIdx])

  if (!reqId) return null

  const options = [
    { id: 'tray' as const, icon: Minimize2, title: '最小化到托盘', desc: '窗口收起，后台任务和定时任务继续跑', tone: 'text-foreground' },
    { id: 'quit' as const, icon: Power, title: '直接退出', desc: '彻底关闭 Roy，正在跑的任务会中断', tone: 'text-destructive' },
  ]

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/25 backdrop-blur-[2px] animate-in fade-in duration-150"
      onMouseDown={(e) => { if (e.target === e.currentTarget) answer('cancel') }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="roy-close-title"
        className="w-[380px] rounded-2xl border border-border/70 bg-popover p-5 text-popover-foreground shadow-2xl animate-in zoom-in-95 fade-in duration-150"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="roy-close-title" className="text-[15px] font-semibold">关闭 Roy</h2>
            <p className="mt-1 text-[12.5px] text-muted-foreground">点 × 的时候，你希望 Roy 怎么做？</p>
          </div>
          <button
            type="button"
            aria-label="取消"
            onClick={() => answer('cancel')}
            className="-mr-1 -mt-1 flex size-7 items-center justify-center rounded-lg text-foreground/50 transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
          >
            <X size={15} />
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-2">
          {options.map((o, i) => {
            const Icon = o.icon
            return (
              <button
                key={o.id}
                type="button"
                autoFocus={i === 0}
                onMouseEnter={() => setFocusIdx(i)}
                onFocus={() => setFocusIdx(i)}
                onClick={() => answer(o.id)}
                className={cn(
                  'flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors focus:outline-none',
                  focusIdx === i ? 'border-primary/40 bg-primary/[0.06]' : 'border-border/70 hover:bg-foreground/[0.03]',
                )}
              >
                <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg bg-foreground/[0.05]', o.tone)}>
                  <Icon size={16} />
                </span>
                <span className="min-w-0">
                  <span className={cn('block text-[13.5px] font-medium', o.tone)}>{o.title}</span>
                  <span className="mt-0.5 block text-[12px] text-muted-foreground">{o.desc}</span>
                </span>
              </button>
            )
          })}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <label className="flex cursor-pointer select-none items-center gap-2 text-[12.5px] text-foreground/75">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="size-3.5 accent-primary"
            />
            记住我的选择
          </label>
          <span className="text-[11.5px] text-muted-foreground">可在 设置 → 权限设置 里改</span>
        </div>
      </div>
    </div>
  )
}
