/**
 * Roy workbench prefs: skin + optional TTS + wake word.
 * ASR stays under Settings > Voice Input; TTS off by default until user enables.
 */

export type RoyWorkbenchSkin = 'aurora' | 'aivy' | 'mineral' | 'ink'

export const ROY_WORKBENCH_SKINS: Array<{
  id: RoyWorkbenchSkin
  label: string
  hint: string
}> = [
  { id: 'aurora', label: '极光', hint: 'Roy 默认蓝青粒子' },
  { id: 'aivy', label: '艾微风', hint: '参考艾微玻璃青调（非商标复刻）' },
  { id: 'mineral', label: '矿物日调', hint: '偏日间矿物蓝 / 铜' },
  { id: 'ink', label: '墨核', hint: '深色高对比粒子' },
]

const SKIN_KEY = 'roy.workbench.skin'
const TTS_KEY = 'roy.voice.tts-enabled'
const WAKE_WORD_KEY = 'roy.voice.wake-word'
const WAKE_ENABLED_KEY = 'roy.voice.wake-enabled'
export const DEFAULT_WAKE_WORD = '罗伊'

export function loadWorkbenchSkin(): RoyWorkbenchSkin {
  try {
    const v = localStorage.getItem(SKIN_KEY)
    if (v === 'aivy' || v === 'mineral' || v === 'ink' || v === 'aurora') return v
  } catch { /* ignore */ }
  return 'aurora'
}

export function saveWorkbenchSkin(skin: RoyWorkbenchSkin): void {
  try { localStorage.setItem(SKIN_KEY, skin) } catch { /* ignore */ }
}

export function loadTtsEnabled(): boolean {
  try { return localStorage.getItem(TTS_KEY) === '1' } catch { return false }
}

export function saveTtsEnabled(on: boolean): void {
  try { localStorage.setItem(TTS_KEY, on ? '1' : '0') } catch { /* ignore */ }
}

export function loadWakeWord(): string {
  try {
    const v = (localStorage.getItem(WAKE_WORD_KEY) || '').trim()
    // 旧默认值「小爱同学」自动升级为「罗伊」
    if (!v || v === '小爱同学') return DEFAULT_WAKE_WORD
    return v
  } catch {
    return DEFAULT_WAKE_WORD
  }
}

export function saveWakeWord(word: string): void {
  try {
    const next = String(word || '').trim() || DEFAULT_WAKE_WORD
    localStorage.setItem(WAKE_WORD_KEY, next)
  } catch { /* ignore */ }
}

export function loadWakeEnabled(): boolean {
  try {
    const v = localStorage.getItem(WAKE_ENABLED_KEY)
    if (v === null) return true
    return v === '1'
  } catch {
    return true
  }
}

export function saveWakeEnabled(on: boolean): void {
  try { localStorage.setItem(WAKE_ENABLED_KEY, on ? '1' : '0') } catch { /* ignore */ }
}

export function utteranceContainsWakeWord(text: string, wakeWord = loadWakeWord()): boolean {
  const raw = String(text || '').replace(/\s+/g, '').toLowerCase()
  const key = String(wakeWord || DEFAULT_WAKE_WORD).replace(/\s+/g, '').toLowerCase()
  if (!raw || !key) return false
  return wakeAliases(key).some((k) => raw.includes(k))
}

/** 「罗伊」常被识别成同音字，一并当作唤醒词。 */
function wakeAliases(key: string): string[] {
  if (key === '罗伊' || key === 'roy') return ['罗伊', '洛伊', '罗一', '罗衣', '萝伊', '罗依', 'roy']
  return [key]
}

export function stripWakeWord(text: string, wakeWord = loadWakeWord()): string {
  const raw = String(text || '').trim()
  if (!raw) return ''
  const key = String(wakeWord || DEFAULT_WAKE_WORD).trim()
  if (!key) return raw
  const escaped = wakeAliases(key.toLowerCase()).map((k) => k.replace(/[^\w\u4e00-\u9fff]/g, (c) => '\\' + c)).join('|')
  const re = new RegExp('^\\s*(?:' + escaped + ')[\\s\\u3002\\uff0c\\uff01\\uff1f.,!?]*', 'i')
  return raw.replace(re, '').trim()
}

