/**
 * 圆角窗口辅助（照 Arthur 的做法）
 *
 * Windows 主窗口是透明无边框的：圆角和细边框由界面画，没有系统边框可拖。
 * - 透明窗口不一定认 isMaximized()，最大化按「铺满工作区」判断
 * - 有的系统上透明窗口 maximize() 不生效，兜底直接铺满工作区
 * - 拖边缩放：界面四边放把手，按住后把屏幕坐标发过来，这里按起点算新的位置和大小
 */

import { BrowserWindow, screen, type Rectangle } from 'electron'

const restoreBoundsMap = new WeakMap<BrowserWindow, Rectangle>()

export function isWindowMaximized(win: BrowserWindow | null | undefined): boolean {
  if (!win || win.isDestroyed()) return false
  if (win.isMaximized() || win.isFullScreen()) return true
  const b = win.getBounds()
  const a = screen.getDisplayMatching(b).workArea
  return b.x <= a.x && b.y <= a.y && b.width >= a.width && b.height >= a.height
}

/** 最大化（带兜底）。 */
export function maximizeWindow(win: BrowserWindow): void {
  if (win.isDestroyed() || isWindowMaximized(win)) return
  const before = win.getBounds()
  restoreBoundsMap.set(win, before)
  win.maximize()
  setTimeout(() => {
    if (win.isDestroyed()) return
    if (!isWindowMaximized(win)) win.setBounds(screen.getDisplayMatching(before).workArea)
  }, 120)
}

export function toggleMaximizeWindow(win: BrowserWindow): void {
  if (win.isDestroyed()) return
  if (!isWindowMaximized(win)) {
    maximizeWindow(win)
    return
  }
  if (win.isFullScreen()) {
    win.setFullScreen(false)
    return
  }
  const restore = restoreBoundsMap.get(win)
  if (win.isMaximized()) win.unmaximize()
  // unmaximize 之后有的系统仍铺满（因为是 setBounds 兜底铺的），按记下的大小还原
  setTimeout(() => {
    if (win.isDestroyed() || !isWindowMaximized(win)) return
    if (restore) {
      win.setBounds(restore)
    } else {
      const a = screen.getDisplayMatching(win.getBounds()).workArea
      const width = Math.min(1400, Math.round(a.width * 0.8))
      const height = Math.min(900, Math.round(a.height * 0.85))
      win.setBounds({ width, height, x: a.x + Math.round((a.width - width) / 2), y: a.y + Math.round((a.height - height) / 2) })
    }
  }, 60)
}

interface ResizeState {
  edge: string
  bounds: Rectangle
  sx: number
  sy: number
  minW: number
  minH: number
}

const resizingMap = new WeakMap<BrowserWindow, ResizeState>()

export function windowResizeStart(win: BrowserWindow, edge: string, sx: number, sy: number): void {
  resizingMap.delete(win)
  if (win.isDestroyed() || isWindowMaximized(win) || !/^(n|s|e|w|ne|nw|se|sw)$/.test(edge)) return
  const [minW = 0, minH = 0] = win.getMinimumSize()
  resizingMap.set(win, { edge, bounds: win.getBounds(), sx, sy, minW, minH })
}

export function windowResizeMove(win: BrowserWindow, cx: number, cy: number): void {
  const r = resizingMap.get(win)
  if (!r || win.isDestroyed()) return
  const { edge, bounds: b } = r
  const dx = Math.round(cx - r.sx)
  const dy = Math.round(cy - r.sy)
  let { x, y, width, height } = b
  if (edge.includes('e')) width = Math.max(r.minW, b.width + dx)
  if (edge.includes('s')) height = Math.max(r.minH, b.height + dy)
  if (edge.includes('w')) {
    width = Math.max(r.minW, b.width - dx)
    x = b.x + b.width - width
  }
  if (edge.includes('n')) {
    height = Math.max(r.minH, b.height - dy)
    y = b.y + b.height - height
  }
  win.setBounds({ x, y, width, height })
}

export function windowResizeEnd(win: BrowserWindow): void {
  resizingMap.delete(win)
}
