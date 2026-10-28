/**
 * Roy 账号登录 / 注册 / 邮箱验证 / 找回密码（启动登录窗用）
 *
 * 布局参照 Proma：卡片 + 带标签的输入框；密码可显示；必须勾选《用户协议》《隐私政策》；
 * 登录和注册用底部链接切换；注册在同一页：用户名 → 邮箱（发送验证码）→ 验证码 → 密码 → 确认密码，验证码对了才创建账号。
 * 登录态以主进程校验过签名的凭证为准（main/lib/roy-account.ts）。
 */
import * as React from 'react'
import { toast } from 'sonner'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { LEGAL_CONTACT_EMAIL, LEGAL_UPDATED_AT, PRIVACY_POLICY, USER_AGREEMENT, type LegalDoc } from './legal-texts'

type View = Awaited<ReturnType<typeof window.electronAPI.accountGet>>

export const authInput = 'h-10 w-full rounded-lg border border-border bg-background px-3 text-[13px] outline-none transition-colors placeholder:text-foreground/35 focus:border-primary focus:ring-2 focus:ring-primary/15'
export const authBtn = 'inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition-colors disabled:opacity-50'
/** 与账号服务 USERNAME_RE 一致：2–20 位中英文、数字、下划线、短横线（不能含 @） */
export const USERNAME_RE = /^[\p{L}\p{N}_-]{2,20}$/u
// IPC 通道名本身带冒号（如 'account:activate'），要按引号截掉整段前缀
export const errText = (e: unknown): string => String(e instanceof Error ? e.message : e).replace(/^Error invoking remote method '[^']*':\s*(Error:\s*)?/, '')

/** 与账号服务 checkNewPassword 一致 */
export function checkNewPassword(password: string): string | null {
  if (password.length < 8 || password.length > 64) return '密码需要 8–64 位'
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return '密码需要同时包含字母和数字'
  return null
}

const primaryBtn = cn(authBtn, 'h-10 w-full justify-center bg-primary text-primary-foreground hover:bg-primary/90')
const linkBtn = 'text-primary underline-offset-4 hover:underline'

type Step = 'login' | 'register' | 'verify' | 'forgot'

const SUBTITLE: Record<Step, string> = {
  login: '登录您的账号',
  register: '创建您的账号',
  verify: '验证您的邮箱',
  forgot: '找回密码',
}

export function RoyAuthForm({ onSignedIn }: { onSignedIn?: (view: View) => void }): React.ReactElement {
  const [step, setStep] = React.useState<Step>('login')
  /** 注册 / 找回密码时带到下一步的邮箱 */
  const [email, setEmail] = React.useState('')
  // 协议勾选在登录和注册之间共用，切换页面不用重勾
  const [agreed, setAgreed] = React.useState(false)

  return (
    <div className="w-full">
      <div className="mb-6 text-center">
        <h1 className="text-[26px] font-semibold tracking-tight text-foreground">Roy</h1>
        <p className="mt-1.5 text-[13px] text-foreground/55">{SUBTITLE[step]}</p>
      </div>
      {step === 'login' && (
        <LoginStep agreed={agreed} onAgreedChange={setAgreed} onSignedIn={onSignedIn}
          onRegister={() => setStep('register')}
          onForgot={(mail) => { setEmail(mail); setStep('forgot') }} />
      )}
      {step === 'register' && (
        <RegisterStep agreed={agreed} onAgreedChange={setAgreed} onSignedIn={onSignedIn}
          onLogin={() => setStep('login')}
          onCodeSent={(mail) => { setEmail(mail); setStep('verify') }} />
      )}
      {step === 'verify' && <VerifyStep email={email} onSignedIn={onSignedIn} onBack={() => setStep('register')} />}
      {step === 'forgot' && <ForgotStep initialEmail={email} onDone={() => setStep('login')} />}
    </div>
  )
}

// ---------- 通用小组件 ----------

