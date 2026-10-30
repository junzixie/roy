/**
 * 应用设置服务
 *
 * 管理应用设置（主题模式等）的读写。
 * 存储在 ~/.roy/settings.json
 */

import { readFileSync, writeFileSync, existsSync, renameSync, statSync, unlinkSync } from 'node:fs'
import { getSettingsPath } from './config-paths'
import { DEFAULT_THEME_MODE, normalizeProductivityToolsSettings } from '../../types'
import type { AgentIslandSettings, AppSettings } from '../../types'
import { getTerminalProfilesForPlatform, isTerminalProfile } from '@roy/shared'

function sanitizeAgentIslandSettings(input: unknown): AgentIslandSettings | undefined {
  if (!input || typeof input !== 'object') return undefined
  const raw = input as { enabled?: unknown }
  return typeof raw.enabled === 'boolean' ? { enabled: raw.enabled } : undefined
}

export function sanitizeWindowsTerminalProfile(input: unknown): AppSettings['lastWindowsTerminalProfile'] {
  return isTerminalProfile(input) && getTerminalProfilesForPlatform('win32').includes(input)
    ? input
    : undefined
}

/**
 * 进程内设置缓存。
 *
 * `getSettings()` 在主进程里有 69 个调用点，其中不少在热路径上（窗口状态、
 * 通知开关、启动参数）。每次同步读盘 + JSON.parse 一个几 KB 的文件，在主进程
 * 里是实打实的阻塞。设置只在 `updateSettings` 里变，所以在这里缓存、
 * 写入时同步更新即可。
 *
 * 缓存带 mtime 校验：`statSync` 比读整个文件 + `JSON.parse` 便宜一个数量级，
 * 但能发现「文件被外部改了」（用户手改、另一个进程写入、测试里直接覆盖）。
 * 只用内存缓存不做校验，会让这类改动在进程重启前完全不生效——这个坑真的踩到了。
 *
 * 存的是不可变快照：调用方拿到的对象被改了也不会污染缓存。
 */
let cachedSettings: AppSettings | null = null
/** 缓存对应的文件指纹；null 表示「文件不存在」的快照。 */
let cachedSettingsFingerprint: string | null = null

/**
 * 文件指纹：mtime + 大小。
 *
 * 只用 mtime 不够：Windows 的文件时间精度受限于系统时钟粒度，同一毫秒内
 * 连续两次写入（测试里直接覆盖 settings.json 就是这种情况）会得到相同的
 * mtimeMs，缓存就会把新内容当成旧内容返回。加上文件大小能挡掉绝大多数
 * 这类误判——内容真的变了而长度恰好不变的概率很低。
 *
 * 文件不存在返回 null，与「存在但内容为空」区分开。
 */
function settingsFingerprint(filePath: string): string | null {
  try {
    const stat = statSync(filePath)
    return `${stat.mtimeMs}:${stat.size}`
  } catch {
    return null
  }
}

/**
 * 清掉设置缓存。
 *
 * mtime+size 指纹已经能发现绝大多数外部改动，这个函数用于两处兜底：
 * 1. 测试里写文件后立刻读（同毫秒同大小的极端情形）；
 * 2. 已知外部写入完成、不想多一次 stat 判断时。
 */
export function invalidateSettingsCache(): void {
  cachedSettings = null
  cachedSettingsFingerprint = null
}

/**
 * 获取应用设置
 *
 * 如果文件不存在，返回默认设置。
 */
