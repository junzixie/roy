/**
 * 设置 → 账号（本地多用户）
 *
 * 每个用户的会话、项目、设置、模型渠道都分开存。第一个用户就是原来的数据（~/.roy），不搬家。
 * 切换用户要重启 Roy；删除用户只从名单里去掉，数据文件夹保留。
 */
import * as React from 'react'
import { useAtom } from 'jotai'
import { toast } from 'sonner'
import { KeyRound, LogIn, Pencil, Trash2, UserPlus } from 'lucide-react'
import { SettingsSection, SettingsCard, SettingsToggle } from './primitives'
import { UserProfileCard } from './UserProfileCard'
import { RoyAccountSection } from './RoyAccountSection'
import { UsageSection } from './UsageSection'
import { AboutSettings, UpdateCard } from './AboutSettings'
import { userProfileAtom } from '@/atoms/user-profile'
import { cn } from '@/lib/utils'

type UsersState = Awaited<ReturnType<typeof window.electronAPI.usersState>>
type Dialog =
  | { kind: 'add' }
  | { kind: 'rename'; username: string; name: string }
  | { kind: 'password'; username: string; hasPassword: boolean }
  | { kind: 'switch'; username: string; name: string; hasPassword: boolean }
  | null

const input = 'h-9 w-full rounded-lg border border-border bg-background px-3 text-[13px] outline-none focus:border-primary'

