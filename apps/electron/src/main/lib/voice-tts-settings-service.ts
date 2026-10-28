/**
 * 语音合成设置服务
 * Access Token / API Key 经 safeStorage 加密后写入 settings.voiceTts。
 */

import { safeStorage } from 'electron'
import type { VoiceTtsSettings, VoiceTtsSettingsUpdate } from '../../types'
import { getSettings, updateSettings } from './settings-service'

const DEFAULT_VOICE_TTS_SETTINGS: VoiceTtsSettings = {
  enabled: false,
  engine: 'system',
  doubaoAuthMode: 'legacy',
  doubaoAppId: '',
  doubaoAccessToken: '',
  doubaoApiKey: '',
  doubaoResourceId: 'seed-tts-2.0',
  doubaoCluster: 'volcano_tts',
  doubaoVoiceType: 'BV001_streaming',
  doubaoSpeaker: 'zh_female_vv_uranus_bigtts',
  minimaxApiKey: '',
  minimaxGroupId: '',
  minimaxVoiceId: 'male-qn-qingse',
  minimaxModel: 'speech-02-hd',
}

function encryptSecret(value: string): string {
  if (!value) return ''
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn('[语音合成] safeStorage 不可用，将以明文存储密钥')
    return value
  }
  return safeStorage.encryptString(value).toString('base64')
}

function decryptSecret(value: string): string {
  if (!value) return ''
  if (!safeStorage.isEncryptionAvailable()) return value
  try {
    return safeStorage.decryptString(Buffer.from(value, 'base64'))
  } catch (error) {
    console.error('[语音合成] 解密密钥失败:', error)
    return ''
  }
}

export function getVoiceTtsSettings(): VoiceTtsSettings {
  const raw = getSettings().voiceTts ?? {}
  const doubaoAuthMode = raw.doubaoAuthMode === 'apiKey' ? 'apiKey' : 'legacy'
  const voiceType = typeof raw.doubaoVoiceType === 'string' ? raw.doubaoVoiceType.trim() : ''
  let doubaoSpeaker =
    typeof raw.doubaoSpeaker === 'string' && raw.doubaoSpeaker.trim()
      ? raw.doubaoSpeaker.trim()
      : DEFAULT_VOICE_TTS_SETTINGS.doubaoSpeaker
  // 兼容旧数据：V3 speaker 曾写在 doubaoVoiceType
  if (
    (!raw.doubaoSpeaker || !String(raw.doubaoSpeaker).trim()) &&
    voiceType &&
    !/^BV/i.test(voiceType) &&
    /_bigtts$/i.test(voiceType)
  ) {
    doubaoSpeaker = voiceType
  }
  return {
    ...DEFAULT_VOICE_TTS_SETTINGS,
    ...raw,
    doubaoAuthMode,
    doubaoSpeaker,
    doubaoAccessToken: decryptSecret(raw.doubaoAccessToken ?? ''),
    doubaoApiKey: decryptSecret(raw.doubaoApiKey ?? ''),
    minimaxApiKey: decryptSecret(raw.minimaxApiKey ?? ''),
  }
}

export function updateVoiceTtsSettings(updates: VoiceTtsSettingsUpdate): VoiceTtsSettings {
  const current = getVoiceTtsSettings()
  const next: VoiceTtsSettings = {
    ...current,
    ...updates,
  }

  updateSettings({
    voiceTts: {
      ...next,
      doubaoAccessToken: encryptSecret(next.doubaoAccessToken),
      doubaoApiKey: encryptSecret(next.doubaoApiKey),
      minimaxApiKey: encryptSecret(next.minimaxApiKey),
    },
  })

  return next
}