function Field({ label, htmlFor, right, children }: { label: string; htmlFor: string; right?: React.ReactNode; children: React.ReactNode }): React.ReactElement {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label htmlFor={htmlFor} className="text-[13px] font-medium text-foreground/85">{label}</label>
        {right}
      </div>
      {children}
    </div>
  )
}

function PasswordInput(props: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>): React.ReactElement {
  const [show, setShow] = React.useState(false)
  return (
    <div className="relative">
      <input {...props} type={show ? 'text' : 'password'} className={cn(authInput, 'pr-10')} />
      <button type="button" tabIndex={-1} aria-label={show ? '隐藏密码' : '显示密码'} onClick={() => setShow((v) => !v)}
        className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-foreground/45 hover:bg-foreground/[0.06] hover:text-foreground/75">
        {show ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  )
}

function ErrorText({ children }: { children: React.ReactNode }): React.ReactElement | null {
  if (!children) return null
  return <p role="alert" className="text-[12px] leading-5 text-destructive">{children}</p>
}

/** 协议勾选：没勾选不能登录 / 注册 */
function Agreement({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }): React.ReactElement {
  const [doc, setDoc] = React.useState<LegalDoc | null>(null)
  return (
    <div className="rounded-lg border border-border/70 bg-foreground/[0.02] px-3 py-2.5">
      <p className="text-[12px] text-foreground/60">继续前，请先确认以下协议</p>
      <label className="mt-1.5 flex cursor-pointer items-start gap-2 text-[12.5px] leading-5 text-foreground/80">
        <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)}
          className="mt-[3px] h-3.5 w-3.5 shrink-0 accent-[hsl(var(--primary))]" />
        <span>
          我已阅读并同意
          <button type="button" className={cn(linkBtn, 'mx-0.5')} onClick={(e) => { e.preventDefault(); setDoc(USER_AGREEMENT) }}>《用户协议》</button>
          和
          <button type="button" className={cn(linkBtn, 'ml-0.5')} onClick={(e) => { e.preventDefault(); setDoc(PRIVACY_POLICY) }}>《隐私政策》</button>
        </span>
      </label>
      <LegalDialog doc={doc} onClose={() => setDoc(null)} />
    </div>
  )
}

