/**
 * Windows 灵动岛
 *
 * 与「托盘悬停面板」不同：这个窗口常驻屏幕顶部居中，不依赖鼠标悬停。
 * - 没有活跃会话时整窗隐藏，不占视觉
 * - 有会话在跑 / 等待交互 / 刚完成时从顶部滑出，显示一条胶囊
 *
 * 只负责窗口与投影；状态机仍然在 agent-island-service 里，避免两套真相。
 */

import { app, BrowserWindow, screen } from 'electron'
import { join } from 'node:path'
import type { NativeAgentIslandSnapshot } from '@roy/shared'
import { WINDOWS_AGENT_ISLAND_IPC_CHANNELS } from '../types'
import { getSettings } from './lib/settings-service'

/** 胶囊宽度：与渲染层的 CSS 宽度保持一致，改一处要同步改另一处。 */
const ISLAND_WIDTH = 440
/** 折叠态高度。 */
const ISLAND_HEIGHT = 68

export class AgentIslandWindow {
  private win: BrowserWindow | null = null
  private latestSnapshot: NativeAgentIslandSnapshot | null = null
  private hideTimer: ReturnType<typeof setTimeout> | null = null

  private isEnabled(): boolean {
    return getSettings().agentIsland?.enabled !== false
  }

  ensureCreated(): void {
    if (this.win && !this.win.isDestroyed()) return

    this.win = new BrowserWindow({
      width: ISLAND_WIDTH,
      height: ISLAND_HEIGHT,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      skipTaskbar: true,
      alwaysOnTop: true,
      // 不抢焦点：否则每次更新都会把用户的输入焦点带走
      focusable: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      show: false,
      hasShadow: false,
      webPreferences: {
        preload: join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    })

    // 悬浮在各窗口之上，但不挡全屏应用
    this.win.setAlwaysOnTop(true, 'floating')
    this.win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false })

    this.win.on('closed', () => {
      this.win = null
    })

    if (app.isPackaged) {
      this.win.loadFile(join(__dirname, 'renderer', 'index.html'), {
        query: { window: 'agent-island' },
      })
    } else {
      this.win.loadURL('http://127.0.0.1:5173?window=agent-island')
    }
  }

  /** 把窗口摆到当前显示器顶部居中，留一点边距。 */
  private positionTopCenter(): void {
    if (!this.win || this.win.isDestroyed()) return
    const cursor = screen.getCursorScreenPoint()
    const display = screen.getDisplayNearestPoint(cursor)
    const { x, y, width } = display.workArea
    this.win.setBounds({
      x: Math.round(x + (width - ISLAND_WIDTH) / 2),
      y: y + 6,
      width: ISLAND_WIDTH,
      height: ISLAND_HEIGHT,
    })
  }

  private clearHideTimer(): void {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer)
      this.hideTimer = null
    }
  }

  private show(): void {
    if (!this.win || this.win.isDestroyed()) return
    this.clearHideTimer()
    this.positionTopCenter()
    if (!this.win.isVisible()) this.win.showInactive()
  }

  private hide(): void {
    if (!this.win || this.win.isDestroyed()) return
    if (this.win.isVisible()) this.win.hide()
  }

  /**
   * 收到新快照时决定显示还是收起。
   *
   * 规则：
   * - 关闭了灵动岛 / 没有任何会话 → 隐藏
   * - 有会话在跑或等待交互 → 立即显示
   * - 全部完成或出错 → 停留几秒再收起，让用户看到结果
   */
  onSnapshot(snapshot: NativeAgentIslandSnapshot): void {
    this.latestSnapshot = snapshot

    if (!this.isEnabled() || snapshot.state.sessions.length === 0) {
      this.clearHideTimer()
      this.hide()
      return
    }

    this.ensureCreated()
    const needsAttention = snapshot.state.sessions.some(
      (session) => session.phase === 'running' || session.phase === 'needs-interaction',
    )
    const hasFailure = snapshot.state.sessions.some((session) => session.phase === 'error')

    if (needsAttention || hasFailure) {
      this.show()
    } else {
      // 全部完成：先显示，过一会儿自动收起
      this.show()
      this.clearHideTimer()
      this.hideTimer = setTimeout(() => {
        this.hideTimer = null
        this.hide()
      }, 4000)
    }

    if (this.win && !this.win.isDestroyed()) {
      this.win.webContents.send(WINDOWS_AGENT_ISLAND_IPC_CHANNELS.PUSH_SNAPSHOT, snapshot)
    }
  }

  /** 供设置页即时预览或手动关闭。 */
  dispose(): void {
    this.clearHideTimer()
    if (this.win && !this.win.isDestroyed()) {
      this.win.destroy()
    }
    this.win = null
    this.latestSnapshot = null
  }
}

let islandWindow: AgentIslandWindow | null = null

export function getAgentIslandWindow(): AgentIslandWindow {
  if (!islandWindow) islandWindow = new AgentIslandWindow()
  return islandWindow
}

export function destroyAgentIslandWindow(): void {
  islandWindow?.dispose()
  islandWindow = null
}
