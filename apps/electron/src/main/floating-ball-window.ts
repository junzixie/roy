/**
 * 桌面悬浮球（参照 Arthur 的悬浮球）
 *
 * 一个 56px 的小圆球，常驻屏幕右侧，可以拖到任何位置（位置会记住）。
 * - 单击：呼出 / 收起 Roy 主窗口
 * - 右键：菜单（新建任务、快捷任务、隐藏悬浮球）
 * - 有任务在跑时转圈，需要你确认时变黄，跑完闪一下绿色
 * 默认关闭，在「设置 → 通用 → 桌面悬浮球」里打开。纯 HTML 小页面，不加载整个界面，几乎不占内存。
 */

import { BrowserWindow, Menu, ipcMain, nativeImage, screen, app } from 'electron'
import { join } from 'node:path'
import { getSettings, updateSettings } from './lib/settings-service'

/**
 * 静态资源目录：开发期在 `dist/resources`，打包后在 `process.resourcesPath`。
 *
 * 与 `main/index.ts:477` 的 `getStartupSplashPath` 同一套解析规则——这里单独写一份
 * 而不是导出那个函数，是因为那个函数是启动页专用的，改动它会影响启动路径。
 */
function getResourcesDir(): string {
  return app.isPackaged ? process.resourcesPath : join(__dirname, 'resources')
}

const SIZE = 64

export type BallState = 'idle' | 'running' | 'attention' | 'done' | 'error'

export interface FloatingBallActions {
  toggleMainWindow: () => void
  newTask: () => void
  quickTask: () => void
}

/*
 * 页面本体已移到 resources/floating-ball/index.html。
 *
 * 以前这里是一整个模板字符串，用 `data:text/html` 加载——既拿不到内容安全策略，
 * 又逼着窗口关掉全部隔离（页面里要 require('electron')）。改成独立文件后，
 * 页面只能通过 preload 暴露的 window.royBall 说话。
 */

class FloatingBall {
  private win: BrowserWindow | null = null
  private actions: FloatingBallActions | null = null
  private state: BallState = 'idle'
  private doneTimer: ReturnType<typeof setTimeout> | null = null
  private ipcReady = false

  init(actions: FloatingBallActions): void {
    this.actions = actions
    if (!this.ipcReady) {
      this.ipcReady = true
      ipcMain.on('ball:click', (e) => { if (this.isMine(e.sender)) this.actions?.toggleMainWindow() })
      ipcMain.on('ball:drag', (e, dx: number, dy: number) => {
        if (!this.isMine(e.sender) || !this.win) return
        const [x = 0, y = 0] = this.win.getPosition()
        this.win.setPosition(Math.round(x + dx), Math.round(y + dy))
      })
      ipcMain.on('ball:drag-end', (e) => { if (this.isMine(e.sender)) this.savePosition() })
      ipcMain.on('ball:menu', (e) => { if (this.isMine(e.sender)) this.popupMenu() })
    }
    if (getSettings().floatingBallEnabled === true) this.show()
  }

  private isMine(sender: Electron.WebContents): boolean {
    return !!this.win && !this.win.isDestroyed() && sender.id === this.win.webContents.id
  }

  private defaultPosition(): { x: number; y: number } {
    const { x, y, width, height } = screen.getPrimaryDisplay().workArea
    return { x: x + width - SIZE - 16, y: y + Math.round(height * 0.62) }
  }

  /** 记住的位置不在任何屏幕里了（拔了副屏）就回到默认位置 */
  private position(): { x: number; y: number } {
    const saved = getSettings().floatingBallPosition
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
      const inside = screen.getAllDisplays().some((d) => {
        const a = d.workArea
        return saved.x >= a.x - 10 && saved.y >= a.y - 10 && saved.x + SIZE <= a.x + a.width + 10 && saved.y + SIZE <= a.y + a.height + 10
      })
      if (inside) return saved
    }
    return this.defaultPosition()
  }

  private savePosition(): void {
    if (!this.win) return
    const [x = 0, y = 0] = this.win.getPosition()
    try { updateSettings({ floatingBallPosition: { x, y } }) } catch { /* ignore */ }
  }

  show(): void {
    if (this.win && !this.win.isDestroyed()) { this.win.showInactive(); return }
    const { x, y } = this.position()
    this.win = new BrowserWindow({
      width: SIZE,
      height: SIZE,
      x,
      y,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      hasShadow: false,
      focusable: false,
      show: false,
      webPreferences: {
        // 三层隔离全开：页面换成独立文件 + 专用 preload，不再 require('electron')。
        // 以前这里是 nodeIntegration: true / contextIsolation: false / sandbox: false，
        // 配合 data: URL 加载，任何一处插值被污染就是 RCE。
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: true,
        preload: join(__dirname, 'preload-floating-ball.cjs'),
      },
    })
    this.win.setAlwaysOnTop(true, 'floating')
    this.win.on('closed', () => { this.win = null })
    void this.win.loadFile(join(getResourcesDir(), 'floating-ball', 'index.html'))
    this.win.webContents.once('did-finish-load', () => {
      if (!this.win) return
      try {
        // 图标转成 data URL 发给小页面，小页面不用读文件
        const img = [join(getResourcesDir(), 'icon.png')]
          .map((p) => nativeImage.createFromPath(p)).find((i) => !i.isEmpty())
        if (img) this.win.webContents.send('ball:icon', img.resize({ width: 80, height: 80 }).toDataURL())
      } catch { /* 没图标就用白圆 */ }
      this.win.webContents.send('ball:state', this.state)
      this.win.showInactive()
    })
  }

  hide(): void {
    if (this.win && !this.win.isDestroyed()) this.win.destroy()
    this.win = null
  }

  async setEnabled(enabled: boolean): Promise<void> {
    updateSettings({ floatingBallEnabled: enabled })
    if (enabled) this.show()
    else this.hide()
  }

  setState(next: BallState): void {
    if (this.doneTimer) { clearTimeout(this.doneTimer); this.doneTimer = null }
    // 跑完闪几下绿色，2 秒后回到空闲
    if ((this.state === 'running' || this.state === 'attention') && next === 'idle') {
      next = 'done'
      this.doneTimer = setTimeout(() => this.setState('idle'), 2000)
    }
    this.state = next
    if (this.win && !this.win.isDestroyed()) this.win.webContents.send('ball:state', next)
  }

  private popupMenu(): void {
    if (!this.win) return
    Menu.buildFromTemplate([
      { label: '打开 Roy', click: () => this.actions?.toggleMainWindow() },
      { label: '新建任务', click: () => this.actions?.newTask() },
      { label: '快捷任务', click: () => this.actions?.quickTask() },
      { type: 'separator' },
      { label: '回到默认位置', click: () => { const p = this.defaultPosition(); this.win?.setPosition(p.x, p.y); this.savePosition() } },
      { label: '隐藏悬浮球', click: () => void this.setEnabled(false) },
    ]).popup({ window: this.win })
  }
}

export const floatingBall = new FloatingBall()