const TTS_ENGINE_KEY = 'roy.voice.tts-engine'
export type RoyTtsEngine = 'system' | 'doubao' | 'minimax'

export function loadTtsEngine(): RoyTtsEngine {
  try {
    const v = localStorage.getItem(TTS_ENGINE_KEY)
    if (v === 'doubao' || v === 'minimax' || v === 'system') return v
  } catch { /* ignore */ }
  return 'system'
}

export function saveTtsEngine(engine: RoyTtsEngine): void {
  try { localStorage.setItem(TTS_ENGINE_KEY, engine) } catch { /* ignore */ }
}

/** Mirror main-process voiceTts.enabled/engine into localStorage for sync UI. */
export function mirrorTtsPrefsFromMain(settings: { enabled?: boolean; engine?: string } | null | undefined): void {
  if (!settings) return
  if (typeof settings.enabled === 'boolean') saveTtsEnabled(settings.enabled)
  if (settings.engine === 'system' || settings.engine === 'doubao' || settings.engine === 'minimax') {
    saveTtsEngine(settings.engine)
  }
}

function speakWithBrowserTtsInternal(text: string): Promise<void> {
  const trimmed = String(text || '').trim()
  if (!trimmed) return Promise.resolve()
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined
  if (!synth) {
    return Promise.reject(new Error('本机不支持 speechSynthesis，无法朗读。'))
  }
  return new Promise((resolve, reject) => {
    stopBrowserTts()
    finishBrowserSpeech = resolve
    const u = new SpeechSynthesisUtterance(trimmed.slice(0, 800))
    u.lang = 'zh-CN'
    u.onend = () => { finishBrowserSpeech = null; resolve() }
    u.onerror = (e) => { finishBrowserSpeech = null; if (e.error === 'canceled' || e.error === 'interrupted') resolve(); else reject(new Error(`朗读失败：${e.error || 'unknown'}`)) }
    synth.speak(u)
  })
}

let currentAudio: HTMLAudioElement | null = null
let finishCurrentPlayback: (() => void) | null = null
let finishBrowserSpeech: (() => void) | null = null

function playBase64Audio(audioBase64: string, mimeType = 'audio/mpeg'): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      stopBrowserTts()
      const src = `data:${mimeType};base64,${audioBase64}`
      const audio = new Audio(src)
      currentAudio = audio
      finishCurrentPlayback = resolve
      audio.onended = () => {
        if (currentAudio === audio) currentAudio = null
        resolve()
      }
      audio.onerror = () => {
        if (currentAudio === audio) currentAudio = null
        reject(new Error('云端音频播放失败'))
      }
      void audio.play().catch((err) => {
        if (currentAudio === audio) currentAudio = null
        reject(err instanceof Error ? err : new Error(String(err)))
      })
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)))
    }
  })
}

/**
 * Speak via selected TTS engine.
 * force=true: short wake ack always uses本机 speechSynthesis（不耗云额度、低延迟）。
 * Without force and TTS off: reject so caller can toast guide.
 */
export function speakWithBrowserTts(text: string, opts?: { force?: boolean }): Promise<void> {
  const trimmed = String(text || '').trim()
  if (!trimmed) return Promise.resolve()
  if (!opts?.force && !loadTtsEnabled()) {
    return Promise.reject(new Error('尚未接入语音合成。请在设置 → 语音输入 → 语音合成中打开。'))
  }
  return speakWithBrowserTtsInternal(trimmed)
}

/**
 * 工具台/设置页统一播报入口：按所选引擎走系统 / 豆包 / Minimax。
 * force 短应答仍走本机合成。
 */
const ttsClipCache = new Map<string, { audioBase64: string; mimeType: string }>()

/**
 * 工作台播报：只要主进程选了云端引擎（豆包 / Minimax）就走云端，
 * 不再强制系统 speechSynthesis（那是“女性机器人声”的来源）。
 * 云端失败时才回退到系统语音。force=true 表示短应答，失败静默回退。
 */
/**
 * 先把一句话合成好，返回「播放」函数。工作台边生成边播报时，
 * 下一句在上一句播放期间就开始合成，句与句之间不再干等云端。
 */
