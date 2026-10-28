/**
 * 侧边栏用量与余额卡（照 Arthur）
 *
 * 卡片：当前默认模型 + 默认渠道余额（查不到时显示本月 token 用量）。
 * 点开：「模型余额与额度」弹窗——每个渠道单独查，失败的单独标出来，不影响别的；
 * 底部显示更新时间和「模型设置」入口，另有「用量详情」跳到用量页。
 *
 * 用量来自本地会话 JSONL（usage-summary），余额来自供应商公开接口；
 * 供应商没有公开余额接口时显示「暂不支持查询」，不猜数字。
 */

import * as React from 'react'
import { createPortal } from 'react-dom'
import { BarChart3, ChevronRight, RotateCw } from 'lucide-react'
import { useAtomValue, useSetAtom } from 'jotai'
import { agentChannelIdAtom, agentModelIdAtom } from '@/atoms/agent-atoms'
import { activeViewAtom } from '@/atoms/active-view'
import { channelsAtom } from '@/atoms/chat-atoms'
import { settingsOpenAtom, settingsTabAtom } from '@/atoms/settings-tab'
import { cn } from '@/lib/utils'

interface UsageSummary {
  total: { sessions: number; messages: number; inputTokens: number; outputTokens: number }
  last30Days: { sessions: number; messages: number; inputTokens: number; outputTokens: number }
  today: { sessions: number; messages: number; inputTokens: number; outputTokens: number }
}

interface BalanceView {
  isAvailable?: boolean
  currency?: string
  total?: string
  used?: string
  limit?: string
  granted?: string
  toppedUp?: string
}

interface BalanceResult {
  supported: boolean
  view?: BalanceView
  message?: string
}

type BalanceState = 'loading' | 'ok' | 'no-key' | 'unsupported' | 'error'

interface ChannelBalance {
  id: string
  name: string
  state: BalanceState
  view?: BalanceView
  error?: string
}

/** 余额缓存：5 分钟内重开弹窗不重复请求 */
const CACHE_MS = 5 * 60_000
let cache: { at: number; list: ChannelBalance[] } | null = null

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return String(value)
}

/** 余额接口里 currency 可能是 CNY / USD 或人民币之类，统一取符号。 */
function currencySymbol(currency: string | undefined): string {
  if (!currency) return ''
  if (currency === 'CNY' || currency === 'RMB') return '¥'
  if (currency === 'USD') return '$'
  return `${currency} `
}

/** 把主进程的 BalanceResult 归成弹窗里的四种状态 */
function toState(result: BalanceResult): Pick<ChannelBalance, 'state' | 'view' | 'error'> {
  if (result.supported && result.view) return { state: 'ok', view: result.view }
  const msg = result.message ?? ''
  if (/API Key|密钥/.test(msg) && /没有填写|读取/.test(msg)) return { state: 'no-key' }
  if (/没有公开|不支持/.test(msg)) return { state: 'unsupported' }
  return { state: 'error', error: msg || '查询失败' }
}

