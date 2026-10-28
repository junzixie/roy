/**
 * AboutSettings - 关于页面
 *
 * 显示应用版本号等基本信息，以及版本检测状态。
 * 检测到新版本后引导用户去 GitHub Releases 手动下载。
 */

import * as React from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { RefreshCw, Loader2, CheckCircle2, AlertCircle, Info, Terminal, ChevronDown, ChevronUp, ExternalLink, RotateCw } from 'lucide-react'
import type { EnvironmentCheckResult, RuntimeStatus, WindowsShellPreference } from '@roy/shared'
import {
  SettingsSection,
  SettingsCard,
  SettingsRow,
  SettingsSelect,
} from './primitives'
import { updateStatusAtom, updaterAvailableAtom, checkForUpdates } from '@/atoms/updater'
import { onboardingGuideOpenAtom, settingsOpenAtom } from '@/atoms/settings-tab'
import { detectIsWindows } from '@/lib/platform'
import { environmentCheckResultAtom } from '@/atoms/environment'
import { EnvironmentCheckCard } from '@/components/environment/EnvironmentCheckCard'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { ReleaseNotesViewer } from './ReleaseNotesViewer'
import { VersionHistory } from './VersionHistory'

/** 从 package.json 构建时由 Vite define 注入 */
declare const __APP_VERSION__: string
/** 沙箱渲染进程没有 process，用 navigator 判断平台 */
function isWindowsPlatform(): boolean {
  try {
    return detectIsWindows()
  } catch {
    return false
  }
}
const APP_VERSION = __APP_VERSION__


