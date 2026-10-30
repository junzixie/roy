/**
 * 壁纸背景层
 *
 * 实现要点：
 * - 壁纸挂在 #root 最前面，z-index 低于内容；
 * - 壁纸模式下 .shell-bg / body / #root 让出底色，内容面板改为半透明，壁纸才透得出来；
 * - 面板透明度由设置里的「面板不透明度」驱动（数值越高，面板越实），
 *   通过 CSS 变量传给 globals.css，避免样式里写死数值导致滑块看起来没反应。
 * - 三种来源：图片（内置 / 自己的）、视频（工坊视频型 / 本地视频）、场景（工坊 scene.pkg，WebWallGL 渲染）
 * - 本地文件只存原始路径，这里换成本次运行有效的 roy-file:// 地址
 * - 视频 / 场景没就绪之前垫一层不透明底色，绝不透出桌面（窗口是透明的）
 */

import * as React from 'react'
import { createPortal } from 'react-dom'
import { useAtomValue, useSetAtom } from 'jotai'
import { agentStreamingAtom } from '@/atoms/agent-atoms'
import { streamingAtom } from '@/atoms/chat-atoms'
import { wallpaperConfigAtom, wallpaperEffectiveAtom, wallpaperStatusAtom } from '@/atoms/wallpaper'
import { SceneWallpaper } from './SceneWallpaper'
import { ProceduralWallpaper } from './ProceduralWallpaper'
import { getProceduralWallpaper } from '@/lib/procedural-wallpapers'

/** 强度 0..100 —— 越高，壁纸越淡、内容越清楚。 */
function alphasOf(strength: number): {
  panel: number
  sidebar: number
  wash: number
  blur: number
} {
  const ratio = Math.min(100, Math.max(0, strength)) / 100
  return {
    // 百分比直接对应面板 alpha：0% 透明，100% 不透明。
    panel: ratio,
    sidebar: ratio,
    // 壁纸层自身的主题色薄蒙版，只做轻微压暗
    wash: 0.02 + ratio * 0.22,
    blur: 0,
  }
}

/** 本地路径 → roy-file:// 地址；文件不在了返回空 */
function useResolvedSrc(src: string, needsResolve: boolean): { url: string; missing: boolean } {
  const [state, setState] = React.useState<{ key: string; url: string; missing: boolean }>({ key: '', url: '', missing: false })
  React.useEffect(() => {
    if (!needsResolve || !src) return
    let cancelled = false
    void window.electronAPI
      .getWallpaperFileUrl(src)
      .then((url) => {
        if (!cancelled) setState({ key: src, url: url ?? '', missing: !url })
      })
      .catch(() => {
        if (!cancelled) setState({ key: src, url: '', missing: true })
      })
    return () => { cancelled = true }
  }, [src, needsResolve])
  if (!needsResolve) return { url: src, missing: false }
  // 解析还没回来时**沿用上一个地址**，不要返回空串。
  // 返回空串会让 active 变 false、整层壁纸卸载，露出的就是下面那层不透明底色——
  // 这是切本地壁纸时闪一下的真正原因（不只是视频那条）。
  return state.key === src ? { url: state.url, missing: state.missing } : { url: state.url, missing: false }
}

