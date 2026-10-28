import * as React from 'react'
import { SettingsRow, SettingsToggle } from './primitives'
import { ensureProFeature } from '@/atoms/pro-activation'
import type { MobileRemotePairing, MobileRemoteStatus } from '@/types/mobile-remote'

export function MobileRemoteSettings(): React.ReactElement {
  const [status, setStatus] = React.useState<MobileRemoteStatus>()
  const [pairing, setPairing] = React.useState<MobileRemotePairing>()
  const [error, setError] = React.useState('')
  const [publicHost, setPublicHost] = React.useState('')
  const [savedHost, setSavedHost] = React.useState('')
  const [mode, setMode] = React.useState<'public' | 'lan'>('lan')
  const [relay, setRelay] = React.useState('')
  const [savedRelay, setSavedRelay] = React.useState('')
  const load = React.useCallback(() => {
    void window.electronAPI.mobileRemoteStatus().then(setStatus).catch(() => setError('读取手机遥控状态失败'))
    void window.electronAPI.getSettings().then((s) => {
      const hosts = (s as { mobileRemotePublicHosts?: string[] }).mobileRemotePublicHosts ?? []
      setPublicHost(hosts[0] ?? '')
      setSavedHost(hosts[0] ?? '')
      const m = (s as { mobileRemoteNetworkMode?: 'public' | 'lan' }).mobileRemoteNetworkMode
      setMode(m ?? (hosts[0] ? 'public' : 'lan'))
      const r = (s as { mobileRemoteRelay?: string }).mobileRemoteRelay ?? ''
      setRelay(r); setSavedRelay(r)
    }).catch(() => undefined)
  }, [])
  React.useEffect(load, [load])
  // 公网中转是后台连接，状态会变：设置页打开期间每 3 秒刷新一次
  React.useEffect(() => {
    const timer = setInterval(() => { void window.electronAPI.mobileRemoteStatus().then(setStatus).catch(() => undefined) }, 3000)
    return () => clearInterval(timer)
  }, [])
  const changeMode = async (next: 'public' | 'lan'): Promise<void> => {
    // 公网遥控是 Pro 功能：没激活就弹激活码窗，激活成功后再切换
    if (next === 'public' && !(await ensureProFeature('mobile-remote-public', () => { void changeMode('public') }))) return
    setError(''); setPairing(undefined)
    try {
      await window.electronAPI.updateSettings({ mobileRemoteNetworkMode: next } as never); setMode(next)
      setStatus(await window.electronAPI.refreshMobileRemoteRelay())
    } catch { setError('切换失败，请重试') }
  }
  const saveHost = async (): Promise<void> => {
    setError('')
    const value = publicHost.trim().toLowerCase()
    try {
      await window.electronAPI.updateSettings({ mobileRemotePublicHosts: value ? [value] : [] })
      setSavedHost(value)
      // 地址变了要重启服务才会生效
      await window.electronAPI.setMobileRemoteEnabled(true)
      load()
    } catch { setError('保存失败，请重试') }
  }
  const saveRelay = async (): Promise<void> => {
    setError('')
    const value = relay.trim()
    if (value && !/^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+(:\d{1,5})?$/.test(value)) { setError('中转服务器格式：用户名@地址:端口，例如 lzx@122.225.39.134:2222'); return }
    try {
      await window.electronAPI.updateSettings({ mobileRemoteRelay: value } as never)
      setSavedRelay(value)
      setStatus(await window.electronAPI.refreshMobileRemoteRelay())
    } catch { setError('保存失败，请重试') }
  }
  const relayState = status?.relay
  const relayText = !savedRelay ? '电脑通过 SSH 反向隧道接到中转服务器，手机经公网地址访问。留空则需自行把公网地址转发到本机。'
    : relayState?.state === 'connected' ? `已连接 ${relayState.target ?? ''}`
      : relayState?.state === 'connecting' ? `正在连接 ${relayState.target ?? ''}…`
        : relayState?.state === 'error' ? `连接失败：${relayState.message ?? ''}`
          : '未连接（切到「公网」后自动连接）'
  return <>
    <SettingsToggle label="允许手机遥控" description="默认仅同一 Wi-Fi 可用；填了公网地址后，手机在任何网络下都能连。扫固定二维码即可连上，同一台手机只需扫一次；可随时移除手机。" checked={!!status?.enabled} onCheckedChange={async checked => { setError(''); try { setStatus(await window.electronAPI.setMobileRemoteEnabled(checked)); if (!checked) setPairing(undefined) } catch { setError('保存失败，请重试') } }} />
    {status?.enabled && <SettingsRow label="连接方式" description={mode === 'lan' ? `局域网：手机需和电脑在同一 Wi-Fi（${status.addresses[0] ?? '正在获取'}）` : '公网：手机在任何网络都能连（需先填公网地址）'}>
      <div className="flex overflow-hidden rounded-md border border-border text-[13px]">
        <button type="button" className={`h-8 px-3 ${mode === 'lan' ? 'bg-primary text-primary-foreground' : 'hover:bg-foreground/[0.05]'}`} onClick={() => { void changeMode('lan') }}>局域网</button>
        <button type="button" className={`h-8 px-3 ${mode === 'public' ? 'bg-primary text-primary-foreground' : 'hover:bg-foreground/[0.05]'}`} onClick={() => { void changeMode('public') }}>公网</button>
      </div>
    </SettingsRow>}
    {status?.enabled && (
      <details className="px-4 py-2">
        <summary className="cursor-pointer select-none text-[12.5px] text-foreground/45 hover:text-foreground/70">高级：公网访问（默认不用填）</summary>
        <div className="mt-2 space-y-1">
          <SettingsRow label="公网地址" description={savedHost ? `当前：https://${savedHost}` : '留空则只能在局域网使用。填 Cloudflare 隧道域名后，手机在任何网络都能访问'}>
            <div className="flex items-center gap-2">
              <input value={publicHost} onChange={e => setPublicHost(e.target.value)} placeholder="www.zajx.top" className="h-8 w-[190px] rounded-md border border-border bg-background px-2 text-[13px]" />
              <button type="button" className="h-8 rounded-md border border-border px-3 text-[13px] hover:bg-foreground/[0.05]" onClick={() => { void saveHost() }}>保存</button>
            </div>
          </SettingsRow>
          {mode === 'public' && <SettingsRow label="中转服务器" description={relayText}>
            <div className="flex items-center gap-2">
              <input value={relay} onChange={e => setRelay(e.target.value)} placeholder="lzx@122.225.39.134:2222" className="h-8 w-[190px] rounded-md border border-border bg-background px-2 text-[13px]" />
              <button type="button" className="h-8 rounded-md border border-border px-3 text-[13px] hover:bg-foreground/[0.05]" onClick={() => { void saveRelay() }}>保存</button>
            </div>
          </SettingsRow>}
          {mode === 'public' && savedRelay && relayState?.state === 'error' && relayState.publicKey && <div className="px-4 pb-2 text-xs text-foreground/60">
            <p>Roy 的中转公钥（只允许这一条端口转发，建议在服务器上这样添加）：</p>
            <code className="mt-1 block break-all rounded bg-foreground/[0.05] p-2">{`restrict,port-forwarding,permitlisten="127.0.0.1:38643" ${relayState.publicKey}`}</code>
            <button type="button" className="mt-1 text-primary" onClick={() => { void navigator.clipboard.writeText(`restrict,port-forwarding,permitlisten="127.0.0.1:38643" ${relayState.publicKey}`) }}>复制</button>
          </div>}
        </div>
      </details>
    )}
    {status?.enabled && <SettingsRow label="配对手机" description={status.running ? (mode === 'public' && savedHost ? `公网：https://${savedHost}` : `局域网地址：${status.addresses.join('、') || '正在获取'}`) : status.error || '服务未启动'}>
      <div className="flex items-center gap-2">
        <button type="button" className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground" onClick={async () => { try { setPairing(await window.electronAPI.fixedMobileRemotePairing()) } catch (e) { setError(e instanceof Error ? e.message : '生成二维码失败') } }}>显示固定二维码</button>
        <button type="button" className="rounded-md border border-border px-3 py-2 text-sm hover:bg-foreground/[0.05]" onClick={async () => { try { setPairing(await window.electronAPI.createMobileRemotePairing()) } catch (e) { setError(e instanceof Error ? e.message : '生成二维码失败') } }}>一次性码</button>
      </div>
    </SettingsRow>}
    {pairing && <div className="px-4 py-3">
      <img src={pairing.qr} alt="手机遥控配对二维码" width={180} height={180} />
      <p className="mt-2 break-all text-xs text-foreground/50">{pairing.url}</p>
      {pairing.expiresAt === 0
        ? <p className="text-xs text-foreground/50">长期有效，可截图保存或打印。手机连上后会收到通知；如有泄露，点下面「重置固定码」立刻作废。</p>
        : <p className="text-xs text-foreground/50">5 分钟内有效，只能用一次。用手机浏览器或微信扫一扫打开。</p>}
      {pairing.expiresAt === 0 && <button type="button" className="mt-2 text-[12px] text-destructive hover:underline" onClick={async () => { if (!window.confirm('重置后旧二维码立刻失效，已配对的手机不受影响。继续？')) return; try { setPairing(await window.electronAPI.resetMobileRemotePairCode()) } catch (e) { setError(e instanceof Error ? e.message : '重置失败') } }}>重置固定码</button>}
    </div>}
    <DeviceList devices={status?.devices ?? []} onRevoke={async (ids) => { let next = status; for (const id of ids) next = await window.electronAPI.revokeMobileRemoteDevice(id); if (next) setStatus(next) }} />
    {error && <p className="px-4 pb-3 text-sm text-destructive">{error}</p>}
  </>
}

