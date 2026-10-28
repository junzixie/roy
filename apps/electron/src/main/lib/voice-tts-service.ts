/**
 * 云端语音合成：豆包（火山 openspeech）/ Minimax。
 * 系统 speechSynthesis 由渲染进程本地完成。
 */

import { randomUUID } from 'crypto'
import type { VoiceTtsSettings, VoiceTtsSynthesizeResult, VoiceTtsTestResult } from '../../types'
import { getVoiceTtsSettings } from './voice-tts-settings-service'

const DEFAULT_V3_RESOURCE_ID = 'seed-tts-2.0'
const DEFAULT_V3_SPEAKER = 'zh_female_vv_uranus_bigtts'
const DEFAULT_LEGACY_VOICE_TYPE = 'BV001_streaming'

/** 旧版 v1 voice_type（不可当作 V3 speaker） */
function isLegacyVoiceType(value: string): boolean {
  const s = value.trim()
  if (!s) return true
  if (/^BV[\w.-]*$/i.test(s)) return true
  if (/_streaming$/i.test(s) && !/_bigtts$/i.test(s)) return true
  return false
}

/**
 * V3 speaker 解析：优先 doubaoSpeaker；若误填了旧版 BV*，自动映射到 2.0 默认音色。
 * seed-tts-2.0 常见：zh_female_vv_uranus_bigtts / zh_female_xiaohe_uranus_bigtts / zh_male_m191_uranus_bigtts
 * seed-icl-2.0：控制台复刻音色 ID；seed-tts-1.0：1.0 音色库 ID
 */
function resolveDoubaoV3Speaker(settings: VoiceTtsSettings): { speaker: string; remappedFrom?: string } {
  const explicit = (settings.doubaoSpeaker || '').trim()
  if (explicit && !isLegacyVoiceType(explicit)) {
    return { speaker: explicit }
  }
  const shared = (settings.doubaoVoiceType || '').trim()
  if (shared && !isLegacyVoiceType(shared)) {
    return { speaker: shared }
  }
  if (explicit && isLegacyVoiceType(explicit)) {
    return { speaker: DEFAULT_V3_SPEAKER, remappedFrom: explicit }
  }
  if (shared && isLegacyVoiceType(shared)) {
    return { speaker: DEFAULT_V3_SPEAKER, remappedFrom: shared }
  }
  return { speaker: DEFAULT_V3_SPEAKER }
}

function formatV3MismatchMessage(resourceId: string, speaker: string, raw: string): string {
  const rid = resourceId || DEFAULT_V3_RESOURCE_ID
  if (/mismatch/i.test(raw) || /resource\s*id/i.test(raw)) {
    return (
      `豆包 TTS(V3) 失败：Resource ID「${rid}」与音色 speaker「${speaker}」不匹配。` +
      `请把 Resource ID 改成与音色一致的版本——` +
      `seed-tts-2.0 配 zh_female_vv_uranus_bigtts（或控制台 2.0 音色）；` +
      `旧版 BV001_streaming 只能走「旧版」鉴权（APP ID+Token），不能当 V3 speaker。` +
      `原始信息：${raw.slice(0, 120)}`
    )
  }
  return `豆包 TTS(V3) 失败：${raw}`
}

function mergeSettings(overrides?: Partial<VoiceTtsSettings>): VoiceTtsSettings {
  return { ...getVoiceTtsSettings(), ...(overrides ?? {}) }
}

async function synthesizeDoubaoLegacy(settings: VoiceTtsSettings, text: string): Promise<VoiceTtsSynthesizeResult> {
  const appId = settings.doubaoAppId.trim()
  const token = settings.doubaoAccessToken.trim()
  const cluster = (settings.doubaoCluster || 'volcano_tts').trim()
  let voiceType = (settings.doubaoVoiceType || DEFAULT_LEGACY_VOICE_TYPE).trim()
  // 若用户把 V3 speaker 误填进旧版字段，回退默认旧音色
  if (!isLegacyVoiceType(voiceType) && /_uranus_bigtts|_bigtts/i.test(voiceType)) {
    voiceType = DEFAULT_LEGACY_VOICE_TYPE
  }
  if (!appId || !token) {
    return { success: false, message: '旧版鉴权：请填写豆包 TTS 的 APP ID 与 Access Token（火山「语音合成」控制台）。' }
  }

  const body = {
    app: { appid: appId, token, cluster },
    user: { uid: 'roy-workbench' },
    audio: {
      voice_type: voiceType,
      encoding: 'mp3',
      speed_ratio: 1.0,
      rate: 24000,
    },
    request: {
      reqid: randomUUID(),
      text: text.slice(0, 1024),
      text_type: 'plain',
      operation: 'query',
    },
  }

  const res = await fetch('https://openspeech.bytedance.com/api/v1/tts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer;${token}`,
    },
    body: JSON.stringify(body),
  })

  const json = (await res.json().catch(() => ({}))) as {
    code?: number
    message?: string
    data?: string
  }

  if (!res.ok || (typeof json.code === 'number' && json.code !== 3000 && json.code !== 0) || !json.data) {
    const msg = json.message || `HTTP ${res.status}`
    return { success: false, message: `豆包 TTS 失败：${msg}` }
  }

  return {
    success: true,
    message: 'ok',
    mimeType: 'audio/mpeg',
    audioBase64: json.data,
  }
}

