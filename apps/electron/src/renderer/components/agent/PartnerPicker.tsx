/**
 * PartnerPicker — 输入框右下角的工作伙伴选择（对应 Arthur 的人设选择）
 *
 * 只列已安装且启用的伙伴；选中后主进程在下一条消息起把它的人设追加到系统提示词。
 */

import * as React from 'react'
import { useSetAtom } from 'jotai'
import { toast } from 'sonner'
import { Check, Settings2, UserRound } from 'lucide-react'
import { getPartner, type PartnerDefinition } from '@roy/shared'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { usePartners } from '@/atoms/partners'
import { activeViewAtom, agentSkillsTabAtom } from '@/atoms/active-view'
import { PartnerAvatar } from '@/components/agent-skills/partner-icons'

export function PartnerPicker({ compact }: { compact?: boolean }): React.ReactElement {
  const { settings, setActive } = usePartners()
  const setActiveView = useSetAtom(activeViewAtom)
  const setSkillsTab = useSetAtom(agentSkillsTabAtom)
  const disabled = new Set(settings.disabled ?? [])
  const list = settings.installed
    .filter((id) => !disabled.has(id))
    .map((id) => getPartner(id, settings.custom))
    .filter((p): p is PartnerDefinition => !!p)
  const current = getPartner(settings.active, settings.custom)

  const choose = async (id: string | undefined, name?: string): Promise<void> => {
    try {
      await setActive(id)
      toast.success(id ? `已切到「${name}」，下一条消息生效` : '已关掉工作伙伴')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  const manage = (): void => {
    void setSkillsTab
    setActiveView('partners')
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title="工作伙伴：Agent 用谁的身份和做事方式帮你（下一条消息生效）"
          className={cn('flex h-8 shrink-0 items-center gap-1.5 rounded-md px-1.5 text-[12.5px] hover:bg-muted/50', current ? 'text-foreground' : 'text-foreground/50')}
        >
          {current ? <PartnerAvatar icon={current.icon} category={current.category} size={18} /> : <UserRound size={16} />}
          {current && !compact && <span className="max-w-[90px] truncate">{current.name}</span>}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="max-h-[360px] w-64 overflow-y-auto">
        <DropdownMenuLabel className="text-[11.5px] font-normal text-foreground/45">工作伙伴：选了以后接下来的消息按它来</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => void choose(undefined)} className="gap-2 text-[13px]">
          <UserRound size={15} className="opacity-40" />
          <span className="flex-1">不用伙伴</span>
          {!current && <Check size={13} className="text-primary" />}
        </DropdownMenuItem>
        {list.map((p) => (
          <DropdownMenuItem key={p.id} onSelect={() => void choose(p.id, p.name)} className="gap-2 text-[13px]">
            <PartnerAvatar icon={p.icon} category={p.category} size={18} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate">{p.name}</span>
              <span className="truncate text-[11.5px] text-muted-foreground">{p.description}</span>
            </span>
            {current?.id === p.id && <Check size={13} className="shrink-0 text-primary" />}
          </DropdownMenuItem>
        ))}
        {list.length === 0 && (
          <div className="px-2 py-1.5 text-[12px] text-muted-foreground">还没装伙伴，去「市场 → 伙伴」挑选或新建</div>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={manage} className="gap-2 text-[13px]">
          <Settings2 size={14} /> 管理伙伴…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
