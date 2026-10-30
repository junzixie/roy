/**
 * 启动页专用 preload。
 *
 * 启动页窗口（resources/startup-splash/index.html）跑在 `sandbox: true` +
 * `contextIsolation: true` 下，拿不到 `ipcRenderer`。它唯一需要的通信是
 * 「主进程推进到哪一步了」——所以这里只暴露一个订阅函数，不开放任何
 * invoke/send 通道：启动页没有可以主动发起的能力面。
 *
 * 为什么单独一个 preload 而不是复用 dist/preload.cjs：
 * 那个 preload 挂了 1000+ 个 API 到 electronAPI 上，是主窗口的完整权限面。
 * 启动页只需要一个只读订阅，给它完整 API 是把攻击面白送出去。
 */

import { contextBridge, ipcRenderer } from 'electron'

/** 主进程推进启动进度时推送的载荷。 */
export interface SplashProgress {
  /** 当前步骤的中文文案，例如「正在准备技能」。 */
  label: string
  /** 0–100 的整体进度。 */
  percent: number
}

contextBridge.exposeInMainWorld('roySplash', {
  /**
   * 订阅启动进度。回调立即可能被调用（主进程会补发当前状态），
   * 所以不需要页面自己去问「现在到哪了」。
   *
   * @param callback - 每次进度推进时调用。
   * @returns 取消订阅的函数。
   */
  onProgress(callback: (progress: SplashProgress) => void): () => void {
    if (typeof callback !== 'function') return () => { /* 非法入参：给一个空取消函数 */ }
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown): void => {
      if (payload === null || typeof payload !== 'object') return
      const { label, percent } = payload as Partial<SplashProgress>
      if (typeof label !== 'string' || typeof percent !== 'number') return
      if (!Number.isFinite(percent)) return
      callback({ label, percent: Math.min(100, Math.max(0, percent)) })
    }
    ipcRenderer.on('splash:progress', listener)
    return () => { ipcRenderer.removeListener('splash:progress', listener) }
  },

  /**
   * 请求主进程立即收起启动页（用户点击跳过）。
   *
   * 用 `send` 而不是 `invoke`：这是单向通知，页面不需要等回执，而且启动页
   * 随后就会被销毁，等一个可能永远不来的 resolve 没有意义。
   */
  skip(): void {
    ipcRenderer.send('splash:skip')
  },
})
