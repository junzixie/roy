import * as React from 'react'
import { detectIsWindows } from '@/lib/platform'
import {
  getWindowTitlebarDragInsetStyle,
  WINDOW_TITLEBAR_CONTROL_WIDTH_PX,
  WINDOW_TITLEBAR_CONTROLS_WIDTH_PX,
  WINDOW_TITLEBAR_HEIGHT_PX,
} from '@/lib/window-titlebar-layout'

/**
 * Windows 圆角窗口（照 Arthur）：
 * 主窗口是透明无边框的，圆角和细边框由样式画（html.roy-rounded），
 * 最大化时去掉圆角（html.roy-maximized）；没有系统边框可拖，四边四角放拖拽缩放把手。
 */
const RESIZE_EDGES: Array<[string, string]> = [
  ['n', 'left-3 right-3 top-0 h-[5px] cursor-ns-resize'],
  ['s', 'bottom-0 left-3 right-3 h-[5px] cursor-ns-resize'],
  ['w', 'bottom-3 left-0 top-3 w-[5px] cursor-ew-resize'],
  ['e', 'bottom-3 right-0 top-3 w-[5px] cursor-ew-resize'],
  ['nw', 'left-0 top-0 h-3 w-3 cursor-nwse-resize'],
  ['ne', 'right-0 top-0 h-3 w-3 cursor-nesw-resize'],
  ['sw', 'bottom-0 left-0 h-3 w-3 cursor-nesw-resize'],
  ['se', 'bottom-0 right-0 h-3 w-3 cursor-nwse-resize'],
]

function ResizeEdges(): React.ReactElement {
  return (
    <>
      {RESIZE_EDGES.map(([edge, cls]) => (
        <div
          key={edge}
          aria-hidden="true"
          className={`titlebar-no-drag fixed z-[200] ${cls}`}
          onPointerDown={(event) => {
            if (event.button !== 0) return
            event.preventDefault()
            ;(event.target as HTMLElement).setPointerCapture(event.pointerId)
            window.electronAPI.windowResizeStart(edge, event.screenX, event.screenY)
          }}
          onPointerMove={(event) => {
            if (event.buttons & 1) window.electronAPI.windowResizeMove(event.screenX, event.screenY)
          }}
          onPointerUp={() => window.electronAPI.windowResizeEnd()}
          onLostPointerCapture={() => window.electronAPI.windowResizeEnd()}
        />
      ))}
    </>
  )
}

export function WindowControls(): React.ReactElement | null {
  const isWindows = React.useMemo(() => detectIsWindows(), [])
  const [isMaximized, setIsMaximized] = React.useState(false)

  React.useEffect(() => {
    if (!isWindows) return
    const root = document.documentElement
    root.classList.add('roy-rounded')
    return () => root.classList.remove('roy-rounded', 'roy-maximized')
  }, [isWindows])

  React.useEffect(() => {
    if (!isWindows) return
    document.documentElement.classList.toggle('roy-maximized', isMaximized)
  }, [isWindows, isMaximized])

  React.useEffect(() => {
    if (!isWindows) return
    window.electronAPI.windowIsMaximized().then(setIsMaximized)
    let timer: ReturnType<typeof setTimeout> | null = null
    const check = (): void => {
      window.electronAPI.windowIsMaximized().then((next) => {
        setIsMaximized((prev) => (prev === next ? prev : next))
      })
    }
    const unsub = window.electronAPI.onWindowResize(() => {
      check()
      // 最大化兜底是 120ms 后 setBounds 铺满的，再补查一次
      if (timer) clearTimeout(timer)
      timer = setTimeout(check, 200)
    })
    return () => {
      if (timer) clearTimeout(timer)
      unsub()
    }
  }, [isWindows])

  if (!isWindows) return null

  return (
    <>
      {!isMaximized && <ResizeEdges />}
      <div
        className="window-titlebar fixed inset-x-0 top-0 z-[100] flex select-none"
        style={{
          height: WINDOW_TITLEBAR_HEIGHT_PX,
          '--window-titlebar-controls-width': `${WINDOW_TITLEBAR_CONTROLS_WIDTH_PX}px`,
        } as React.CSSProperties}
      >
        <div
          aria-hidden="true"
          className="titlebar-drag-region pointer-events-none absolute inset-y-0 left-0"
          style={getWindowTitlebarDragInsetStyle(isWindows)}
        />
        <div
          className="window-controls relative ml-auto flex"
          style={{ width: WINDOW_TITLEBAR_CONTROLS_WIDTH_PX }}
        >
          <button
            type="button"
            className="window-control-btn"
            style={{ width: WINDOW_TITLEBAR_CONTROL_WIDTH_PX }}
            aria-label="最小化"
            title="最小化"
            onClick={() => window.electronAPI.windowMinimize()}
          >
            <svg width="12" height="12" viewBox="0 0 12 12">
              <rect x="1" y="5.5" width="10" height="1" fill="currentColor" />
            </svg>
          </button>

          <button
            type="button"
            className="window-control-btn"
            style={{ width: WINDOW_TITLEBAR_CONTROL_WIDTH_PX }}
            aria-label={isMaximized ? '还原' : '最大化'}
            title={isMaximized ? '还原' : '最大化'}
            onClick={() => window.electronAPI.windowMaximize()}
          >
            {isMaximized ? (
              <svg width="12" height="12" viewBox="0 0 12 12">
                <rect x="3" y="0.5" width="8" height="8" rx="0.5" fill="none" stroke="currentColor" strokeWidth="1" />
                <rect x="1" y="3.5" width="8" height="8" rx="0.5" fill="currentColor" stroke="currentColor" strokeWidth="1" />
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 12 12">
                <rect x="1.5" y="1.5" width="9" height="9" rx="1" fill="none" stroke="currentColor" strokeWidth="1" />
              </svg>
            )}
          </button>

          <button
            type="button"
            className="window-control-btn window-control-close"
            style={{ width: WINDOW_TITLEBAR_CONTROL_WIDTH_PX }}
            aria-label="关闭"
            title="关闭"
            onClick={() => window.electronAPI.windowClose()}
          >
            <svg width="12" height="12" viewBox="0 0 12 12">
              <path d="M1.5 1.5l9 9M10.5 1.5l-9 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>
    </>
  )
}
