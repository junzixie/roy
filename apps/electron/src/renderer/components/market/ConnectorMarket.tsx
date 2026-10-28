/**
 * MCP 市场（和技能市场同一套排版）
 *
 * - 子页：精选 / 仓库 / 已安装 N
 * - 仓库：所有能加的 MCP 放在一个仓库里（Roy MCP 仓库、本机软件、官方注册表），用户自己筛选，见 McpRepo.tsx
 * - 添加后先保持停用，填好 Key / 授权后在「已安装」里打开
 */

import React from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { toast } from 'sonner'
import { Check, ChevronDown, ExternalLink, KeyRound, Loader2, RotateCw, Search, Settings2, Trash2, X } from 'lucide-react'
import { Loading } from '@/components/ui/Loading'
import { McpPicks } from './MarketPicks'
import { McpRepo } from './McpRepo'
import { AppIcon } from './app-icons'
import { Switch } from '@/components/ui/switch'
import { cachedLoad } from '@/lib/load-cache'
import { cn } from '@/lib/utils'
import { activeViewAtom, agentSkillsTabAtom } from '@/atoms/active-view'
import { workspaceCapabilitiesVersionAtom } from '@/atoms/agent-atoms'
import type { McpServerEntry } from '@roy/shared'

type Entry = Awaited<ReturnType<typeof window.electronAPI.getMarketConnectors>>[number]

const errText = (e: unknown): string => String(e instanceof Error ? e.message : e).replace(/^Error invoking remote method[^:]*:\s*(Error:\s*)?/, '')
const keyOf = (id: string): string => id.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 100)

function runText(server?: Entry['server']): string {
  if (!server) return ''
  if (server.type === 'stdio') return [server.command, ...(server.args ?? [])].join(' ')
  return server.url ?? ''
}

function Tile({ name = '' }: { name?: string }): React.ReactElement {
  return <AppIcon name={name} category="MCP" size={36} />
}

export function ConnectorMarket({ workspaceSlug }: { search?: string; workspaceSlug: string }): React.ReactElement {
  const [sub, setSub] = React.useState<'featured' | 'repo' | 'added'>('featured')
  const [skillNames, setSkillNames] = React.useState<Set<string>>(new Set())
  const [servers, setServers] = React.useState<Record<string, McpServerEntry> | null>(null)
  const version = useAtomValue(workspaceCapabilitiesVersionAtom)
  const bump = useSetAtom(workspaceCapabilitiesVersionAtom)

  const reload = React.useCallback(() => {
    if (!workspaceSlug) { setServers({}); return }
    void window.electronAPI.getWorkspaceMcpConfig(workspaceSlug).then((c) => setServers(c.servers ?? {})).catch(() => setServers({}))
  }, [workspaceSlug])
  React.useEffect(() => { reload() }, [reload, version])
  React.useEffect(() => {
    if (!workspaceSlug) return
    void window.electronAPI.getWorkspaceSkills(workspaceSlug).then((l) => setSkillNames(new Set(l.flatMap((s) => [s.slug.toLowerCase(), s.name.toLowerCase()])))).catch(() => {})
  }, [workspaceSlug, version])
  const changed = React.useCallback(() => { bump((v) => v + 1) }, [bump])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-5 border-b border-border/60 px-6">
        {([['featured', '精选'], ['repo', '仓库'], ['added', `已安装 ${servers ? Object.keys(servers).length : ''}`]] as const).map(([id, label]) => (
          <button key={id} type="button" onClick={() => setSub(id)} className={cn('-mb-px border-b-2 py-2 text-[13.5px] transition-colors', sub === id ? 'border-foreground font-medium text-foreground' : 'border-transparent text-foreground/50 hover:text-foreground')}>
            {label}
          </button>
        ))}
      </div>
      {sub === 'featured'
        ? <McpPicks key={sub} mode="featured" workspaceSlug={workspaceSlug} added={servers ?? {}} onChanged={changed} onShowAll={() => setSub('repo')} />
        : sub === 'repo'
          ? <McpRepo workspaceSlug={workspaceSlug} added={servers ?? {}} installedSkills={skillNames} onChanged={changed} />
          : <AddedList workspaceSlug={workspaceSlug} servers={servers} onChanged={changed} />}
    </div>
  )
}

function AddedList({ workspaceSlug, servers, onChanged }: { workspaceSlug: string; servers: Record<string, McpServerEntry> | null; onChanged: () => void }): React.ReactElement {
  const setActiveView = useSetAtom(activeViewAtom)
  const setAgentSkillsTab = useSetAtom(agentSkillsTabAtom)
  const [busy, setBusy] = React.useState('')
  if (!workspaceSlug) return <div className="py-16 text-center text-[13px] text-foreground/45">还没有项目，先建一个项目</div>
  if (servers === null) return <Loading text="正在读取已安装的 MCP" />
  const names = Object.keys(servers).sort()

  const toggle = async (name: string, enabled: boolean): Promise<void> => {
    setBusy(name)
    try {
      const r = await window.electronAPI.setMcpEnabledAndValidate(workspaceSlug, name, enabled)
      if (enabled && !r.verification.success) toast.error(`已打开，但连接没通：${r.verification.message}`)
      else toast.success(enabled ? '已启用并连上' : '已停用')
      onChanged()
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setBusy('')
    }
  }
  const remove = async (name: string): Promise<void> => {
    if (!window.confirm(`从当前项目移除「${name}」？`)) return
    setBusy(name)
    try {
      await window.electronAPI.deleteWorkspaceMcp(workspaceSlug, name)
      toast.success('已移除')
      onChanged()
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setBusy('')
    }
  }
  const configure = (): void => { setAgentSkillsTab('mcp'); setActiveView('agent-skills') }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-8 pt-3.5">
      <div className="mb-3 text-[12.5px] text-foreground/45">当前项目共 {names.length} 个 MCP。要填 Key、授权或改启动参数，点「配置」。</div>
      {names.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-16 text-center text-[13px] text-foreground/45">还没装 MCP，去「仓库」挑一个</div>
      ) : (
        <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border bg-background">
          {names.map((name, i) => {
            const s = servers[name]!
            return (
              <div key={name} className="flex items-center gap-3 px-4 py-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-foreground/[0.05] text-[11.5px] tabular-nums text-foreground/50">{i + 1}</span>
                <Tile name={`${name} ${runText(s)}`} />
                <div className="min-w-0 flex-1">
                  <div className={cn('truncate text-[14px] font-medium', !s.enabled && 'text-foreground/45')}>{name}</div>
                  <div className="mt-0.5 truncate font-mono text-[11.5px] text-foreground/45">{runText(s)}</div>
                </div>
                <button type="button" onClick={configure} className="flex h-7 items-center gap-1 rounded-lg border border-border px-2.5 text-[12.5px] text-foreground/70 hover:bg-foreground/[0.04]"><Settings2 size={13} />配置</button>
                <button type="button" title="移除" disabled={busy === name} onClick={() => void remove(name)} className="rounded-md p-1.5 text-foreground/45 hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"><Trash2 size={14} /></button>
                {busy === name ? <Loader2 size={16} className="animate-spin text-foreground/40" /> : <Switch checked={!!s.enabled} onCheckedChange={(v) => void toggle(name, v)} />}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
