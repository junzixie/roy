/**
 * 余额卡片（Arthur 风格）
 *
 * 横向布局：左侧余额（大字号） + 竖线 + 右侧三个数据卡（今天/本月/缓存）
 * 对齐 Arthur 的简洁设计，一张卡片包含全部核心信息
 */

import * as React from 'react'
import { RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

interface BalanceView {
  isAvailable?: boolean
  currency?: string
  total?: string
  granted?: string
  toppedUp?: string
  used?: string
  limit?: string
}

interface MetricCardProps {
  label: string
  value: string
  hint?: string
}

function MetricCard({ label, value, hint }: MetricCardProps) {
  return (
    <div className="min-w-[100px]">
      <div className="text-[12px] text-foreground/45">{label}</div>
      <div className="mt-1 text-[22px] font-medium tabular-nums text-foreground">{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-foreground/35">{hint}</div>}
    </div>
  )
}

function currencySymbol(currency: string | undefined): string {
  if (!currency) return ''
  if (currency === 'CNY' || currency === 'RMB') return '¥'
  if (currency === 'USD') return '$'
  return `${currency} `
}

export interface BalanceCardProps {
  /** 余额数据 */
  balance: { supported: boolean; view?: BalanceView; message?: string } | null
  /** 渠道名称 */
  channelName?: string
  /** 今天用量（token） */
  todayTokens: number
  /** 今天消息数 */
  todayMessages: number
  /** 本月用量（token） */
  monthTokens: number
  /** 本月会话数 */
  monthSessions: number
  /** 缓存命中率（0-1） */
  cacheHitRate: number | null
  /** 刷新中 */
  busy: boolean
  /** 刷新回调 */
  onRefresh: () => void
  /** Token 格式化函数 */
  formatTokens: (n: number) => string
}

export function BalanceCard({
  balance,
  channelName,
  todayTokens,
  todayMessages,
  monthTokens,
  monthSessions,
  cacheHitRate,
  busy,
  onRefresh,
  formatTokens,
}: BalanceCardProps): React.ReactElement {
  const balanceOk = balance?.supported && balance.view?.total

  return (
    <div className="rounded-xl border border-border bg-card px-5 py-4">
      <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
        {/* 左侧：余额 */}
        <div className="min-w-[160px]">
          <div className="flex items-center gap-1.5 text-[12px] text-foreground/45">
            余额{channelName ? ` · ${channelName}` : ''}
            <button
              type="button"
              className="rounded p-0.5 text-foreground/45 hover:bg-foreground/[0.06] hover:text-foreground/70"
              title="重新查询"
              onClick={onRefresh}
              disabled={busy}
            >
              <RefreshCw size={11} className={cn(busy && 'animate-spin')} />
            </button>
          </div>
          <div className="mt-1 text-[24px] font-medium tabular-nums text-foreground">
            {balanceOk
              ? `${currencySymbol(balance?.view?.currency)}${balance?.view?.total}`
              : balance?.supported === false
                ? '不支持查询'
                : '—'}
          </div>
          <div className="mt-0.5 truncate text-[11px] text-foreground/35">
            {balanceOk
              ? [
                balance?.view?.granted != null && balance.view.granted !== '0' && `赠送 ${balance.view.granted}`,
                balance?.view?.toppedUp != null && balance.view.toppedUp !== '0' && `充值 ${balance.view.toppedUp}`,
                balance?.view?.used != null && balance.view.used !== '0' && `已用 ${balance.view.used}`,
              ].filter(Boolean).join(' · ') || (balance?.view?.limit ? `总额度 ${balance.view.limit}` : '供应商余额')
              : balance?.message ?? '供应商不提供余额接口'}
          </div>
        </div>

        {/* 竖线分隔 */}
        <div className="h-12 w-px shrink-0 bg-border/60" />

        {/* 右侧：今天/本月/缓存 */}
        <MetricCard
          label="今天"
          value={formatTokens(todayTokens)}
          hint={`${todayMessages} 条消息`}
        />
        <MetricCard
          label="近 30 天"
          value={formatTokens(monthTokens)}
          hint={`${monthSessions} 个会话`}
        />
        <MetricCard
          label="缓存命中"
          value={cacheHitRate == null ? '—' : `${Math.round(cacheHitRate * 100)}%`}
          hint="越高越省钱"
        />
      </div>
    </div>
  )
}