/** 更新状态卡片（导出给账号页和关于页共用） */
export function UpdateCard(): React.ReactElement {
  const available = useAtomValue(updaterAvailableAtom)
  const status = useAtomValue(updateStatusAtom)
  const [checking, setChecking] = React.useState(false)
  const [showReleaseNotes, setShowReleaseNotes] = React.useState(false)
  const [release, setRelease] = React.useState<import('@roy/shared').GitHubRelease | null>(null)

  // updater 不可用时不静默隐藏：给出明确原因，避免用户以为没有这个功能
  if (!available) {
    return (
      <SettingsCard>
        <SettingsRow label="软件更新" description={`当前版本 v${APP_VERSION}`}>
          <span className="text-xs text-muted-foreground">当前构建未配置更新源，无法检查更新</span>
        </SettingsRow>
      </SettingsCard>
    )
  }

  const handleCheck = async (): Promise<void> => {
    setChecking(true)
    try {
      await checkForUpdates()
    } finally {
      // 状态由 atom 订阅自动更新，延迟重置 checking 避免按钮闪烁
      setTimeout(() => setChecking(false), 1000)
    }
  }

  const handleInstallWhenIdle = (): void => {
    void window.electronAPI.updater?.installWhenIdle()
      .catch((error) => console.error('[更新] 安排空闲更新失败:', error))
  }

  const handleCancelIdleInstall = (): void => {
    void window.electronAPI.updater?.cancelIdleInstall()
      .catch((error) => console.error('[更新] 取消空闲更新失败:', error))
  }

  // 当检测到新版本时，获取完整的 release 信息

  React.useEffect(() => {
    if (status.status === 'available' && status.version && !release) {
      window.electronAPI
        .getReleaseByTag(`v${status.version}`)
        .then((r) => {
          if (r) {
            setRelease(r)
            setShowReleaseNotes(true)
          }
        })
        .catch((err) => {
          console.error('[更新] 获取 Release 信息失败:', err)
        })
    }
  }, [status.status, status.version, release])

  const isChecking = checking || status.status === 'checking' || status.status === 'downloading'
  const hasReleaseNotes = status.releaseNotes || release?.body

  return (
    <SettingsCard>
      <SettingsRow label="软件更新" description={`当前版本 v${APP_VERSION}`}>
        <div className="flex items-center gap-3">
          {/* 状态文字 */}
          <StatusText status={status.status} version={status.version} error={status.error} />

          {/* 操作按钮 */}
          {status.status === 'downloaded' ? (
            status.installScheduled ? (
              <button
                onClick={handleCancelIdleInstall}
                className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors"
              >
                取消安排
              </button>
            ) : (
              <button
                onClick={handleInstallWhenIdle}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <RotateCw className="h-3.5 w-3.5" />
                立即重启更新
              </button>
            )
          ) : status.status === 'available' ? (
            // 发现新版本后会自动在后台静默下载，不再跳转到网页
            <span className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              准备下载
            </span>
          ) : (
            <button
              onClick={handleCheck}
              disabled={isChecking}
              className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors disabled:opacity-50"
            >
              {isChecking ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              检查更新
            </button>
          )}
        </div>
      </SettingsRow>

      {/* Release Notes（新版本可用时显示） */}
      {status.status === 'available' && hasReleaseNotes && (
        <div className="px-4 pb-4 border-t">
          <button
            onClick={() => setShowReleaseNotes(!showReleaseNotes)}
            className="w-full flex items-center justify-between py-3 text-left hover:opacity-80 transition-opacity"
          >
            <span className="text-sm font-medium">更新日志</span>
            {showReleaseNotes ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>

          {showReleaseNotes && release && (
            <div className="mt-2">
              <ReleaseNotesViewer
                release={release}
                showHeader={false}
                compact
              />
            </div>
          )}
        </div>
      )}
    </SettingsCard>
  )
}

/** 状态文字组件 */
function StatusText({ status, version, error }: {
  status: string
  version?: string
  error?: string
}): React.ReactElement {
  switch (status) {
    case 'checking':
      return <span className="text-xs text-muted-foreground">正在检查...</span>
    case 'available':
      return (
        <span className="text-xs text-primary flex items-center gap-1">
          <ExternalLink className="h-3 w-3" />
          新版本 v{version} 可用
        </span>
      )
    case 'downloading':
      return (
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          正在下载 v{version}
        </span>
      )
    case 'downloaded':
      return (
        <span className="text-xs text-primary flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3" />
          更新 v{version} 已就绪
        </span>
      )
    case 'not-available':
      return (
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3" />
          已是最新版本
        </span>
      )
    case 'error':
      return (
        <span className="text-xs text-destructive flex items-center gap-1" title={error}>
          <AlertCircle className="h-3 w-3" />
          检查失败
        </span>
      )
    default:
      return <span className="text-xs text-muted-foreground">未检查</span>
  }
}

/** 环境检测卡片 */
function EnvironmentCard(): React.ReactElement {
  const setEnvironmentResult = useSetAtom(environmentCheckResultAtom)
  const [result, setResult] = React.useState<EnvironmentCheckResult | null>(null)
  const [isChecking, setIsChecking] = React.useState(false)

  // 初始化时加载缓存的检测结果；没有缓存就自动检测一次，避免一直停在“检测中”
  React.useEffect(() => {
    let cancelled = false
    void window.electronAPI.getSettings().then(async (settings) => {
      if (cancelled) return
      if (settings.lastEnvironmentCheck) {
        setResult(settings.lastEnvironmentCheck)
        setEnvironmentResult(settings.lastEnvironmentCheck)
        return
      }
      setIsChecking(true)
      try {
        const checkResult = await window.electronAPI.checkEnvironment()
        if (cancelled) return
        setResult(checkResult)
        setEnvironmentResult(checkResult)
      } catch (error) {
        console.error('[环境检测] 首次自动检测失败:', error)
      } finally {
        if (!cancelled) setIsChecking(false)
      }
    })
    return () => { cancelled = true }
  }, [setEnvironmentResult])

  // 执行环境检测
  const handleCheck = async () => {
    setIsChecking(true)
    try {
      const checkResult = await window.electronAPI.checkEnvironment()
      setResult(checkResult)
      setEnvironmentResult(checkResult)
    } catch (error) {
      console.error('[环境检测] 检测失败:', error)
    } finally {
      setIsChecking(false)
    }
  }

  // Node.js 检测状态
  const nodejsStatus = !result
    ? 'checking'
    : result.nodejs.installed && result.nodejs.meetsMinimum && result.nodejs.meetsRecommended
      ? 'success'
      : 'warning'

  // Git 仅影响仓库状态、Changes 与 Diff，不阻塞基础 Agent。
  const gitStatus = !result
    ? 'checking'
    : result.git.installed && result.git.meetsRequirement
      ? 'success'
      : 'warning'

  return (
    <SettingsCard>
      <div className="p-4 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium">可选环境能力</h3>
          </div>
          <button
            onClick={handleCheck}
            disabled={isChecking}
            className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors disabled:opacity-50"
          >
            {isChecking ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {isChecking ? '检测中...' : '重新检查'}
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          基础 Agent 无需 Node.js 或 Git；按需安装以启用 MCP、Git 变更视图等能力
        </p>
      </div>

      <div className="p-4 space-y-3">
        {/* Node.js 检测卡片 */}
        <EnvironmentCheckCard
          name="Node.js"
          status={nodejsStatus}
          version={result?.nodejs.version}
          requirement="可选 · 仅 npx / npm 型 MCP 服务器需要（推荐 22 LTS）"
          action={{
            type: 'openExternal',
            url: result?.nodejs.downloadUrl || 'https://nodejs.org/',
          }}
          statusText={
            result && nodejsStatus === 'warning'
              ? `v${result.nodejs.version} (建议升级到 22 LTS 以获得最佳体验)`
              : undefined
          }
        />

        {/* Git 检测卡片 */}
        <EnvironmentCheckCard
          name="Git"
          status={gitStatus}
          version={result?.git.version}
          requirement="可选 · Git 仓库状态、Changes 与 Diff 功能需要"
          action={{
            type: 'openExternal',
            url: result?.git.downloadUrl || 'https://git-scm.com/',
          }}
        />

        {/* Windows 提示 */}
        {result?.platform === 'win32' && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="text-xs">
              <strong>Windows 用户建议：</strong>
              安装时请选择默认路径（C:\Program Files\...），并确保勾选"添加到 PATH"选项
            </AlertDescription>
          </Alert>
        )}
      </div>
    </SettingsCard>
  )
}

/** Shell 环境卡片（Windows 平台）*/
function ShellEnvironmentCard(): React.ReactElement | null {
  const [runtimeStatus, setRuntimeStatus] = React.useState<RuntimeStatus | null>(null)
  const [shellPreference, setShellPreference] = React.useState<WindowsShellPreference>('auto')
  const [isChecking, setIsChecking] = React.useState(false)

  // 初始化时加载运行时状态与用户偏好
  React.useEffect(() => {
    Promise.all([window.electronAPI.getRuntimeStatus(), window.electronAPI.getSettings()])
      .then(([status, settings]) => {
        setRuntimeStatus(status)
        setShellPreference(settings.windowsShellPreference ?? 'auto')
      })
      .catch((error) => console.error('[Shell 环境检测] 读取设置失败:', error))
  }, [])

  // 重新检测
  const handleCheck = async () => {
    setIsChecking(true)
    try {
      // 触发重新初始化运行时（后续可以添加此 IPC 方法）
      const status = await window.electronAPI.getRuntimeStatus()
      setRuntimeStatus(status)
    } catch (error) {
      console.error('[Shell 环境检测] 检测失败:', error)
    } finally {
      setIsChecking(false)
    }
  }

  const handlePreferenceChange = async (value: string): Promise<void> => {
    if (value !== 'auto' && value !== 'git-bash' && value !== 'wsl') return
    const preference = value as WindowsShellPreference
    await window.electronAPI.updateSettings({ windowsShellPreference: preference })
    setShellPreference(preference)
  }

  // 非 Windows 平台不显示
  // 注意：渲染进程开了 sandbox + contextIsolation，没有 process 全局。
  // 这里必须用 navigator 判断，否则整棵组件树会 ReferenceError 白屏。
  if (!isWindowsPlatform() && !runtimeStatus?.shell) {
    return null
  }
  if (!runtimeStatus || !runtimeStatus.shell) {
    // 读取中：给一个明确的加载态，不要整块消失
    return (
      <SettingsCard>
        <div className="flex items-center gap-2 px-4 py-4 text-[12.5px] text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          正在读取 Shell 环境…
        </div>
      </SettingsCard>
    )
  }

  const { shell } = runtimeStatus
  const hasShell = shell.gitBash?.available || shell.wsl?.available
  const resolvedShell = shellPreference === 'wsl' && shell.wsl.available
    ? 'wsl'
    : shellPreference === 'git-bash' && shell.gitBash.available
      ? 'git-bash'
      : shell.recommended
  const resolvedShellLabel = resolvedShell === 'git-bash' ? 'Git Bash' : resolvedShell === 'wsl' ? 'WSL' : '无可用 Shell'

  return (
    <SettingsCard>
      <div className="p-4 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">Shell 环境（Windows）</h3>
            {!hasShell && <Badge variant="secondary">可选</Badge>}
          </div>
          <button
            onClick={handleCheck}
            disabled={isChecking}
            className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors disabled:opacity-50"
          >
            {isChecking ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {isChecking ? '检测中...' : '重新检查'}
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          可选：配置 Git Bash 或 WSL 后，Agent 可执行 Bash 命令
        </p>
      </div>

      <div className="p-4 space-y-3">
        <SettingsSelect
          label="Agent Shell"
          description="默认使用 Git Bash，确保 Windows 项目与 Agent 工具使用同一套路径；选择 WSL 后，WSL 不可用时会回退到 Git Bash。"
          value={shellPreference}
          onValueChange={(value) => {
            void handlePreferenceChange(value).catch((error) => console.error('[Shell 环境检测] 保存偏好失败:', error))
          }}
          options={[
            { value: 'auto', label: '自动（推荐：Git Bash 优先）' },
            { value: 'git-bash', label: 'Git Bash' },
            { value: 'wsl', label: 'WSL（实验性）' },
          ]}
        />

        {/* Git Bash 检测卡片 */}
        <EnvironmentCheckCard
          name="Git Bash"
          status={shell.gitBash?.available ? 'success' : 'error'}
          version={shell.gitBash?.version ?? undefined}
          requirement="Git for Windows 自带"
          action={{ type: 'download', installerId: 'git-for-windows' }}
          statusText={
            shell.gitBash?.available
              ? `${shell.gitBash.path}`
              : shell.gitBash?.error || '未安装'
          }
        />

        {/* WSL 检测卡片 */}
        <EnvironmentCheckCard
          name="WSL"
          status={shell.wsl?.available ? 'success' : 'error'}
          version={shell.wsl?.version ? `WSL ${shell.wsl.version}` : undefined}
          requirement="WSL 1 或 WSL 2"
          action={{
            type: 'openExternal',
            url: 'https://learn.microsoft.com/zh-cn/windows/wsl/install',
          }}
          statusText={
            shell.wsl?.available
              ? `默认发行版: ${shell.wsl.defaultDistro || '未设置'} (${shell.wsl.distros.join(', ')})`
              : shell.wsl?.error || '未安装'
          }
        />

        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription className="text-xs">
            <strong>Agent 将使用：</strong>{resolvedShellLabel}
            {shellPreference === 'wsl' && resolvedShell !== 'wsl' && '（WSL 不可用，已回退）'}
            {shellPreference === 'git-bash' && resolvedShell !== 'git-bash' && '（Git Bash 不可用，已回退）'}
          </AlertDescription>
        </Alert>

        {/* 无可用环境警告 */}
        {!hasShell && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              <strong>未检测到可用的 Shell 环境。</strong>
              <br />
              基础 Agent 仍可使用；安装 Git Bash 或 WSL 后可启用 Bash 命令执行。
            </AlertDescription>
          </Alert>
        )}
      </div>
    </SettingsCard>
  )
}

export function AboutSettings(): React.ReactElement {
  const setGuideOpen = useSetAtom(onboardingGuideOpenAtom)
  const setSettingsOpen = useSetAtom(settingsOpenAtom)
  return (
    <SettingsSection
      title="软件更新"
      description="当前版本、检查更新和每一版的更新内容"
    >
      {/* 自动更新卡片（updater 不可用时不渲染） */}
      <UpdateCard />

      <SettingsCard>
        <SettingsRow label="版本">
          <span className="text-sm text-muted-foreground font-mono">{APP_VERSION}</span>
        </SettingsRow>
        <SettingsRow label="运行时">
          <span className="text-sm text-muted-foreground">Electron + React</span>
        </SettingsRow>
        <SettingsRow
          label="开源协议"
          description="Roy 在 AGPL-3.0 基础上构建，数据全部留在本地"
        >
          <a
            href="https://www.gnu.org/licenses/agpl-3.0.html"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline"
          >
            AGPL-3.0
          </a>
        </SettingsRow>
        <SettingsRow label="数据目录" description="会话、项目、技能与设置都在这一个目录里">
          <span className="font-mono text-[12.5px] text-muted-foreground">~/.roy</span>
        </SettingsRow>
        <SettingsRow label="新手引导" description="再看一遍入门介绍">
          <button
            type="button"
            onClick={() => { setSettingsOpen(false); setGuideOpen(true) }}
            className="h-8 rounded-md border border-border px-3 text-[12.5px] hover:bg-foreground/[0.05]"
          >
            重新查看
          </button>
        </SettingsRow>
        <SettingsRow label="运行日志" description="反馈问题时把里面的 main.log 一起发过来">
          <button
            type="button"
            onClick={() => void window.electronAPI.openLogsDir()}
            className="h-8 rounded-md border border-border px-3 text-[12.5px] hover:bg-foreground/[0.05]"
          >
            打开日志文件夹
          </button>
        </SettingsRow>
      </SettingsCard>

      {/* 版本历史 */}
      <VersionHistory />

      {/* 环境检测卡片 */}
      <EnvironmentCard />

      {/* Shell 环境卡片（仅 Windows） */}
      <ShellEnvironmentCard />
    </SettingsSection>
  )
}
