import { warmBundledWorkbuddy } from './lib/bundled-market-resources'
import { installPinnedCertificates } from './lib/pinned-certificates'
import { installPiRequestProxyFetch } from './lib/adapters/pi-request-proxy'
import { installFileLogger } from './lib/file-logger'
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, protocol, screen, shell } from 'electron'
import { needsLoginOnStartup } from './lib/local-users'
import { runLoginGate } from './login-window'
import { startCliBridge, stopCliBridge } from './lib/cli-bridge'
import { floatingBall } from './floating-ball-window'
import { getTelegramConfig, telegramBridge } from './lib/telegram-bridge'
import { cleanupOldCheckpoints } from './lib/file-checkpoints'
import { cleanupComputerJournal, disposeComputerHelper } from './lib/computer-control'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { existsSync, readFileSync } from 'fs'

/**
 * 加载项目根目录的 .env（仅补齐尚未存在的变量）。
 *
 * 之前仓库里存在 .env（ROY_AGENT_RUNTIME=in-process），但没有任何代码读取它，
 * 所以那条配置一直是死的，进程始终默认走 utility-process 隔离模式。
 */
function loadProjectEnv(): void {
  if (app.isPackaged) return
  const candidates = [
    join(app.getAppPath(), '.env'),
    join(app.getAppPath(), '..', '.env'),
    join(app.getAppPath(), '..', '..', '.env'),
    join(app.getAppPath(), '..', '..', '..', '.env'),
  ]
  for (const file of candidates) {
    try {
      if (!existsSync(file)) continue
      for (const line of readFileSync(file, 'utf-8').split('\n')) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const eq = trimmed.indexOf('=')
        if (eq <= 0) continue
        const key = trimmed.slice(0, eq).trim()
        const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '')
        if (key && process.env[key] === undefined) process.env[key] = value
      }
      return
    } catch {
      /* 读不到就按默认值运行 */
    }
  }
}

loadProjectEnv()

// Dev 与正式版使用独立的 userData 目录，避免共享 Chromium SingletonLock 导致 dev 启动被静默退出
// 必须在任何会读取 userData 路径的模块加载之前执行
if (!app.isPackaged) {
  // 多个 worktree 可显式隔离开发实例，避免其中一个分支抢走另一分支的 Chromium SingletonLock。
  const instance = process.env.ROY_DEV_INSTANCE?.replace(/[^a-zA-Z0-9_-]/g, '')
  if (instance) app.setName(`Roy-${instance}`)
  app.setPath('userData', join(app.getPath('appData'), instance ? `@roy/electron-dev-${instance}` : '@roy/electron-dev'))
}

// 单实例锁：防止重复启动同一个版本（dev/prod 因 userData 已隔离，互不影响）
//
// 失败的常见原因：用户升级新版本时旧版进程仍在后台运行（macOS 关闭窗口 = hide
// 不退出）。原先此处直接 process.exit(0)，没有任何用户可见反馈——如果旧进程
// 卡在启动期，second-instance 也唤不起窗口，用户表现就是"双击应用没反应"。
// 改为：留下 stderr 排查线索后正常退出，让 Electron 触发已存在实例的
// second-instance 事件，由主实例负责显示窗口。
const QUIT_REQUESTED = process.argv.includes('--quit')
if (!app.requestSingleInstanceLock()) {
  console.warn(
    '[启动] 已有 Roy 进程持有单实例锁，本次启动将退出。\n' +
      '  如果窗口未出现，可能旧进程已卡死。请运行 `killall Roy` 后重试。',
  )
  app.quit()
} else if (QUIT_REQUESTED) {
  // `Roy.exe --quit` 且没有在跑的 Roy：什么都不做，直接结束
  app.exit(0)
} else {
  // 主流程：正常启动（单实例锁已获取）
  registerProtocolsAndHandlers()
}

function registerProtocolsAndHandlers(): void {
  // 注册自定义协议方案为"特权"（必须在 app ready 之前）
  // 用于内联预览本地文件（renderer 用 iframe 加载 roy-file:// 资源）
  protocol.registerSchemesAsPrivileged([
    { scheme: 'roy-file', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
  ])

  // Windows: 禁用 LCD 次像素抗锯齿（ClearType），改用灰度 AA。
  // ClearType 是为浅色背景+深色文字设计的，在深色代码块背景下会产生彩色边缘，导致文字模糊。
  if (process.platform === 'win32') {
    app.commandLine.appendSwitch('disable-lcd-text')
  }

  // Windows 等平台通过 second-instance 唤起已有主窗口。
  app.on('second-instance', (_event, argv) => {
    // `Roy.exe --quit`：让正在运行的 Roy 走正常退出流程（撤托盘图标、保存会话），
    // 升级 / 重新打包前用它代替强制结束，避免右下角留下残影图标
    if (argv.includes('--quit')) {
      app.quit()
      return
    }
    showAndFocusMainWindow()
  })
}



import { getSettings, updateSettings } from './lib/settings-service'
import { handleRoyFileRequest } from './lib/local-file-protocol'
import { setupWorkflowIPC } from './lib/workflow/ipc-handler'

// 处理 EPIPE 错误：当 stdout/stderr 管道被关闭时（如 electronmon 重启），忽略写入错误
// 这在开发环境热重载时经常发生，不影响应用功能
process.stdout?.on?.('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EPIPE') return
  throw err
})
process.stderr?.on?.('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EPIPE') return
  throw err
})

// 🔧 修复：注释掉环境变量清理，允许使用 ANTHROPIC_API_KEY
// 原因：这会导致无法使用环境变量配置模型，与上游产品不兼容
// 如果需要严格使用渠道系统，可以取消注释
/*
for (const key of Object.keys(process.env)) {
  if (key.startsWith('ANTHROPIC_')) {
    delete process.env[key]
  }
}
*/