export function SidebarUsageCard(): React.ReactElement | null {
  const setActiveView = useSetAtom(activeViewAtom)
  const setSettingsOpen = useSetAtom(settingsOpenAtom)
  const setSettingsTab = useSetAtom(settingsTabAtom)
  const channels = useAtomValue(channelsAtom)
  const agentChannelId = useAtomValue(agentChannelIdAtom)
  const agentModelId = useAtomValue(agentModelIdAtom)
  const [usage, setUsage] = React.useState<UsageSummary | null>(null)
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [bals, setBals] = React.useState<{ at: number; list: ChannelBalance[] } | null>(cache)

  const channel = channels.find((item) => item.id === agentChannelId) ?? channels.find((item) => item.enabled)
  const modelLabel = agentModelId ?? channel?.models.find((model) => model.enabled)?.id ?? '未设置模型'

  React.useEffect(() => {
    let cancelled = false
    void window.electronAPI
      .getUsageSummary()
      .then((summary) => {
        if (!cancelled) setUsage(summary as UsageSummary)
      })
      .catch(() => { /* 用量读不到就不显示数字 */ })
    return () => { cancelled = true }
  }, [])

  const channelKey = channels.map((item) => item.id).join('|')

  const loadBalances = React.useCallback(async (force: boolean) => {
    if (!force && cache && Date.now() - cache.at < CACHE_MS && cache.list.length === channels.length) {
      setBals(cache)
      return
    }
    setBusy(true)
    const list: ChannelBalance[] = channels.map((item) => ({ id: item.id, name: item.name, state: 'loading' }))
    setBals((prev) => prev ?? { at: 0, list })
    const results = await Promise.all(
      channels.map(async (item): Promise<ChannelBalance> => {
        try {
          const result = await window.electronAPI.getChannelBalance(item.id) as BalanceResult
          return { id: item.id, name: item.name, ...toState(result) }
        } catch {
          return { id: item.id, name: item.name, state: 'error', error: '查询失败' }
        }
      }),
    )
    cache = { at: Date.now(), list: results }
    setBals(cache)
    setBusy(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelKey])

  // 启动时查一次（用于卡片显示默认渠道余额），之后每 5 分钟自动刷新
  React.useEffect(() => {
    if (!channels.length) return
    void loadBalances(false)
    const timer = setInterval(() => { void loadBalances(true) }, CACHE_MS)
    return () => clearInterval(timer)
  }, [channelKey, loadBalances])

  React.useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!channel) return null

  const monthTokens = usage
    ? usage.last30Days.inputTokens + usage.last30Days.outputTokens
    : null
  const calls = usage?.last30Days.messages ?? null

  const mine = bals?.list.find((item) => item.id === channel.id)
  const balanceText = mine?.state === 'ok' && mine.view?.total != null
    ? `${currencySymbol(mine.view.currency)}${mine.view.total}`
    : null

  const quotaText = balanceText ?? (monthTokens !== null ? `本月 ${formatTokens(monthTokens)}` : '—')
  const quotaSub = balanceText
    ? (mine?.view?.isAvailable === false ? '余额不足' : '账户余额')
    : calls !== null ? `近 30 天 ${calls} 次` : '点开看余额'

  const openModelSettings = (): void => {
    setOpen(false)
    setSettingsTab('channels')
    setSettingsOpen(true)
  }

  return (
    <div className="px-3 pb-1">
      <button
        type="button"
        title="点开看所有模型的余额与额度"
        onClick={() => {
          setOpen(true)
          void loadBalances(false)
        }}
        className="group flex w-full items-start gap-2 rounded-[10px] border border-foreground/[0.06] bg-foreground/[0.04] px-3 py-2 text-left titlebar-no-drag transition-colors hover:bg-foreground/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[11px] text-foreground/45">
            <span className="min-w-0 truncate" title={`${channel.name} · ${modelLabel}`}>{modelLabel}</span>
            <span className="shrink-0 rounded bg-foreground/[0.06] px-1 text-[10px] text-foreground/40">default</span>
          </div>
          <div className="mt-0.5 truncate text-[13px] font-medium tabular-nums text-foreground/85">{quotaText}</div>
          <div className={cn('truncate text-[10.5px]', mine?.view?.isAvailable === false ? 'text-red-500' : 'text-foreground/40')}>
            {quotaSub}
          </div>
        </div>
        <ChevronRight size={12} className="mt-0.5 shrink-0 text-foreground/25 transition-colors group-hover:text-foreground/50" />
      </button>

      {open && createPortal(
        <>
          <div className="fixed inset-0 z-[120]" onClick={() => setOpen(false)} />
          <div className="fixed bottom-[72px] left-2 z-[121] flex max-h-[70vh] w-[326px] flex-col overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-xl">
            <div className="flex shrink-0 items-center gap-2 border-b border-border px-3.5 py-2.5">
              <span className="flex-1 text-[13px] font-medium">模型余额与额度</span>
              <button
                type="button"
                className="rounded p-1 text-foreground/45 transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
                title="刷新"
                onClick={() => { void loadBalances(true) }}
              >
                <RotateCw size={13} className={busy ? 'animate-spin' : ''} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {!bals ? (
                <div className="px-3.5 py-6 text-center text-[12px] text-foreground/45">正在查余额…</div>
              ) : !bals.list.length ? (
                <div className="px-3.5 py-6 text-center text-[12px] text-foreground/45">还没配供应商</div>
              ) : (
                bals.list.map((item) => (
                  <div key={item.id} className="border-b border-border px-3.5 py-2.5 last:border-0">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[12.5px] font-medium text-foreground">{item.name}</span>
                      {item.id === channel.id && (
                        <span className="shrink-0 rounded bg-foreground/[0.06] px-1 text-[10px] text-foreground/45">default</span>
                      )}
                    </div>
                    {item.state === 'loading' ? (
                      <div className="mt-0.5 text-[12px] text-foreground/40">查询中…</div>
                    ) : item.state === 'ok' ? (
                      <>
                        <div className="mt-0.5 text-[15px] font-medium tabular-nums text-foreground">
                          {currencySymbol(item.view?.currency)}{item.view?.total ?? '—'}
                        </div>
                        <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-foreground/45">
                          {item.view?.toppedUp != null && <span>充值余额 {item.view.toppedUp}</span>}
                          {item.view?.granted != null && <span>赠送余额 {item.view.granted}</span>}
                          {item.view?.used != null && <span>已用 {item.view.used}</span>}
                          {item.view?.limit != null && <span>总额度 {item.view.limit}</span>}
                          {item.view?.isAvailable === false && <span className="text-red-500">余额不足</span>}
                        </div>
                      </>
                    ) : item.state === 'no-key' ? (
                      <div className="mt-0.5 text-[12px] text-foreground/60">
                        未配置凭据{' '}
                        <button type="button" className="text-primary hover:underline" onClick={openModelSettings}>模型设置</button>
                      </div>
                    ) : item.state === 'unsupported' ? (
                      <div className="mt-0.5 text-[12px] text-foreground/45">暂不支持查询</div>
                    ) : (
                      <div className="mt-0.5 break-words text-[11.5px] text-red-500">{item.error || '查询失败'}</div>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="flex shrink-0 items-center gap-3 border-t border-border bg-foreground/[0.02] px-3.5 py-2 text-[10.5px] text-foreground/45">
              <span className="flex-1">
                {bals?.at ? `更新于 ${new Date(bals.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '每 5 分钟自动刷新'}
              </span>
              <button
                type="button"
                className="flex items-center gap-1 hover:text-foreground"
                onClick={() => {
                  setOpen(false)
                  setActiveView('usage')
                }}
              >
                <BarChart3 size={11} />
                用量详情
              </button>
              <button type="button" className="text-primary hover:underline" onClick={openModelSettings}>模型设置</button>
            </div>
          </div>
        </>,
        document.body,
      )}
    </div>
  )
}
