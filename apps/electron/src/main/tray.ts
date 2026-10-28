import { Tray, Menu, app, nativeImage, BrowserWindow } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { spawn } from 'child_process'
import { listAgentSessions } from './lib/agent-session-manager'
import { listAgentWorkspaces } from './lib/agent-workspace-manager'
import { isAgentSessionActive } from './lib/agent-service'
import { createTrayMenuModel, type TrayRecentSessionItem } from './lib/tray-menu-model'

let tray: Tray | null = null
/** 清理残影期间会给托盘区发模拟的鼠标移动，这段时间忽略悬停，免得面板乱弹 */
let suppressHoverUntil = 0

/**
 * Windows：清掉以前的 Roy 被强制结束 / 崩溃后留下的「残影」托盘图标。
 *
 * 进程没来得及删除图标就没了，Windows 要等鼠标滑过才发现，于是右下角会堆好几个 Roy。
 * 这里给托盘区（含展开的溢出区）发一遍 WM_MOUSEMOVE，效果等同于鼠标滑过一遍。
 * 只发消息、不移动真实鼠标；后台隐藏运行，失败也不影响启动。
 */
function cleanupWindowsTrayGhosts(): void {
  if (process.platform !== 'win32') return
  const script = `
$ErrorActionPreference='SilentlyContinue'
Add-Type -Namespace RoyTray -Name U -MemberDefinition @'
[DllImport("user32.dll")] public static extern IntPtr FindWindow(string c, string w);
[DllImport("user32.dll")] public static extern IntPtr FindWindowEx(IntPtr p, IntPtr a, string c, string w);
[DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h, out RECT r);
[DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
public struct RECT { public int L, T, R, B; }
'@
function Sweep($h) {
  if ($h -eq [IntPtr]::Zero) { return }
  $r = New-Object RoyTray.U+RECT
  [void][RoyTray.U]::GetClientRect($h, [ref]$r)
  for ($x = 0; $x -lt $r.R; $x += 5) { for ($y = 0; $y -lt $r.B; $y += 5) {
    [void][RoyTray.U]::SendMessage($h, 0x200, [IntPtr]::Zero, [IntPtr](($y -shl 16) + $x)) } }
}
$t = [RoyTray.U]::FindWindow('Shell_TrayWnd', [NullString]::Value)
$n = [RoyTray.U]::FindWindowEx($t, [IntPtr]::Zero, 'TrayNotifyWnd', [NullString]::Value)
$p = [RoyTray.U]::FindWindowEx($n, [IntPtr]::Zero, 'SysPager', [NullString]::Value)
Sweep ([RoyTray.U]::FindWindowEx($p, [IntPtr]::Zero, 'ToolbarWindow32', [NullString]::Value))
$o = [RoyTray.U]::FindWindow('NotifyIconOverflowWindow', [NullString]::Value)
Sweep ([RoyTray.U]::FindWindowEx($o, [IntPtr]::Zero, 'ToolbarWindow32', [NullString]::Value))
`
  try {
    suppressHoverUntil = Date.now() + 8000
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], {
      windowsHide: true,
      stdio: 'ignore',
    })
    const done = (): void => { suppressHoverUntil = Date.now() + 300 }
    child.on('exit', done)
    child.on('error', done)
    child.unref()
  } catch (error) {
    suppressHoverUntil = 0
    console.warn('[托盘] 清理残影图标失败（不影响使用）:', error)
  }
}

// 兜底：无论从哪条路退出（app.exit、异常），进程结束前都把图标撤掉，不留残影
process.once('exit', () => {
  try {
    if (tray && !tray.isDestroyed()) tray.destroy()
  } catch {
    /* 退出路径上不再抛错 */
  }
  tray = null
})

export interface TrayActions {
  showMainWindow: () => void
  openAgentSession: (sessionId: string, title: string) => void
  createChatSession: () => void
  createAgentSession: () => void
  onTrayMouseEnter?: (bounds: Electron.Rectangle) => void
  onTrayMouseMove?: (bounds: Electron.Rectangle) => void
  onTrayMouseLeave?: () => void
}

let flashTimer: ReturnType<typeof setInterval> | null = null

function clearTrayFlashTimer(): void {
  if (flashTimer) {
    clearInterval(flashTimer)
    flashTimer = null
  }
}

/**
 * 获取托盘图标路径
 * 所有平台统一使用 Template 图标（PNG）
 */
function getTrayIconPath(): string {
  // dev: __dirname/resources（build:resources 拷贝产物）
  // prod: process.resourcesPath（electron-builder extraResources 产物）
  const resourcesDir = app.isPackaged
    ? join(process.resourcesPath, 'roy-logos')
    : join(__dirname, 'resources/roy-logos')
  const candidates = process.platform === 'win32'
    ? [join(resourcesDir, 'tray-color.png'), join(process.resourcesPath, 'icon.ico'), join(process.resourcesPath, 'icon.png'), join(__dirname, 'resources/icon.png')]
    : [join(resourcesDir, 'iconTemplate.png')]
  return candidates.find(path => existsSync(path) && !nativeImage.createFromPath(path).isEmpty()) ?? candidates[0]!
}

/** 显示主窗口 */
function showMainWindow(): void {
  const windows = BrowserWindow.getAllWindows()
  if (windows.length === 0) return
  const mainWindow = windows[0]!
  if (mainWindow.isMinimized()) {
    mainWindow.restore()
  }
  mainWindow.show()
  mainWindow.focus()
}

