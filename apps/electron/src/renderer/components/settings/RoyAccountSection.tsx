/**
 * 设置 → 账号 → 软件激活：显示激活状态，用激活码激活 / 续期 Pro。
 *
 * 登录 / 注册在启动登录窗（components/account/RoyLoginGate）里完成，这里不再放登录表单。
 * 激活状态以主进程校验过签名的凭证为准（main/lib/roy-account.ts），这里只负责展示和操作。
 */
import * as React from 'react'
import { toast } from 'sonner'
import { Check, Crown, KeyRound, LogOut, RefreshCw, ShieldCheck } from 'lucide-react'
import { SettingsSection, SettingsCard } from './primitives'
import { cn } from '@/lib/utils'
import { formatProValidity } from '@/lib/pro-expiry'
import { authBtn, authInput, errText } from '@/components/account/RoyAuthForm'

type View = Awaited<ReturnType<typeof window.electronAPI.accountGet>>

const PRO_LIST = ['电脑控制（Cua 后台操作）', '多智能体并行', '全局长期记忆', 'DeepSeek 优化模式（仅 DeepSeek 模型有效）', '公网手机遥控', '云同步', '工作流和定时任务不限数量', '最多 5 台设备（免费版 2 台）']

export function RoyAccountSection(): React.ReactElement {
  const [view, setView] = React.useState<View | null>(null)
  const [code, setCode] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')

  const load = React.useCallback(() => { void window.electronAPI.accountGet().then(setView).catch(() => undefined) }, [])
  React.useEffect(() => { load(); return window.electronAPI.onAccountChanged(load) }, [load])

  const run = async (fn: () => Promise<View>, ok: (v: View) => string): Promise<void> => {
    setBusy(true); setError('')
    try { const v = await fn(); setView(v); toast.success(ok(v)); setCode('') }
    catch (e) { setError(errText(e)) }
    finally { setBusy(false) }
  }

  const activate = (event: React.FormEvent): void => {
    event.preventDefault()
    if (!code.trim()) { setError('请输入激活码'); return }
    // 同一个输入框也收点数码：服务端按码的类型处理，点数码不会开 Pro
    let addedPoints = 0
    void run(async () => {
      const r = await window.electronAPI.balanceRedeem(code.trim())
      addedPoints = r.addedPoints
      if (addedPoints <= 0 && r.account.plan !== 'pro') throw new Error('激活码校验未通过，请检查后重试')
      return r.account
    }, (v) => addedPoints > 0
      ? `已充值 ${addedPoints} 点，可在「Roy 点数」查看余额`
      : v.proExpiresAt ? `激活成功，${formatProValidity(v.proExpiresAt)}` : '激活成功')
  }

  const pro = view?.plan === 'pro'
  const validity = formatProValidity(view?.proExpiresAt)

  return (
    <SettingsSection title="软件激活" description="输入激活码激活 Roy Pro，解锁全部高级功能；点数充值码也可以在这里兑换">
      <SettingsCard>
        <div className="space-y-4 px-4 py-4">
          {/* 激活状态 */}
          <div className="flex flex-wrap items-center gap-3">
            <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', pro ? 'bg-amber-500/15 text-amber-600' : 'bg-foreground/[0.06] text-foreground/45')}>
              {pro ? <ShieldCheck size={20} /> : <KeyRound size={20} />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[14px] font-medium text-foreground">
                {pro ? '已激活' : '未激活'}
                <span className={cn('rounded px-1.5 py-px text-[11px] font-semibold', pro ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400' : 'bg-foreground/[0.07] text-foreground/60')}>{pro ? 'Pro' : '免费版'}</span>
              </div>
              <div className="mt-0.5 text-[12px] text-foreground/50">
                {pro ? (validity || '长期有效') : '输入激活码即可开通 Pro'}
                {view?.username ? ` · 账号 ${view.username}（${view.email}）` : view?.email ? ` · 账号 ${view.email}` : ''}
                {view?.offline ? ' · 暂时连不上激活服务，正在使用离线凭证' : ''}
              </div>
            </div>
            <button type="button" disabled={busy} onClick={() => void run(() => window.electronAPI.accountRefresh(), () => '已刷新激活状态')} className={cn(authBtn, 'h-8 border border-border text-[12.5px] text-foreground/75 hover:bg-foreground/[0.05]')}><RefreshCw size={13} />刷新</button>
            <button type="button" disabled={busy} onClick={() => void run(() => window.electronAPI.accountLogout(), () => '已退出登录')} className={cn(authBtn, 'h-8 border border-border text-[12.5px] text-foreground/75 hover:bg-foreground/[0.05]')}><LogOut size={13} />退出登录</button>
          </div>

          {/* 激活码 */}
          <form onSubmit={activate} className="flex max-w-lg gap-2">
            <div className="relative flex-1">
              <KeyRound size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-foreground/40" />
              <input id="roy-account-code" className={cn(authInput, 'pl-9 font-mono tracking-wide')} placeholder={pro ? '输入新激活码续期' : '请输入激活码'} value={code} onChange={(e) => setCode(e.target.value)} spellCheck={false} autoComplete="off" />
            </div>
            <button type="submit" disabled={busy || !code.trim()} className={cn(authBtn, 'h-10 shrink-0 bg-primary text-primary-foreground hover:bg-primary/90')}>{busy ? '正在验证…' : pro ? '续期' : '激活'}</button>
          </form>
          {error && <p role="alert" className="text-[12px] text-destructive">{error}</p>}

          {/* Pro 功能 */}
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {PRO_LIST.map((f) => (
              <li key={f} className="flex items-center gap-2 text-[12.5px] text-foreground/75">
                {pro ? <Check size={14} className="text-emerald-600" /> : <Crown size={14} className="text-amber-600/70" />}
                {f}
              </li>
            ))}
          </ul>

          {pro && <CloudSyncRow />}
        </div>
      </SettingsCard>
    </SettingsSection>
  )
}

type SyncInfo = Awaited<ReturnType<typeof window.electronAPI.accountSyncStatus>>

/** Pro：设置云同步（上传本机设置 / 用云端设置覆盖本机） */
function CloudSyncRow(): React.ReactElement {
  const [info, setInfo] = React.useState<SyncInfo | null>(null)
  const [busy, setBusy] = React.useState(false)
  React.useEffect(() => { void window.electronAPI.accountSyncStatus().then(setInfo).catch(() => undefined) }, [])
  const act = async (fn: () => Promise<SyncInfo>, ok: (r: SyncInfo) => string): Promise<void> => {
    setBusy(true)
    try { const r = await fn(); setInfo(r); toast.success(ok(r)) } catch (e) { toast.error(errText(e)) } finally { setBusy(false) }
  }
  const when = info?.updatedAt ? `云端设置：${new Date(info.updatedAt).toLocaleString('zh-CN')} 由「${info.deviceName || '某台电脑'}」上传` : '云端还没有设置'
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium text-foreground">云同步</div>
        <div className="text-[11.5px] text-foreground/50">{when}。只同步外观、快捷键和工作习惯，不含模型密钥和本机路径</div>
      </div>
      <button type="button" disabled={busy} onClick={() => void act(() => window.electronAPI.accountSyncUpload(), (r) => `已上传 ${r.keys} 项设置`)} className={cn(authBtn, 'h-8 border border-border text-[12.5px] text-foreground/75 hover:bg-foreground/[0.05]')}>上传到云端</button>
      <button type="button" disabled={busy || !info?.updatedAt} onClick={() => void act(() => window.electronAPI.accountSyncRestore(), (r) => `已恢复 ${r.keys} 项设置，部分设置重启后生效`)} className={cn(authBtn, 'h-8 border border-border text-[12.5px] text-foreground/75 hover:bg-foreground/[0.05]')}>从云端恢复</button>
    </div>
  )
}