type Device = { id: string; name: string; lastSeenAt: number }

function ago(t: number): string {
  const m = Math.round((Date.now() - t) / 60000)
  if (m < 1) return '刚刚'
  if (m < 60) return `${m} 分钟前`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} 小时前`
  const d = Math.round(h / 24)
  return d < 30 ? `${d} 天前` : new Date(t).toLocaleDateString('zh-CN')
}

/** 已配对手机：按最近使用排序，只露出两台，其余折叠；可一键只保留最近一台 */
function DeviceList({ devices, onRevoke }: { devices: Device[]; onRevoke: (ids: string[]) => Promise<void> }): React.ReactElement | null {
  const [open, setOpen] = React.useState(false)
  if (!devices.length) return null
  const sorted = [...devices].sort((a, b) => b.lastSeenAt - a.lastSeenAt)
  const shown = open ? sorted : sorted.slice(0, 2)
  const rest = sorted.length - 2
  return (
    <div className="px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[13px] font-medium text-foreground">已配对的手机 · {sorted.length} 台</span>
        {sorted.length > 1 && <button type="button" className="text-[12px] text-destructive hover:underline" onClick={() => void onRevoke(sorted.slice(1).map(d => d.id))}>只保留最近一台</button>}
      </div>
      <div className="divide-y divide-border/50 rounded-lg border border-border/60">
        {shown.map((d, i) => (
          <div key={d.id} className="flex items-center gap-3 px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{d.name}{i === 0 && <span className="ml-1.5 rounded bg-emerald-500/12 px-1.5 py-px text-[10.5px] text-emerald-700 dark:text-emerald-400">最近在用</span>}</span>
            <span className="shrink-0 text-[12px] text-foreground/50">{ago(d.lastSeenAt)}</span>
            <button type="button" className="shrink-0 text-[12px] text-destructive hover:underline" onClick={() => void onRevoke([d.id])}>移除</button>
          </div>
        ))}
      </div>
      {rest > 0 && <button type="button" className="mt-2 text-[12px] text-foreground/55 hover:text-foreground" onClick={() => setOpen(!open)}>{open ? '收起' : `展开其余 ${rest} 台`}</button>}
    </div>
  )
}
