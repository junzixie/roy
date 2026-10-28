import * as React from 'react'
import { useAtom } from 'jotai'
import { Eye, EyeOff, ListChecks } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import {
  nextWorkVerbosity,
  WORK_VERBOSITY_HINTS,
  WORK_VERBOSITY_LABELS,
  workVerbosityAtom,
  type WorkVerbosity,
} from '@/atoms/work-verbosity'

const ICONS: Record<WorkVerbosity, typeof Eye> = {
  quiet: EyeOff,
  list: ListChecks,
  detail: Eye,
}

/** 输入框下面的「静默 / 清单 / 细节」：点一下换下一种（同 Arthur） */
export function WorkVerbosityButton(): React.ReactElement {
  const [mode, setMode] = useAtom(workVerbosityAtom)
  const Icon = ICONS[mode]
  const next = nextWorkVerbosity(mode)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => setMode(next)}
          className={cn(
            'flex h-8 items-center gap-1 rounded-md px-2 text-[12.5px] text-foreground/55 transition-[background-color,transform]',
            'hover:bg-muted/50 hover:text-foreground active:scale-[0.96]',
          )}
          aria-label={`干活时显示：${WORK_VERBOSITY_LABELS[mode]}`}
        >
          <Icon className="size-3.5" />
          <span>{WORK_VERBOSITY_LABELS[mode]}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[260px]">
        <p className="font-medium">{WORK_VERBOSITY_LABELS[mode]}：{WORK_VERBOSITY_HINTS[mode]}</p>
        <p className="mt-0.5 text-[11px] opacity-70">点一下换成「{WORK_VERBOSITY_LABELS[next]}」</p>
      </TooltipContent>
    </Tooltip>
  )
}