import { createApplicationMenu } from './menu'
import { isWindowMaximized, maximizeWindow } from './lib/window-frame'
import { registerIpcHandlers } from './ipc'
import { createTray, destroyTray, getTray, setTrayFlash } from './tray'
import { initializeRuntime } from './lib/runtime-init'
import { seedDefaultSkills } from './lib/config-paths'
import { upgradeDefaultSkillsInWorkspaces } from './lib/agent-workspace-manager'
import { hasActiveAgentSessions, stopAllAgents } from './lib/agent-service'
import { stopAllTerminals } from './lib/terminal-service'
import { disposePiMcpConnections } from './lib/adapters/pi-mcp-tools'
import { browserController } from './lib/browser-controller'
import { flushAgentSessionsIndexSync, markRunningDelegationsAsInterrupted } from './lib/agent-session-manager'
import { stopAllGenerations } from './lib/chat-service'
import { configureUpdater, initAutoUpdater, cleanupUpdater } from './lib/updater/auto-updater'
import { startWorkspaceWatcher, stopWorkspaceWatcher } from './lib/workspace-watcher'
import { startChatToolsWatcher, stopChatToolsWatcher } from './lib/chat-tools-watcher'
import { getIsQuitting, setQuitting } from './lib/app-lifecycle'
import { getMainWindow as getStoredMainWindow, setMainWindow as setStoredMainWindow } from './lib/main-window-store'
import {
  registerBridge,
  startAllBridges,
  startBridgeSelfHealing,
  stopAllBridges,
  stopBridgeSelfHealing,
} from './lib/bridge-registry'
import { startScheduler, stopScheduler } from './lib/automation-scheduler'
import { startPlanningReminderScheduler, stopPlanningReminderScheduler } from './lib/planning-reminder-scheduler'
import { startPlanningNativeSyncCoordinator, stopPlanningNativeSyncCoordinator } from './lib/planning-native-sync-coordinator'
import { feishuBridgeManager } from './lib/feishu-bridge-manager'
import { getFeishuMultiBotConfig } from './lib/feishu-config'
import { stopFeishuSyncSleepBlocker, syncFeishuSyncSleepBlocker } from './lib/feishu-sleep-blocker'
import {
  ensureWindowBoundsVisible,
  getPersistableMainWindowState,
  hideMacMainWindowAfterClose,
  normalizeWindowBoundsToVisibleArea,
  type WindowBounds,
} from './lib/main-window-lifecycle'
import { dingtalkBridgeManager } from './lib/dingtalk-bridge-manager'
import { getDingTalkMultiBotConfig } from './lib/dingtalk-config'
import { redactSensitiveLogValue } from './lib/bridge-log-redaction'
import { slackBridgeManager } from './lib/slack-bridge-manager'
import { getSlackConfig } from './lib/slack-config'
import { wechatBridge } from './lib/wechat-bridge'
import { getWeChatConfig } from './lib/wechat-config'
import { toggleQuickTaskWindow, destroyQuickTaskWindow } from './lib/quick-task-window'
import { getAgentStatusHoverWindow, destroyAgentStatusHoverWindow } from './agent-status-hover-window'
import { getAgentIslandWindow, destroyAgentIslandWindow } from './agent-island-window'
import { handleNativeAgentIslandEvent, initAgentIslandService, disposeAgentIslandService, publishAgentIslandNow } from './lib/agent-island-service'
import { disposeMacAgentIslandNativeHost, startMacAgentIslandNativeHost, isMacAgentIslandNativeHostReady } from './lib/mac-agent-island-native-host'
import { isAgentIslandServiceSupported, isMacAgentIslandSurfaceSupported } from './lib/macos-version'
import { getWindowsAgentIslandSurface, processNotification, type SurfaceDeps } from './lib/windows-agent-island-surface'
import {
  createVoiceDictationWindow,
  toggleVoiceDictationWindow,
  destroyVoiceDictationWindow,
  shouldSuppressVoiceDictationActivate,
} from './lib/voice-dictation-window'
import { registerGlobalShortcut, unregisterAllGlobalShortcuts } from './lib/global-shortcut-service'
import { setRoyVersion } from '@roy/core'
import { canRecoverRenderer, RENDERER_RECOVERY_WINDOW_MS } from './lib/renderer-process-recovery'
import { TRAY_IPC_CHANNELS, WINDOWS_AGENT_ISLAND_IPC_CHANNELS } from '../types'
import { startAccountRefresh } from './lib/roy-account'

/** macOS 26+ 使用 Swift/AppKit NSPanel；其他平台不创建 Agent Island surface。 */
function startAgentIslandSurface(): void {
  if (!isMacAgentIslandSurfaceSupported()) {
    console.info('[agent-island] 当前平台或 macOS 版本不支持，已禁用')
    return
  }

  const startedNative = startMacAgentIslandNativeHost({
    onReady: () => {
      console.info('[agent-island] macOS 原生 NSPanel helper 已就绪')
      publishAgentIslandNow()
    },
    onEvent: handleNativeAgentIslandEvent,
    onUnavailable: (reason) => {
      console.warn(`[agent-island] macOS 原生 helper 不可用，已禁用：${reason}`)
    },
  })
  if (!startedNative) {
    console.warn('[agent-island] macOS 原生 helper 启动失败，已禁用')
  }
}

// ===== Bridge 注册（新增 Bridge 只需在此添加一个 registerBridge 调用） =====

registerBridge({
  name: '飞书 BridgeManager',
  shouldAutoStart: () => {
    const config = getFeishuMultiBotConfig()
    return config.bots.some((b) => b.enabled && b.appId && b.appSecret)
  },
  needsRecovery: () => {
    const config = getFeishuMultiBotConfig()
    const states = feishuBridgeManager.getStates()
    return config.bots.some((bot) => (
      bot.enabled &&
      !!bot.appId &&
      !!bot.appSecret &&
      states.bots[bot.id]?.status === 'error'
    ))
  },
  start: () => feishuBridgeManager.startAll(),
  stop: () => feishuBridgeManager.stopAll(),
  recover: () => recoverEnabledFeishuBots(),
})

registerBridge({
  name: '钉钉 BridgeManager',
  shouldAutoStart: () => {
    const config = getDingTalkMultiBotConfig()
    return config.bots.some((b) => b.enabled && b.clientId && b.clientSecret)
  },
  needsRecovery: () => {
    const config = getDingTalkMultiBotConfig()
    const states = dingtalkBridgeManager.getStates()
    return config.bots.some((bot) => (
      bot.enabled &&
      !!bot.clientId &&
      !!bot.clientSecret &&
      states.bots[bot.id]?.status === 'error'
    ))
  },
  start: () => dingtalkBridgeManager.startAll(),
  stop: () => dingtalkBridgeManager.stopAll(),
  recover: () => recoverEnabledDingTalkBots(),
})

registerBridge({
  name: 'Slack BridgeManager',
  shouldAutoStart: () => {
    const config = getSlackConfig()
    return config.bots.some((bot) => bot.enabled && bot.botToken && bot.appToken)
  },
  needsRecovery: () => {
    const config = getSlackConfig()
    const states = slackBridgeManager.getStates()
    return config.bots.some((bot) => (
      bot.enabled && !!bot.botToken && !!bot.appToken && states.bots[bot.id]?.status === 'error'
    ))
  },
  start: () => slackBridgeManager.startAll(),
  stop: () => slackBridgeManager.stopAll(),
  recover: () => recoverEnabledSlackBots(),
})

registerBridge({
  name: 'Telegram Bridge',
  shouldAutoStart: () => {
    const config = getTelegramConfig()
    return config.enabled && !!config.tokenEncrypted
  },
  needsRecovery: () => telegramBridge.getStatus().status === 'error',
  start: () => telegramBridge.start(),
  stop: () => telegramBridge.stop(),
})

registerBridge({
  name: '微信 Bridge',
  shouldAutoStart: () => {
    const config = getWeChatConfig()
    return !!(config.enabled && config.credentials)
  },
  needsRecovery: () => wechatBridge.getStatus().status === 'error',
  start: () => wechatBridge.start(),
  stop: () => wechatBridge.stop(),
})

async function recoverEnabledFeishuBots(): Promise<void> {
  const config = getFeishuMultiBotConfig()
  let failedCount = 0
  for (const bot of config.bots) {
    if (!bot.enabled || !bot.appId || !bot.appSecret) continue
    try {
      await feishuBridgeManager.restartBot(bot.id)
    } catch (error) {
      failedCount++
      console.error(`[飞书 BridgeManager] Bot "${bot.name}" 自愈恢复失败:`, error)
    }
  }
  if (failedCount > 0) {
    throw new Error(`${failedCount} 个飞书 Bot 自愈恢复失败`)
  }
}

