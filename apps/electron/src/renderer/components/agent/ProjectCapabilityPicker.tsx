/**
 * 创建项目时的能力勾选
 *
 * 列出可用的 Skills 与 MCP，让用户在建项目时就决定装哪些，
 * 而不是建完再进设置里一个个开关。
 */

import * as React from 'react'
import { Check, Loader2, Package, Plug } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CapabilityOption {
  key: string
  name: string
  description?: string
}

interface ProjectCapabilityPickerProps {
  /** 已勾选的技能 slug；undefined 表示全选默认技能 */
  selectedSkills: string[] | undefined
  onChangeSkills: (next: string[] | undefined) => void
}

export function ProjectCapabilityPicker({
  selectedSkills,
  onChangeSkills,
}: ProjectCapabilityPickerProps): React.ReactElement {
  const [skills, setSkills] = React.useState<CapabilityOption[] | null>(null)
  const [mcp, setMcp] = React.useState<CapabilityOption[]>([])
  const [tab, setTab] = React.useState<'skills' | 'mcp'>('skills')

  React.useEffect(() => {
    let cancelled = false
    void window.electronAPI
      .getDefaultSkillSlugs()
      .then(async (slugs) => {
        if (cancelled) return
        const list: CapabilityOption[] = slugs.map((slug) => ({ key: slug, name: slug }))
        setSkills(list)
      })
      .catch(() => { if (!cancelled) setSkills([]) })

    // MCP 以当前默认工作区已配置的为准；新建项目会继承 default 工作区配置
    void window.electronAPI
      .getWorkspaceMcpConfig('default')
      .then((config: { servers?: Record<string, { url?: string; command?: string }> }) => {
        if (cancelled) return
        setMcp(Object.entries(config?.servers ?? {}).map(([name, entry]) => ({
          key: name,
          name,
          description: entry?.url ?? entry?.command,
        })))
      })
      .catch(() => { if (!cancelled) setMcp([]) })

    return () => { cancelled = true }
  }, [])

  const allSelected = selectedSkills === undefined
  const selected = React.useMemo(
    () => new Set(selectedSkills ?? (skills ?? []).map((item) => item.key)),
    [selectedSkills, skills],
  )

  const toggle = (key: string) => {
    const next = new Set(selected)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    onChangeSkills([...next])
  }

  return (
    <div className="mt-1.5 rounded-xl border border-border bg-background/95 p-2 shadow-sm">
      <div className="mb-1.5 flex items-center gap-0.5 rounded-lg bg-foreground/[0.05] p-0.5 text-[12px]">
        <button
          type="button"
          onClick={() => setTab('skills')}
          className={cn(
            'flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1 transition-colors',
            tab === 'skills' ? 'bg-background font-medium shadow-sm' : 'text-foreground/55',
          )}
        >
          <Package size={12} /> Skills {skills ? `(${selected.size}/${skills.length})` : ''}
        </button>
        <button
          type="button"
          onClick={() => setTab('mcp')}
          className={cn(
            'flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1 transition-colors',
            tab === 'mcp' ? 'bg-background font-medium shadow-sm' : 'text-foreground/55',
          )}
        >
          <Plug size={12} /> MCP ({mcp.length})
        </button>
      </div>

      {tab === 'skills' ? (
        <>
          <div className="mb-1 flex items-center justify-between px-1">
            <span className="text-[11px] text-foreground/40">
              {allSelected ? '默认全部装' : `已选 ${selected.size} 个`}
            </span>
            <button
              type="button"
              onClick={() => onChangeSkills(allSelected ? [] : undefined)}
              className="text-[11px] text-foreground/45 hover:text-foreground"
            >
              {allSelected ? '全部取消' : '全选'}
            </button>
          </div>
          <div className="max-h-[168px] overflow-y-auto">
            {skills === null ? (
              <div className="flex items-center gap-2 px-1 py-3 text-[12px] text-foreground/40">
                <Loader2 size={12} className="animate-spin" /> 正在读取技能…
              </div>
            ) : skills.length === 0 ? (
              <div className="px-1 py-3 text-[12px] text-foreground/40">没有可用的内置技能</div>
            ) : (
              skills.map((skill) => {
                const on = selected.has(skill.key)
                return (
                  <button
                    key={skill.key}
                    type="button"
                    onClick={() => toggle(skill.key)}
                    className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-[12.5px] hover:bg-foreground/[0.05]"
                  >
                    <span
                      className={cn(
                        'grid size-3.5 shrink-0 place-items-center rounded border',
                        on ? 'border-primary bg-primary text-primary-foreground' : 'border-foreground/25',
                      )}
                    >
                      {on && <Check size={10} strokeWidth={3} />}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-foreground/75">{skill.name}</span>
                  </button>
                )
              })
            )}
          </div>
        </>
      ) : (
        <div className="max-h-[168px] overflow-y-auto">
          {mcp.length === 0 ? (
            <div className="px-1 py-3 text-[12px] text-foreground/40">
              没有可选的 MCP。建好项目后可在「MCP / Skill」里添加。
            </div>
          ) : (
            mcp.map((server) => (
              <div key={server.key} className="rounded-md px-1.5 py-1 text-[12.5px] text-foreground/70">
                <div className="truncate">{server.name}</div>
                {server.description && (
                  <div className="truncate text-[11px] text-foreground/40">{server.description}</div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
