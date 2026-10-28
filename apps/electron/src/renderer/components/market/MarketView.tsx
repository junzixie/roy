/**
 * 市场（照 Arthur 的市场排版）
 *
 * 顶部三个标签：伙伴 / 技能 / MCP
 * - 伙伴：相当于 Arthur 的「专家」，装上后在输入框里选用
 * - 技能：精选 / 仓库（Roy 技能仓库、在线合集、ZCode 官方放在一个仓库里，按来源筛选）/ 已安装
 * - MCP：精选 / 仓库（Roy MCP 仓库、本机软件、官方注册表放在一个仓库里，按来源筛选）/ 已安装
 */

import React from 'react'
import { Search, X } from 'lucide-react'
import { useAtomValue } from 'jotai'
import { agentWorkspacesAtom, currentAgentWorkspaceIdAtom } from '@/atoms/agent-atoms'
import { cn } from '@/lib/utils'
import { SkillMarket } from './SkillMarket'
import { ConnectorMarket } from './ConnectorMarket'
import { PartnersTab } from '@/components/agent-skills/PartnersTab'

type MarketTab = 'partners' | 'skills' | 'mcp'

const TABS: Array<{ id: MarketTab; label: string }> = [
  { id: 'partners', label: '伙伴' },
  { id: 'skills', label: '技能' },
  { id: 'mcp', label: 'MCP' },
]

export function MarketView(): React.ReactElement {
  const workspaces = useAtomValue(agentWorkspacesAtom)
  const selectedWorkspaceId = useAtomValue(currentAgentWorkspaceIdAtom)
  const workspaceSlug = workspaces.find((w) => w.id === selectedWorkspaceId)?.slug ?? ''
  const workspaceName = workspaces.find((w) => w.id === selectedWorkspaceId)?.name ?? ''

  const [tab, setTab] = React.useState<MarketTab>(() => {
    const t = localStorage.getItem('roy.market.initialTab')
    return t === 'partners' || t === 'mcp' ? t : 'skills'
  })
  React.useEffect(() => {
    localStorage.removeItem('roy.market.initialTab')
    const onTab = (event: Event): void => {
      const next = (event as CustomEvent<string>).detail
      if (next === 'partners' || next === 'skills' || next === 'mcp') setTab(next)
    }
    window.addEventListener('roy:market-tab', onTab)
    return () => window.removeEventListener('roy:market-tab', onTab)
  }, [])

  const [partnerQuery, setPartnerQuery] = React.useState('')

  return (
    <div className="roy-page-enter flex h-full min-h-0 flex-col bg-content-area">
      <div className="flex shrink-0 items-center gap-3 px-6 pb-3 pt-4">
        <div className="flex items-center gap-0.5 rounded-xl bg-foreground/[0.05] p-0.5">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={cn(
                'flex h-8 items-center rounded-[10px] px-4 text-[13.5px] transition-colors',
                tab === item.id ? 'bg-background font-medium text-foreground shadow-sm' : 'text-foreground/55 hover:text-foreground',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        {tab !== 'partners' && workspaceName && (
          <span className="truncate text-[12.5px] text-foreground/45" title="技能和 MCP 装到当前项目">装到项目：{workspaceName}</span>
        )}
        {tab === 'partners' && (
          <label className="flex h-8 w-64 items-center gap-2 rounded-lg border border-border bg-background px-2.5 focus-within:border-foreground/30">
            <Search size={14} className="shrink-0 text-foreground/40" />
            <input value={partnerQuery} onChange={(e) => setPartnerQuery(e.target.value)} placeholder="搜伙伴：名字、擅长" className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-foreground/35" />
            {partnerQuery && <button type="button" onClick={() => setPartnerQuery('')} className="text-foreground/40 hover:text-foreground"><X size={13} /></button>}
          </label>
        )}
      </div>

      {tab === 'partners' && (
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-8 pt-1">
          <PartnersTab search={partnerQuery} />
        </div>
      )}
      {tab === 'skills' && <SkillMarket workspaceSlug={workspaceSlug} />}
      {tab === 'mcp' && <ConnectorMarket workspaceSlug={workspaceSlug} />}
    </div>
  )
}
