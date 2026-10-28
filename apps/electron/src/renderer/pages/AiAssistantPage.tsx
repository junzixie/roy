/**
 * 罗伊语音与行动助手：默认模型连续交流，分句播报，点击打断。
 * 操作留在球体页，权限与交互请求在页内明确确认。
 */

import * as React from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { ArrowLeft, ExternalLink, Loader2, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import {
  agentChannelIdAtom,
  agentModelIdAtom,
  agentSessionsAtom,
  agentWorkspacesAtom,
  currentAgentWorkspaceIdAtom,
} from '@/atoms/agent-atoms'
import { channelsAtom } from '@/atoms/chat-atoms'
import { activeViewAtom } from '@/atoms/active-view'
import { useOpenSession } from '@/hooks/useOpenSession'
import { RoyWorkbenchStage, type WorkbenchChip, type RoyOrbState } from '@/components/ai-assistant'
import {
  loadWorkbenchSkin,
  saveWorkbenchSkin,
  loadWorkbenchMode,
  saveWorkbenchMode,
  AI_ASSISTANT_SESSION_TITLE,
  AI_ASSISTANT_SESSION_ID_KEY,
  OPEN_AI_ASSISTANT_EVENT,
  loadWakeWord,
  loadWakeEnabled,
  prefetchWorkbenchAcks,
  speakWorkbenchTts,
  prepareWorkbenchTts,
  playPrepared,
  stopBrowserTts,
  type RoyWorkbenchSkin,
  type WorkbenchMode,
} from '@/lib/roy-workbench-prefs'
import { createWakeWatch, type WakeWatchHandle } from '@/components/ai-assistant/workbenchWakeWatch'
import { settingsOpenAtom, settingsTabAtom } from '@/atoms/settings-tab'
import {
  setLastFocusedVoiceInputId,
  VOICE_DICTATION_INSERT_EVENT,
  VOICE_DICTATION_STATUS_EVENT,
  isVoiceDictationTargetInput,
} from '@/lib/voice-input-focus'
import type { AgentSessionMeta, SDKAssistantMessage } from '@roy/shared'
import { PermissionBanner } from '@/components/agent/PermissionBanner'
import { AskUserBanner } from '@/components/agent/AskUserBanner'
import { ExitPlanModeBanner } from '@/components/agent/ExitPlanModeBanner'
import { allPendingPermissionRequestsAtom, allPendingAskUserRequestsAtom, allPendingExitPlanRequestsAtom } from '@/atoms/agent-atoms'
import { VoiceReplyQueue, takeSpeechChunks, cleanSpokenText, isSocialConversation } from '@/components/ai-assistant/voiceConversation'

const WORKBENCH_VOICE_INPUT_ID = 'roy-ai-workbench-command'
/** 按住空格说话：不做停顿自动提交，松开空格才提交 */
const WORKBENCH_PTT_INPUT_ID = 'roy-ai-workbench-ptt'
/** 操作类请求的即时应答 */
const ACTION_ACK = '好，我来办。'
/** 固定短句：走缓存秒出声 */
const ACK_PHRASES = new Set(['在。', '好的，再见。', ACTION_ACK])
const isWorkbenchVoiceSource = (id: string | null | undefined): boolean => id === WORKBENCH_VOICE_INPUT_ID || id === WORKBENCH_PTT_INPUT_ID

const ASSISTANT_TITLE = AI_ASSISTANT_SESSION_TITLE
const SESSION_ID_KEY = AI_ASSISTANT_SESSION_ID_KEY

const AgentView = React.lazy(() =>
  import('@/components/agent').then((m) => ({ default: m.AgentView })),
)

type Mode = WorkbenchMode

export function AiAssistantPage(): React.ReactElement {
  const [session, setSession] = React.useState<AgentSessionMeta | null>(null)
  const [booting, setBooting] = React.useState(true)
  const [bootError, setBootError] = React.useState<string | null>(null)
  const [mode, setMode] = React.useState<Mode>(() => loadWorkbenchMode())
  const [skin, setSkin] = React.useState<RoyWorkbenchSkin>(() => loadWorkbenchSkin())
  const setSettingsOpen = useSetAtom(settingsOpenAtom)
  const setSettingsTab = useSetAtom(settingsTabAtom)

  const handleSkinChange = React.useCallback((next: RoyWorkbenchSkin) => {
    setSkin(next)
    saveWorkbenchSkin(next)
  }, [])

  const openVoiceSettings = React.useCallback(() => {
    setSettingsTab('voice-input')
    setSettingsOpen(true)
  }, [setSettingsOpen, setSettingsTab])

  const channels = useAtomValue(channelsAtom)
  const agentChannelId = useAtomValue(agentChannelIdAtom)
  const agentModelId = useAtomValue(agentModelIdAtom)
  const workspaces = useAtomValue(agentWorkspacesAtom)
  const [agentSessions, setAgentSessions] = useAtom(agentSessionsAtom)
  const currentWorkspaceId = useAtomValue(currentAgentWorkspaceIdAtom)
  const setCurrentWorkspaceId = useSetAtom(currentAgentWorkspaceIdAtom)
  const setActiveView = useSetAtom(activeViewAtom)
  const openSession = useOpenSession()

  const agentSessionsRef = React.useRef(agentSessions)
  agentSessionsRef.current = agentSessions
  const currentWorkspaceIdRef = React.useRef(currentWorkspaceId)
  currentWorkspaceIdRef.current = currentWorkspaceId

  const hasAvailableModel = React.useMemo(
    () => channels.some((channel) => channel.enabled && channel.models.some((model) => model.enabled)),
    [channels],
  )

  const modelLabel = React.useMemo(() => {
    const ch = channels.find((c) => c.id === agentChannelId)
    if (!ch) return null
    const m = ch.models.find((x) => x.id === agentModelId) ?? ch.models.find((x) => x.enabled)
    return m ? `${ch.name} · ${m.name}` : ch.name
  }, [agentChannelId, agentModelId, channels])

  const workspaceName = React.useMemo(
    () => workspaces.find((w) => w.id === currentWorkspaceId)?.name ?? null,
    [currentWorkspaceId, workspaces],
  )

  const persistMode = React.useCallback((next: Mode) => {
    setMode(next)
    saveWorkbenchMode(next)
  }, [])

  // 侧栏再次点「AI 工具台」时强制回舞台（即使本页已挂载）
  React.useEffect(() => {
    const onOpen = (event: Event): void => {
      const detail = (event as CustomEvent<{ mode?: WorkbenchMode }>).detail
      persistMode(detail?.mode === 'session' ? 'session' : 'stage')
    }
    window.addEventListener(OPEN_AI_ASSISTANT_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_AI_ASSISTANT_EVENT, onOpen)
  }, [persistMode])

  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!agentChannelId || !hasAvailableModel) {
        setBooting(false)
        setBootError(
          !agentChannelId
            ? '还没有选择模型渠道。请先到设置 → 模型渠道里配置并启用一个模型。'
            : '当前没有可用模型。请在设置 → 模型渠道中启用至少一个模型。',
        )
        return
      }
      setBooting(true)
      setBootError(null)
      try {
        const remembered = localStorage.getItem(SESSION_ID_KEY)
        const listedLocal = agentSessionsRef.current
        let meta =
          (remembered ? listedLocal.find((item) => item.id === remembered) : undefined)
          || listedLocal.find((item) => item.title === ASSISTANT_TITLE)

        if (!meta) {
          const listed = await window.electronAPI.listAgentSessions()
          meta =
            (remembered ? listed.find((item) => item.id === remembered) : undefined)
            || listed.find((item) => item.title === ASSISTANT_TITLE)
          if (meta) {
            setAgentSessions((prev) => (prev.some((item) => item.id === meta!.id) ? prev : [meta!, ...prev]))
          }
        }

        if (!meta) {
          meta = await window.electronAPI.createAgentSession(
            ASSISTANT_TITLE,
            agentChannelId,
            currentWorkspaceIdRef.current ?? undefined,
            agentModelId ?? undefined,
            false,
          )
          setAgentSessions((prev) => [meta!, ...prev.filter((item) => item.id !== meta!.id)])
        }

        if (cancelled || !meta) return
        localStorage.setItem(SESSION_ID_KEY, meta.id)
        setSession(meta)
        await window.electronAPI.setVisibleAgentStreamSession(meta.id)
      } catch (error) {
        if (!cancelled) {
          setBootError(error instanceof Error ? error.message : String(error))
        }
      } finally {
        if (!cancelled) setBooting(false)
      }
    })()
    return () => { cancelled = true }
  }, [agentChannelId, agentModelId, hasAvailableModel, setAgentSessions])

  const openFullSession = React.useCallback((): void => {
    if (!session) return
    openSession('agent', session.id, session.title || ASSISTANT_TITLE)
    setActiveView('conversations')
  }, [openSession, session, setActiveView])


  type Exchange = { id: number; role: 'user' | 'assistant'; text: string }
  const [history, setHistory] = React.useState<Exchange[]>([])
  const [voiceTalkActive, setVoiceTalkActive] = React.useState(false)
  const [awake, setAwake] = React.useState(false)
  const [conversationActive, setConversationActive] = React.useState(false)
  const [voiceBusy, setVoiceBusy] = React.useState(false)
  const [speaking, setSpeaking] = React.useState(false)
  const [activity, setActivity] = React.useState('')
  const [lastReply, setLastReply] = React.useState('')
  const [wakeWatchStatus, setWakeWatchStatus] = React.useState<'idle' | 'watching' | 'unsupported' | 'denied'>('idle')
  const [wakeWordLabel, setWakeWordLabel] = React.useState(loadWakeWord)
  const wakeWatchRef = React.useRef<WakeWatchHandle | null>(null)
  const listeningRef = React.useRef(false)
  const acceptCaptureRef = React.useRef(false)
  const listenStartingRef = React.useRef(false)
  const convoRef = React.useRef(false)
  const activeRef = React.useRef(false)
  const pendingRunRef = React.useRef<Promise<void> | null>(null)
  const speechBufferRef = React.useRef('')
  /** 本轮还没开口：第一句遇到逗号就先说出来 */
  const firstSpeechRef = React.useRef(true)
  const streamedTextRef = React.useRef('')
  const turnTextRef = React.useRef(new Map<string, string>())
  const sequenceRef = React.useRef(0)
  const runStartedAtRef = React.useRef(0)
  const runGenerationRef = React.useRef<number | undefined>()
  const continueListenRef = React.useRef<(ack?: boolean) => Promise<void>>(async () => {})
  const sendRef = React.useRef<(text: string) => Promise<void>>(async () => {})
  const interruptRef = React.useRef<(listen?: boolean) => Promise<void>>(async () => {})
  const mutedRef = React.useRef(false)
  const [muted, setMuted] = React.useState(false)
  const [stopping, setStopping] = React.useState(false)
  const stoppingRef = React.useRef(false)
  const idleTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const resumeTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const errorsShownRef = React.useRef(false)
  const permissions = useAtomValue(allPendingPermissionRequestsAtom)
  const questions = useAtomValue(allPendingAskUserRequestsAtom)
  const plans = useAtomValue(allPendingExitPlanRequestsAtom)
  const needsConfirmation = !!session && ((permissions.get(session.id)?.length ?? 0) > 0 || (questions.get(session.id)?.length ?? 0) > 0 || (plans.get(session.id)?.length ?? 0) > 0)
  const queueRef = React.useRef<VoiceReplyQueue | null>(null)
  if (!queueRef.current) queueRef.current = new VoiceReplyQueue(
    // 入队即合成、按顺序播放：边生成边说，句与句之间不等云端
    async (text, signal) => mutedRef.current ? async () => {} : prepareWorkbenchTts(text, { signal, force: ACK_PHRASES.has(text) }),
    (ready, signal) => playPrepared(ready, signal),
    setSpeaking,
    (error) => { if (!errorsShownRef.current) { errorsShownRef.current = true; toast.error(error instanceof Error ? error.message : String(error)) } },
  )

  const clearIdle = React.useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    idleTimerRef.current = null
  }, [])
  const pauseWake = React.useCallback(() => { wakeWatchRef.current?.pause() }, [])
  const endConversation = React.useCallback(() => {
    convoRef.current = false; setConversationActive(false)
    setAwake(false)
    if (!activeRef.current && !listeningRef.current) wakeWatchRef.current?.resume()
  }, [])

  const listenSourceRef = React.useRef(WORKBENCH_VOICE_INPUT_ID)
  const startListening = React.useCallback(async (ack = false, sourceInputId = WORKBENCH_VOICE_INPUT_ID): Promise<void> => {
    if (listenStartingRef.current || listeningRef.current || activeRef.current || stoppingRef.current) return
    listenStartingRef.current = true
    pauseWake()
    try {
      if (pendingRunRef.current) await pendingRunRef.current.catch(() => {})
      if (activeRef.current || stoppingRef.current) return
      const settings = await window.electronAPI.getVoiceDictationSettings()
      if (!settings.enabled) { endConversation(); openVoiceSettings(); toast.info('请先启用语音识别'); return }
      const token = sequenceRef.current
      convoRef.current = true; setConversationActive(true)
      setAwake(true)
      if (ack) {
        queueRef.current?.push('在。')
        await queueRef.current?.drain()
      }
      if (token !== sequenceRef.current || !convoRef.current) return
      acceptCaptureRef.current = true
      listenSourceRef.current = sourceInputId
      setLastFocusedVoiceInputId(sourceInputId)
      await window.electronAPI.toggleVoiceDictation({ sourceInputId })
      listeningRef.current = true
      setVoiceTalkActive(true)
    } catch (error) {
      endConversation()
      toast.error('无法打开麦克风', { description: String(error) })
    } finally { listenStartingRef.current = false }
  }, [endConversation, openVoiceSettings, pauseWake])
  continueListenRef.current = (ack = false) => startListening(ack)

  const interrupt = React.useCallback(async (listen = true): Promise<void> => {
    if (stoppingRef.current) return
    stoppingRef.current = true
    setStopping(true)
    sequenceRef.current += 1
    clearIdle()
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current)
    const wasRunning = activeRef.current
    setHistory(prev => prev.map(item => item.id === (sequenceRef.current - 1) * 2 + 1 && !item.text ? { ...item, text: '已打断；已执行操作不会自动撤销。' } : item))
    activeRef.current = false
    queueRef.current?.cancel()
    stopBrowserTts()
    setVoiceBusy(false)
    speechBufferRef.current = ''
    pauseWake()
    try {
      if (wasRunning && session) {
        setActivity('正在停止后续操作…已完成操作不会自动撤销')
        await window.electronAPI.stopAgent(session.id)
        const prior = pendingRunRef.current
        if (prior) {
          let timer: ReturnType<typeof setTimeout> | undefined
          try {
            await Promise.race([prior.catch(() => {}), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('旧任务仍在收尾，请稍候，不会重放已执行操作')), 15000) })])
          } finally { if (timer) clearTimeout(timer) }
        }
      }
      setActivity(wasRunning ? '已停止后续操作；已执行的操作未撤销' : '已打断回答')
    } catch (error) {
      setActivity('停止失败，请先确认当前任务状态')
      toast.error(String(error))
      listen = false
    } finally { stoppingRef.current = false; setStopping(false) }
    if (listen) { convoRef.current = true; setConversationActive(true); await continueListenRef.current() }
    else endConversation()
  }, [clearIdle, endConversation, pauseWake, session])
  interruptRef.current = interrupt

  const submit = React.useCallback(async (text: string): Promise<void> => {
    const trimmed = text.trim()
    if (!trimmed || stoppingRef.current) return
    if (pendingRunRef.current && !activeRef.current) { toast.info('上一轮仍在收尾，请稍候'); return }
    if (!session || !agentChannelId || !hasAvailableModel) { toast.error('助手尚未就绪'); return }
    // 等旧运行彻底停止后才开始下一次，拒绝旧轮次迟到事件。
    if (activeRef.current || speaking) await interrupt(false)
    if (pendingRunRef.current) { toast.info('上一轮尚未结束，暂不重开任务'); return }
    if (listeningRef.current) {
      toast.info('正在聆听，请先点球提交语音，或结束交流后输入文字')
      return
    }
    pauseWake()
    const token = ++sequenceRef.current
    errorsShownRef.current = false
    queueRef.current?.cancel()
    stopBrowserTts()
    speechBufferRef.current = ''
    firstSpeechRef.current = true
    streamedTextRef.current = ''
    turnTextRef.current.clear()
    runGenerationRef.current = undefined
    runStartedAtRef.current = Date.now()
    setHistory(prev => [...prev.slice(-18), { id: token * 2, role: 'user', text: trimmed }, { id: token * 2 + 1, role: 'assistant', text: '' }])
    setLastReply('')
    setActivity(isSocialConversation(trimmed) ? '正在理解你的话…' : '正在理解指令，按需调用工具…')
    setVoiceBusy(true)
    setAwake(false)
    activeRef.current = true
    clearIdle()
    idleTimerRef.current = setTimeout(() => {
      if (token !== sequenceRef.current || !activeRef.current) return
      setActivity('这次处理较久，可点球打断；不会自动重复执行')
    }, 45000)
    const assistantMode = isSocialConversation(trimmed) ? 'conversation' : 'action'
    // 要动手的事先应一声，像真人一样「好，我来」，不让人对着「正在理解」干等
    if (assistantMode === 'action') {
      firstSpeechRef.current = false
      queueRef.current?.push(ACTION_ACK)
    }
    try {
      await window.electronAPI.updateSessionPermissionMode(session.id, 'ask')
      if (token !== sequenceRef.current) return
      const run = window.electronAPI.sendAgentMessage({
        sessionId: session.id,
        userMessage: trimmed,
        rawUserMessage: trimmed,
        channelId: agentChannelId,
        modelId: agentModelId || undefined,
        workspaceId: currentWorkspaceId || undefined,
        permissionModeOverride: 'ask',
        assistantMode,
        startedAt: runStartedAtRef.current,
        triggeredBy: 'user',
      })
      pendingRunRef.current = run
      try { await run } finally { if (pendingRunRef.current === run) pendingRunRef.current = null }
    } catch (error) {
      if (token !== sequenceRef.current) return
      activeRef.current = false
      setVoiceBusy(false)
      clearIdle()
      setActivity(`发送失败：${String(error)}`)
      endConversation()
    }
  }, [agentChannelId, agentModelId, clearIdle, currentWorkspaceId, endConversation, hasAvailableModel, interrupt, pauseWake, session, speaking])
  sendRef.current = submit

  const toggleVoiceTalk = React.useCallback(() => {
    if (stoppingRef.current) return
    if (activeRef.current || speaking || listenStartingRef.current) { void interrupt(); return }
    if (listeningRef.current) {
      // 聆听时点击：提交刚说完的话，而不是结束整个对话。
      void window.electronAPI.toggleVoiceDictation({ sourceInputId: listenSourceRef.current }).catch(error => toast.error(String(error)))
      return
    }
    void startListening(true)
  }, [interrupt, speaking, startListening])

  // 按住空格说话：按下打断当前回答并开始听，松开提交；不会在回答后自动接着听
  const speakingRef = React.useRef(false)
  speakingRef.current = speaking
  React.useEffect(() => {
    if (mode !== 'stage') return
    let hold: Promise<void> | null = null
    const typing = (target: EventTarget | null): boolean =>
      target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
    const onDown = (event: KeyboardEvent): void => {
      if (event.code !== 'Space' || event.ctrlKey || event.altKey || event.metaKey || typing(event.target)) return
      event.preventDefault()
      if (event.repeat || hold || stoppingRef.current) return
      hold = (async () => {
        if (activeRef.current || speakingRef.current) await interruptRef.current(false)
        await startListening(false, WORKBENCH_PTT_INPUT_ID)
      })()
    }
    const onUp = (event: KeyboardEvent): void => {
      if (event.code !== 'Space' || !hold) return
      event.preventDefault()
      const started = hold
      hold = null
      void started.then(() => {
        convoRef.current = false; setConversationActive(false)
        if (listeningRef.current) return window.electronAPI.toggleVoiceDictation({ sourceInputId: WORKBENCH_PTT_INPUT_ID })
      }).catch(error => toast.error(String(error)))
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => { window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp) }
  }, [mode, startListening])

  React.useEffect(() => {
    const onStatus = (event: Event): void => {
      const d = (event as CustomEvent<{ status?: string; sourceId?: string | null; message?: string }>).detail
      if (!d || (d.sourceId && !isWorkbenchVoiceSource(d.sourceId))) return
      const wasListening = listeningRef.current
      const listening = d.status === 'connecting' || d.status === 'recording' || d.status === 'stopping'
      listeningRef.current = listening
      setVoiceTalkActive(listening)
      if (d.status === 'error') { setActivity(d.message || '语音识别出错'); endConversation() }
      else if (wasListening && !listening && !activeRef.current && convoRef.current) {
        if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current)
        const token = sequenceRef.current
        resumeTimerRef.current = setTimeout(() => {
          if (token === sequenceRef.current && !activeRef.current && !listeningRef.current) endConversation()
        }, 1800)
      }
    }
    const onInsert = (event: Event): void => {
      const d = (event as CustomEvent<{ text?: string; targetInputId?: string | null }>).detail
      if (!d?.text || !(isVoiceDictationTargetInput(WORKBENCH_VOICE_INPUT_ID, d.targetInputId) || isVoiceDictationTargetInput(WORKBENCH_PTT_INPUT_ID, d.targetInputId))) return
      event.preventDefault()
      if (!acceptCaptureRef.current) return
      acceptCaptureRef.current = false
      listeningRef.current = false
      setVoiceTalkActive(false)
      const text = d.text.trim()
      if (/^(再见|拜拜|退下|结束对话|不用了|没事了)[\s，。！？,.!?]*$/.test(text)) {
        convoRef.current = false; setConversationActive(false)
        setAwake(false)
        pauseWake()
        queueRef.current?.push('好的，再见。')
        void queueRef.current?.drain().then(() => wakeWatchRef.current?.resume())
        return
      }
      void sendRef.current(text)
    }
    window.addEventListener(VOICE_DICTATION_STATUS_EVENT, onStatus)
    window.addEventListener(VOICE_DICTATION_INSERT_EVENT, onInsert)
    return () => { window.removeEventListener(VOICE_DICTATION_STATUS_EVENT, onStatus); window.removeEventListener(VOICE_DICTATION_INSERT_EVENT, onInsert) }
  }, [endConversation, pauseWake])

  React.useEffect(() => {
    if (!session) return
    const flushSpeech = (flush = false): void => {
      const next = takeSpeechChunks(speechBufferRef.current, flush, firstSpeechRef.current)
      speechBufferRef.current = next.rest
      if (next.chunks.length) firstSpeechRef.current = false
      next.chunks.forEach(text => queueRef.current?.push(text))
    }
    const updateText = (text: string): void => {
      if (!text) return
      streamedTextRef.current += text
      speechBufferRef.current += text
      setLastReply(cleanSpokenText(streamedTextRef.current))
      const id = sequenceRef.current * 2 + 1
      setHistory(prev => prev.map(item => item.id === id ? { ...item, text: streamedTextRef.current } : item))
      flushSpeech()
    }
    const unsub = window.electronAPI.onAgentStreamEvent(data => {
      if (data.sessionId !== session.id || !activeRef.current) return
      const p = data.payload
      if (p.kind === 'roy_event') {
        if (p.event.type === 'run_started') {
          if (p.event.startedAt < runStartedAtRef.current) return
          runGenerationRef.current = p.event.runGeneration
        }
        if (p.event.type === 'permission_request' || p.event.type === 'ask_user_request' || p.event.type === 'exit_plan_mode_request') setActivity('等待你确认，请查看操作卡片')
        if (p.event.type === 'permission_resolved' || p.event.type === 'ask_user_resolved' || p.event.type === 'exit_plan_mode_resolved') setActivity('已收到确认，继续处理…')
        if (p.event.type === 'retry') setActivity('连接暂时不稳，正在重试；可点球停止')
        return
      }
      if (p.kind === 'sdk_delta') {
        const d = p.delta
        if (d.runGeneration != null && runGenerationRef.current != null && d.runGeneration !== runGenerationRef.current) return
        if (d.runStartedAt != null && d.runStartedAt < runStartedAtRef.current) return
        for (const item of d.deltas) {
          if (item.type === 'text_delta') {
            const key = `${d.uuid}:${item.contentIndex}`
            turnTextRef.current.set(key, (turnTextRef.current.get(key) || '') + item.delta)
            updateText(item.delta)
          } else if (item.type === 'toolcall_start' || item.type === 'toolcall_end') {
            if (item.toolCall) setActivity(`正在操作：${item.toolCall.name}`)
          } else if (item.type === 'thinking_start') setActivity('正在理解与规划…可点击球打断')
          // thinking_delta 从不进入文本或语音。
        }
      } else if (runGenerationRef.current != null && p.kind === 'sdk_message' && p.message.type === 'assistant' && !p.message.isReplay && !p.message.parent_tool_use_id) {
        const message = p.message as SDKAssistantMessage
        for (const [index, block] of message.message.content.entries()) {
          if (block.type === 'text' && typeof block.text === 'string') {
            const key = `${message.uuid}:${index}`
            const received = turnTextRef.current.get(key) || ''
            if (!received) updateText(block.text)
            else if (block.text.startsWith(received)) updateText(block.text.slice(received.length))
            turnTextRef.current.set(key, block.text)
          } else if (block.type === 'tool_use') setActivity(`正在操作：${block.name}`)
        }
      }
    })
    const done = window.electronAPI.onAgentStreamComplete(data => {
      if (data.sessionId !== session.id || !activeRef.current) return
      if (data.runGeneration != null && runGenerationRef.current != null && data.runGeneration !== runGenerationRef.current) return
      if (data.startedAt != null && data.startedAt < runStartedAtRef.current) return
      activeRef.current = false
      clearIdle()
      setVoiceBusy(false)
      if (data.stoppedByUser) { queueRef.current?.cancel(); endConversation(); setActivity('已停止后续操作；已完成操作未撤销'); return }
      // 非流式兼容：只取本轮最后一条助手回复，不重复播完整历史。
      if (!streamedTextRef.current.trim()) {
        const final = [...(data.messages || [])].reverse().find(m => m.role === 'assistant' && m.content?.trim())
        if (final) updateText(final.content)
      }
      flushSpeech(true)
      const token = sequenceRef.current
      setActivity('回答完成')
      void queueRef.current?.drain().then(async () => {
        if (token !== sequenceRef.current || activeRef.current) return
        if (convoRef.current) await continueListenRef.current()
        else wakeWatchRef.current?.resume()
      })
    })
    const error = window.electronAPI.onAgentStreamError(data => {
      if (data.sessionId !== session.id || !activeRef.current) return
      if (data.runGeneration != null && runGenerationRef.current != null && data.runGeneration !== runGenerationRef.current) return
      activeRef.current = false
      clearIdle()
      setVoiceBusy(false)
      queueRef.current?.cancel()
      setActivity(`出错了：${data.error}`)
      convoRef.current = false; setConversationActive(false)
      setAwake(false)
      pauseWake()
      queueRef.current?.push('抱歉，这次没有完成，请查看错误提示。')
      void queueRef.current?.drain().then(() => wakeWatchRef.current?.resume())
    })
    return () => { unsub(); done(); error() }
  }, [clearIdle, endConversation, pauseWake, session])

  React.useEffect(() => {
    if (mode !== 'stage') return
    const watch = createWakeWatch({
      onWake: ({ command }) => {
        if (activeRef.current || listeningRef.current || listenStartingRef.current) return
        convoRef.current = true; setConversationActive(true)
        if (command.trim()) void sendRef.current(command.trim())
        else void continueListenRef.current(true)
      },
      onStatus: setWakeWatchStatus,
      onError: message => toast.error(message),
    })
    wakeWatchRef.current = watch
    const sync = (): void => {
      setWakeWordLabel(loadWakeWord()); watch.setWakeWord(loadWakeWord())
      void window.electronAPI.getVoiceDictationSettings().then(settings => {
        if (settings.enabled && loadWakeEnabled() && !activeRef.current && !listeningRef.current && !convoRef.current) watch.start()
        else watch.pause()
      }).catch(() => {})
    }
    sync()
    window.addEventListener('focus', sync)
    return () => { window.removeEventListener('focus', sync); watch.destroy(); wakeWatchRef.current = null }
  }, [mode])

  React.useEffect(() => { prefetchWorkbenchAcks([...ACK_PHRASES]) }, [])
  React.useEffect(() => () => {
    sequenceRef.current += 1
    convoRef.current = false; setConversationActive(false)
    queueRef.current?.cancel()
    stopBrowserTts()
    clearIdle()
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current)
    acceptCaptureRef.current = false
    // 离开助手页不自动终止已确认的任务，但不再继续开麦。
    if (listeningRef.current) void window.electronAPI.toggleVoiceDictation({ sourceInputId: listenSourceRef.current }).catch(() => {})
  }, [clearIdle])

  const handleChip = (chip: WorkbenchChip): void => {
    if (chip.action === 'voice_hint') { toggleVoiceTalk(); return }
    if (chip.action === 'create_project_prompt') { void submit('我想创建一个项目，请先问我项目名称和目标，不要自动跳转界面。'); return }
    if (chip.prompt) void submit(chip.prompt)
  }
  const orbState: RoyOrbState = !hasAvailableModel || bootError ? 'offline' : speaking ? 'speaking' : voiceBusy || stopping ? 'thinking' : voiceTalkActive || awake ? 'listening' : 'ready'
  const isEngaged = conversationActive || voiceTalkActive || voiceBusy || speaking || stopping
  const statusLine = needsConfirmation ? '等待确认 · 请查看下方操作卡片' : stopping ? '正在停止…' : speaking ? '正在回答 · 点球打断' : voiceBusy ? activity || '正在处理…' : voiceTalkActive ? '正在聆听 · 停顿后自动提交（按住空格时松开提交）' : booting ? '助手启动中…' : '罗伊在线 · 点球或按住空格说话'
  const wakeHint = wakeWatchStatus === 'watching' ? `说「${wakeWordLabel}」或点球开始` : wakeWatchStatus === 'unsupported' ? '当前不支持免提唤醒，请点球说话' : wakeWatchStatus === 'denied' ? '麦克风权限被拒绝，请检查权限' : `点球开始；可在语音设置中配置「${wakeWordLabel}」唤醒`
  const errorBanner = bootError ? <div className="mx-4 rounded-xl bg-amber-500/10 p-3 text-sm"><AlertCircle size={14} className="mr-2 inline" />{bootError}</div> : null

  if (mode === 'session') return <div className="flex h-full min-h-0 flex-col">
    <div className="flex items-center gap-3 border-b p-3"><button onClick={() => persistMode('stage')}><ArrowLeft size={16} /></button><span className="flex-1">罗伊 · 执行详情</span><button onClick={openFullSession}><ExternalLink size={14} /></button></div>
    {errorBanner}
    <div className="min-h-0 flex-1">{session ? <React.Suspense fallback={<Loader2 className="m-5 animate-spin" />}><AgentView sessionId={session.id} embedded /></React.Suspense> : null}</div>
  </div>

  return <div className="relative flex h-full min-h-0 flex-col">
    {errorBanner}
    <RoyWorkbenchStage
      orbState={orbState} skin={skin} onSkinChange={handleSkinChange}
      statusLine={statusLine} detailLine={voiceBusy || stopping ? activity : lastReply || '普通交流留在这里，只有需要时才调用工具'} wakeHint={wakeHint}
      workspaceName={workspaceName} modelLabel={modelLabel}
      recentProjects={workspaces.map(w => ({ id: w.id, name: w.name }))}
      onOpenChat={() => persistMode('session')} onOrbActivate={toggleVoiceTalk} onChip={handleChip}
      onCommandSubmit={text => submit(text)} onOpenFullSession={session ? openFullSession : undefined}
      onSelectProject={id => { const found = workspaces.find(w => w.id === id); if (!found) return; setCurrentWorkspaceId(id); void window.electronAPI.updateSettings({ agentWorkspaceId: id }); setActivity(`后续指令使用项目「${found.name}」`) }}
      onOpenVoiceSettings={openVoiceSettings} onToggleVoiceTalk={toggleVoiceTalk} voiceTalkActive={voiceTalkActive}
      conversationActive={isEngaged} stopping={stopping}
      history={history} muted={muted} onToggleMuted={() => { mutedRef.current = !mutedRef.current; setMuted(mutedRef.current); if (mutedRef.current) { queueRef.current?.cancel(); stopBrowserTts() } }}
      onEndConversation={() => { acceptCaptureRef.current = false; convoRef.current = false; setConversationActive(false); if (listeningRef.current) { void window.electronAPI.toggleVoiceDictation({ sourceInputId: listenSourceRef.current }); listeningRef.current = false; setVoiceTalkActive(false) } void interrupt(false) }}
    />
    {session && needsConfirmation ? <div className="absolute bottom-4 left-3 right-3 z-40 max-h-[60%] overflow-auto rounded-2xl border bg-background/95 p-2 shadow-xl">
      <PermissionBanner sessionId={session.id} explicitOnly />
      <AskUserBanner sessionId={session.id} />
      <ExitPlanModeBanner sessionId={session.id} />
    </div> : null}
  </div>
}