/** 新版控制台：V3 HTTP Chunked 单向流式，Header 用 X-Api-Key */
async function synthesizeDoubaoApiKey(settings: VoiceTtsSettings, text: string): Promise<VoiceTtsSynthesizeResult> {
  const apiKey = settings.doubaoApiKey.trim()
  const resourceId = (settings.doubaoResourceId || DEFAULT_V3_RESOURCE_ID).trim()
  const { speaker, remappedFrom } = resolveDoubaoV3Speaker(settings)
  if (!apiKey) {
    return { success: false, message: '新版鉴权：请填写豆包 TTS 的 API Key（火山「语音技术」控制台 → API Key 管理）。' }
  }

  const res = await fetch('https://openspeech.bytedance.com/api/v3/tts/unidirectional', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': apiKey,
      'X-Api-Resource-Id': resourceId,
      'X-Api-Request-Id': randomUUID(),
    },
    body: JSON.stringify({
      user: { uid: 'roy-workbench' },
      req_params: {
        text: text.slice(0, 2000),
        speaker,
        audio_params: {
          format: 'mp3',
          sample_rate: 24000,
        },
      },
    }),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    return {
      success: false,
      message: formatV3MismatchMessage(resourceId, speaker, `HTTP ${res.status} ${errText.slice(0, 200)}`),
    }
  }

  const raw = await res.text()
  const chunks: Buffer[] = []
  let lastError = ''

  const pieces = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const tryParseObjects = (src: string): Array<Record<string, unknown>> => {
    const out: Array<Record<string, unknown>> = []
    let depth = 0
    let start = -1
    for (let i = 0; i < src.length; i++) {
      const ch = src[i]
      if (ch === '{') {
        if (depth === 0) start = i
        depth++
      } else if (ch === '}') {
        depth--
        if (depth === 0 && start >= 0) {
          try {
            out.push(JSON.parse(src.slice(start, i + 1)) as Record<string, unknown>)
          } catch {
            /* ignore partial */
          }
          start = -1
        }
      }
    }
    return out
  }

  const objects: Array<Record<string, unknown>> = []
  if (pieces.length > 0) {
    for (const line of pieces) {
      try {
        objects.push(JSON.parse(line) as Record<string, unknown>)
      } catch {
        objects.push(...tryParseObjects(line))
      }
    }
  } else {
    objects.push(...tryParseObjects(raw))
  }

  for (const obj of objects) {
    const code = typeof obj.code === 'number' ? obj.code : undefined
    const data = typeof obj.data === 'string' ? obj.data : ''
    if (data) {
      chunks.push(Buffer.from(data, 'base64'))
    }
    if (code !== undefined && code !== 0 && code !== 20000000) {
      lastError = typeof obj.message === 'string' ? obj.message : `code=${code}`
    }
  }

  if (chunks.length === 0) {
    const detail = lastError
      ? formatV3MismatchMessage(resourceId, speaker, lastError)
      : `豆包 TTS(V3) 未返回音频数据（Resource ID=${resourceId}，speaker=${speaker}${remappedFrom ? `，已从旧版音色「${remappedFrom}」自动映射` : ''}）`
    return { success: false, message: detail }
  }

  const okMsg = remappedFrom
    ? `ok（已将旧版音色「${remappedFrom}」映射为 V3「${speaker}」，建议在设置里改成 2.0 speaker）`
    : 'ok'

  return {
    success: true,
    message: okMsg,
    mimeType: 'audio/mpeg',
    audioBase64: Buffer.concat(chunks).toString('base64'),
  }
}