export async function prepareWorkbenchTts(text: string, opts?: { force?: boolean; signal?: AbortSignal }): Promise<() => Promise<void>> {
  const noop = async (): Promise<void> => {}
  const cancelled = (): boolean => opts?.signal?.aborted === true
  const trimmed = String(text || '').trim()
  if (!trimmed || cancelled()) return noop
  const maxLen = opts?.force ? 80 : 800
  const spoken = trimmed.slice(0, maxLen)

  const api = typeof window !== 'undefined' ? window.electronAPI : undefined
  if (!api?.synthesizeVoiceTts || !api?.getVoiceTtsSettings) {
    if (!opts?.force && !loadTtsEnabled()) {
      throw new Error('尚未接入语音合成。请在设置 → 语音输入 → 语音合成中打开，并选择引擎。')
    }
    return () => speakWithBrowserTtsInternal(spoken)
  }

  const settings = await api.getVoiceTtsSettings()
  if (cancelled()) return noop
  mirrorTtsPrefsFromMain(settings)
  const cloud = settings.engine === 'doubao' || settings.engine === 'minimax'

  if (!cloud) {
    if (!opts?.force && !settings.enabled) {
      throw new Error('尚未接入语音合成。请在设置 → 语音输入 → 语音合成中打开，并选择豆包引擎。')
    }
    return () => speakWithBrowserTtsInternal(spoken)
  }

  const key = `${settings.engine}|${settings.doubaoSpeaker}|${spoken}`
  let clip = ttsClipCache.get(key)
  if (!clip) {
    // 选了云端引擎即视为启用，工作台不再要求另开「启用」开关
    const result = await api.synthesizeVoiceTts({ text: spoken, updates: { enabled: true } })
    if (cancelled()) return noop
    if (!result.success || !result.audioBase64) {
      console.warn('[语音合成] 云端失败，回退系统语音:', result.message)
      return async () => {
        await speakWithBrowserTtsInternal(spoken)
        if (!opts?.force) throw new Error(`${result.message || '云端语音合成失败'}（已用系统语音朗读）`)
      }
    }
    clip = { audioBase64: result.audioBase64, mimeType: result.mimeType || 'audio/mpeg' }
    if (trimmed.length <= 20) ttsClipCache.set(key, clip)
  }
  const ready = clip
  return () => playBase64Audio(ready.audioBase64, ready.mimeType)
}

/** 合成并立即播放（打断时停止播放）。 */
export async function speakWorkbenchTts(text: string, opts?: { force?: boolean; signal?: AbortSignal }): Promise<void> {
  const play = await prepareWorkbenchTts(text, opts)
  await playPrepared(play, opts?.signal)
}

/** 播放已合成好的一句；signal 取消时立即停声。 */
export async function playPrepared(play: () => Promise<void>, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return
  const abortPlayback = (): void => stopBrowserTts()
  signal?.addEventListener('abort', abortPlayback, { once: true })
  try { await play() } finally { signal?.removeEventListener('abort', abortPlayback) }
}

/** 预热短应答，点球 / 唤醒时秒出声。 */
export function prefetchWorkbenchAcks(phrases: string[]): void {
  void (async () => {
    try {
      const api = window.electronAPI
      const settings = await api.getVoiceTtsSettings()
      if (settings.engine !== 'doubao' && settings.engine !== 'minimax') return
      for (const p of phrases) {
        const key = `${settings.engine}|${settings.doubaoSpeaker}|${p}`
        if (ttsClipCache.has(key)) continue
        const r = await api.synthesizeVoiceTts({ text: p, updates: { enabled: true } })
        if (r.success && r.audioBase64) ttsClipCache.set(key, { audioBase64: r.audioBase64, mimeType: r.mimeType || 'audio/mpeg' })
      }
    } catch { /* ignore */ }
  })()
}

export function stopBrowserTts(): void {
  const done = finishCurrentPlayback; finishCurrentPlayback = null; done?.()
  const doneSpeech = finishBrowserSpeech; finishBrowserSpeech = null; doneSpeech?.()
  try { window.speechSynthesis?.cancel() } catch { /* ignore */ }
  try {
    if (currentAudio) {
      currentAudio.pause()
      currentAudio.src = ''
      currentAudio = null
    }
  } catch { /* ignore */ }
}
/** Sidebar AI workbench title; hide same-named session from project tree */
export const AI_ASSISTANT_SESSION_TITLE = 'AI 工具台'
export const AI_ASSISTANT_SESSION_TITLE_LEGACY = 'AI 助理'
export const WORKBENCH_MODE_KEY = 'roy.ai-assistant.workbench-mode'
export const AI_ASSISTANT_SESSION_ID_KEY = 'roy.ai-assistant.session-id'
export const OPEN_AI_ASSISTANT_EVENT = 'roy:open-ai-assistant'

