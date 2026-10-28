/**
 * 用量详情
 *
 * 点侧边栏用量卡进入。版式对齐 Arthur：
 * 顶部余额 + 今天/本月/缓存三张数字卡，中间 14 天柱状图，底部本月按模型分布。
 *
 * 数据来自本地会话 JSONL（usage-summary）与供应商余额接口，
 * 供应商没有公开余额接口时明确写「不支持查询」，不猜数字。
 */

import * as React from 'react'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import { useAtomValue, useSetAtom } from 'jotai'
import { agentChannelIdAtom } from '@/atoms/agent-atoms'
import { channelsAtom } from '@/atoms/chat-atoms'
import { activeViewAtom } from '@/atoms/active-view'
import { cn } from '@/lib/utils'
import { BalanceCard } from '@/components/usage/BalanceCard'

interface Bucket {
  sessions: number
  messages: number
  inputTokens: number
  outputTokens: number
}

interface UsageSummary {
  total: Bucket
  today: Bucket
  last30Days: Bucket
  days: Record<string, number>
  byModel: Record<string, number>
  cacheHitRate: number | null
  scannedSessions: number
  truncated: boolean
}

interface BalanceView {
  isAvailable?: boolean
  currency?: string
  total?: string
  granted?: string
  used?: string
  limit?: string
}

/** 中文习惯：万/亿优先，比 K/M 更直观 */
function formatTokens(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0'
  if (value >= 1e8) return `${(value / 1e8).toFixed(2)} 亿`
  if (value >= 1e4) return `${(value / 1e4).toFixed(1)} 万`
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`
  return String(Math.round(value))
}


export function UsagePage(): React.ReactElement {
  const setActiveView = useSetAtom(activeViewAtom)
  const channels = useAtomValue(channelsAtom)
  const agentChannelId = useAtomValue(agentChannelIdAtom)

  const [usage, setUsage] = React.useState<UsageSummary | null>(null)
  const [balance, setBalance] = React.useState<{ supported: boolean; view?: BalanceView; message?: string } | null>(null)
  const [busy, setBusy] = React.useState(false)

  const channel = channels.find((item) => item.id === agentChannelId) ?? channels.find((item) => item.enabled)

  const loadUsage = React.useCallback(() => {
    void window.electronAPI
      .getUsageSummary()
      .then((summary) => setUsage(summary as UsageSummary))
      .catch((error: unknown) => console.error('[用量] 读取失败:', error))
  }, [])

  const loadBalance = React.useCallback(() => {
    if (!channel) return
    setBusy(true)
    void window.electronAPI
      .getChannelBalance(channel.id)
      .then((result) => setBalance(result))
      .catch(() => setBalance({ supported: false, message: '查询失败' }))
      .finally(() => setBusy(false))
  }, [channel])

  React.useEffect(() => { loadUsage() }, [loadUsage])
  React.useEffect(() => { loadBalance() }, [loadBalance])

  // 近 14 天：缺失日期补 0，保证柱子数量固定
  const days = React.useMemo(() => {
    const list: Array<[string, number]> = []
    for (let i = 13; i >= 0; i -= 1) {
      const d = new Date(Date.now() - i * 86400000)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      list.push([key, usage?.days?.[key] ?? 0])
    }
    return list
  }, [usage])

  const maxDay = Math.max(1, ...days.map(([, v]) => v))

  const models = React.useMemo(() => {
    const entries = Object.entries(usage?.byModel ?? {})
    entries.sort((a, b) => b[1] - a[1])
    return entries
  }, [usage])
  const maxModel = Math.max(1, ...models.map(([, v]) => v))

  const todayTokens = usage ? usage.today.inputTokens + usage.today.outputTokens : 0
  const monthTokens = usage ? usage.last30Days.inputTokens + usage.last30Days.outputTokens : 0

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-content-area">
      <div className="mx-auto w-full max-w-[880px] px-6 py-5">
        {/* 顶部 */}
        <div className="mb-5 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveView('conversations')}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[13px] text-foreground/55 hover:bg-foreground/[0.06] hover:text-foreground"
          >
            <ArrowLeft size={14} /> 返回
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => { loadUsage(); loadBalance() }}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-[12.5px] text-foreground/65 hover:bg-foreground/[0.05] disabled:opacity-50"
          >
            <RefreshCw size={12} className={cn(busy && 'animate-spin')} /> 刷新
          </button>
        </div>

        {/* 余额 + 数字卡（Arthur 风格） */}
        <div className="mb-4">
          <BalanceCard
            balance={balance}
            channelName={channel?.name}
            todayTokens={todayTokens}
            todayMessages={usage?.today.messages ?? 0}
            monthTokens={monthTokens}
            monthSessions={usage?.last30Days.sessions ?? 0}
            cacheHitRate={usage?.cacheHitRate ?? null}
            busy={busy}
            onRefresh={() => { loadUsage(); loadBalance() }}
            formatTokens={formatTokens}
          />
        </div>

        {/* 14 天柱状图 */}
        <div className="mb-4 rounded-xl border border-border bg-card px-5 pb-6 pt-4">
          <div className="mb-3 text-[13px] font-medium text-foreground/75">最近 14 天</div>
          <div className="flex h-32 items-end gap-1">
            {days.map(([key, value]) => (
              <div
                key={key}
                className="group relative flex h-full flex-1 flex-col justify-end"
                title={`${key}：${formatTokens(value)} tokens`}
              >
                <div
                  className="w-full rounded-[2px] bg-foreground/25 transition-colors group-hover:bg-foreground/45"
                  style={{ height: `${Math.max(value ? 3 : 1, (value / maxDay) * 100)}%` }}
                />
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-1">
            {days.map(([key], index) => (
              <span key={key} className="flex-1 text-center text-[9.5px] tabular-nums text-foreground/35">
                {index % 2 === 0 ? key.slice(8) : ''}
              </span>
            ))}
          </div>
        </div>

        {/* 本月按模型 */}
        {models.length > 0 && (
          <div className="rounded-xl border border-border bg-card px-5 py-4">
            <div className="mb-3 text-[13px] font-medium text-foreground/75">本月按模型</div>
            <div className="space-y-2">
              {models.map(([model, value]) => (
                <div key={model} className="flex items-center gap-3">
                  <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-foreground/70" title={model}>
                    {model}
                  </span>
                  <span className="h-1.5 w-32 shrink-0 overflow-hidden rounded-full bg-foreground/[0.06]">
                    <span
                      className="block h-full rounded-full bg-foreground/40"
                      style={{ width: `${(value / maxModel) * 100}%` }}
                    />
                  </span>
                  <span className="w-16 shrink-0 text-right tabular-nums text-[12.5px] text-foreground/60">
                    {formatTokens(value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {usage && (
          <div className="mt-4 text-[11.5px] text-foreground/30">
            统计范围：{usage.scannedSessions} 个会话，仅本机记录，不发往任何服务器
          </div>
        )}
      </div>
    </div>
  )
}
