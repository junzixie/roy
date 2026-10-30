/**
 * 场景壁纸（照 Arthur 的 SceneBg）
 *
 * 用 WebWallGL（MIT）在 canvas 上实时渲染 Wallpaper Engine 的 scene.pkg，
 * 不需要 Wallpaper Engine 在后台跑。webwallgl 是动态 import 的：
 * 只有真用了场景壁纸才会加载那 1MB 多的渲染核心，不影响首屏。
 *
 * - fps：帧率上限（场景壁纸默认跑满刷新率，笔记本会很热）
 * - pauseHidden：窗口切走 / 最小化时暂停渲染，省电省显卡
 *
 * 双槽渲染：切换场景壁纸时，旧场景继续留在前台播，新场景在背面挂载，等它真的
 * 渲染出画面才交换。以前是单实例，切源时 `ready` 立刻变 false、整层 opacity 归零，
 * 露出下面的不透明底色——用户看到的就是「换壁纸时闪一下」。
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

type Slot = 'a' | 'b'

/** 一个槽位挂的是哪张场景；空串表示这个槽没在用。 */
interface SlotState {
  id: string
  instance: SceneInstance | null
}

const EMPTY_SLOT: SlotState = { id: '', instance: null }

/** 交换后等淡出过渡走完再销毁旧槽，别在画面还看得见的时候拆掉它。 */
const SLOT_FADE_MS = 500

export function SceneWallpaper({ id, fps, pauseHidden, onReady, onError }: SceneWallpaperProps): React.ReactElement {
  const boxA = React.useRef<HTMLDivElement | null>(null)
  const boxB = React.useRef<HTMLDivElement | null>(null)
  const slots = React.useRef<Record<Slot, SlotState>>({ a: EMPTY_SLOT, b: EMPTY_SLOT })
  /** 前台槽：屏幕上可见的那个。 */
  const front = React.useRef<Slot>('a')
  /** 背面正在加载的槽；null 表示没有切换在进行。 */
  const pending = React.useRef<Slot | null>(null)
  /** 卸载后别再 setState / 回调。 */
  const alive = React.useRef(true)
  const [error, setError] = React.useState('')
  /** 槽位状态存在 ref 里，改动后靠这个计数器让 DOM 重新读 opacity。 */
  const [, bump] = React.useState(0)
  const rerender = React.useCallback(() => {
    if (alive.current) bump((n) => n + 1)
  }, [])

  /** 销毁一个槽位的实例并清空记录。 */
  const disposeSlot = React.useCallback((slot: Slot): void => {
    const current = slots.current[slot]
    try {
      current.instance?.destroy?.()
    } catch {
      // 销毁失败不影响界面
    }
    slots.current[slot] = EMPTY_SLOT
  }, [])

  /** 在指定槽位挂载一张场景；出画面后若它是背面槽，就交换前后台。 */
  const mountSlot = React.useCallback((slot: Slot, sceneId: string): void => {
    const box = slot === 'a' ? boxA.current : boxB.current
    if (!box) return
    void (async () => {
      // 1) 主进程读 scene.pkg + project.json（几十 MB，一次就好）
      const data = await window.electronAPI.getSceneWallpaper(sceneId)
      if (!alive.current) return
      // 2) 现场渲染
      const lib = await import('webwallgl')
      if (!alive.current) return
      const source = lib.bytesSource(new Uint8Array(data.pkg), data.project as never, sceneId)
      const it = (await lib.mount(box, { source } as never)) as unknown as SceneInstance
      // 挂载期间槽位可能已经被换掉（连点两下切换），以当前记录为准
      if (!alive.current || slots.current[slot].id !== sceneId) {
        try {
          it?.destroy?.()
        } catch {
          // 同上
        }
        return
      }
      slots.current[slot] = { id: sceneId, instance: it }
      it.setFps?.(fps)
      const wasPending = pending.current === slot
      if (wasPending) {
        const previous = front.current
        front.current = slot
        pending.current = null
        window.setTimeout(() => {
          if (!alive.current) return
          if (front.current !== previous) disposeSlot(previous)
          rerender()
        }, SLOT_FADE_MS + 100)
      }
      rerender()
      // 只有真的成了前台才对外报「已就绪」，背面槽出画面不该改外部状态
      if (wasPending || front.current === slot) onReady?.(true)
    })().catch((err: unknown) => {
      if (!alive.current) return
      const message = err instanceof Error ? err.message : String(err)
      slots.current[slot] = EMPTY_SLOT
      // 背面槽失败：放弃它，继续用前台那张，不打断当前壁纸
      if (pending.current === slot) {
        pending.current = null
        rerender()
        return
      }
      setError(message)
      onError?.(message)
      console.error('[场景壁纸] 渲染失败:', err)
    })
  }, [disposeSlot, fps, onError, onReady, rerender])

  // id 变化：前台空就直接装前台，否则装背面等它就绪再换。
  React.useEffect(() => {
    if (!id) return
    const frontSlot = front.current
    if (slots.current[frontSlot].id === id) return
    if (pending.current !== null && slots.current[pending.current].id === id) return
    setError('')
    if (!slots.current[frontSlot].id) {
      slots.current[frontSlot] = { id, instance: null }
      rerender()
      mountSlot(frontSlot, id)
      return
    }
    const back: Slot = frontSlot === 'a' ? 'b' : 'a'
    pending.current = back
    slots.current[back] = { id, instance: null }
    rerender()
    mountSlot(back, id)
  }, [id, mountSlot, rerender])

  // 卸载：标记死亡并清掉两个槽
  React.useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      disposeSlot('a')
      disposeSlot('b')
    }
  }, [disposeSlot])

  // fps 只同步给前台实例，避免重挂整张壁纸
  React.useEffect(() => {
    slots.current[front.current].instance?.setFps?.(fps)
  }, [fps])

  // 看不见的时候没必要烧 GPU：两个槽都暂停，恢复时只恢复前台
  React.useEffect(() => {
    if (!pauseHidden) return
    const stop = (): void => {
      slots.current.a.instance?.pause?.()
      slots.current.b.instance?.pause?.()
    }
    const go = (): void => {
      slots.current[front.current].instance?.resume?.()
    }
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
  }, [pauseHidden])

  /** 前台可见、背面透明；交换靠这条 transition 交叉淡入，中间没有空白帧。 */
  const slotStyle = (slot: Slot): React.CSSProperties => ({
    opacity: front.current === slot ? 1 : 0,
    transition: `opacity ${SLOT_FADE_MS}ms ease-out`,
  })

  return (
    <>
      <div className="absolute inset-0" style={slotStyle('a')}>
        <div ref={boxA} className="h-full w-full" />
      </div>
      <div className="absolute inset-0" style={slotStyle('b')}>
        <div ref={boxB} className="h-full w-full" />
      </div>
      {error && (
        <div className="absolute inset-x-0 bottom-4 mx-auto w-fit rounded-lg bg-black/70 px-3 py-1.5 text-[12px] text-white">
          场景壁纸渲染失败：{error.slice(0, 80)}
        </div>
      )}
    </>
  )
}