function LegalDialog({ doc, onClose }: { doc: LegalDoc | null; onClose: () => void }): React.ReactElement {
  return (
    <Dialog open={doc !== null} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="z-[260] max-h-[80vh] max-w-2xl overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>{doc?.title}</DialogTitle>
          <p className="text-[12px] text-foreground/50">更新日期：{LEGAL_UPDATED_AT}</p>
        </DialogHeader>
        <div className="max-h-[calc(80vh-80px)] overflow-y-auto px-6 py-4 text-[13px] leading-6 text-foreground/80">
          {doc?.sections.map((s) => (
            <section key={s.heading} className="mb-4">
              <h3 className="mb-1 font-semibold text-foreground">{s.heading}</h3>
              {s.paragraphs.map((p) => <p key={p} className="mb-1.5">{p}</p>)}
            </section>
          ))}
          <p className="text-[12px] text-foreground/45">联系邮箱：{LEGAL_CONTACT_EMAIL}</p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function useCooldown(): [number, (s: number) => void] {
  const [left, setLeft] = React.useState(0)
  React.useEffect(() => {
    if (left <= 0) return
    const t = setTimeout(() => setLeft((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [left])
  return [left, setLeft]
}

const AGREE_FIRST = '请先阅读并勾选同意《用户协议》和《隐私政策》'

// ---------- 登录 ----------

function LoginStep({ agreed, onAgreedChange, onSignedIn, onRegister, onForgot }: {
  agreed: boolean; onAgreedChange: (v: boolean) => void; onSignedIn?: (v: View) => void
  onRegister: () => void; onForgot: (email: string) => void
}): React.ReactElement {
  const [account, setAccount] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    setError('')
    if (!account.trim() || !password) { setError('请填写用户名或邮箱，以及密码'); return }
    if (!agreed) { setError(AGREE_FIRST); return }
    setBusy(true)
    try {
      const view = await window.electronAPI.accountLogin(account.trim(), password)
      toast.success('登录成功')
      onSignedIn?.(view)
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4">
      <Field label="用户名或邮箱" htmlFor="roy-auth-account">
        <input id="roy-auth-account" className={authInput} type="text" autoComplete="username" placeholder="your@email.com 或用户名"
          value={account} onChange={(e) => setAccount(e.target.value)} disabled={busy} autoFocus />
      </Field>
      <Field label="密码" htmlFor="roy-auth-password"
        right={<button type="button" className="text-[12.5px] text-foreground/55 hover:text-primary" onClick={() => onForgot(account.includes('@') ? account.trim() : '')}>忘记密码？</button>}>
        <PasswordInput id="roy-auth-password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} />
      </Field>
      <Agreement checked={agreed} onChange={onAgreedChange} disabled={busy} />
      <ErrorText>{error}</ErrorText>
      <button type="submit" disabled={busy} className={primaryBtn}>{busy ? '登录中…' : '登录'}</button>
      <p className="pt-1 text-center text-[13px] text-foreground/55">
        还没有账号？<button type="button" className={cn(linkBtn, 'ml-1')} onClick={onRegister}>立即注册</button>
      </p>
    </form>
  )
}

// ---------- 注册 ----------

function RegisterStep({ agreed, onAgreedChange, onSignedIn, onLogin, onCodeSent }: {
  agreed: boolean; onAgreedChange: (v: boolean) => void; onSignedIn?: (v: View) => void
  onLogin: () => void; onCodeSent: (email: string) => void
}): React.ReactElement {
  const [username, setUsername] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [code, setCode] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [confirm, setConfirm] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [sending, setSending] = React.useState(false)
  /** 验证码发给了哪个邮箱；改了邮箱要重新发 */
  const [sentTo, setSentTo] = React.useState('')
  /** 账号服务还是旧版：没有单页注册接口，改走「填完再收验证码」的两步流程 */
  const [legacy, setLegacy] = React.useState(false)
  const [cooldown, setCooldown] = useCooldown()
  const [error, setError] = React.useState('')

  const checkIdentity = (): string | null => {
    if (!USERNAME_RE.test(username.trim())) return '用户名需 2–20 位，只能用中英文、数字、下划线或短横线'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return '邮箱格式不对'
    return null
  }

  const sendCode = async (): Promise<void> => {
    setError('')
    const bad = checkIdentity()
    if (bad) { setError(bad); return }
    setSending(true)
    try {
      const r = await window.electronAPI.accountRegisterSendCode(username.trim(), email.trim())
      if (r.legacy) { setLegacy(true); toast.info('请填好密码后点「注册」，验证码会发到你的邮箱'); return }
      setSentTo(email.trim().toLowerCase())
      setCooldown(60)
      toast.success('验证码已发送，请查看邮箱')
    } catch (e) {
      setError(errText(e))
    } finally {
      setSending(false)
    }
  }

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    setError('')
    const bad = checkIdentity()
    if (bad) { setError(bad); return }
    if (!legacy) {
      if (!sentTo) { setError('请先点「发送验证码」验证邮箱'); return }
      if (sentTo !== email.trim().toLowerCase()) { setError('邮箱改过了，请重新发送验证码'); return }
      if (!/^\d{6}$/.test(code.trim())) { setError('请输入邮件里的 6 位验证码'); return }
    }
    const weak = checkNewPassword(password)
    if (weak) { setError(weak); return }
    if (password !== confirm) { setError('两次输入的密码不一致'); return }
    if (!agreed) { setError(AGREE_FIRST); return }
    setBusy(true)
    try {
      if (legacy) {
        const r = await window.electronAPI.accountRegisterStart(username.trim(), email.trim(), password)
        if (r.pending) { toast.success('验证码已发送到你的邮箱'); onCodeSent(email.trim()) }
        else if (r.view) { toast.success('注册成功，已登录'); onSignedIn?.(r.view) }
        return
      }
      const view = await window.electronAPI.accountRegisterComplete(username.trim(), email.trim(), code.trim(), password)
      toast.success('注册成功，已登录')
      onSignedIn?.(view)
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(false)
    }
  }

  const locked = busy || sending
  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-3.5">
      <Field label="用户名" htmlFor="roy-auth-username">
        <input id="roy-auth-username" className={authInput} type="text" autoComplete="username" placeholder="2–20 位，可以用中文" maxLength={20}
          value={username} onChange={(e) => setUsername(e.target.value)} disabled={locked} autoFocus />
      </Field>
      <Field label="邮箱" htmlFor="roy-auth-email">
        <div className="flex gap-2">
          <input id="roy-auth-email" className={cn(authInput, 'min-w-0 flex-1')} type="email" autoComplete="email" placeholder="your@email.com"
            value={email} onChange={(e) => setEmail(e.target.value)} disabled={locked} />
          {!legacy && (
            <button type="button" onClick={() => void sendCode()} disabled={locked || cooldown > 0}
              className={cn(authBtn, 'h-10 shrink-0 justify-center border border-border bg-background px-3 text-foreground/80 hover:border-primary hover:text-primary')}>
              {sending ? '发送中…' : cooldown > 0 ? `${cooldown} 秒` : sentTo ? '重新发送' : '发送验证码'}
            </button>
          )}
        </div>
      </Field>
      {!legacy && (
        <Field label="验证码" htmlFor="roy-auth-code"
          right={sentTo ? <span className="text-[12px] text-foreground/45">已发送到 {sentTo}，15 分钟内有效</span> : undefined}>
          <input id="roy-auth-code" className={cn(authInput, 'font-mono tracking-[0.3em] placeholder:font-sans placeholder:tracking-normal')} inputMode="numeric" autoComplete="one-time-code" maxLength={6}
            placeholder="邮件里的 6 位数字" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} disabled={locked} />
        </Field>
      )}
      <Field label="密码" htmlFor="roy-auth-new-password">
        <PasswordInput id="roy-auth-new-password" autoComplete="new-password" placeholder="8–64 位，包含字母和数字" value={password} onChange={(e) => setPassword(e.target.value)} disabled={locked} />
      </Field>
      <Field label="确认密码" htmlFor="roy-auth-confirm">
        <PasswordInput id="roy-auth-confirm" autoComplete="new-password" placeholder="再次输入密码" value={confirm} onChange={(e) => setConfirm(e.target.value)} disabled={locked} />
      </Field>
      <Agreement checked={agreed} onChange={onAgreedChange} disabled={locked} />
      <ErrorText>{error}</ErrorText>
      <button type="submit" disabled={locked} className={primaryBtn}>{busy ? '请稍候…' : '注册'}</button>
      <p className="pt-1 text-center text-[13px] text-foreground/55">
        已有账号？<button type="button" className={cn(linkBtn, 'ml-1')} onClick={onLogin}>立即登录</button>
      </p>
    </form>
  )
}

// ---------- 邮箱验证 ----------

function VerifyStep({ email, onSignedIn, onBack }: { email: string; onSignedIn?: (v: View) => void; onBack: () => void }): React.ReactElement {
  const [code, setCode] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  const [cooldown, setCooldown] = useCooldown()
  React.useEffect(() => { setCooldown(60) }, [setCooldown])

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    setError('')
    if (!/^\d{6}$/.test(code.trim())) { setError('验证码为 6 位数字'); return }
    setBusy(true)
    try {
      const view = await window.electronAPI.accountRegisterVerify(email, code.trim())
      toast.success('注册成功，已登录')
      onSignedIn?.(view)
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(false)
    }
  }
  const resend = async (): Promise<void> => {
    setError('')
    try { await window.electronAPI.accountRegisterResend(email); setCooldown(60); toast.success('验证码已重新发送') }
    catch (e) { setError(errText(e)) }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4">
      <p className="text-center text-[13px] leading-5 text-foreground/65">
        我们已向 <strong className="font-medium text-foreground">{email}</strong> 发送了 6 位验证码，15 分钟内有效
      </p>
      <Field label="验证码" htmlFor="roy-auth-code"
        right={<button type="button" disabled={cooldown > 0} onClick={() => void resend()} className="text-[12.5px] text-foreground/55 hover:text-primary disabled:hover:text-foreground/55">{cooldown > 0 ? `${cooldown} 秒后可重发` : '重新发送'}</button>}>
        <input id="roy-auth-code" className={cn(authInput, 'text-center font-mono text-[16px] tracking-[0.4em]')} inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="······"
          value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} disabled={busy} autoFocus />
      </Field>
      <ErrorText>{error}</ErrorText>
      <button type="submit" disabled={busy} className={primaryBtn}>{busy ? '验证中…' : '验证并登录'}</button>
      <p className="text-center text-[12px] leading-5 text-foreground/45">没收到？看看垃圾邮件，或<button type="button" className={cn(linkBtn, 'mx-0.5')} onClick={onBack}>返回修改邮箱</button></p>
    </form>
  )
}

// ---------- 找回密码 ----------

function ForgotStep({ initialEmail, onDone }: { initialEmail: string; onDone: () => void }): React.ReactElement {
  const [email, setEmail] = React.useState(initialEmail)
  const [sent, setSent] = React.useState(false)
  const [code, setCode] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  const [cooldown, setCooldown] = useCooldown()

  const send = async (): Promise<void> => {
    setBusy(true); setError('')
    try { await window.electronAPI.accountForgotPassword(email.trim()); setSent(true); setCooldown(60); toast.success('如果这个邮箱注册过，验证码已经发过去了') }
    catch (e) { setError(errText(e)) } finally { setBusy(false) }
  }
  const reset = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    if (!sent) { void send(); return }
    if (password.length < 8) { setError('新密码至少 8 位'); return }
    setBusy(true); setError('')
    try { await window.electronAPI.accountResetPassword(email.trim(), code.trim(), password); toast.success('密码已重设，请用新密码登录'); onDone() }
    catch (e) { setError(errText(e)) } finally { setBusy(false) }
  }

  return (
    <form onSubmit={(e) => void reset(e)} className="space-y-4">
      <Field label="注册邮箱" htmlFor="roy-forgot-email">
        <div className="flex gap-2">
          <input id="roy-forgot-email" className={authInput} type="email" autoComplete="email" placeholder="your@email.com" value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} autoFocus />
          <button type="button" disabled={busy || !email.trim() || cooldown > 0} onClick={() => void send()} className={cn(authBtn, 'h-10 shrink-0 border border-border text-foreground/75 hover:bg-foreground/[0.05]')}>
            {cooldown > 0 ? `${cooldown} 秒` : sent ? '重新发送' : '发送验证码'}
          </button>
        </div>
      </Field>
      {sent && (
        <>
          <Field label="验证码" htmlFor="roy-forgot-code">
            <input id="roy-forgot-code" className={authInput} inputMode="numeric" autoComplete="one-time-code" placeholder="邮件里的 6 位验证码" value={code} onChange={(e) => setCode(e.target.value)} disabled={busy} />
          </Field>
          <Field label="新密码" htmlFor="roy-forgot-password">
            <PasswordInput id="roy-forgot-password" autoComplete="new-password" placeholder="至少 8 位" value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} />
          </Field>
        </>
      )}
      <ErrorText>{error}</ErrorText>
      <button type="submit" disabled={busy} className={primaryBtn}>{busy ? '请稍候…' : sent ? '重设密码' : '发送验证码'}</button>
      <p className="text-center text-[13px] text-foreground/55">
        想起来了？<button type="button" className={cn(linkBtn, 'ml-1')} onClick={onDone}>返回登录</button>
      </p>
    </form>
  )
}