export function getSettings(): AppSettings {
  const filePath = getSettingsPath()
  const fingerprint = settingsFingerprint(filePath)
  if (cachedSettings && fingerprint === cachedSettingsFingerprint) return cachedSettings

  if (!existsSync(filePath)) {
    cachedSettings = {
      themeMode: DEFAULT_THEME_MODE,
      onboardingCompleted: false,
      environmentCheckSkipped: false,
      notificationsEnabled: true,
      longTextPasteAsAttachmentEnabled: false,
      richTextRenderingEnabled: false,
      feishuSessionMirror: { mode: 'off' },
      visionRelay: { enabled: false },
      windowsShellPreference: 'auto',
      agentThinking: { type: 'adaptive' },
      gitAttributionEnabled: true,
      productivityTools: normalizeProductivityToolsSettings(undefined),
    }
    cachedSettingsFingerprint = null
    return cachedSettings
  }

  try {
    const raw = readFileSync(filePath, 'utf-8')
    // 去 BOM：记事本保存过的 settings.json 带 U+FEFF，会让 JSON.parse 直接失败
    const data = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw) as Partial<AppSettings> & {
      experimentalAgentRuntimeSwitchEnabled?: boolean
      agentRuntime?: unknown
      agentChannelIds?: unknown
      builtinMcpDisabledIds?: unknown
      interfaceVariant?: unknown
      /** PR #1895 早期构建写入的无平台 profile 字段；仅在 Windows 上迁移。 */
      lastTerminalProfile?: unknown
    }
    // Pi-only：读取时丢弃旧 runtime selector、界面风格与 Claude 白名单，避免下次写回复活。
    const {
      experimentalAgentRuntimeSwitchEnabled: _legacyRuntimeSwitch,
      agentRuntime: _legacyAgentRuntime,
      agentChannelIds: _legacyAgentChannelIds,
      builtinMcpDisabledIds: _legacyBuiltinMcpDisabledIds,
      interfaceVariant: _legacyInterfaceVariant,
      lastTerminalProfile: legacyLastTerminalProfile,
      ...settings
    } = data
    const resolved: AppSettings = {
      ...settings,
      themeMode: data.themeMode || DEFAULT_THEME_MODE,
      onboardingCompleted: data.onboardingCompleted ?? false,
      environmentCheckSkipped: data.environmentCheckSkipped ?? false,
      notificationsEnabled: data.notificationsEnabled ?? true,
      longTextPasteAsAttachmentEnabled: data.longTextPasteAsAttachmentEnabled ?? false,
      richTextRenderingEnabled: data.richTextRenderingEnabled ?? false,
      feishuSessionMirror: data.feishuSessionMirror ?? { mode: 'off' },
      visionRelay: data.visionRelay ?? { enabled: false },
      windowsShellPreference: settings.windowsShellPreference ?? 'auto',
      lastWindowsTerminalProfile: process.platform === 'win32'
        ? sanitizeWindowsTerminalProfile(settings.lastWindowsTerminalProfile ?? legacyLastTerminalProfile)
        : undefined,
      agentThinking: settings.agentThinking ?? { type: 'adaptive' },
      // 缺省 true：老配置文件未写该字段时保持推广默认开启
      gitAttributionEnabled: settings.gitAttributionEnabled ?? true,
      // 缺省全部开启：老配置文件不会因升级意外隐藏生产力工具。
      productivityTools: normalizeProductivityToolsSettings(data.productivityTools),
      // 仅保留 macOS 原生 Island 开关；清理旧非原生 surface 的持久化残留字段。
      agentIsland: sanitizeAgentIslandSettings(data.agentIsland),
    }
    cachedSettings = resolved
    cachedSettingsFingerprint = fingerprint
    return resolved
  } catch (error) {
    console.error('[设置] 读取失败:', error)
    // 文件存在但解析不了：先把它备份走再回落默认值。
    // 不备份的话，用户下一次改任何设置都会用默认值整体覆盖，原始配置永久丢失——
    // 用户看到的是「所有设置莫名其妙回到初始状态」。
    try {
      const backupPath = `${filePath}.corrupt-${Date.now()}`
      renameSync(filePath, backupPath)
      console.warn('[设置] 已把损坏的设置文件备份到:', backupPath)
    } catch (backupError) {
      console.error('[设置] 备份损坏文件失败:', backupError)
    }
    cachedSettings = {
      themeMode: DEFAULT_THEME_MODE,
      onboardingCompleted: false,
      environmentCheckSkipped: false,
      notificationsEnabled: true,
      longTextPasteAsAttachmentEnabled: false,
      richTextRenderingEnabled: false,
      feishuSessionMirror: { mode: 'off' },
      visionRelay: { enabled: false },
      windowsShellPreference: 'auto',
      agentThinking: { type: 'adaptive' },
      gitAttributionEnabled: true,
      productivityTools: normalizeProductivityToolsSettings(undefined),
    }
    // 损坏文件已被改名，此时原路径不存在，缓存对应的是「无文件」快照
    cachedSettingsFingerprint = null
    return cachedSettings
  }
}

/**
 * 原子写：先写临时文件再改名，避免写到一半崩溃/断电把 settings.json 截断。
 *
 * `writeFileSync` 直接覆盖原文件时，进程在写了一半被杀死（或者系统断电）会留下
 * 一个语法不完整的 JSON——下次启动 `JSON.parse` 抛错，所有设置静默回落到默认值，
 * 用户看到的是「我的主题、渠道、快捷键全没了」。改名在同一分区上是原子的，
 * 要么是旧的完整文件，要么是新的完整文件。
 *
 * @param filePath - 目标文件。
 * @param content - 要写入的完整文本。
 */
export function writeFileAtomic(filePath: string, content: string): void {
  const tempPath = `${filePath}.tmp`
  try {
    writeFileSync(tempPath, content, 'utf-8')
    renameSync(tempPath, filePath)
  } catch (error) {
    // 改名失败（例如 Windows 上目标被占用）时清掉临时文件再抛，避免留垃圾
    try {
      if (existsSync(tempPath)) unlinkSync(tempPath)
    } catch {
      // 清理失败不影响主错误
    }
    throw error
  }
}

/**
 * 更新应用设置
 *
 * 合并更新字段并写入文件。
 */
export function updateSettings(updates: Partial<AppSettings>): AppSettings {
  const current = getSettings()
  const updated: AppSettings = {
    ...current,
    ...updates,
    // 仅保留 macOS 原生 Island 开关，避免旧非原生 surface 字段被继续回写。
    agentIsland: updates.agentIsland === undefined
      ? sanitizeAgentIslandSettings(current.agentIsland)
      : sanitizeAgentIslandSettings({ ...current.agentIsland, ...updates.agentIsland }),
    productivityTools: updates.productivityTools === undefined
      ? normalizeProductivityToolsSettings(current.productivityTools)
      : normalizeProductivityToolsSettings({ ...current.productivityTools, ...updates.productivityTools }),
  }
  const filePath = getSettingsPath()

  try {
    writeFileAtomic(filePath, JSON.stringify(updated, null, 2))
    // 写成功才更新缓存：写失败时内存里仍是旧值，和磁盘保持一致
    cachedSettings = updated
    cachedSettingsFingerprint = settingsFingerprint(filePath)
    console.log('[设置] 已更新 keys:', Object.keys(updates).join(', '))
  } catch (error) {
    console.error('[设置] 写入失败:', error)
    throw new Error('写入应用设置失败')
  }

  return updated
}
