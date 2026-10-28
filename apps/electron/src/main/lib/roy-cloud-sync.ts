/**
 * 云同步（Pro）：把「换台电脑也想一样」的偏好设置上传到账号，在另一台电脑一键恢复。
 *
 * 只同步下面白名单里的外观、快捷键、工作习惯类设置。模型渠道和 API Key、数据目录、窗口位置、
 * 手机遥控配对、本机路径这些和具体电脑绑定或敏感的东西一律不传。
 */

import { hostname } from 'node:os'
import type { AppSettings } from '../../types'
import { getSettings, updateSettings } from './settings-service'
import { callAccount, hasProFeature } from './roy-account'

const SYNC_KEYS = [
  'themeMode', 'themeStyle', 'wallpaper', 'startupAnimation', 'appIconVariant',
  'markdownFontSize', 'uiFontSize', 'chatWidth', 'richTextRenderingEnabled', 'sessionHoverPreviewEnabled',
  'shortcutOverrides', 'sendWithCmdEnter', 'sendWithClickOnly', 'longTextPasteAsAttachmentEnabled',
  'notificationsEnabled', 'notificationSoundEnabled', 'notificationSounds',
  'workMode', 'agentMode', 'fastModeView', 'agentThinking', 'agentEffort', 'defaultOpenAIThinkingLevel',
  'defaultPermissionMode', 'autoCompactPercent', 'archiveAfterDays', 'agentMaxTurns',
  'filesPanelDefaultSource', 'closeBehavior', 'gitAttributionEnabled', 'floatingBallEnabled',
] as const satisfies ReadonlyArray<keyof AppSettings>

interface SyncPayload { v: 1; savedAt: number; settings: Partial<AppSettings> }

export interface CloudSyncResult { updatedAt: number | null; deviceName: string | null; keys: number }

function requirePro(): void {
  if (!hasProFeature('cloud-sync')) throw new Error('云同步需要激活 Pro（设置 → 账号 → 软件激活）')
}

/** 把本机设置上传到云端（覆盖云端那份） */
export async function uploadCloudSync(): Promise<CloudSyncResult> {
  requirePro()
  const all = getSettings() as unknown as Record<string, unknown>
  const settings: Record<string, unknown> = {}
  for (const k of SYNC_KEYS) if (all[k] !== undefined) settings[k] = all[k]
  const payload: SyncPayload = { v: 1, savedAt: Date.now(), settings: settings as Partial<AppSettings> }
  const r = await callAccount<{ updatedAt: number }>('/v1/sync/put', { data: JSON.stringify(payload), deviceName: hostname() })
  return { updatedAt: r.updatedAt, deviceName: hostname(), keys: Object.keys(settings).length }
}

/** 查看云端那份是什么时候、哪台电脑上传的 */
export async function cloudSyncStatus(): Promise<CloudSyncResult> {
  requirePro()
  const r = await callAccount<{ data: string | null; updatedAt: number | null; deviceName: string | null }>('/v1/sync/get', {})
  let keys = 0
  try { keys = r.data ? Object.keys((JSON.parse(r.data) as SyncPayload).settings ?? {}).length : 0 } catch { /* 坏数据按空处理 */ }
  return { updatedAt: r.updatedAt, deviceName: r.deviceName, keys }
}

/** 用云端那份覆盖本机对应设置（白名单以外的不动） */
export async function restoreCloudSync(): Promise<CloudSyncResult> {
  requirePro()
  const r = await callAccount<{ data: string | null; updatedAt: number | null; deviceName: string | null }>('/v1/sync/get', {})
  if (!r.data) throw new Error('云端还没有同步过设置，先在另一台电脑上点「上传到云端」')
  const payload = JSON.parse(r.data) as SyncPayload
  const patch: Record<string, unknown> = {}
  for (const k of SYNC_KEYS) if (payload.settings && k in payload.settings) patch[k] = (payload.settings as Record<string, unknown>)[k]
  updateSettings(patch as Partial<AppSettings>)
  return { updatedAt: r.updatedAt, deviceName: r.deviceName, keys: Object.keys(patch).length }
}