export function WallpaperLayer(): React.ReactElement | null {
  const effective = useAtomValue(wallpaperEffectiveAtom)
  const config = useAtomValue(wallpaperConfigAtom)
  const agentReplying = useAtomValue(agentStreamingAtom)
  const chatReplying = useAtomValue(streamingAtom)
  const clarity = Math.min(100, Math.max(0, config.textClarity ?? (config.boldText ? 50 : 0)))
  React.useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--roy-text-weight', String(400 + clarity * 2))
    root.style.setProperty('--roy-text-contrast', String(0.75 + clarity * 0.0025))
    root.toggleAttribute('data-roy-reduced-effects', config.reduceEffectsWhileReplying !== false && (agentReplying || chatReplying))
    return () => { root.removeAttribute('data-roy-reduced-effects'); root.style.removeProperty('--roy-text-weight'); root.style.removeProperty('--roy-text-contrast') }
  }, [clarity, config.reduceEffectsWhileReplying, agentReplying, chatReplying])
  const setStatus = useSetAtom(wallpaperStatusAtom)
  const [mediaError, setMediaError] = React.useState('')
  const { kind, scope, strength, boldText, imageScale, objectPosition, sceneFps, scenePause, fitHeight } = effective
  const resolved = useResolvedSrc(kind === 'scene' || kind === 'procedural' ? '' : effective.src, effective.needsResolve)
  const [mediaReady, setMediaReady] = React.useState(false)

  /**
   * 视频双槽：A / B 交替。
   *
   * 以前是一个 `<video key={mediaUrl}>`，切壁纸时 React 直接销毁重建，新视频
   * 解码出第一帧之前 `mediaReady` 一直是 false，于是整层变透明、露出下面的不透明
   * 底色——用户看到的就是「切换时闪一下黑/白」。
   *
   * 现在旧视频留在前台继续播，新视频装进背面槽加载，只有它真的解出第一帧
   * （`loadeddata`）才交换前后台。屏幕上任何时刻都有一张已解码的画面，
   * 中间那层底色再也不会露出来。
   */
  const [videoState, setVideoState] = React.useState<{
    front: 'a' | 'b'
    src: Record<'a' | 'b', string>
    pending: 'a' | 'b' | null
  }>({ front: 'a', src: { a: '', b: '' }, pending: null })
  const videoRefs = React.useRef<Record<'a' | 'b', HTMLVideoElement | null>>({ a: null, b: null })

  /** 把新地址装进槽位：前台空就装前台，否则装背面等它就绪。 */
  React.useEffect(() => {
    if (kind !== 'video') return
    const url = resolved.url
    if (!url) return
    setVideoState((prev) => {
      if (prev.src[prev.front] === url) return prev
      if (prev.pending !== null && prev.src[prev.pending] === url) return prev
      if (!prev.src[prev.front]) {
        return { ...prev, src: { ...prev.src, [prev.front]: url } }
      }
      const back = prev.front === 'a' ? 'b' : 'a'
      return { ...prev, src: { ...prev.src, [back]: url }, pending: back }
    })
  }, [kind, resolved.url])

  /** 背面槽解出第一帧：交换前后台。 */
  const handleSlotReady = React.useCallback((slot: 'a' | 'b'): void => {
    setVideoState((prev) => {
      if (prev.front === slot || prev.pending !== slot) return prev
      return { ...prev, front: slot, pending: null }
    })
    setMediaReady(true)
  }, [])

  /** 交换完成、淡入过渡走完之后，再清掉旧槽的 src，省一份解码器。 */
  React.useEffect(() => {
    if (kind !== 'video' || videoState.pending !== null) return
    const back = videoState.front === 'a' ? 'b' : 'a'
    if (!videoState.src[back]) return
    const timer = setTimeout(() => {
      setVideoState((prev) => {
        if (prev.pending !== null || prev.front === back) return prev
        return { ...prev, src: { ...prev.src, [back]: '' } }
      })
    }, 400)
    return () => clearTimeout(timer)
  }, [kind, videoState])

  /** 离开视频模式时清空槽位。 */
  React.useEffect(() => {
    if (kind === 'video') return
    setVideoState((prev) => (
      prev.front === 'a' && prev.pending === null && !prev.src.a && !prev.src.b
        ? prev
        : { front: 'a', src: { a: '', b: '' }, pending: null }
    ))
  }, [kind])

  React.useEffect(() => {
    if (kind !== 'video') return
    // 按前台槽取元素，而不是缓存一份 ref：交换前后台之后缓存会指向旧槽，
    // 暂停/播放就作用在已经隐藏的那个视频上。
    const syncPlayback = (): void => {
      const video = videoRefs.current[videoState.front]
      if (!video) return
      if (scenePause && (document.hidden || !document.hasFocus())) video.pause()
      else void video.play().catch(() => { /* 切换来源或媒体未就绪时忽略，加载后再同步 */ })
    }
    document.addEventListener('visibilitychange', syncPlayback)
    window.addEventListener('blur', syncPlayback)
    window.addEventListener('focus', syncPlayback)
    const video = videoRefs.current[videoState.front]
    video?.addEventListener('loadeddata', syncPlayback)
    syncPlayback()
    return () => {
      document.removeEventListener('visibilitychange', syncPlayback)
      window.removeEventListener('blur', syncPlayback)
      window.removeEventListener('focus', syncPlayback)
      video?.removeEventListener('loadeddata', syncPlayback)
      video?.pause()
    }
  }, [kind, resolved.url, scenePause, videoState.front])

  const mediaUrl = kind === 'image' && effective.needsResolve
    ? (resolved.url ? `url("${resolved.url}")` : '')
    : kind === 'image'
      ? effective.src
      : resolved.url
  const active = kind === 'scene' || kind === 'procedural' ? Boolean(effective.src) : kind !== 'none' && Boolean(mediaUrl)

  /**
   * 图片内容闸门：只有新图**解码完成**才把它换到屏幕上。
   *
   * 直接改 `backgroundImage` 时，浏览器在新图解码出来之前什么都不画，露出下面那层
   * 不透明底色——和视频那条是同一个闪白。这里先离屏加载，成功才提交。
   * 加载结果同时驱动状态栏（已加载 / 加载失败），所以不再另起一个 effect。
   */
  const [committedImage, setCommittedImage] = React.useState('')
  React.useEffect(() => {
    if (kind !== 'image' || !mediaUrl) {
      setCommittedImage('')
      return
    }
    if (committedImage === mediaUrl) return
    let dead = false
    const image = new Image()
    image.onload = () => {
      if (dead) return
      setCommittedImage(mediaUrl)
      setMediaReady(true)
    }
    image.onerror = () => {
      if (dead) return
      // 清空而不是留着上一张：否则用户以为切换成功了
      setCommittedImage('')
      setMediaError('图片加载失败，请重新选择')
    }
    image.src = mediaUrl.replace(/^url\(["']?/, '').replace(/["']?\)$/, '')
    return () => { dead = true; image.onload = null; image.onerror = null }
    // committedImage 只在比较里用，不需要触发重新加载
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, mediaUrl])

  /** 屏幕上真正该显示的图片地址：加载中就沿用上一张，别露底。 */
  const shownImage = committedImage || ''

  React.useEffect(() => {
    setMediaReady(false)
    setMediaError('')
  }, [kind, mediaUrl, effective.src])

  React.useEffect(() => {
    if (kind === 'none') setStatus({ state:'idle', message:'未启用壁纸' })
    else if (resolved.missing || mediaError) setStatus({state:'error',message:mediaError || '壁纸文件不存在，请重新选择'})
    else if (mediaReady) setStatus({state:'ready',message:'壁纸已加载'})
    else setStatus({state:'loading',message:'正在加载壁纸…'})
  }, [kind, resolved.missing, mediaReady, mediaError, setStatus])

  React.useEffect(() => {
    const root = document.documentElement
    if (!active) {
      root.removeAttribute('data-roy-wallpaper')
      root.removeAttribute('data-roy-wallpaper-bold')
      root.style.removeProperty('--roy-wp-panel')
      root.style.removeProperty('--roy-wp-sidebar')
      root.style.removeProperty('--roy-wp-blur')
      return
    }

    const { panel, sidebar, blur } = alphasOf(strength)
    root.setAttribute('data-roy-wallpaper', scope)
    root.setAttribute('data-roy-wallpaper-bold', boldText ? '1' : '0')
    root.style.setProperty('--roy-wp-panel', panel.toFixed(3))
    root.style.setProperty('--roy-wp-sidebar', sidebar.toFixed(3))
    root.style.setProperty('--roy-wp-blur', `${blur}px`)
  }, [active, scope, strength, boldText])

  // 内置壁纸：侧栏换成壁纸配套的底色（跟随深浅色），关掉壁纸即恢复主题原色
  React.useEffect(() => {
    const root = document.documentElement
    const tint = kind === 'procedural' ? getProceduralWallpaper(effective.src)?.sidebar : undefined
    if (!tint) return
    const apply = (): void => { root.style.setProperty('--sidebar-surface', root.classList.contains('dark') ? tint.dark : tint.light) }
    apply()
    root.setAttribute('data-roy-wallpaper-tint', '1')
    const observer = new MutationObserver(apply)
    observer.observe(root, { attributes: true, attributeFilter: ['class'] })
    return () => {
      observer.disconnect()
      root.removeAttribute('data-roy-wallpaper-tint')
      root.style.removeProperty('--sidebar-surface')
    }
  }, [kind, effective.src])

  React.useEffect(() => () => {
    const root = document.documentElement
    root.removeAttribute('data-roy-wallpaper')
    root.removeAttribute('data-roy-wallpaper-bold')
    root.style.removeProperty('--roy-wp-panel')
    root.style.removeProperty('--roy-wp-sidebar')
    root.style.removeProperty('--roy-wp-blur')
  }, [])

  if (!active || typeof document === 'undefined') return null

  const { wash, blur } = alphasOf(strength)
  // 左边界跟着「当前左侧那一栏」走：主界面是侧栏宽度 + 1px 分隔线，设置页由 SettingsPanel 写入 --roy-wp-left（导航宽度）。
  // 以前写死成侧栏宽度，设置页导航更宽，就露出一条白底。
  const offset = scope === 'chat' ? 'var(--roy-wp-left, calc(var(--roy-sidebar-width, 300px) + 1px))' : '0px'
  const host = document.getElementById('root') ?? document.body
  const area: React.CSSProperties = { left: offset }

  return createPortal(
    <div
      aria-hidden
      data-roy-wallpaper-layer={scope}
      className="pointer-events-none fixed inset-0 select-none overflow-hidden"
      style={{ zIndex: 0 }}
    >
      {/* 不透明底：视频 / 场景没就绪、图片加载失败时兜住，绝不透出桌面 */}
      <div className="absolute inset-0" style={{ background: 'hsl(var(--background))' }} />

      {kind === 'image' && fitHeight && (
        // 竖版小图（内置壁纸的低清预览）：不硬撑满横向区域（会放大 5~7 倍、变形发糊），
        // 改成按高度铺满、保持原比例居中，两侧用同一张图的大幅模糊版补满
        <div className="absolute inset-y-0 right-0 overflow-hidden" style={{ ...area }}>
          <div
            className="absolute"
            style={{
              inset: -80,
              backgroundImage: shownImage,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              filter: 'blur(48px) saturate(1.05)',
              opacity: 0.9,
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: shownImage,
              backgroundSize: 'auto 100%',
              backgroundRepeat: 'no-repeat',
              backgroundPosition: objectPosition,
              WebkitMaskImage: 'linear-gradient(90deg, transparent 0, #000 18%, #000 82%, transparent 100%)',
              maskImage: 'linear-gradient(90deg, transparent 0, #000 18%, #000 82%, transparent 100%)',
            }}
          />
        </div>
      )}

      {kind === 'image' && !fitHeight && (
        <div
          className="absolute inset-y-0 right-0"
          style={{
            ...area,
            backgroundImage: shownImage,
            backgroundSize: 'cover',
            backgroundPosition: objectPosition,
            transform: [
              imageScale !== 1 ? `scale(${imageScale})` : '',
              blur > 0 ? 'scale(1.04)' : '',
            ].filter(Boolean).join(' ') || undefined,
          }}
        />
      )}

      {kind === 'video' && (['a', 'b'] as const).map((slot) => {
        const url = videoState.src[slot]
        if (!url) return null
        const isFront = videoState.front === slot
        return (
          <video
            key={slot}
            ref={(el) => { videoRefs.current[slot] = el }}
            className="absolute inset-y-0 right-0 h-full object-cover"
            style={{
              ...area,
              width: `calc(100% - ${offset})`,
              // 前台立刻可见；背面先挂上去解码，交换后靠这条 transition 淡入，
              // 两帧画面重叠过渡，中间没有透明的一瞬。
              opacity: isFront ? 1 : 0,
              transition: 'opacity 300ms ease-out',
            }}
            src={url}
            loop
            muted
            playsInline
            preload="auto"
            onLoadedData={() => handleSlotReady(slot)}
            onCanPlay={() => handleSlotReady(slot)}
            onError={() => {
              // 背面槽失败：放弃它，继续用前台那张，不打断当前壁纸。
              if (!isFront) {
                setVideoState((prev) => (prev.pending === slot ? { ...prev, pending: null, src: { ...prev.src, [slot]: '' } } : prev))
                return
              }
              setMediaReady(false)
              setMediaError('视频无法播放，可能格式不支持或文件损坏')
            }}
          />
        )
      })}

      {kind === 'scene' && (
        <div className="absolute inset-y-0 right-0" style={{ ...area }}>
          <SceneWallpaper id={effective.src} fps={sceneFps} pauseHidden={scenePause} onReady={setMediaReady} onError={setMediaError} />
        </div>
      )}

      {kind === 'procedural' && (
        <div className="absolute inset-y-0 right-0" style={{ ...area }}>
          <ProceduralWallpaper id={effective.src} fps={sceneFps} pauseHidden={scenePause} onReady={setMediaReady} onError={setMediaError} />
        </div>
      )}

      {/* 主题色薄蒙版：只轻微压暗壁纸本身，面板透明度由 --roy-wp-panel 控制 */}
      <div
        className="absolute inset-y-0 right-0"
        style={{ ...area, background: `hsl(var(--background) / ${wash.toFixed(3)})` }}
      />
    </div>,
    host,
  )
}