async function recoverEnabledDingTalkBots(): Promise<void> {
  const config = getDingTalkMultiBotConfig()
  let failedCount = 0
  for (const bot of config.bots) {
    if (!bot.enabled || !bot.clientId || !bot.clientSecret) continue
    try {
      await dingtalkBridgeManager.restartBot(bot.id)
    } catch (error) {
      failedCount++
      console.error(`[钉钉 BridgeManager] Bot "${bot.name}" 自愈恢复失败:`, error)
    }
  }
  if (failedCount > 0) {
    throw new Error(`${failedCount} 个钉钉 Bot 自愈恢复失败`)
  }
}

async function recoverEnabledSlackBots(): Promise<void> {
  const config = getSlackConfig()
  let failedCount = 0
  for (const bot of config.bots) {
    if (!bot.enabled || !bot.botToken || !bot.appToken) continue
    try {
      await slackBridgeManager.restartBot(bot.id)
    } catch (error) {
      failedCount++
      console.error(`[Slack BridgeManager] Bot "${bot.name}" 自愈恢复失败:`, redactSensitiveLogValue(error))
    }
  }
  if (failedCount > 0) {
    throw new Error(`${failedCount} 个 Slack Bot 自愈恢复失败`)
  }
}

let mainWindow: BrowserWindow | null = null
let startupSplashWindow: BrowserWindow | null = null
/** 启动页实际展示的时刻，用于保证最短展示时长 */
let startupSplashShownAt = 0
/** 启动页退场前的淡出时长：盖住主窗口上屏那一瞬，不做停留。 */
const STARTUP_SPLASH_FADE_OUT_MS = 320
/**
 * 启动页最短可见时长。
 *
 * 用户希望开场动画能看完整一点：
 * - 太短（400ms）像闪一下，看不出动画
 * - 太长会在视频中途切换，有割裂感
 * 2000ms 能让视频动画走完开头段落，字标和进度线也有时间读。
 */
const STARTUP_SPLASH_MIN_ON_SCREEN_MS = 2000
/**
 * 启动页硬超时：渲染层到这个点还没发 `app:renderer-ready`，就让出屏幕。
 *
 * 没有这条兜底时，渲染进程一旦卡死或崩溃在「还没发 ready」的阶段，启动页会
 * 永久停在屏幕上，并且盖住下面的错误信息——用户看到的是一段播不完的动画，
 * 而不是「启动失败了」。正常启动远快于此值，所以只在异常路径上触发。
 */
const STARTUP_SPLASH_HARD_TIMEOUT_MS = 30_000

/**
 * 启动步骤代号 → 启动页文案。
 *
 * 键必须与 `safeRun(...)` / `safeAwait(...)` 的第一个参数逐字一致：这两个函数
 * 是所有启动钩子的唯一入口，改一行就能覆盖全部调用点，所以这份表是「用户看到的
 * 启动阶段」的单一真源。不在表里的代号不推进进度（例如纯内部的 watcher 注册），
 * 顺序即真实执行顺序，进度条因此是单调的。
 */
const BOOT_STEP_LABELS: Record<string, string> = {
  initializeRuntime: '正在初始化运行环境',
  seedDefaultSkills: '正在准备技能',
  upgradeDefaultSkillsInWorkspaces: '正在升级技能',
  markRunningDelegationsAsInterrupted: '正在收敛上次的会话',
  cliBridge: '正在启动命令行',
  mobileRemote: '正在启动远程控制',
  startWorkspaceWatcher: '正在监听工作目录',
  startAllBridges: '正在连接消息渠道',
  startScheduler: '正在启动定时任务',
  startPlanningReminderScheduler: '正在准备提醒',
}
/** 进度分母：只数真正会上报的步骤，避免分母含未列出的代号导致永远到不了 100%。 */
const BOOT_STEP_TOTAL = Object.keys(BOOT_STEP_LABELS).length
/** 已经走完的步骤数。启动只发生一次，所以用模块级计数而不是传参。 */
let bootStepDone = 0

/**
 * 把一步启动推进同步给启动页。
 *
 * 启动页可能还没加载完（`webContents` 已建但页面未 ready），此时 `send` 会丢；
 * 这是可接受的——启动页拿到的是「此后每一步」，而第一步之前它本来也没有进度可显示。
 * 页面侧会用 `--dsh-boot-arc` 之外的真实推送驱动进度条，所以丢早期事件只表现为
 * 起点略高一点，不会卡住。
 *
 * @param name - `safeRun` / `safeAwait` 的步骤代号。
 */
function reportBootProgress(name: string): void {
  const label = BOOT_STEP_LABELS[name]
  if (label === undefined) return
  bootStepDone = Math.min(BOOT_STEP_TOTAL, bootStepDone + 1)
  if (!startupSplashWindow || startupSplashWindow.isDestroyed()) return
  startupSplashWindow.webContents.send('splash:progress', {
    label,
    percent: Math.round((bootStepDone / BOOT_STEP_TOTAL) * 100),
  })
}

const DEFAULT_MAIN_WINDOW_WIDTH = 1400
const DEFAULT_MAIN_WINDOW_HEIGHT = 900
const MIN_MAIN_WINDOW_WIDTH = 800
const MIN_MAIN_WINDOW_HEIGHT = 600

function getVisibleMainWindowBounds(bounds: WindowBounds): WindowBounds {
  return normalizeWindowBoundsToVisibleArea(
    bounds,
    screen.getAllDisplays(),
    screen.getPrimaryDisplay(),
    {
      minWidth: MIN_MAIN_WINDOW_WIDTH,
      minHeight: MIN_MAIN_WINDOW_HEIGHT,
      fallbackWidth: DEFAULT_MAIN_WINDOW_WIDTH,
      fallbackHeight: DEFAULT_MAIN_WINDOW_HEIGHT,
    },
  )
}

function getInitialMainWindowBounds(
  savedState: ReturnType<typeof getSettings>['mainWindowState'],
): Partial<WindowBounds> {
  const defaultBounds = (): Partial<WindowBounds> => {
    const area = screen.getPrimaryDisplay().workArea
    const width = Math.min(DEFAULT_MAIN_WINDOW_WIDTH, Math.round(area.width * 0.8))
    const height = Math.min(DEFAULT_MAIN_WINDOW_HEIGHT, Math.round(area.height * 0.85))
    return {
      width,
      height,
      x: area.x + Math.round((area.width - width) / 2),
      y: area.y + Math.round((area.height - height) / 2),
    }
  }
  if (!savedState) return defaultBounds()

  const visible = getVisibleMainWindowBounds(savedState)
  // 旧版本在透明窗口上「铺满工作区」后没被认成最大化，把几乎全屏的尺寸当普通大小存了下来，
  // 下次启动就是一个巨大的窗口、看不到圆角。这种几乎铺满的尺寸按默认大小居中处理。
  if (!savedState.isMaximized && visible.width != null && visible.height != null) {
    const area = screen.getDisplayMatching(visible as WindowBounds).workArea
    if (visible.width >= area.width * 0.9 || visible.height >= area.height * 0.9) return defaultBounds()
  }
  return visible
}

/**
 * 原生启动页不依赖 Renderer bundle 或运行时检测，避免冷启动期间出现空白窗口。
 * dev 由 build:resources 复制到 dist/resources；打包版由 electron-builder extraResources 提供。
 */
function getStartupSplashPath(): string {
  const resourcesDir = app.isPackaged ? process.resourcesPath : join(__dirname, 'resources')
  return join(resourcesDir, 'startup-splash', 'index.html')
}