function getDefaultTrayActions(): TrayActions {
  return {
    showMainWindow,
    openAgentSession: () => showMainWindow(),
    createChatSession: () => showMainWindow(),
    createAgentSession: () => showMainWindow(),
  }
}

function createRecentSessionMenuItem(
  item: TrayRecentSessionItem,
  actions: TrayActions,
): Electron.MenuItemConstructorOptions {
  return {
    label: item.title,
    sublabel: item.subtitle,
    click: () => actions.openAgentSession(item.id, item.title),
  }
}

function buildTrayMenu(actions: TrayActions): Menu {
  const sessions = listAgentSessions()
  const runningSessionIds = new Set(
    sessions
      .filter((session) => isAgentSessionActive(session.id))
      .map((session) => session.id)
  )
  const model = createTrayMenuModel(sessions, listAgentWorkspaces(), runningSessionIds)
  const runningItems = model.runningSessions.map((item) => createRecentSessionMenuItem(item, actions))
  const recentItems = model.recentSessions.map((item) => createRecentSessionMenuItem(item, actions))
  const moreItems = model.moreSessions.map((item) => createRecentSessionMenuItem(item, actions))

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(runningItems.length > 0
      ? [
          { label: '运行中', enabled: false },
          ...runningItems,
          { type: 'separator' as const },
        ]
      : []),
    { label: '最近', enabled: false },
    ...(recentItems.length > 0
      ? recentItems
      : [{ label: '暂无最近会话', enabled: false }]),
    ...(moreItems.length > 0
      ? [{
          label: '更多',
          submenu: moreItems,
        }]
      : []),
    { type: 'separator' },
    {
      label: '新建对话',
      click: () => actions.createChatSession(),
    },
    {
      label: '新建 Agent 会话',
      click: () => actions.createAgentSession(),
    },
    { type: 'separator' },
    {
      label: '打开 Roy',
      click: () => actions.showMainWindow(),
    },
    { type: 'separator' },
    {
      label: '退出 Roy',
      click: () => {
        app.quit()
      },
    },
  ]

  return Menu.buildFromTemplate(template)
}

function updateTrayMenu(actions: TrayActions): Menu | null {
  if (!tray) return null
  const contextMenu = buildTrayMenu(actions)
  tray.setContextMenu(contextMenu)
  return contextMenu
}

/**
 * 创建系统托盘图标和菜单
 */
export function createTray(actionsInput?: Partial<TrayActions>): Tray | null {
  const iconPath = getTrayIconPath()
  const actions = { ...getDefaultTrayActions(), ...actionsInput }
  const hasIcon = existsSync(iconPath)

  if (!hasIcon) {
    console.warn('Tray icon not found at:', iconPath)
    return null
  }

  try {
    const image = nativeImage.createFromPath(iconPath)
    if (image.isEmpty()) throw new Error('托盘图标无法解码')

    // 已经有一个就先撤掉，保证同一进程只有一个 Roy 图标
    if (tray && !tray.isDestroyed()) tray.destroy()
    tray = null
    cleanupWindowsTrayGhosts()

    if (process.platform === 'darwin') {
      image.setTemplateImage(true)
    }

    tray = new Tray(image)

    tray.setToolTip('Roy')

    updateTrayMenu(actions)

    tray.on('click', () => {
      if (process.platform === 'win32') {
        actions.showMainWindow()
        return
      }
      const contextMenu = updateTrayMenu(actions)
      if (contextMenu) {
        tray?.popUpContextMenu(contextMenu)
      }
    })

    tray.on('right-click', () => {
      updateTrayMenu(actions)
    })

    if (process.platform === 'win32') {
      tray.on('mouse-enter', () => {
        if (!tray || Date.now() < suppressHoverUntil) return
        actions.onTrayMouseEnter?.(tray.getBounds())
      })
      tray.on('mouse-move', () => {
        if (!tray || Date.now() < suppressHoverUntil) return
        actions.onTrayMouseMove?.(tray.getBounds())
      })
      tray.on('mouse-leave', () => {
        actions.onTrayMouseLeave?.()
      })
    }

    console.log('System tray created')
    return tray
  } catch (error) {
    console.error('Failed to create system tray:', error)
    return null
  }
}

/**
 * 销毁系统托盘
 */
export function destroyTray(): void {
  clearTrayFlashTimer()
  if (tray) {
    try {
      if (!tray.isDestroyed()) tray.destroy()
    } catch (error) {
      console.warn('[托盘] 销毁失败:', error)
    }
    tray = null
  }
}

/**
 * 获取当前托盘实例
 */
export function getTray(): Tray | null {
  return tray
}

/**
 * 切换托盘图标闪烁（仅 Windows）
 */
export function setTrayFlash(on: boolean): void {
  if (process.platform !== 'win32') return
  clearTrayFlashTimer()
  const baseIcon = nativeImage.createFromPath(getTrayIconPath())
  if (!on) {
    if (!baseIcon.isEmpty()) tray?.setImage(baseIcon)
    tray?.setToolTip('Roy')
    return
  }
  if (!tray) return
  let showIdle = true
  flashTimer = setInterval(() => {
    showIdle = !showIdle
    tray?.setImage(baseIcon)
    tray?.setToolTip(showIdle ? 'Roy' : 'Roy · 有新的任务通知')
  }, 500)
}