async function synthesizeDoubao(settings: VoiceTtsSettings, text: string): Promise<VoiceTtsSynthesizeResult> {
  if (settings.doubaoAuthMode === 'apiKey') {
    return synthesizeDoubaoApiKey(settings, text)
  }
  return synthesizeDoubaoLegacy(settings, text)
}

function hexToBase64(hex: string): string {
  const clean = hex.replace(/[^0-9a-fA-F]/g, '')
  return Buffer.from(clean, 'hex').toString('base64')
}

async function synthesizeMinimax(settings: VoiceTtsSettings, text: string): Promise<VoiceTtsSynthesizeResult> {
  const apiKey = settings.minimaxApiKey.trim()
  const groupId = settings.minimaxGroupId.trim()
  const voiceId = (settings.minimaxVoiceId || 'male-qn-qingse').trim()
  const model = (settings.minimaxModel || 'speech-02-hd').trim()
  if (!apiKey || !groupId) {
    return { success: false, message: '请填写 Minimax 的 API Key 与 Group ID' }
  }

  const url = `https://api.minimaxi.com/v1/t2a_v2?GroupId=${encodeURIComponent(groupId)}`
  const body = {
    model,
    text: text.slice(0, 2000),
    stream: false,
    voice_setting: {
      voice_id: voiceId,
      speed: 1,
      vol: 1,
      pitch: 0,
    },
    audio_setting: {
      sample_rate: 32000,
      bitrate: 128000,
      format: 'mp3',
      channel: 1,
    },
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })

  const json = (await res.json().catch(() => ({}))) as {
    base_resp?: { status_code?: number; status_msg?: string }
    data?: { audio?: string }
    audio_file?: string
  }

  const status = json.base_resp?.status_code
  const audioHexOrB64 = json.data?.audio || json.audio_file || ''
  if (!res.ok || (typeof status === 'number' && status !== 0) || !audioHexOrB64) {
    const msg = json.base_resp?.status_msg || `HTTP ${res.status}`
    return { success: false, message: `Minimax TTS 失败：${msg}` }
  }

  const looksHex = /^[0-9a-fA-F]+$/.test(audioHexOrB64) && audioHexOrB64.length % 2 === 0
  const audioBase64 = looksHex ? hexToBase64(audioHexOrB64) : audioHexOrB64

  return {
    success: true,
    message: 'ok',
    mimeType: 'audio/mpeg',
    audioBase64,
  }
}

export async function synthesizeVoiceTts(
  text: string,
  overrides?: Partial<VoiceTtsSettings>,
  opts?: { ignoreEnabled?: boolean },
): Promise<VoiceTtsSynthesizeResult> {
  const trimmed = String(text || '').trim()
  if (!trimmed) return { success: false, message: '没有可合成的文本' }

  const settings = mergeSettings(overrides)
  if (!opts?.ignoreEnabled && !settings.enabled) {
    return { success: false, message: '尚未开启语音合成。请到设置 → 语音输入 → 语音合成里打开。' }
  }

  if (settings.engine === 'system') {
    return {
      success: false,
      message: 'system',
      useBrowserSpeechSynthesis: true,
    }
  }

  if (settings.engine === 'doubao') return synthesizeDoubao(settings, trimmed)
  if (settings.engine === 'minimax') return synthesizeMinimax(settings, trimmed)
  return { success: false, message: `未知合成引擎：${settings.engine}` }
}

export async function testVoiceTtsConnection(
  overrides?: Partial<VoiceTtsSettings>,
): Promise<VoiceTtsTestResult> {
  const settings = mergeSettings(overrides)
  if (settings.engine === 'system') {
    return { success: true, message: '系统合成在本地 speechSynthesis 完成；打开「试听合成」可验证。' }
  }

  // 测试连接不要求用户已打开「启用」开关，但会用当前表单/已存凭证
  const result = await synthesizeVoiceTts('语音合成连接测试。', { ...settings, enabled: true }, { ignoreEnabled: true })
  if (result.useBrowserSpeechSynthesis) {
    return { success: true, message: result.message }
  }
  if (!result.success) return { success: false, message: result.message }
  const engineLabel = settings.engine === 'doubao' ? '豆包' : 'Minimax'
  const extra = result.message && result.message !== 'ok' ? `（${result.message}）` : ''
  return { success: true, message: `${engineLabel} TTS 连接成功，已收到音频${extra}` }
}