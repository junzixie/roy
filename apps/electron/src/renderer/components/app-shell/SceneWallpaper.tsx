/**
 * 场景壁纸（照 Arthur 的 SceneBg）
 *
 * 用 WebWallGL（MIT）在 canvas 上实时渲染 Wallpaper Engine 的 scene.pkg，
 * 不需要 Wallpaper Engine 在后台跑。webwallgl 是动态 import 的：
 * 只有真用了场景壁纸才会加载那 1MB 多的渲染核心，不影响首屏。
 *
 * - fps：帧率上限（场景壁纸默认跑满刷新率，笔记本会很热）
 * - pauseHidden：窗口切走 / 最小化时暂停渲染，省电省显卡
 */

import * as React from 'react'

interface SceneInstance {
  destroy?: () => void
  setFps?: (fps: number) => void
  pause?: () => void
  resume?: () => void
}

interface SceneWallpaperProps {
  id: string
  fps: number
  pauseHidden: boolean
  onReady?: (ready: boolean) => void
  onError?: (message: string) => void
}

export function SceneWallpaper({ id, fps, pauseHidden, onReady, onError }: SceneWallpaperProps): React.ReactElement {
  const box = React.useRef<HTMLDivElement | null>(null)
  const inst = React.useRef<SceneInstance | null>(null)
  const [error, setError] = React.useState('')
  const [ready, setReady] = React.useState(false)

  React.useEffect(() => {
    let dead = false
    setReady(false)
    setError('')
    onReady?.(false)

    void (async () => {
      // 1) 主进程读 scene.pkg + project.json（几十 MB，一次就好）
      const data = await window.electronAPI.getSceneWallpaper(id)
      if (dead || !box.current) return
      // 2) 现场渲染
      const lib = await import('webwallgl')
      if (dead || !box.current) return
      const source = lib.bytesSource(new Uint8Array(data.pkg), data.project as never, id)
      const it = (await lib.mount(box.current, { source } as never)) as unknown as SceneInstance
      if (dead) {
        it?.destroy?.()
        return
      }
      inst.current = it
      it.setFps?.(fps)
      setReady(true)
      onReady?.(true)
    })().catch((err: unknown) => {
      if (dead) return
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      onError?.(message)
      console.error('[场景壁纸] 渲染失败:', err)
    })

    return () => {
      dead = true
      try {
        inst.current?.destroy?.()
      } catch {
        // 销毁失败不影响界面
      }
      inst.current = null
    }
    // fps 用下面的 effect 单独同步，避免重挂整张壁纸
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  React.useEffect(() => {
    inst.current?.setFps?.(fps)
  }, [fps, ready])

  // 看不见的时候没必要烧 GPU
  React.useEffect(() => {
    if (!pauseHidden || !ready) return
    const stop = (): void => inst.current?.pause?.()
    const go = (): void => inst.current?.resume?.()
    const onVisibility = (): void => ((document.hidden || !document.hasFocus()) ? stop() : go())
    onVisibility()
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('blur', stop)
    window.addEventListener('focus', go)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('blur', stop)
      window.removeEventListener('focus', go)
      if (!document.hidden && document.hasFocus()) go()
    }
  }, [pauseHidden, ready])

  return (
    <>
      <div className="absolute inset-0 transition-opacity duration-500" style={{ opacity: ready ? 1 : 0 }}>
        <div ref={box} className="h-full w-full" />
      </div>
      {error && (
        <div className="absolute inset-x-0 bottom-4 mx-auto w-fit rounded-lg bg-black/70 px-3 py-1.5 text-[12px] text-white">
          场景壁纸渲染失败：{error.slice(0, 80)}
        </div>
      )}
    </>
  )
}
