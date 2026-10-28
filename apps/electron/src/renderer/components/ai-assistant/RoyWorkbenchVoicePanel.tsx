/**
 * 助理语音区：识别（ASR）一块；其下「语音合成」可选接入。
 */
import * as React from 'react'
import { Mic, Volume2, VolumeX, Settings2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  loadTtsEnabled,
  saveTtsEnabled,
  speakWorkbenchTts,
  stopBrowserTts,
  loadWakeWord,
  saveWakeWord,
  loadWakeEnabled,
  saveWakeEnabled,
  DEFAULT_WAKE_WORD,
} from '@/lib/roy-workbench-prefs'

export function RoyWorkbenchVoicePanel({
  onOpenSettings,
}: {
  onOpenSettings?: () => void
}): React.ReactElement {
  const [asrEnabled, setAsrEnabled] = React.useState<boolean | null>(null)
  const [asrLoading, setAsrLoading] = React.useState(true)
  const [ttsOn, setTtsOn] = React.useState(() => loadTtsEnabled())
  const [ttsBusy, setTtsBusy] = React.useState(false)
  const [wakeOn, setWakeOn] = React.useState(() => loadWakeEnabled())
  const [wakeWord, setWakeWord] = React.useState(() => loadWakeWord())

  const refreshAsr = React.useCallback(async () => {
    setAsrLoading(true)
    try {
      const s = await window.electronAPI.getVoiceDictationSettings()
      setAsrEnabled(!!s.enabled)
    } catch {
      setAsrEnabled(null)
    } finally {
      setAsrLoading(false)
    }
  }, [])

  React.useEffect(() => { void refreshAsr() }, [refreshAsr])

  const openVoiceSettings = (): void => {
    onOpenSettings?.()
    toast.message('语音识别在「设置 → 语音输入」', {
      description: '打开总开关并授权麦克风后，对话区麦克风按钮即可听写。',
    })
  }

  const toggleAsrQuick = async (): Promise<void> => {
    try {
      const s = await window.electronAPI.getVoiceDictationSettings()
      const saved = await window.electronAPI.updateVoiceDictationSettings({ ...s, enabled: !s.enabled })
      setAsrEnabled(!!saved.enabled)
      toast.success(saved.enabled ? '已打开语音识别' : '已关闭语音识别')
      window.electronAPI.reregisterGlobalShortcuts().catch(console.error)
    } catch (e) {
      toast.error('无法切换语音识别', {
        description: e instanceof Error ? e.message : String(e),
      })
    }
  }

  const toggleTts = (on: boolean): void => {
    saveTtsEnabled(on)
    setTtsOn(on)
    if (!on) stopBrowserTts()
    // 只改开关，不覆盖设置里选好的引擎（豆包）
    void window.electronAPI.updateVoiceTtsSettings({ enabled: on }).catch((error) => {
      console.error('[语音合成] 同步设置失败:', error)
    })
    toast.success(on ? '已接入语音合成（引擎可在设置 → 语音输入里选豆包 / Minimax / 系统）' : '已关闭语音合成')
  }

  const testTts = async (): Promise<void> => {
    setTtsBusy(true)
    try {
      await speakWorkbenchTts('Roy 语音合成已接入，可以朗读回复。')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setTtsBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">语音识别</div>
        <div className="rounded-lg border border-border/70 bg-background/60 p-2.5">
          <div className="flex items-center gap-2 text-[12.5px]">
            <Mic size={14} className="text-primary/80" />
            <span className="flex-1">
              {asrLoading ? '读取中…' : asrEnabled === null ? '状态未知' : asrEnabled ? '已开启' : '未开启'}
            </span>
            {asrLoading ? <Loader2 size={13} className="animate-spin text-muted-foreground" /> : null}
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
            听写走设置里的语音输入。打开后：点球或说唤醒词进入聆听，再说指令。
          </p>
          <div className="mt-2 flex items-center gap-1.5 text-[11.5px]">
            <button
              type="button"
              role="switch"
              aria-checked={wakeOn}
              onClick={() => { const v = !wakeOn; setWakeOn(v); saveWakeEnabled(v) }}
              className={`h-7 rounded-md border px-2 ${wakeOn ? 'border-emerald-500/60 text-emerald-600' : 'border-border text-muted-foreground'}`}
            >
              {wakeOn ? '唤醒词：开' : '唤醒词：关'}
            </button>
            <input
              value={wakeWord}
              onChange={(e) => setWakeWord(e.target.value)}
              onBlur={() => { saveWakeWord(wakeWord); setWakeWord(loadWakeWord()) }}
              placeholder={DEFAULT_WAKE_WORD}
              className="h-7 min-w-0 flex-1 rounded-md border border-border bg-transparent px-2 outline-none"
              aria-label="唤醒词"
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button type="button" onClick={() => { void toggleAsrQuick() }} className="h-7 rounded-md border border-border px-2 text-[11.5px] hover:bg-muted/50">
              {asrEnabled ? '关闭识别' : '打开识别'}
            </button>
            <button type="button" onClick={openVoiceSettings} className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[11.5px] hover:bg-muted/50">
              <Settings2 size={11} />
              详细设置
            </button>
          </div>
        </div>
      </div>

      <div>
        <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">语音合成（可选）</div>
        <div className="rounded-lg border border-dashed border-border/80 bg-background/40 p-2.5">
          <div className="flex items-center gap-2 text-[12.5px]">
            {ttsOn ? <Volume2 size={14} className="text-emerald-500" /> : <VolumeX size={14} className="text-muted-foreground" />}
            <span className="flex-1">{ttsOn ? '已接入 · 可朗读' : '未接入'}</span>
            <button
              type="button"
              role="switch"
              aria-checked={ttsOn}
              onClick={() => toggleTts(!ttsOn)}
              className={`relative h-5 w-9 rounded-full transition ${ttsOn ? 'bg-emerald-500/90' : 'bg-muted'}`}
            >
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${ttsOn ? 'left-4' : 'left-0.5'}`} />
            </button>
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
            默认关闭。接入后按设置里的引擎（系统 / 豆包 / Minimax）朗读回复；未接入时只显示文字。唤醒短应答「在」用本机临时出声。
          </p>
          <button
            type="button"
            disabled={!ttsOn || ttsBusy}
            onClick={() => { void testTts() }}
            className="mt-2 h-7 rounded-md border border-border px-2 text-[11.5px] hover:bg-muted/50 disabled:opacity-40"
          >
            {ttsBusy ? '朗读中…' : '试听合成'}
          </button>
        </div>
      </div>
    </div>
  )
}