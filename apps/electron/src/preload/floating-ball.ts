/**
 * 悬浮球专用 preload。
 *
 * 悬浮球窗口原来开着 `nodeIntegration: true` + `contextIsolation: false`，
 * 页面里直接 `require('electron')`。这份 preload 把那 4 个通道收成 4 个函数，
 * 窗口本身恢复 `contextIsolation: true` + `sandbox: true`，页面再也拿不到 Node。
 *
 * 只暴露悬浮球真正需要的：点击、拖动、拖动结束、右键菜单，以及两个下行订阅。
 * 没有 `send(channel, ...)` 这种透传口，所以页面即使被注入也发不出任意 IPC。
 */

import { contextBridge, ipcRenderer } from 'electron'

/** 悬浮球状态，与主进程 `BallState` 保持一致。 */
type BallState = 'idle' | 'running' | 'attention' | 'done' | 'error'

const VALID_STATES = new Set<BallState>(['idle', 'running', 'attention', 'done', 'error'])

contextBridge.exposeInMainWorld('royBall', {
  /** 单击：切换主窗口显示。 */
  click(): void {
    ipcRenderer.send('ball:click')
  },

  /**
   * 拖动增量。
   *
   * @param dx - 相对上一次事件的水平位移（屏幕坐标）。
   * @param dy - 相对上一次事件的垂直位移（屏幕坐标）。
   */
  drag(dx: number, dy: number): void {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return
    ipcRenderer.send('ball:drag', dx, dy)
  },

  /** 拖动结束：让主进程保存位置。 */
  dragEnd(): void {
    ipcRenderer.send('ball:drag-end')
  },

  /** 右键：弹出菜单。 */
  menu(): void {
    ipcRenderer.send('ball:menu')
  },

  /**
   * 订阅状态变化。
   *
   * @param callback - 状态更新时调用。
   * @returns 取消订阅的函数。
   */
  onState(callback: (state: BallState) => void): () => void {
    if (typeof callback !== 'function') return () => { /* 非法入参：空取消函数 */ }
    const listener = (_event: Electron.IpcRendererEvent, state: unknown): void => {
      if (typeof state !== 'string' || !VALID_STATES.has(state as BallState)) return
      callback(state as BallState)
    }
    ipcRenderer.on('ball:state', listener)
    return () => { ipcRenderer.removeListener('ball:state', listener) }
  },

  /**
   * 订阅图标。主进程发的是已经缩放到 80px 的 data URL。
   *
   * @param callback - 图标更新时调用。
   * @returns 取消订阅的函数。
   */
  onIcon(callback: (url: string) => void): () => void {
    if (typeof callback !== 'function') return () => { /* 非法入参：空取消函数 */ }
    const listener = (_event: Electron.IpcRendererEvent, url: unknown): void => {
      if (typeof url !== 'string' || !url.startsWith('data:image/')) return
      callback(url)
    }
    ipcRenderer.on('ball:icon', listener)
    return () => { ipcRenderer.removeListener('ball:icon', listener) }
  },
})
