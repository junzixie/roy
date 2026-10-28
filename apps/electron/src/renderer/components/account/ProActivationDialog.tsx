/**
 * Pro 激活弹窗：只能输入激活码激活，激活码由账号服务校验（/v1/activate）。
 * 由 openProActivation / ensureProFeature 打开（见 atoms/pro-activation.ts）。
 */
import * as React from 'react'
import { useAtom } from 'jotai'
import { toast } from 'sonner'
import { Crown, KeyRound } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { formatProValidity } from '@/lib/pro-expiry'
import { proActivationAtom, PRO_FEATURE_NAMES } from '@/atoms/pro-activation'
import { authBtn, authInput, errText } from './RoyAuthForm'

export function ProActivationDialog(): React.ReactElement {
  const [request, setRequest] = useAtom(proActivationAtom)
  const [code, setCode] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')

  const open = request !== null
  React.useEffect(() => { if (open) { setCode(''); setError('') } }, [open])

  const featureName = request?.feature ? PRO_FEATURE_NAMES[request.feature] : ''

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    const value = code.trim()
    if (!value) { setError('请输入激活码'); return }
    setBusy(true); setError('')
    try {
      const view = await window.electronAPI.accountActivate(value)
      if (view.plan !== 'pro') { setError('激活码校验未通过，请检查后重试'); return }
      if (request?.feature && !view.features.includes(request.feature)) {
        setError(`激活成功，但这个激活码不包含「${featureName}」`)
        return
      }
      const expires = view.proExpiresAt ? `，${formatProValidity(view.proExpiresAt)}` : ''
      toast.success(`激活成功${expires}`)
      const next = request?.onActivated
      setRequest(null)
      next?.()
    } catch (e) {
      setError(errText(e) || '激活失败，请重试')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !busy) setRequest(null) }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Crown size={18} className="text-amber-500" />激活 Roy Pro</DialogTitle>
          <DialogDescription>
            {featureName ? `「${featureName}」需要激活后才能使用。` : ''}请输入激活码进行激活。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void submit(e)} className="space-y-3">
          <div className="relative">
            <KeyRound size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-foreground/40" />
            <input
              id="roy-pro-activation-code"
              className={cn(authInput, 'pl-9 font-mono tracking-wide')}
              placeholder="请输入激活码"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoFocus
              spellCheck={false}
              autoComplete="off"
            />
          </div>
          {error && <p role="alert" className="text-[12px] text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" disabled={busy} onClick={() => setRequest(null)} className={cn(authBtn, 'border border-border text-foreground/75 hover:bg-foreground/[0.05]')}>取消</button>
            <button type="submit" disabled={busy || !code.trim()} className={cn(authBtn, 'bg-primary text-primary-foreground hover:bg-primary/90')}>{busy ? '正在验证…' : '激活'}</button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
