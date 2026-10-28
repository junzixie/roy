/**
 * 记忆设置
 *
 * 设置里的项目记忆入口：选择项目后直接复用 Agent 右侧的项目记忆面板，
 * 与侧边栏/工作区 Tab 看到的是同一份 ~/.roy 项目记忆文件。
 */

import React from 'react'
import { useAtomValue } from 'jotai'
import { Brain } from 'lucide-react'
import { agentWorkspacesAtom, currentAgentWorkspaceIdAtom } from '@/atoms/agent-atoms'
import { WorkspaceMemoryTab } from '@/components/agent-skills/WorkspaceMemoryTab'
import { toast } from 'sonner'
import { ensureProFeature } from '@/atoms/pro-activation'

const errText = (e: unknown): string => String(e instanceof Error ? e.message : e).replace(/^Error invoking remote method[^:]*:\s*(Error:\s*)?/, '')

/** 全局长期记忆（Pro）：跨所有项目生效的偏好，AI 会自己维护，用户也能直接改 */
function GlobalMemoryCard(): React.ReactElement {
  const [state, setState] = React.useState<{ content: string; path: string; enabled: boolean; updatedAt: number | null } | null>(null)
  const [draft, setDraft] = React.useState('')
  const [editing, setEditing] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const load = React.useCallback(() => {
    void window.electronAPI.globalMemoryGet().then((v) => { setState(v); setDraft(v.content) }).catch(() => undefined)
  }, [])
  React.useEffect(() => {
    load()
    return window.electronAPI.onAccountChanged(load)
  }, [load])

  const save = (): void => {
    setSaving(true)
    void window.electronAPI.globalMemorySave(draft)
      .then(() => { toast.success('全局记忆已保存'); setEditing(false); load() })
      .catch((e: unknown) => toast.error(errText(e)))
      .finally(() => setSaving(false))
  }

  const lines = (state?.content ?? '').split('\n').filter((l) => /^\s*[-*]\s+/.test(l)).length
  return (
    <div className="mb-4 rounded-xl border border-border/70 bg-background p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[14px] font-medium text-foreground">全局记忆{state && !state.enabled && <span className="ml-1.5 rounded bg-primary/10 px-1.5 py-0.5 text-[11px] text-primary">Pro</span>}</div>
          <div className="mt-0.5 text-[12px] leading-5 text-muted-foreground">
            跨所有项目记住你的偏好：称呼、语言和回复风格、常用工具、工作习惯。AI 发现稳定的偏好会自己记下并告诉你；不记密码和密钥。项目特有的内容在下面的项目记忆里。
          </div>
        </div>
        <div className="flex shrink-0 gap-1.5">
          {state?.enabled ? (
            <>
              <button type="button" onClick={() => void window.electronAPI.globalMemoryOpenDir()} className="h-8 rounded-md border border-border px-2.5 text-[12.5px] hover:bg-foreground/[0.05]">打开文件夹</button>
              {editing
                ? <button type="button" disabled={saving} onClick={save} className="h-8 rounded-md bg-primary px-3 text-[12.5px] text-primary-foreground disabled:opacity-60">{saving ? '保存中…' : '保存'}</button>
                : <button type="button" onClick={() => setEditing(true)} className="h-8 rounded-md border border-border px-2.5 text-[12.5px] hover:bg-foreground/[0.05]">编辑</button>}
            </>
          ) : (
            <button type="button" onClick={() => void ensureProFeature('long-memory', load)} className="h-8 rounded-md bg-primary px-3 text-[12.5px] text-primary-foreground">激活 Pro 开启</button>
          )}
        </div>
      </div>
      {state?.enabled && (editing ? (
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck={false}
          className="mt-3 h-48 w-full resize-y rounded-lg border border-border bg-background p-3 font-mono text-[12.5px] leading-5 outline-none focus:border-foreground/30" />
      ) : (
        <div className="mt-3 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg bg-foreground/[0.03] p-3 text-[12.5px] leading-5 text-foreground/80">
          {state.content.trim() ? state.content : '还没有记下任何内容。和 AI 聊的时候说「以后都用中文简洁回复」这类偏好，它就会记到这里。'}
        </div>
      ))}
      {state?.enabled && !editing && <div className="mt-1.5 text-[11.5px] text-muted-foreground">{lines} 条{state.updatedAt ? ` · 更新于 ${new Date(state.updatedAt).toLocaleString('zh-CN')}` : ''}</div>}
    </div>
  )
}

export function MemorySettings(): React.ReactElement {
  const workspaces = useAtomValue(agentWorkspacesAtom)
  const selectedWorkspaceId = useAtomValue(currentAgentWorkspaceIdAtom)
  const [pickedId, setPickedId] = React.useState<string | null>(null)

  const activeId = pickedId ?? selectedWorkspaceId ?? workspaces[0]?.id ?? null
  const active = workspaces.find((workspace) => workspace.id === activeId)

  if (workspaces.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <GlobalMemoryCard />
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
          <Brain size={28} className="text-foreground/25" />
          <div className="text-[13px] text-foreground/50">还没有项目，项目记忆需要先有一个项目</div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <GlobalMemoryCard />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-foreground/55">项目</span>
        <select
          value={activeId ?? ''}
          onChange={(event) => setPickedId(event.target.value)}
          className="h-8 min-w-[180px] rounded-lg border border-border bg-background px-2 text-[13px] outline-none focus:border-foreground/30"
        >
          {workspaces.map((workspace) => (
            <option key={workspace.id} value={workspace.id}>
              {workspace.name}
            </option>
          ))}
        </select>
        <span className="text-[12px] text-foreground/40">
          Agent 在这个项目里积累的记忆文件，人设提示词里会引用它
        </span>
      </div>

      {active && (
        <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border">
          <WorkspaceMemoryTab workspaceSlug={active.slug} embedded />
        </div>
      )}
    </div>
  )
}