function dismissStartupSplash(): void {
  if (!startupSplashWindow || startupSplashWindow.isDestroyed()) {
    startupSplashWindow = null
    return
  }

  const splash = startupSplashWindow
  // 主窗口一旦能上屏就立即交给它，不再等动画播完。
  // 只保留“启动页必须真的显示过”的极短兜底，避免一闪。
  const elapsed = Date.now() - startupSplashShownAt
  const remaining = Math.max(0, STARTUP_SPLASH_MIN_ON_SCREEN_MS - elapsed)

  /** 先淡出再销毁：直接 destroy 会露出主窗口上屏前的空白 */
  const fadeOutThenDestroy = (delay: number): void => {
    setTimeout(() => {
      if (!startupSplashWindow || startupSplashWindow.isDestroyed()) return
      const target = startupSplashWindow
      // Windows 不支持 setOpacity 的透明窗口混合，用 CSS 淡出兼容两种情况
      target.webContents
        .executeJavaScript(
          `window.stopRoySplash?.();document.documentElement.style.transition='opacity ${STARTUP_SPLASH_FADE_OUT_MS}ms ease-out';document.documentElement.style.opacity='0';`,
        )
        .catch(() => { /* 页面已卸载时忽略 */ })
      setTimeout(() => {
        if (!target.isDestroyed()) target.destroy()
        if (startupSplashWindow === target) startupSplashWindow = null
      }, STARTUP_SPLASH_FADE_OUT_MS)
    }, delay)
  }

  fadeOutThenDestroy(remaining)
}

function createStartupSplashWindow(): void {
  if (startupSplashWindow && !startupSplashWindow.isDestroyed()) return

  const savedState = getSettings().mainWindowState
  const initialBounds = getInitialMainWindowBounds(savedState)

  startupSplashWindow = new BrowserWindow({
    ...initialBounds,
    show: false,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    // 与新启动页的深色径向背景一致，避免加载瞬间闪一下旧绿底
    backgroundColor: '#050b0e',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // 启动页只订阅启动进度，所以给它一个只暴露一个函数的专用 preload，
      // 而不是主窗口那份挂了上千个 API 的 preload.cjs。
      preload: join(__dirname, 'preload-splash.cjs'),
    },
  })

  const splash = startupSplashWindow
  splash.setMenuBarVisibility(false)
  splash.once('ready-to-show', () => {
    if (splash.isDestroyed()) return
    // 与主窗口使用相同的默认策略，首次启动时也不会出现窗口尺寸跳变。
    if (savedState?.isMaximized ?? false) splash.maximize()
    startupSplashShownAt = Date.now()
    splash.show()
  })
  splash.once('closed', () => {
    if (startupSplashWindow === splash) startupSplashWindow = null
  })
  // 页面加载完成时补发一次当前进度：早期的 reportBootProgress 会落在
  // 「webContents 已建、页面还没监听」的窗口里丢掉，补发让启动页立刻对齐真实状态。
  splash.webContents.once('did-finish-load', () => {
    if (splash.isDestroyed()) return
    const done = Math.max(bootStepDone, 1)
    const lastLabel = BOOT_STEP_LABELS[Object.keys(BOOT_STEP_LABELS)[done - 1] ?? '']
    splash.webContents.send('splash:progress', {
      label: lastLabel ?? '正在启动',
      percent: Math.round((done / BOOT_STEP_TOTAL) * 100),
    })
  })
  // 硬超时兜底：渲染层始终不就绪时让出屏幕，别把诊断信息盖在动画下面。
  const hardTimeout = setTimeout(() => {
    if (!startupSplashWindow || startupSplashWindow.isDestroyed()) return
    console.warn('[启动] 渲染层超时未就绪，强制收起启动页')
    dismissStartupSplash()
  }, STARTUP_SPLASH_HARD_TIMEOUT_MS)
  splash.once('closed', () => { clearTimeout(hardTimeout) })
  // 启动动画由设置决定（startupAnimation）；未设置时启动页自行随机
  const startupAnimation = getSettings().startupAnimation
  splash.loadFile(getStartupSplashPath(), {
    query: startupAnimation ? { anim: startupAnimation } : undefined,
  }).catch((error) => {
    console.warn('[启动] 原生启动页加载失败，将继续启动主窗口:', error)
    dismissStartupSplash()
  })
}

/** 获取主窗口实例（供其他模块使用） */
export function getMainWindow(): BrowserWindow | null {
  return getStoredMainWindow()
}

function installWindowsZoomInFallback(win: BrowserWindow): void {
  if (process.platform !== 'win32') return

  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || !input.control || input.alt || input.meta) return

    // Windows 下主键盘的 Ctrl++ 常会以 Ctrl+= 上报；小键盘加号也需要兜底。
    const key = input.key.toLowerCase()
    if (!['=', '+', 'numadd', 'add'].includes(key)) return

    event.preventDefault()
    const currentZoomLevel = win.webContents.getZoomLevel()
    win.webContents.setZoomLevel(Math.min(currentZoomLevel + 0.5, 9))
  })
}

/**
 * 检查窗口是否在可用显示器范围内
 * 处理外接显示器断开后窗口位于不可见区域的情况
 */
function ensureWindowOnScreen(win: BrowserWindow): void {
  const repositioned = ensureWindowBoundsVisible(
    win,
    screen.getAllDisplays(),
    screen.getPrimaryDisplay(),
    {
      minWidth: MIN_MAIN_WINDOW_WIDTH,
      minHeight: MIN_MAIN_WINDOW_HEIGHT,
      fallbackWidth: DEFAULT_MAIN_WINDOW_WIDTH,
      fallbackHeight: DEFAULT_MAIN_WINDOW_HEIGHT,
    },
  )
  if (repositioned) console.log('[窗口] 窗口已重新定位到主显示器可见区域')
}

/** 显示并聚焦主窗口，确保窗口在可见区域；若窗口已销毁则重新创建 */
function showAndFocusMainWindow(): void {
  if (process.platform === 'darwin') {
    if (app.dock) app.dock.show()
    app.show()
  }

  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow()
    return
  }
  ensureWindowOnScreen(mainWindow)
  if (mainWindow.isMinimized()) {
    mainWindow.restore()
  }
  mainWindow.show()
  mainWindow.focus()
}

/**
 * Get the appropriate app icon path for the current platform
 */
function getIconPath(): string {
  // 打包后图标随 extraResources 放在 process.resourcesPath 根下；
  // 开发模式由 build:resources 拷到 dist/resources。两个位置都要看，
  // 否则打包版会拿不到窗口图标（托盘图标正常但任务栏是空白）。
  const candidates = app.isPackaged
    ? [process.resourcesPath, join(__dirname, 'resources')]
    : [join(__dirname, 'resources'), process.resourcesPath]

  const fileName = process.platform === 'darwin'
    ? 'icon.icns'
    : process.platform === 'win32'
      ? 'icon.ico'
      : 'icon.png'

  for (const dir of candidates) {
    if (!dir) continue
    const candidate = join(dir, fileName)
    if (existsSync(candidate)) return candidate
  }
  return join(candidates[0]!, fileName)
}

