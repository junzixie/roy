/**
 * Workbench wake-word watcher via Web SpeechRecognition (no cloud wake engine).
 * Continuously listens for the configured wake phrase (default 小爱同学),
 * then invokes onWake. Pauses while command capture / TTS is active.
 */
import {
  loadWakeEnabled,
  loadWakeWord,
  utteranceContainsWakeWord,
  stripWakeWord,
} from '@/lib/roy-workbench-prefs'

type SpeechRec = any

export type WakeWatchHandlers = {
  onWake: (payload: { raw: string; command: string }) => void
  onError?: (message: string) => void
  onStatus?: (status: 'idle' | 'watching' | 'unsupported' | 'denied') => void
}

export type WakeWatchHandle = {
  start: () => void
  stop: () => void
  pause: () => void
  resume: () => void
  setWakeWord: (word: string) => void
  destroy: () => void
}

function getSpeechRecognitionCtor(): (new () => SpeechRec) | null {
  if (typeof window === 'undefined') return null
  const w = window as Window & {
    SpeechRecognition?: new () => SpeechRec
    webkitSpeechRecognition?: new () => SpeechRec
  }
  return w.SpeechRecognition || w.webkitSpeechRecognition || null
}

export function createWakeWatch(handlers: WakeWatchHandlers): WakeWatchHandle {
  const Ctor = getSpeechRecognitionCtor()
  let wakeWord = loadWakeWord()
  let rec: SpeechRec | null = null
  let wanted = false
  let paused = false
  let restartTimer: ReturnType<typeof setTimeout> | null = null
  let lastFireAt = 0

  const clearRestart = (): void => {
    if (restartTimer) {
      clearTimeout(restartTimer)
      restartTimer = null
    }
  }

  const stopRec = (): void => {
    clearRestart()
    if (!rec) return
    try { rec.onresult = null; rec.onerror = null; rec.onend = null } catch { /* ignore */ }
    try { rec.stop() } catch { /* ignore */ }
    try { rec.abort() } catch { /* ignore */ }
    rec = null
  }

  const scheduleRestart = (): void => {
    clearRestart()
    if (!wanted || paused) return
    restartTimer = setTimeout(() => {
      restartTimer = null
      begin()
    }, 420)
  }

  const begin = (): void => {
    if (!wanted || paused) return
    if (!loadWakeEnabled()) {
      handlers.onStatus?.('idle')
      return
    }
    if (!Ctor) {
      handlers.onStatus?.('unsupported')
      return
    }
    stopRec()
    const r = new Ctor()
    rec = r
    r.lang = 'zh-CN'
    r.continuous = true
    r.interimResults = true
    r.maxAlternatives = 1
    r.onresult = (event: any) => {
      let chunk = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i]
        if (!res?.[0]) continue
        chunk += res[0].transcript || ''
        if (!res.isFinal) continue
        const raw = String(chunk || res[0].transcript || '').trim()
        chunk = ''
        if (!utteranceContainsWakeWord(raw, wakeWord)) continue
        const now = Date.now()
        if (now - lastFireAt < 1600) continue
        lastFireAt = now
        const command = stripWakeWord(raw, wakeWord)
        paused = true
        stopRec()
        handlers.onWake({ raw, command })
      }
      // 等完整识别结果，避免只听到唤醒词就截断同一句后半条指令。
    }
    r.onerror = (ev: any) => {
      const err = String(ev.error || '')
      if (err === 'not-allowed' || err === 'service-not-allowed') {
        handlers.onStatus?.('denied')
        handlers.onError?.('麦克风权限被拒绝，无法监听唤醒词')
        wanted = false
        return
      }
      if (err === 'network' || err === 'audio-capture') {
        wanted = false
        stopRec()
        handlers.onStatus?.('unsupported')
        return
      }
      if (err === 'no-speech' || err === 'aborted') {
        scheduleRestart()
        return
      }
      scheduleRestart()
    }
    r.onend = () => {
      if (wanted && !paused) scheduleRestart()
    }
    try {
      r.start()
      handlers.onStatus?.('watching')
    } catch (e) {
      handlers.onError?.(e instanceof Error ? e.message : String(e))
      scheduleRestart()
    }
  }

  return {
    start() {
      wanted = true
      paused = false
      begin()
    },
    stop() {
      wanted = false
      paused = false
      stopRec()
      handlers.onStatus?.('idle')
    },
    pause() {
      paused = true
      stopRec()
    },
    resume() {
      if (!wanted) return
      paused = false
      begin()
    },
    setWakeWord(word: string) {
      wakeWord = String(word || '').trim() || loadWakeWord()
    },
    destroy() {
      wanted = false
      paused = false
      stopRec()
    },
  }
}