export function AccountSettings(): React.ReactElement {
  const [state, setState] = React.useState<UsersState | null>(null)
  const [dialog, setDialog] = React.useState<Dialog>(null)
  const [userProfile] = useAtom(userProfileAtom)
  const [form, setForm] = React.useState<Record<string, string>>({})
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')

  const load = React.useCallback(() => { void window.electronAPI.usersState().then(setState).catch(() => setState({ users: [], askOnStartup: true, active: '' })) }, [])
  React.useEffect(load, [load])

  const open = (d: Dialog): void => { setDialog(d); setForm(d?.kind === 'rename' ? { name: d.name } : {}); setError('') }
  const run = (fn: () => Promise<unknown>, ok?: string): void => {
    setBusy(true); setError('')
    fn().then((r) => {
      if (r && typeof r === 'object' && 'users' in (r as object)) setState(r as UsersState)
      if (ok) toast.success(ok)
      setDialog(null)
    }).catch((e: unknown) => setError(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e)))
      .finally(() => setBusy(false))
  }

  const users = state?.users ?? []
  const active = state?.active ?? ''

  return (
    <div className="space-y-8">
      <UserProfileCard />

      <RoyAccountSection />

      <SettingsSection title="软件更新" description="检查当前版本与是否有新版本">
        <UpdateCard />
      </SettingsSection>

      <UsageSection userName={userProfile.userName} />

      <SettingsSection title="多用户" description="一台电脑几个人用时，每个人的会话、项目、设置和模型配置都是分开的。切换用户会重启 Roy">
        <SettingsCard>
          {users.length === 0 ? (
            <div className="px-4 py-4 text-[13px] text-muted-foreground">
              现在只有你一个人用，数据在原来的位置。加第一个用户时，现在的数据会归到「第一个用户」名下，原地不动。
            </div>
          ) : users.map((u) => (
            <div key={u.username} className="flex items-center gap-3 px-4 py-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/90 text-[14px] text-primary-foreground">{u.displayName.slice(0, 1)}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[13.5px] font-medium text-foreground">
                  {u.displayName}
                  {u.username === active && <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[11px] font-normal text-emerald-700 dark:text-emerald-400">正在用</span>}
                  {u.primary && <span className="rounded bg-foreground/[0.06] px-1.5 py-0.5 text-[11px] font-normal text-muted-foreground">第一个用户</span>}
                  {u.hasPassword && <KeyRound size={12} className="text-muted-foreground" />}
                </div>
                <div className="truncate text-[11.5px] text-muted-foreground" title={u.dataDir}>{u.username} · {u.dataDir}</div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {u.username !== active && (
                  <button type="button" className="flex h-8 items-center gap-1 rounded-md px-2 text-[12.5px] hover:bg-foreground/[0.06]" onClick={() => open({ kind: 'switch', username: u.username, name: u.displayName, hasPassword: u.hasPassword })}>
                    <LogIn size={14} />切换
                  </button>
                )}
                <button type="button" title="改名字" className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-foreground/[0.06]" onClick={() => open({ kind: 'rename', username: u.username, name: u.displayName })}><Pencil size={14} /></button>
                {u.username === active && (
                  <button type="button" title={u.hasPassword ? '改密码' : '设密码'} className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-foreground/[0.06]" onClick={() => open({ kind: 'password', username: u.username, hasPassword: u.hasPassword })}><KeyRound size={14} /></button>
                )}
                {!u.primary && u.username !== active && (
                  <button type="button" title="从名单里删掉（数据保留）" className="flex h-8 w-8 items-center justify-center rounded-md text-destructive hover:bg-destructive/10" onClick={() => {
                    if (!window.confirm(`把「${u.displayName}」从用户名单里删掉？\n\n他的数据文件夹不会删除：\n${u.dataDir}`)) return
                    run(() => window.electronAPI.usersDelete(u.username), '已删除')
                  }}><Trash2 size={14} /></button>
                )}
              </div>
            </div>
          ))}
          <div className="px-4 py-3">
            <button type="button" className="flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-[13px] hover:bg-foreground/[0.04]" onClick={() => open({ kind: 'add' })}>
              <UserPlus size={14} />添加用户
            </button>
          </div>
        </SettingsCard>
        {users.length > 1 && (
          <SettingsCard>
            <SettingsToggle
              label="启动时选择用户"
              description="打开 Roy 时先弹出用户列表。关掉后直接进上次用的用户（设了密码的用户还是要输密码）"
              checked={state?.askOnStartup ?? true}
              onCheckedChange={(v) => run(() => window.electronAPI.usersAskOnStartup(v))}
            />
          </SettingsCard>
        )}
      </SettingsSection>

      <AboutSettings />

      {dialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[2px]" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) setDialog(null) }}>
          <form
            className="w-[380px] space-y-3 rounded-2xl border border-border bg-background p-5 shadow-xl"
            onSubmit={(e) => {
              e.preventDefault()
              const api = window.electronAPI
              if (dialog.kind === 'add') {
                if (form.password && form.password !== form.password2) { setError('两次输入的密码不一样'); return }
                run(() => api.usersCreate({ username: form.username ?? '', displayName: form.displayName ?? '', password: form.password ?? '' }), '已添加用户')
              } else if (dialog.kind === 'rename') {
                run(() => api.usersRename(dialog.username, form.name ?? ''), '已改名')
              } else if (dialog.kind === 'password') {
                if ((form.newPw ?? '') !== (form.newPw2 ?? '')) { setError('两次输入的新密码不一样'); return }
                run(() => api.usersPassword(dialog.username, form.oldPw ?? '', form.newPw ?? ''), form.newPw ? '密码已更新' : '已去掉密码')
              } else if (dialog.kind === 'switch') {
                run(() => api.usersSwitch(dialog.username, form.pw ?? ''), '正在切换，Roy 马上重启…')
              }
            }}
          >
            <div className="text-[15px] font-semibold text-foreground">
              {dialog.kind === 'add' ? '添加用户' : dialog.kind === 'rename' ? '改名字' : dialog.kind === 'password' ? (dialog.hasPassword ? '改密码' : '设密码') : `切换到「${dialog.name}」`}
            </div>
            {dialog.kind === 'add' && (<>
              <input autoFocus className={input} placeholder="用户名（英文，比如 xiaoming，以后不能改）" value={form.username ?? ''} onChange={(e) => setForm({ ...form, username: e.target.value })} />
              <input className={input} placeholder="显示的名字（比如 小明）" value={form.displayName ?? ''} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
              <input className={input} type="password" placeholder="密码（可以不设）" value={form.password ?? ''} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              {form.password && <input className={input} type="password" placeholder="再输一次密码" value={form.password2 ?? ''} onChange={(e) => setForm({ ...form, password2: e.target.value })} />}
              <p className="text-[12px] leading-5 text-muted-foreground">新用户是一套空白的 Roy：要重新配模型、项目。{users.length === 0 ? '现在的数据会成为「第一个用户」，不会被搬动。' : ''}</p>
            </>)}
            {dialog.kind === 'rename' && <input autoFocus className={input} value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} />}
            {dialog.kind === 'password' && (<>
              {dialog.hasPassword && <input autoFocus className={input} type="password" placeholder="原密码" value={form.oldPw ?? ''} onChange={(e) => setForm({ ...form, oldPw: e.target.value })} />}
              <input autoFocus={!dialog.hasPassword} className={input} type="password" placeholder={dialog.hasPassword ? '新密码（留空 = 去掉密码）' : '新密码'} value={form.newPw ?? ''} onChange={(e) => setForm({ ...form, newPw: e.target.value })} />
              <input className={input} type="password" placeholder="再输一次新密码" value={form.newPw2 ?? ''} onChange={(e) => setForm({ ...form, newPw2: e.target.value })} />
              <p className="text-[12px] leading-5 text-muted-foreground">密码只存在这台电脑上，忘了就找不回，只能用第一个用户把这个用户删了重建。</p>
            </>)}
            {dialog.kind === 'switch' && (<>
              {dialog.hasPassword && <input autoFocus className={input} type="password" placeholder="输入密码" value={form.pw ?? ''} onChange={(e) => setForm({ ...form, pw: e.target.value })} />}
              <p className="text-[12px] leading-5 text-muted-foreground">Roy 会重启并打开这个用户的数据。正在跑的任务要先停下。</p>
            </>)}
            {error && <p role="alert" className="text-[12.5px] text-destructive">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" disabled={busy} className="h-8 rounded-lg px-3 text-[13px] hover:bg-foreground/[0.06]" onClick={() => setDialog(null)}>取消</button>
              <button type="submit" disabled={busy} className={cn('h-8 rounded-lg bg-primary px-4 text-[13px] text-primary-foreground', busy && 'opacity-60')}>
                {dialog.kind === 'switch' ? '切换并重启' : '确定'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