function saveMainWindowState(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  // 透明窗口用「铺满工作区」兜底最大化时 isMaximized() 是 false：
  // 这时不覆盖普通大小，只把最大化标记记下来
  if (!mainWindow.isMaximized() && isWindowMaximized(mainWindow)) {
    const previous = getSettings().mainWindowState
    if (previous) updateSettings({ mainWindowState: { ...previous, isMaximized: true } })
    return
  }
  const mainWindowState = getPersistableMainWindowState(mainWindow)
  if (!mainWindowState) return
  updateSettings({
    mainWindowState,
  })
}

function isDevServerNavigation(url: string): boolean {
  try {
    return new URL(url).origin === 'http://127.0.0.1:5173'
  } catch {
    return false
  }
}

function createWindow(): void {
  const iconPath = getIconPath()
  const iconExists = existsSync(iconPath)

  if (!iconExists) {
    console.warn('App icon not found at:', iconPath)
  }

  const isMac = process.platform === 'darwin'
  const isWindows = process.platform === 'win32'

  const titleBarOptions = isMac
    ? {
        titleBarStyle: 'hiddenInset' as const,
        trafficLightPosition: { x: 18, y: 18 },
        vibrancy: 'under-window' as const,
        visualEffectState: 'followWindow' as const,
      }
    : isWindows
      ? {
          // 圆角窗口（照 Arthur）：去掉系统边框、背景透明，圆角和细边框由界面画；
          // 最小化 / 最大化 / 关闭按钮由 WindowControls 画，拖边缩放由界面四边的把手完成
          frame: false,
          transparent: true,
          hasShadow: true,
        }
      : {}

  const savedState = getSettings().mainWindowState
  const initialBounds = getInitialMainWindowBounds(savedState)

  mainWindow = new BrowserWindow({
    ...initialBounds,
    minWidth: MIN_MAIN_WINDOW_WIDTH,
    minHeight: MIN_MAIN_WINDOW_HEIGHT,
    icon: iconExists ? iconPath : undefined,
    show: false,
    // 与启动页一致的深色底：首帧渲染前露出的就是它，而不是系统默认的浅色。
    // Windows 是透明窗口，底色必须全透明，否则圆角外会露出一块方角
    backgroundColor: isWindows ? '#00000000' : '#050b0e',
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      // 实验：恢复 Chromium 的后台调度节流，避免隐藏窗口的 renderer 持续占用主线程。
      // 当前排队消息自动投递仍由 renderer 消费 STREAM_COMPLETE；隐藏窗口下可能延后，
      // 这是本分支需要与卡顿改善一起验证的行为代价。
      backgroundThrottling: true,
    },
    ...titleBarOptions,
  })
  setStoredMainWindow(mainWindow)
  installWindowsZoomInFallback(mainWindow)
  browserController.setOwnerWindow(mainWindow)

  // Load the renderer
  const isDev = !app.isPackaged
  const rendererPath = join(__dirname, 'renderer', 'index.html')
  const rendererEntryUrl = isDev ? 'http://127.0.0.1:5173' : pathToFileURL(rendererPath).toString()
  const loadMainRenderer = (): Promise<void> => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return Promise.reject(new Error('主窗口已销毁'))
    }
    return isDev
      ? mainWindow.loadURL(rendererEntryUrl)
      : mainWindow.loadFile(rendererPath)
  }

  // 主 Renderer 无法加载或崩溃时，不能让启动页无限停留；优先有限次数自动恢复。
  let hasShownRendererFailure = false
  let rendererRecoveryAttempts: number[] = []
  const showRendererFailure = (reason: string): void => {
    if (!mainWindow || mainWindow.isDestroyed()) return

    dismissStartupSplash()
    if (hasShownRendererFailure) {
      mainWindow.show()
      return
    }

    hasShownRendererFailure = true
    const escapeHtml = (value: string): string => value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
    const page = `<!doctype html><html><head><meta charset="utf-8"><title>Roy 无法加载</title><style>body{font:14px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:48px;color:#222;background:#fff}main{max-width:680px;margin:auto}h1{font-size:20px;font-weight:600}pre{white-space:pre-wrap;background:#f3f3f3;padding:16px;border-radius:8px}a{display:inline-block;margin-top:12px;padding:9px 14px;border-radius:6px;background:#222;color:#fff;text-decoration:none}</style></head><body><main><h1>Roy 无法加载主界面</h1><pre>${escapeHtml(reason)}</pre><a href="${escapeHtml(rendererEntryUrl)}">重新加载主界面</a></main></body></html>`
    mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(page)}`).catch((error) => {
      console.error('[启动] 降级错误页加载失败:', error)
      mainWindow?.show()
    })
  }
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame || errorCode === -3) return
    console.error(`[启动] 主 Renderer 加载失败 (${errorCode}): ${errorDescription} (${validatedURL})`)
    showRendererFailure(errorDescription)
  })
  mainWindow.webContents.on('did-finish-load', () => {
    // 主 Renderer 成功恢复后重新开始计数；只有连续失败才应进入错误页。
    if (!hasShownRendererFailure) rendererRecoveryAttempts = []
  })
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    // clean-exit 和应用退出不属于 Renderer 故障；避免退出过程中重新加载主窗口。
    if (getIsQuitting() || details.reason === 'clean-exit') return

    const now = Date.now()
    rendererRecoveryAttempts = rendererRecoveryAttempts.filter(
      (attemptAt) => now - attemptAt < RENDERER_RECOVERY_WINDOW_MS,
    )
    const processId = (() => {
      try {
        return mainWindow?.webContents.getProcessId()
      } catch {
        return undefined
      }
    })()
    const rendererUrl = (() => {
      try {
        return mainWindow?.webContents.getURL()
      } catch {
        return undefined
      }
    })()
    const crashContext = {
      reason: details.reason,
      exitCode: details.exitCode,
      url: rendererUrl,
      processId,
    }
    console.error('[启动] 主 Renderer 进程异常退出:', crashContext)

    if (!hasShownRendererFailure && canRecoverRenderer(rendererRecoveryAttempts, now)) {
      rendererRecoveryAttempts.push(now)
      console.warn(`[启动] 尝试恢复主 Renderer（${rendererRecoveryAttempts.length}/2）`)
      void loadMainRenderer().catch((error) => {
        console.error('[启动] 主 Renderer 自动恢复失败:', error)
        showRendererFailure(`Renderer 进程异常退出：${details.reason}`)
      })
      return
    }

    showRendererFailure(`Renderer 进程异常退出：${details.reason}\n退出码：${details.exitCode}`)
  })

  // 窗口就绪后，按保存的状态决定是否最大化
  mainWindow.once('ready-to-show', () => {
    // 照 Arthur：首次启动用普通大小居中显示（能看到圆角），用户自己最大化过才按最大化恢复
    if (savedState?.isMaximized ?? false) {
      if (mainWindow) maximizeWindow(mainWindow)
    }
    if (process.platform === 'darwin' && app.dock) {
      app.dock.show()
    }
    mainWindow?.show()
  })

  // 启动页的退场由渲染层控制：主界面挂载完成才发这个信号。
  // 这样不管机器快慢，启动页都会把空白期盖住，而不是固定等一段时长。
  ipcMain.handle('app:renderer-ready', () => {
    dismissStartupSplash()
    return true
  })

  // 用户点击启动页跳过：只接受来自启动页窗口的请求，别让主窗口也能把它收掉。
  ipcMain.on('splash:skip', (event) => {
    if (!startupSplashWindow || startupSplashWindow.isDestroyed()) return
    if (event.sender !== startupSplashWindow.webContents) return
    dismissStartupSplash()
  })

  // 持久化窗口大小和位置（防抖 500ms，避免频繁写入）
  let windowStateSaveTimer: ReturnType<typeof setTimeout> | null = null
  const scheduleWindowStateSave = (): void => {
    if (windowStateSaveTimer) clearTimeout(windowStateSaveTimer)
    windowStateSaveTimer = setTimeout(() => {
      windowStateSaveTimer = null
      saveMainWindowState()
    }, 500)
  }
  mainWindow.on('resize', scheduleWindowStateSave)
  mainWindow.on('move', scheduleWindowStateSave)

  // 拦截页面内导航，外部链接用系统浏览器打开，防止 Electron 窗口被覆盖
  mainWindow.webContents.on('will-navigate', (event, url) => {
    // 错误页上的“重新加载主界面”需要放行回到原始入口。
    if (url === rendererEntryUrl) {
      hasShownRendererFailure = false
      rendererRecoveryAttempts = []
      return
    }
    // 允许开发模式下的 Vite HMR 热重载
    if (isDev && isDevServerNavigation(url)) return
    event.preventDefault()
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url)
    }
  })

  // 拦截 window.open / target="_blank" 链接
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  // 调试面板贴在窗口里会让透明窗口失去透明（圆角变方角），所以默认不开；
  // 需要时设 ROY_DEVTOOLS=1，单独弹一个窗口
  if (isDev && process.env.ROY_DEVTOOLS === '1') mainWindow.webContents.openDevTools({ mode: 'detach' })
  void loadMainRenderer().catch((error) => {
    console.error('[启动] 主 Renderer 初始加载失败:', error)
    showRendererFailure(error instanceof Error ? error.message : String(error))
  })

  // macOS: 点击关闭按钮时隐藏窗口+应用，而不是退出
  // 同时隐藏应用（类似 Cmd+H），确保点击 Dock 图标时 macOS 能正确触发 activate 事件
  if (process.platform === 'darwin') {
    mainWindow.on('close', (event) => {
      if (!getIsQuitting()) {
        // 隐藏前先刷新挂起的窗口状态保存
        if (windowStateSaveTimer) {
          clearTimeout(windowStateSaveTimer)
          windowStateSaveTimer = null
        }
        saveMainWindowState()
        event.preventDefault()
        if (mainWindow && !mainWindow.isDestroyed()) {
          hideMacMainWindowAfterClose(mainWindow, app)
        }
      }
    })
  }

  // Windows：最小化始终保留任务栏；关闭行为由用户选择。
  if (process.platform === 'win32') {
    let closePromptPending = false
    mainWindow.on('minimize', () => mainWindow?.setSkipTaskbar(false))
    mainWindow.on('close', (event) => {
      if (getIsQuitting()) return
      event.preventDefault()
      if (closePromptPending) return
      closePromptPending = true
      void (async () => {
        const win = mainWindow
        if (!win || win.isDestroyed()) return
        let behavior = getSettings().closeBehavior ?? 'ask'
        if (behavior !== 'tray' && behavior !== 'quit') {
          const inApp = await askCloseInRenderer(win)
          if (inApp) {
            if (inApp.choice === 'cancel') return
            behavior = inApp.choice
            if (inApp.remember) await updateSettings({ closeBehavior: behavior })
          } else {
          const result = await dialog.showMessageBox(win, {
            type: 'question', title: '关闭 Roy 窗口',
            message: '点击 × 时，你希望 Roy 怎么做？',
            detail: '最小化到托盘：后台任务继续运行。直接退出：正在运行的任务可能中断。点击 — 始终留在任务栏。可在设置 → 通用中修改。',
            buttons: ['最小化到托盘', '直接退出', '取消'], defaultId: 0, cancelId: 2,
            checkboxLabel: '记住我的选择', checkboxChecked: true,
          })
          if (result.response === 2) return
          behavior = result.response === 0 ? 'tray' : 'quit'
          if (result.checkboxChecked) await updateSettings({ closeBehavior: behavior })
          }
        }
        if (behavior === 'quit') { app.quit(); return }
        if (win.isDestroyed()) return
        const currentTray = getTray()
        if (!currentTray || currentTray.isDestroyed()) {
          win.setSkipTaskbar(false)
          await dialog.showMessageBox(win, { type: 'warning', title: '托盘暂不可用', message: '无法显示 Roy 托盘图标，已改为最小化到任务栏，避免后台运行却找不到窗口。' })
          if (!win.isDestroyed()) win.minimize()
          return
        }
        if (windowStateSaveTimer) { clearTimeout(windowStateSaveTimer); windowStateSaveTimer = null }
        saveMainWindowState()
        win.hide()
      })().catch(error => {
        console.error('[关闭窗口] 操作失败:', error)
        if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.show(); mainWindow.setSkipTaskbar(false) }
      }).finally(() => { closePromptPending = false })
    })
  }

  mainWindow.on('closed', () => {
    setStoredMainWindow(null)
    browserController.dispose()
    mainWindow = null
  })
}

/**
 * 关闭窗口时先让界面弹 Roy 自己画的弹窗。界面 1.5 秒内没回 ack（还没加载完、卡住）返回 null，
 * 调用方退回系统弹窗。
 */
function askCloseInRenderer(win: BrowserWindow): Promise<{ choice: 'tray' | 'quit' | 'cancel'; remember: boolean } | null> {
  return new Promise((resolve) => {
    if (win.isDestroyed() || win.webContents.isLoading() || win.webContents.isCrashed()) { resolve(null); return }
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    let acked = false
    const cleanup = (): void => {
      ipcMain.removeListener('window:close-prompt:ack', onAck)
      ipcMain.removeListener('window:close-prompt:result', onResult)
      clearTimeout(timer)
    }
    const onAck = (e: Electron.IpcMainEvent, rid: unknown): void => {
      if (e.sender === win.webContents && rid === id) acked = true
    }
    const onResult = (e: Electron.IpcMainEvent, rid: unknown, choice: unknown, remember: unknown): void => {
      if (e.sender !== win.webContents || rid !== id) return
      cleanup()
      const c = choice === 'tray' || choice === 'quit' ? choice : 'cancel'
      resolve({ choice: c, remember: remember === true })
    }
    const timer = setTimeout(() => { if (!acked) { cleanup(); resolve(null) } }, 1500)
    ipcMain.on('window:close-prompt:ack', onAck)
    ipcMain.on('window:close-prompt:result', onResult)
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
    win.webContents.send('window:close-prompt', id)
  })
}

function sendToMainWindow(channel: string, data?: unknown): void {
  showAndFocusMainWindow()

  const win = mainWindow
  if (!win || win.isDestroyed()) return

  const send = (): void => {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, data)
    }
  }

  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', send)
  } else {
    send()
  }
}

// 打包版没有控制台：主进程日志写到 <logs>/main.log，用户报问题时可以直接发这个文件
try { installFileLogger(app.getPath('logs')) } catch { /* 日志落盘失败不影响启动 */ }

app.whenReady().then(bootstrap).then(() => { warmBundledWorkbuddy(); startAccountRefresh(); setTimeout(() => { cleanupComputerJournal(); cleanupOldCheckpoints() }, 30_000) }).catch(handleBootstrapFailure)

/**
 * 启动主流程。所有非关键步骤用 safeRun / safeAwait 隔离，
 * 单点失败不应阻止窗口和托盘的创建（用户至少要能看到界面）。
 */
async function bootstrap(): Promise<void> {
  // 自家服务器的固定证书（自动更新、账号服务直连 IP 用），越早装越好
  installPinnedCertificates()
  // 主进程里的 Node fetch（标题生成、渠道测试等）发往 Roy 服务器时同样只认固定证书
  installPiRequestProxyFetch()
  // 初始化 Roy 版本号（供 User-Agent 等全局标识使用）
  setRoyVersion(app.getVersion())

  // 本地多用户：当前用户有密码、或有多个用户时，先选用户再往下启动（会话、定时任务、机器人都还没开）
  if (needsLoginOnStartup()) await runLoginGate()

  // 先显示不依赖 Renderer 的静态启动页；运行时检测耗时不会再变成用户可见的空白。
  createStartupSplashWindow()

  // 注册自定义协议 roy-file:// 用于内联预览本地文件。
  // 协议只接受主进程签发的 opaque token，不解析 renderer 提供的绝对路径。
  protocol.handle('roy-file', handleRoyFileRequest)

  // 初始化运行时环境。Node.js 仅由 npx / npm 型 MCP 在实际连接时使用，
  // 或由用户从设置手动检测；启动时不应将其作为 Agent 的前置要求。
  await safeAwait('initializeRuntime', () => initializeRuntime({ skipNodeDetection: true }))

  // 同步默认 Skills 模板到 ~/.roy/default-skills/
  safeRun('seedDefaultSkills', seedDefaultSkills)

  // 升级所有工作区中版本过旧的默认 Skills
  safeRun('upgradeDefaultSkillsInWorkspaces', upgradeDefaultSkillsInWorkspaces)

  // Create application menu
  const menu = createApplicationMenu()
  Menu.setApplicationMenu(menu)

  // Register IPC handlers
  registerIpcHandlers()

  // 收敛上次退出时遗留的运行中委派子会话（内存态丢失，无法续跑）
  safeRun('markRunningDelegationsAsInterrupted', markRunningDelegationsAsInterrupted)

  // Set dock icon on macOS
  // 确保 Dock 图标可见（dev 模式下通过 spawn 启动时可能不会自动显示）
  // 如果用户有保存的图标偏好则使用，否则用默认图标
  if (process.platform === 'darwin' && app.dock) {
    await app.dock.show()
    const { resolveAppIconPath } = require('./ipc')
    const settings = getSettings()
    const variantId = settings.appIconVariant
    const dockIconPath = resolveAppIconPath(variantId ?? 'default')
    if (dockIconPath && existsSync(dockIconPath)) {
      app.dock.setIcon(dockIconPath)
    }
  }

  // Create main window (will be shown when ready)
  createWindow()
  safeRun('cliBridge', () => { void startCliBridge().catch((e) => console.error('[roy 命令行] 启动失败:', e)) })
  safeRun('mobileRemote', () => { const { startMobileRemote } = require('./lib/mobile-remote-controller'); void startMobileRemote() })

  // Create system tray icon
  const hoverWin = process.platform === 'win32' ? getAgentStatusHoverWindow() : null
  // 托盘面板在首次有效悬停时创建，不占用启动内存。

  createTray({
    showMainWindow: showAndFocusMainWindow,
    openAgentSession: (sessionId, title) => {
      sendToMainWindow(TRAY_IPC_CHANNELS.OPEN_AGENT_SESSION, { sessionId, title })
    },
    createChatSession: () => {
      sendToMainWindow(TRAY_IPC_CHANNELS.CREATE_SESSION, { mode: 'chat' })
    },
    createAgentSession: () => {
      sendToMainWindow(TRAY_IPC_CHANNELS.CREATE_SESSION, { mode: 'agent' })
    },
    onTrayMouseEnter: hoverWin ? (bounds) => hoverWin.onTrayMouseEnter(bounds) : undefined,
    onTrayMouseMove: hoverWin ? (bounds) => hoverWin.onTrayMouseMove(bounds) : undefined,
    onTrayMouseLeave: hoverWin ? () => hoverWin.onTrayMouseLeave() : undefined,
  })

  // Windows: 将 Agent Island surface 的 pill 状态接入托盘图标 + tooltip + 通知
  if (process.platform === 'win32') {
    const surface = getWindowsAgentIslandSurface()
    surface.onTrayFlash = (flashing) => setTrayFlash(flashing)

    const notificationDeps: SurfaceDeps = {
      sendPlaySound: (type) => {
        const win = getMainWindow()
        if (win) win.webContents.send(WINDOWS_AGENT_ISLAND_IPC_CHANNELS.PLAY_SOUND, { type })
      },
      soundEnabled: () => getSettings().notificationSoundEnabled ?? true,
    }
    surface.onNotification = (transition) => processNotification(transition, notificationDeps)

    if (hoverWin) {
      surface.onHoverWindowUpdate = (snapshot) => hoverWin.updateSnapshot(snapshot)
    }

    // 灵动岛：常驻屏幕顶部居中，不依赖托盘悬停
    safeRun('agentIslandWindow', () => {
      const islandWin = getAgentIslandWindow()
      // 灵动岛由 onSnapshot 在有会话时按需创建。
      const previous = surface.onHoverWindowUpdate
      surface.onHoverWindowUpdate = (snapshot) => {
        previous?.(snapshot)
        islandWin.onSnapshot(snapshot)
        // 悬浮球跟着一起变：要你确认 > 出错 > 运行中 > 空闲
        const sessions = snapshot.state.sessions
        floatingBall.setState(
          sessions.some((x) => x.phase === 'needs-interaction') ? 'attention'
            : sessions.some((x) => x.phase === 'running') ? 'running'
              : sessions.some((x) => x.phase === 'error') ? 'error' : 'idle',
        )
      }
    })
  }

  // 桌面悬浮球（默认关，设置里打开）
  safeRun('floatingBall', () => floatingBall.init({
    toggleMainWindow: () => {
      const w = getMainWindow()
      if (w && w.isVisible() && w.isFocused() && !w.isMinimized()) w.minimize()
      else showAndFocusMainWindow()
    },
    newTask: () => { showAndFocusMainWindow(); sendToMainWindow(TRAY_IPC_CHANNELS.CREATE_SESSION, { mode: 'agent' }) },
    quickTask: () => toggleQuickTaskWindow(),
  }))

  // 启动工作区文件监听（Agent MCP/Skills + 文件浏览器自动刷新）
  if (mainWindow) {
    safeRun('startWorkspaceWatcher', () => startWorkspaceWatcher(mainWindow!))
  }

  // 启动 Chat 工具配置文件监听（Agent 创建工具后自动通知渲染进程）
  safeRun('startChatToolsWatcher', startChatToolsWatcher)

  // 自动更新仅在生产环境启用，并由主进程统一检测 Agent 是否空闲。
  if (app.isPackaged && mainWindow) {
    configureUpdater(mainWindow, { hasActiveAgents: hasActiveAgentSessions })
    safeRun('initAutoUpdater', () => initAutoUpdater(mainWindow!))
  }

  // 快速任务通过 toggleQuickTaskWindow 首次调用时创建，保留后续草稿。
  if (getSettings().voiceDictation?.enabled === true) {
    safeRun('createVoiceDictationWindow', createVoiceDictationWindow)
  }

  // Agent Island 状态机在 macOS 和 Windows 都初始化；Swift surface 仅 macOS 26+。
  if (isAgentIslandServiceSupported()) {
    safeRun('initAgentIslandService', () => {
      initAgentIslandService({
        showAndFocusMainWindow,
        openAgentSession: (sessionId, title) => {
          sendToMainWindow(TRAY_IPC_CHANNELS.OPEN_AGENT_SESSION, { sessionId, title })
        },
        enabled: () => getSettings().agentIsland?.enabled !== false,
      })
    })
  }

  if (isMacAgentIslandSurfaceSupported()) {
    safeRun('startAgentIslandSurface', startAgentIslandSurface)
  }

  // 飞书实时同步开启时，默认阻止系统自动休眠，保证远程群内继续可用。
  safeRun('syncFeishuSyncSleepBlocker', () => syncFeishuSyncSleepBlocker(getSettings()))

  // 注册全局快捷键
  safeRun('registerGlobalShortcut:quick-task', () =>
    registerGlobalShortcut('quick-task', toggleQuickTaskWindow),
  )
  safeRun('registerGlobalShortcut:show-main-window', () =>
    registerGlobalShortcut('show-main-window', showAndFocusMainWindow),
  )
  safeRun('registerGlobalShortcut:voice-dictation', () =>
    registerGlobalShortcut('voice-dictation', () => {
      toggleVoiceDictationWindow({ targetIsRoy: mainWindow?.isFocused() === true })
    }),
  )

  // 启动所有已注册的 Bridge（飞书/钉钉/微信等）
  await safeAwait('startAllBridges', () => startAllBridges())
  safeRun('startBridgeSelfHealing', startBridgeSelfHealing)

  // 启动定时任务调度器（恢复持久化的 active 任务）
  safeRun('startScheduler', startScheduler)
  safeRun('startPlanningReminderScheduler', startPlanningReminderScheduler)
  safeRun('startPlanningNativeSyncCoordinator', startPlanningNativeSyncCoordinator)

  // 🎯 初始化 Workflow 工作流系统
  safeRun('setupWorkflowIPC', () => {
    setupWorkflowIPC()
    console.log('[Workflow] 工作流系统已初始化')
  })

  app.on('activate', () => {
    if (shouldSuppressVoiceDictationActivate()) {
      return
    }

    // 直接检查 mainWindow 引用，避免 getAllWindows() 包含 DevTools 等其他窗口导致误判
    if (!mainWindow || mainWindow.isDestroyed()) {
      createWindow()
    } else {
      // 窗口已存在但可能被隐藏（macOS 关闭按钮 = hide），重新显示
      showAndFocusMainWindow()
    }
  })
}

/** 同步启动钩子隔离：单点失败仅记录日志，不阻断启动链。 */
function safeRun(name: string, fn: () => void): void {
  reportBootProgress(name)
  try {
    fn()
  } catch (err) {
    console.error(`[启动] ${name} 失败（已隔离）:`, err)
  }
}

/** 异步启动钩子隔离：同 safeRun，但适用于返回 Promise 的钩子。 */
async function safeAwait(name: string, fn: () => Promise<unknown>): Promise<void> {
  reportBootProgress(name)
  try {
    await fn()
  } catch (err) {
    console.error(`[启动] ${name} 失败（已隔离）:`, err)
  }
}

/**
 * whenReady 顶层兜底：理论上 bootstrap 内的 safeRun/safeAwait 已经把所有可预期
 * 异常隔离掉了，能走到这里说明出了 bootstrap 本身控制流的意外（极端情况），
 * 此时仍尝试创建一个降级窗口，让用户至少能看到界面、复制日志、提交反馈。
 */
function handleBootstrapFailure(err: unknown): void {
  console.error('[启动] bootstrap 致命错误，进入降级模式:', err)

  try {
    const message = err instanceof Error ? (err.stack ?? err.message) : String(err)
    dialog.showErrorBox(
      'Roy 启动遇到错误',
      `部分功能可能不可用：\n\n${message}\n\n` +
        `日志位置：${app.getPath('logs')}\n\n` +
        `常见原因与排查：\n` +
        (process.platform === 'win32'
          ? `1. 旧版 Roy 进程未退出（任务管理器结束所有 Roy 进程后重试）\n` +
            `2. 用户目录下 .roy 配置损坏（把 .roy 文件夹改名后重启）\n` +
            `3. 系统加密无法解密保存的凭证（重新登录即可）\n\n`
          : `1. 旧版 Roy 进程未退出（终端运行 killall Roy 后重试）\n` +
            `2. ~/.roy/ 配置损坏（重命名 ~/.roy 后重启）\n` +
            `3. 系统 Keychain 无法解密保存的凭证（删除 ~/.roy/feishu.json 等后重新登录）\n\n`) +
        `反馈问题时请附上日志文件夹里的 main.log。`,
    )
  } catch {
    /* dialog 也失败，无能为力 */
  }

  try {
    registerIpcHandlers()
    createWindow()
  } catch (fallbackErr) {
    console.error('[启动] 降级窗口创建也失败:', fallbackErr)
  }
}

app.on('window-all-closed', () => {
  // 非 macOS：关闭所有窗口时退出应用
  // macOS：保持应用运行（可通过 tray 或 Dock 重新打开）
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  try { stopCliBridge() } catch { /* ignore */ }
  try { floatingBall.hide() } catch { /* ignore */ }
  // 先撤托盘图标：放在最前面，后面任何清理出错都不会在右下角留残影
  destroyTray()
  // 标记正在退出，让 close 事件不再阻止关闭
  setQuitting()

  // 关掉电脑控制的输入助手
  disposeComputerHelper()
  // 中止所有活跃的 Agent 和 Chat 子进程
  stopAllAgents()
  void stopAllTerminals()
  browserController.dispose()
  stopAllGenerations()
  // 清理更新器定时器
  cleanupUpdater()
  // 停止工作区文件监听
  stopWorkspaceWatcher()
  // 停止 Chat 工具配置文件监听
  stopChatToolsWatcher()
  // 停止所有 Bridge
  stopBridgeSelfHealing()
  stopAllBridges()
  safeRun('mobileRemote', () => { const { stopMobileRemote } = require('./lib/mobile-remote-controller'); stopMobileRemote() })
  // 停止定时任务调度器
  stopScheduler()
  stopPlanningReminderScheduler()
  stopPlanningNativeSyncCoordinator()
  // 释放飞书同步防休眠
  stopFeishuSyncSleepBlocker()
  // 注销全局快捷键
  unregisterAllGlobalShortcuts()
  // 销毁辅助窗口
  destroyQuickTaskWindow()
  destroyVoiceDictationWindow()
  destroyAgentStatusHoverWindow()
  // 销毁原生 macOS 灵动岛服务（其他平台从未创建 surface）
  disposeMacAgentIslandNativeHost()
  disposeAgentIslandService()
  // 关闭 Pi MCP 桥接连接（释放 stdio 子进程）
  disposePiMcpConnections().catch(() => {})
  // 把会话索引写缓冲强制落盘，否则退出前最后 300ms 的改动会丢
  try {
    flushAgentSessionsIndexSync()
  } catch {
    /* 退出路径上的最后写入失败不再阻塞关闭 */
  }
})
