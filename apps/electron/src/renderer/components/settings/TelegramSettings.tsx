/**
 * Telegram 机器人设置：填 Token、测试、开关、允许的用户 ID
 */
import * as React from 'react'
import { SettingsSection, SettingsCard, SettingsRow } from './primitives'
import { cn } from '@/lib/utils'

interface PublicConfig { enabled: boolean; hasToken: boolean; allowedUserIds: number[] }
interface Status { status: 'disconnected' | 'connecting' | 'connected' | 'error'; botName?: string; errorMessage?: string }

const STATUS_LABEL: Record<Status['status'], { label: string; dot: string }> = {
  disconnected: { label: '未连接', dot: 'bg-gray-400' },
  connecting: { label: '连接中', dot: 'bg-yellow-400 animate-pulse' },
  connected: { label: '已连接', dot: 'bg-green-500' },
  error: { label: '出错了', dot: 'bg-red-500' },
}

export function TelegramSettings(): React.ReactElement {
  const [config, setConfig] = React.useState<PublicConfig | null>(null)
  const [status, setStatus] = React.useState<Status>({ status: 'disconnected' })
  const [token, setToken] = React.useState('')
  const [ids, setIds] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [message, setMessage] = React.useState('')

  const refresh = React.useCallback(async () => {
    const [c, s] = await Promise.all([window.electronAPI.telegramGetConfig(), window.electronAPI.telegramGetStatus()])
    setConfig(c); setStatus(s); setIds(c.allowedUserIds.join(', '))
  }, [])

  React.useEffect(() => {
    void refresh()
    const t = setInterval(() => { void window.electronAPI.telegramGetStatus().then(setStatus).catch(() => undefined) }, 3000)
    return () => clearInterval(t)
  }, [refresh])

  const run = async (fn: () => Promise<unknown>, ok?: string): Promise<void> => {
    setBusy(true); setMessage('')
    try { await fn(); if (ok) setMessage(ok); await refresh() } catch (e) { setMessage(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : '操作失败') } finally { setBusy(false) }
  }

  const parsedIds = (): number[] => ids.split(/[\s,，]+/).map((s) => Number(s)).filter((n) => Number.isInteger(n) && n > 0)
  const st = STATUS_LABEL[status.status]

  return (
    <div className="space-y-8">
      <SettingsSection title="Telegram 机器人" description="在 Telegram 里私聊机器人，就能让这台电脑上的 Roy 干活：直接发消息，或用 /new、/list、/switch、/stop、/model、/workspace 命令">
        <SettingsCard>
          <SettingsRow label="连接状态" description={status.status === 'error' ? status.errorMessage : status.botName ? `机器人 ${status.botName}` : '打开下面的开关后自动连接'}>
            <span className="flex items-center gap-1.5 text-[13px]"><span className={cn('h-2 w-2 rounded-full', st.dot)} />{st.label}</span>
          </SettingsRow>
          <SettingsRow label="Bot Token" description={config?.hasToken ? '已保存（系统加密）。要换就填新的再点保存' : '在 Telegram 里找 @BotFather，发 /newbot 创建机器人，把它给的 Token 粘到这里'}>
            <div className="flex items-center gap-2">
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={config?.hasToken ? '••••••（已保存）' : '123456789:AAH...'}
                className="h-8 w-[220px] rounded-md border border-input bg-transparent px-2.5 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
              />
              <button type="button" disabled={busy || (!token.trim() && !config?.hasToken)} onClick={() => void run(async () => {
                const r = await window.electronAPI.telegramTest(token.trim() || undefined)
                if (!r.ok) throw new Error(r.message ?? '连接失败')
                setMessage(`连接成功：${r.botName}`)
              })} className="h-8 rounded-md border border-border px-3 text-[13px] hover:bg-foreground/[0.04] disabled:opacity-50">测试</button>
              <button type="button" disabled={busy || !token.trim()} onClick={() => void run(async () => {
                await window.electronAPI.telegramSaveConfig({ token: token.trim() }); setToken('')
              }, 'Token 已保存')} className="h-8 rounded-md bg-primary px-3 text-[13px] text-primary-foreground disabled:opacity-50">保存</button>
            </div>
          </SettingsRow>
          <SettingsRow label="启用" description="打开后 Roy 在后台一直收 Telegram 消息（关窗口到托盘也照收）。国内一般要先在「设置 → 代理」里配好代理">
            <button
              type="button"
              role="switch"
              aria-checked={!!config?.enabled}
              disabled={busy || !config?.hasToken}
              onClick={() => void run(() => window.electronAPI.telegramSaveConfig({ enabled: !config?.enabled }))}
              className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50', config?.enabled ? 'bg-primary' : 'bg-foreground/20')}
            >
              <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all', config?.enabled ? 'left-[18px]' : 'left-0.5')} />
            </button>
          </SettingsRow>
          <SettingsRow label="允许的用户 ID" description="只有这些 Telegram 用户能用，多个用逗号隔开。留空时，第一个私聊机器人的人自动成为主人。群聊一律不响应">
            <div className="flex items-center gap-2">
              <input value={ids} onChange={(e) => setIds(e.target.value)} placeholder="例如 123456789" className="h-8 w-[220px] rounded-md border border-input bg-transparent px-2.5 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring/30" />
              <button type="button" disabled={busy} onClick={() => void run(() => window.electronAPI.telegramSaveConfig({ allowedUserIds: parsedIds() }), '已保存')} className="h-8 rounded-md border border-border px-3 text-[13px] hover:bg-foreground/[0.04] disabled:opacity-50">保存</button>
            </div>
          </SettingsRow>
          {message && <p className="px-4 pb-3 text-[12.5px] text-muted-foreground">{message}</p>}
        </SettingsCard>
      </SettingsSection>
    </div>
  )
}
