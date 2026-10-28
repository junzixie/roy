/**
 * AI 助理页 — 嵌入完整 AgentView（复用工具/权限/流式），顶部保留建项目快捷条。
 */

import * as React from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { Bot, ExternalLink, FolderPlus, Loader2, AlertCircle } from 'lucide-react'
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
import { findWorkspaceByName, parseAiAssistantIntent } from '@/lib/ai-assistant-intent'
import type { AgentSessionMeta } from '@roy/shared'

const ASSISTANT_TITLE = 'AI 助理'
const SESSION_ID_KEY = 'roy.ai-assistant.session-id'

const AgentView = React.lazy(() =>
  import('@/components/agent').then((m) => ({ default: m.AgentView })),
)

export function AiAssistantPage(): React.ReactElement {
  const [session, setSession] = React.useState<AgentSessionMeta | null>(null)
  const [booting, setBooting] = React.useState(true)
  const [bootError, setBootError] = React.useState<string | null>(null)
  const [quickText, setQuickText] = React.useState('')
  const [busyQuick, setBusyQuick] = React.useState(false)

  const channels = useAtomValue(channelsAtom)
  const agentChannelId = useAtomValue(agentChannelIdAtom)
  const agentModelId = useAtomValue(agentModelIdAtom)
  const [workspaces, setWorkspaces] = useAtom(agentWorkspacesAtom)
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
          (remembered ? listedLocal.find((item) => item.id === remembered) : undefined) ||
          listedLocal.find((item) => item.title === ASSISTANT_TITLE)

        if (!meta) {
          const listed = await window.electronAPI.listAgentSessions()
          meta =
            (remembered ? listed.find((item) => item.id === remembered) : undefined) ||
            listed.find((item) => item.title === ASSISTANT_TITLE)
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
    return () => {
      cancelled = true
    }
  }, [agentChannelId, agentModelId, hasAvailableModel, setAgentSessions])

  const openFullSession = React.useCallback((): void => {
    if (!session) return
    openSession('agent', session.id, session.title || ASSISTANT_TITLE)
    setActiveView('conversations')
  }, [openSession, session, setActiveView])

  const createNamedProject = React.useCallback(
    async (name: string): Promise<void> => {
      if (!agentChannelId) {
        toast.error('请先配置模型渠道')
        return
      }
      setBusyQuick(true)
      try {
        const { workspace, session: projectSession } = await window.electronAPI.createAgentProject(
          { name },
          agentChannelId,
          agentModelId ?? undefined,
        )
        setWorkspaces((prev) => [workspace, ...prev.filter((w) => w.id !== workspace.id)])
        setAgentSessions((prev) => [projectSession, ...prev.filter((s) => s.id !== projectSession.id)])
        setCurrentWorkspaceId(workspace.id)
        void window.electronAPI.updateSettings({ agentWorkspaceId: workspace.id }).catch(console.error)
        toast.success(`已创建项目「${workspace.name}」`)
        openSession('agent', projectSession.id, projectSession.title)
        setActiveView('conversations')
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        toast.error('创建项目失败', { description: msg })
      } finally {
        setBusyQuick(false)
      }
    },
    [agentChannelId, agentModelId, openSession, setActiveView, setAgentSessions, setCurrentWorkspaceId, setWorkspaces],
  )

  const handleQuick = React.useCallback(async (): Promise<void> => {
    const text = quickText.trim()
    if (!text || busyQuick) return
    const intent = parseAiAssistantIntent(text)

    if (intent.type === 'create_project') {
      setQuickText('')
      await createNamedProject(intent.name)
      return
    }

    if (intent.type === 'open_project') {
      const found = findWorkspaceByName(workspaces, intent.name)
      if (!found) {
        toast.error(`没有找到项目「${intent.name}」`, {
          description: '可以改成「新建项目 xxx」或点下方按钮手动创建。',
        })
        return
      }
      setQuickText('')
      setCurrentWorkspaceId(found.id)
      void window.electronAPI.updateSettings({ agentWorkspaceId: found.id }).catch(console.error)
      const projectSession = agentSessions.find((s) => s.workspaceId === found.id)
      if (projectSession) {
        openSession('agent', projectSession.id, projectSession.title)
        setActiveView('conversations')
      } else {
        toast.success(`已切到项目「${found.name}」`)
        setActiveView('conversations')
      }
      return
    }

    // 未识别：提示用完整会话输入，或弹出建项目名
    const name = window.prompt('要新建的项目名称？（取消则请到下方完整会话里直接聊）', text.slice(0, 40))
    if (name && name.trim()) {
      setQuickText('')
      await createNamedProject(name.trim())
    } else {
      toast.message('请在下方完整会话里继续说', {
        description: '助理页已接入完整 Agent 能力；快捷条主要用于建/开项目。',
      })
    }
  }, [
    agentSessions,
    busyQuick,
    createNamedProject,
    openSession,
    quickText,
    setActiveView,
    setCurrentWorkspaceId,
    workspaces,
  ])

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
        <Bot size={18} className="text-foreground/70" />
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-medium text-foreground">AI 助理</div>
          <div className="text-[11.5px] text-muted-foreground">
            下方是完整 Agent 会话（工具/权限/流式与项目会话同一套）。快捷条可建项目或跳进完整标签页。
          </div>
        </div>
        <button
          type="button"
          disabled={!session}
          onClick={openFullSession}
          className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-[12px] hover:bg-muted/50 disabled:opacity-40"
        >
          <ExternalLink size={12} />
          在会话标签打开
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/20 px-4 py-2">
        <FolderPlus size={14} className="text-foreground/45" />
        <input
          value={quickText}
          onChange={(e) => setQuickText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault()
              void handleQuick()
            }
          }}
          placeholder="快捷：开一个叫某某的项目 / 打开项目某某（或直接输入名称后回车）"
          className="min-w-[12rem] flex-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-[12.5px] outline-none focus:border-primary/40"
          disabled={busyQuick || !hasAvailableModel}
        />
        <button
          type="button"
          disabled={busyQuick || !quickText.trim() || !hasAvailableModel}
          onClick={() => { void handleQuick() }}
          className="h-8 rounded-lg bg-foreground px-3 text-[12px] text-background disabled:bg-foreground/15 disabled:text-foreground/40"
        >
          {busyQuick ? '…' : '执行'}
        </button>
      </div>

      {(bootError || !hasAvailableModel || !agentChannelId) && (
        <div className="mx-4 mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12.5px] text-amber-900 dark:text-amber-100">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <div>
            {bootError
              || (!agentChannelId
                ? '还没选模型渠道：请到设置 → 模型渠道启用并选择一个模型。'
                : '当前没有可用模型：请到设置 → 模型渠道启用至少一个模型。')}
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1">
        {booting && (
          <div className="flex h-full items-center justify-center gap-2 text-[13px] text-muted-foreground">
            <Loader2 size={16} className="animate-spin" />
            正在接通完整助理会话…
          </div>
        )}
        {!booting && session && (
          <React.Suspense
            fallback={(
              <div className="flex h-full items-center justify-center text-[13px] text-muted-foreground">
                加载 Agent 界面…
              </div>
            )}
          >
            <AgentView sessionId={session.id} embedded />
          </React.Suspense>
        )}
      </div>
    </div>
  )
}
