/**
 * 设置 · Roy 点数：内置模型（「Roy 国产模型 / GPT / Claude / Grok / Gemini」渠道）的余额、充值和用量记录。
 *
 * 余额和账目都以服务器为准（main/lib/balance-ipc.ts 只做转发），这里不做任何本地计算。
 * 充值 = 兑换点数激活码；用户自己配置的模型渠道不扣点数。
 */
import * as React from 'react'
import { toast } from 'sonner'
import { Coins, KeyRound, RefreshCw } from 'lucide-react'
import { SettingsSection, SettingsCard } from './primitives'
import { cn } from '@/lib/utils'
import { authBtn, authInput, errText } from '@/components/account/RoyAuthForm'

type Balance = Awaited<ReturnType<typeof window.electronAPI.balanceGet>>
type LedgerEntry = Balance['ledger'][number]

/**
 * 点数显示：单次对话常常不到 0.01 点，保留 2 位会让余额看起来没被扣（4.9995 显示成 5.00）。
 * 1 点以上保留 4 位、更小的保留 6 位，去掉末尾的 0。
 */
function formatPoints(value: number): string {
  return String(Number(value.toFixed(Math.abs(value) >= 1 ? 4 : 6)))
}

function formatTokens(n: number | null): string {
  if (!n) return '0'
  return n >= 10_000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

const KIND_LABEL: Record<LedgerEntry['kind'], string> = { usage: '使用', recharge: '充值', adjust: '调整' }

export function PointsSettings(): React.ReactElement {
  const [balance, setBalance] = React.useState<Balance | null>(null)
  const [loadError, setLoadError] = React.useState('')
  const [loading, setLoading] = React.useState(true)
  const [code, setCode] = React.useState('')
  const [redeeming, setRedeeming] = React.useState(false)
  const [redeemError, setRedeemError] = React.useState('')
  const [modelNames, setModelNames] = React.useState<Record<string, string>>({})

  const load = React.useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      setBalance(await window.electronAPI.balanceGet(100))
      setLoadError('')
    } catch (e) {
      setLoadError(errText(e))
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
    // 账目里存的是模型 id，用内置渠道的模型名显示
    void window.electronAPI.listChannels().then((channels) => {
      const names: Record<string, string> = {}
      for (const c of channels) if (c.id.startsWith('builtin-')) for (const m of c.models) names[m.id] = m.name
      setModelNames(names)
    }).catch(() => undefined)
    return window.electronAPI.onAccountChanged(() => void load())
  }, [load])

  const redeem = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    const value = code.trim()
    if (!value) return
    setRedeeming(true)
    setRedeemError('')
    try {
      const r = await window.electronAPI.balanceRedeem(value)
      setCode('')
      toast.success(r.addedPoints > 0 ? `已充值 ${r.addedPoints} 点` : '这是 Pro 激活码，已为你开通 / 续期 Pro')
      await load()
    } catch (e) {
      setRedeemError(errText(e))
    } finally {
      setRedeeming(false)
    }
  }

  const points = balance?.points ?? 0
  const usage = (balance?.ledger ?? []).filter((e) => e.kind === 'usage')
  const spent = usage.reduce((sum, e) => sum - e.amount, 0)

  return (
    <div className="space-y-8">
      <SettingsSection
        title="Roy 点数"
        description="使用「Roy 官方」渠道的模型（DeepSeek、GLM、Kimi、GPT、Claude、Grok、Gemini）时按实际用量扣点数，1 点 = ¥1。你自己配置的模型渠道不扣点数。"
        action={(
          <button type="button" disabled={loading} onClick={() => void load()} className={cn(authBtn, 'h-8 border border-border text-[12.5px] text-foreground/75 hover:bg-foreground/[0.05]')}>
            <RefreshCw size={13} className={cn(loading && 'animate-spin')} />刷新
          </button>
        )}
      >
        <SettingsCard>
          <div className="space-y-4 px-4 py-4">
            {loadError ? (
              <p role="alert" className="text-[12.5px] text-destructive">
                {loadError === '请先登录' ? '登录 Roy 账号后才能查看点数和使用内置模型' : `暂时查不到余额：${loadError}`}
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', points > 0 ? 'bg-amber-500/15 text-amber-600' : 'bg-foreground/[0.06] text-foreground/45')}>
                  <Coins size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] text-foreground/50">当前余额</div>
                  <div className={cn('text-[22px] font-semibold tabular-nums leading-tight', points <= 0 ? 'text-destructive' : 'text-foreground')}>
                    {balance ? formatPoints(points) : '—'} <span className="text-[13px] font-normal text-foreground/50">点</span>
                  </div>
                </div>
                {balance && (
                  <div className="text-right text-[12px] text-foreground/50">
                    最近 {usage.length} 次使用共消耗 <span className="tabular-nums text-foreground/75">{formatPoints(spent)}</span> 点
                  </div>
                )}
              </div>
            )}
            {balance && points <= 0 && (
              <p className="text-[12.5px] text-foreground/60">点数已用完：内置模型暂时不能用。兑换充值码后即可继续，或在「模型配置」切换到你自己的模型渠道。</p>
            )}

            <form onSubmit={(e) => void redeem(e)} className="flex max-w-lg gap-2">
              <div className="relative flex-1">
                <KeyRound size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-foreground/40" />
                <input
                  className={cn(authInput, 'pl-9 font-mono tracking-wide')}
                  placeholder="输入点数充值码，例如 ROY-XXXX-XXXX-XXXX"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  spellCheck={false}
                  autoComplete="off"
                />
              </div>
              <button type="submit" disabled={redeeming || !code.trim()} className={cn(authBtn, 'h-10 shrink-0 bg-primary text-primary-foreground hover:bg-primary/90')}>
                {redeeming ? '正在兑换…' : '兑换'}
              </button>
            </form>
            {redeemError && <p role="alert" className="text-[12px] text-destructive">{redeemError}</p>}
          </div>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="使用记录" description="最近 100 条，以服务器记账为准。标「估算」的是对话中途断开、上游没返回用量时按已输出内容估算的。">
        <SettingsCard>
          {!balance || balance.ledger.length === 0 ? (
            <p className="px-4 py-6 text-center text-[12.5px] text-foreground/45">{balance ? '还没有记录' : loading ? '正在加载…' : '—'}</p>
          ) : (
            <div className="max-h-[420px] overflow-auto">
              <table className="w-full text-[12.5px]">
                <thead className="sticky top-0 bg-background text-left text-[11.5px] text-foreground/45">
                  <tr>
                    <th className="px-4 py-2 font-normal">时间</th>
                    <th className="px-2 py-2 font-normal">类型</th>
                    <th className="px-2 py-2 font-normal">模型 / 说明</th>
                    <th className="px-2 py-2 text-right font-normal">输入 / 输出 token</th>
                    <th className="px-4 py-2 text-right font-normal">点数</th>
                  </tr>
                </thead>
                <tbody>
                  {balance.ledger.map((e) => (
                    <tr key={`${e.createdAt}-${e.kind}-${e.amount}`} className="border-t border-border/50">
                      <td className="whitespace-nowrap px-4 py-2 tabular-nums text-foreground/60">{new Date(e.createdAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                      <td className="px-2 py-2 text-foreground/70">{KIND_LABEL[e.kind] ?? e.kind}</td>
                      <td className="px-2 py-2 text-foreground/80">
                        {e.model ? (modelNames[e.model] ?? e.model) : (e.note ?? '')}
                        {e.estimated ? <span className="ml-1.5 rounded bg-foreground/[0.07] px-1 text-[10.5px] text-foreground/55">估算</span> : null}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums text-foreground/60">
                        {e.kind === 'usage' ? `${formatTokens((e.inputTokens ?? 0) + (e.cacheReadTokens ?? 0))} / ${formatTokens(e.outputTokens)}` : ''}
                      </td>
                      <td className={cn('whitespace-nowrap px-4 py-2 text-right tabular-nums', e.amount > 0 ? 'text-emerald-600' : 'text-foreground/80')}>
                        {e.amount > 0 ? '+' : ''}{formatPoints(e.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SettingsCard>
      </SettingsSection>
    </div>
  )
}
