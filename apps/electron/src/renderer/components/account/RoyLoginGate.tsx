/**
 * 启动登录门槛：没登录 Roy 账号时，整个窗口显示登录 / 注册页，登录后才进入软件。
 *
 * 布局参照 Proma：左侧大幅画面（这里换成开场动画里的视频，每次随机一段）+ 品牌和标语，右侧居中卡片。
 * - 登录态以主进程凭证为准；退出登录或令牌失效（account:changed）会重新显示
 * - 已登录用户离线时沿用本地凭证，不会被拦
 * - 无边框窗口：自带最小化 / 关闭按钮和顶部拖动区
 * - 视频放不了时显示静态缩略图
 * - 窗口太窄时只显示右侧表单
 * 登录页不展示 Pro 权益：权益在激活码弹窗和「设置 → 账号 → 软件激活」里。
 */
import * as React from 'react'
import { Minus, X } from 'lucide-react'
import { RoyLogo } from '@/lib/model-logo'
import { RoyAuthForm } from './RoyAuthForm'
import archesVideo from '@/assets/login/fb-arches.mp4'
import gatewayVideo from '@/assets/login/fb-gateway.mp4'
import archesPoster from '@/assets/startup/fb-arches.webp'
import gatewayPoster from '@/assets/startup/fb-gateway.webp'

/** 从开场动画里挑的安静画面（「极光地平线」大部分时间接近全黑，不适合做背景，没有放进来） */
const SCENES = [
  { video: archesVideo, poster: archesPoster, alt: '水中拱门' },
  { video: gatewayVideo, poster: gatewayPoster, alt: '赤色门廊' },
]

/**
 * 左侧画面。注意：不跟随系统「减少动态效果」——很多 Windows 电脑关了「显示动画」，
 * 跟随的话登录页就永远是静态图；这几段是缓慢、无闪烁的风景视频，按产品要求始终播放。
 * 视频放不了时退回缩略图。
 */
function SceneVideo(): React.ReactElement {
  // 每次打开登录页随机一段
  const scene = React.useMemo(() => SCENES[Math.floor(Math.random() * SCENES.length)]!, [])
  const [failed, setFailed] = React.useState(false)
  const ref = React.useRef<HTMLVideoElement | null>(null)

  // 窗口切走时暂停，省电
  React.useEffect(() => {
    const v = ref.current
    if (!v) return
    const sync = (): void => { if (document.hidden) v.pause(); else void v.play().catch(() => undefined) }
    document.addEventListener('visibilitychange', sync)
    return () => document.removeEventListener('visibilitychange', sync)
  }, [])

  if (failed) {
    return <img src={scene.poster} alt={scene.alt} className="absolute inset-0 h-full w-full object-cover" />
  }
  return (
    <video
      ref={ref}
      src={scene.video}
      poster={scene.poster}
      autoPlay
      muted
      loop
      playsInline
      aria-label={scene.alt}
      onError={() => setFailed(true)}
      className="absolute inset-0 h-full w-full object-cover"
    />
  )
}

export function RoyLoginGate(): React.ReactElement | null {
  // null = 还在读登录状态
  const [signedIn, setSignedIn] = React.useState<boolean | null>(null)

  const load = React.useCallback(() => {
    void window.electronAPI.accountGet()
      .then((v) => setSignedIn(v.signedIn))
      .catch(() => setSignedIn(false))
  }, [])
  React.useEffect(() => { load(); return window.electronAPI.onAccountChanged(load) }, [load])

  if (signedIn === true) return null

  return (
    <div className="fixed inset-0 z-[200] flex bg-background">
      {/* 顶部拖动区 + 窗口按钮（主窗口无边框，被盖住后原按钮点不到） */}
      <div className="titlebar-drag-region absolute inset-x-0 top-0 z-10 h-9" />
      <div className="titlebar-no-drag absolute right-2 top-1.5 z-20 flex gap-1">
        <button type="button" aria-label="最小化" onClick={() => void window.electronAPI.windowMinimize()} className="flex h-7 w-9 items-center justify-center rounded-md text-foreground/60 hover:bg-foreground/[0.07]"><Minus size={15} /></button>
        <button type="button" aria-label="关闭" onClick={() => void window.electronAPI.windowClose()} className="flex h-7 w-9 items-center justify-center rounded-md text-foreground/60 hover:bg-destructive hover:text-white"><X size={15} /></button>
      </div>

      {signedIn === false && (
        <>
          {/* 左侧画面：窗口够宽才显示 */}
          <aside className="relative hidden flex-[1.7] overflow-hidden bg-[#070b18] md:block">
            <SceneVideo />
            <div className="absolute inset-0 bg-gradient-to-tr from-black/60 via-transparent to-black/20" />
            <div className="absolute left-8 top-10 flex items-center gap-2.5">
              <img src={RoyLogo} alt="Roy" className="h-8 w-8 rounded-lg object-contain drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]" />
              <span className="text-lg font-light tracking-wide text-white">Roy</span>
            </div>
            <div className="absolute bottom-10 left-8 right-8">
              <p className="text-balance text-2xl font-light leading-snug text-white">让想法落地，让工作自然发生。</p>
              <p className="mt-2 text-xs uppercase tracking-[0.3em] text-white/70">Local-first AI Agent</p>
            </div>
          </aside>

          {/* 右侧表单 */}
          <main className="titlebar-no-drag relative flex flex-1 items-center justify-center overflow-y-auto bg-foreground/[0.025] px-6 py-12">
            <div className="w-full max-w-[420px] rounded-2xl border border-border/70 bg-card px-8 py-8 shadow-lg">
              <RoyAuthForm onSignedIn={(v) => setSignedIn(v.signedIn)} />
            </div>
          </main>
        </>
      )}
    </div>
  )
}
