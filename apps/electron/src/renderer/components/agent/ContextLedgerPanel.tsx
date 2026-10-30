/**
 * ContextLedgerPanel — 上下文压缩历史
 *
 * 主进程每次压缩上下文都会往 `~/.roy/context-ledger/<sessionId>.jsonl` 写一条记录，
 * 里面带着压缩前后的 token 数、触发原因、用的策略。但这些数据**此前没有任何读取方**：
 * 写了就沉底，用户只能看到「正在压缩上下文...」一闪而过，不知道自己被压缩过几次、
 * 每次省了多少、是自动触发还是手动点的。
 *
 * 这个面板把账本读出来。设计上只做展示，不提供任何操作——压缩决策仍然由
 * runtime 的阈值逻辑控制，面板只负责让这个过程可见。
 */

import * as React from 'react'
import { useAtomValue } from 'jotai'
import { History, Loader2 } from 'lucide-react'
import { formatBytes } from '@roy/shared'
import type { ContextLedgerEntry } from '@roy/shared'
import { cn } from '@/lib/utils'

/** 触发原因的中文文案。 */
const REASON_LABELS: Record<ContextLedgerEntry['reason'], string> = {
  manual: '手动触发',
  threshold: '达到阈值',
  overflow: '上下文溢出',
}

/** 压缩策略的中文文案。 */
const STRATEGY_LABELS: Record<ContextLedgerEntry['strategy'], string> = {
  'cache-preserving': '保缓存',
  balanced: '均衡',
  aggressive: '激进',
}

/** 状态对应的颜色与文案；started 是中间态，不算结果。 */
const STATUS_META: Record<ContextLedgerEntry['status'], { label: string; className: string }> = {
  success: { label: '成功', className: 'text-emerald-600 dark:text-emerald-400' },
  failed: { label: '失败', className: 'text-destructive' },
  noop: { label: '无需压缩', className: 'text-foreground/50' },
  started: { label: '进行中', className: 'text-amber-600 dark:text-amber-400' },
}

/** token 数带千分位；缺失时显示占位符而不是 0，避免误导。 */
function formatTokens(value?: number): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return value.toLocaleString('zh-CN')
}

/** 时间戳 → `10-30 03:14` 这种紧凑格式，跨天也能读。 */
function formatTime(at: number): string {
  if (!Number.isFinite(at)) return '—'
  const date = new Date(at)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

interface ContextLedgerPanelProps {
  /** 当前会话 ID；为空时不请求。 */
  sessionId?: string
  /** 面板是否可见，不可见时跳过请求，省掉无谓的 IPC。 */
  open: boolean
}

export function ContextLedgerPanel({ sessionId, open }: ContextLedgerPanelProps): React.ReactElement {
  const [entries, setEntries] = React.useState<ContextLedgerEntry[] | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')

  React.useEffect(() => {
    if (!open || !sessionId) return
    let dead = false
    setLoading(true)
    setError('')
    void window.electronAPI
      .getContextLedger(sessionId)
      .then((rows) => {
        if (dead) return
        // 最新的排前面：用户关心的是「刚才那次压缩」
        setEntries([...rows].reverse())
      })
      .catch((cause: unknown) => {
        if (dead) return
        setError(cause instanceof Error ? cause.message : '读取压缩历史失败')
        setEntries([])
      })
      .finally(() => { if (!dead) setLoading(false) })
    return () => { dead = true }
  }, [open, sessionId])

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-6 text-[12.5px] text-foreground/50">
        <Loader2 className="size-3.5 animate-spin" />
        正在读取压缩历史…
      </div>
    )
  }

  if (error) {
    return <div className="px-3 py-6 text-[12.5px] text-destructive">{error}</div>
  }

  if (!entries || entries.length === 0) {
    return (
      <div className="flex flex-col items-center gap-1.5 px-3 py-8 text-center">
        <History className="size-5 text-foreground/25" />
        <span className="text-[12.5px] text-foreground/50">这个会话还没压缩过上下文</span>
        <span className="text-[11.5px] text-foreground/35">
          接近阈值时会自动压缩，也可以在输入框的圆环里手动触发
        </span>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1 px-1 py-1">
      {entries.map((entry) => {
        const status = STATUS_META[entry.status]
        const reclaimed = entry.tokensReclaimed
        return (
          <div
            key={entry.id}
            className="rounded-md border border-border/60 bg-foreground/[0.02] px-2.5 py-2 text-[12px]"
          >
            <div className="flex items-center gap-2">
              <span className={cn('font-medium', status.className)}>{status.label}</span>
              <span className="text-foreground/45">{REASON_LABELS[entry.reason]}</span>
              <span className="rounded bg-foreground/[0.06] px-1.5 py-px text-[10.5px] text-foreground/55">
                {STRATEGY_LABELS[entry.strategy]}
              </span>
              <span className="ml-auto shrink-0 text-[11px] text-foreground/35">{formatTime(entry.at)}</span>
            </div>

            <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-foreground/60">
              <span>
                压缩前 <span className="text-foreground/85">{formatTokens(entry.tokensBefore)}</span>
              </span>
              <span className="text-foreground/25">→</span>
              <span>
                压缩后 <span className="text-foreground/85">{formatTokens(entry.tokensAfter)}</span>
              </span>
              {reclaimed != null && reclaimed > 0 && (
                <span className="text-emerald-600 dark:text-emerald-400">
                  省下 {formatTokens(reclaimed)}
                </span>
              )}
            </div>

            {entry.error && (
              <div className="mt-1 text-[11.5px] text-destructive">{entry.error}</div>
            )}
          </div>
        )
      })}
    </div>
  )
}