export type WorkbenchMode = 'stage' | 'session'

export function loadWorkbenchMode(): WorkbenchMode {
  try {
    return localStorage.getItem(WORKBENCH_MODE_KEY) === 'session' ? 'session' : 'stage'
  } catch {
    return 'stage'
  }
}

export function saveWorkbenchMode(mode: WorkbenchMode): void {
  try { localStorage.setItem(WORKBENCH_MODE_KEY, mode) } catch { /* ignore */ }
}

export function requestOpenAiAssistantWorkbench(opts?: { mode?: WorkbenchMode }): void {
  const mode = opts?.mode ?? 'stage'
  saveWorkbenchMode(mode)
  try {
    window.dispatchEvent(new CustomEvent(OPEN_AI_ASSISTANT_EVENT, { detail: { mode } }))
  } catch { /* ignore */ }
}

export function isAiAssistantSession(meta: { id?: string; title?: string | null } | null | undefined): boolean {
  if (!meta) return false
  const title = (meta.title || '').trim()
  if (title === AI_ASSISTANT_SESSION_TITLE || title === AI_ASSISTANT_SESSION_TITLE_LEGACY) return true
  try {
    const remembered = localStorage.getItem(AI_ASSISTANT_SESSION_ID_KEY)
    return !!remembered && remembered === meta.id
  } catch {
    return false
  }
}

/** Parse "create task under default project" intent from natural language. */
export function parseCreateTaskIntent(text: string): { name: string; raw: string } | null {
  const raw = String(text || '').trim()
  if (!raw) return null

  const en = raw.match(/(?:create|new|start)\s+(?:a\s+)?(?:task|session|chat)(?:\s+(?:called|named|for)?\s*["']?([^"'\n]{1,48})["']?)?/i)
  if (en) return { name: (en[1] || '').trim(), raw }

  const taskHit = /(?:创建|新建|建立|建一个|建个|开一个|开个|做一个|做个|新开)(?:一个|个)?(?:新的|新)?(?:任务|会话|对话)|(?:创建|新建|建立).{0,8}(?:任务|会话)/.test(raw)
  const projectAsTaskHit = /(?:创建|新建|建立|建一个|建个|开一个|开个|做一个|做个|做一?个)(?:一个|个)?(?:新的|新)?项目|(?:创建|新建|建立).{0,10}项目|我想(?:要)?(?:创建|新建|开)(?:一个|个)?(?:新的|新)?项目/.test(raw)
  if (!taskHit && !projectAsTaskHit) return null

  let name = ''
  const named = raw.match(/(?:任务|会话|项目)\s*(?:叫|名为|名字是|名称是)\s*[「"'《]?([^」"'》\n，,]{1,48})/)
  if (named) name = (named[1] ?? '').trim()

  if (!name) {
    const after = raw.split(/[，,：:]/).slice(1).join('，').trim()
    if (after) {
      const m2 = after.match(/^(?:做一个|做个|做|关于|用来|用于)?\s*[「"'《]?([^」"'》\n]{1,48})/)
      if (m2) name = (m2[1] ?? '').trim()
    }
  }

  if (!name) {
    const tail = raw.match(/(?:任务|会话|项目)\s*[「"'《]?([\u4e00-\u9fffA-Za-z0-9_\-]{1,48})/)
    if (tail) {
      const cand = (tail[1] ?? '').trim()
      if (!/^(?:叫|名为|名字|名称|吧|啊|呢|吗|嘛)$/.test(cand)) name = cand
    }
  }

  name = name.replace(/^(?:是|做|用来|用于|关于)\s*/u, '').replace(/[。.!！？?]+$/u, '').trim()
  if (!name || name === '新' || name === '一个' || name === '新的') name = ''
  return { name, raw }
}

/** @deprecated alias — now always create task under default project */
export function parseCreateProjectIntent(text: string): { name: string; raw: string } | null {
  return parseCreateTaskIntent(text)
}
