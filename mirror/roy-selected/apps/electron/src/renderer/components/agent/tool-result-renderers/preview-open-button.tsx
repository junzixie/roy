/**
 * PreviewOpenButton — 工具结果旁的产物打开入口（Roy 契约）
 *
 * 默认单击：打开工作台 / 打开项目文档 → 右侧预览工作台
 * 菜单旁路：在文件夹中显示 → showItemInFolder
 */

import * as React from 'react'
import { useAtomValue } from 'jotai'
import { toast } from 'sonner'
import { currentAgentSessionIdAtom } from '@/atoms/agent-atoms'
import { useOpenPreview } from '@/components/diff/preview-opener'
import {
  getRoyPrimaryOpenLabel,
  ROY_OPEN_WORKBENCH_LABEL,
  ROY_REVEAL_IN_FOLDER_LABEL,
} from '@/components/diff/roy-product-open'
import { cn } from '@/lib/utils'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'

interface PreviewOpenButtonProps {
  filePath: string
  /** 解析相对路径时的候选根目录 */
  basePaths?: string[]
  className?: string
}

export function PreviewOpenButton({ filePath, basePaths, className }: PreviewOpenButtonProps): React.ReactElement | null {
  const sessionId = useAtomValue(currentAgentSessionIdAtom)
  const openPreview = useOpenPreview()
  const primaryLabel = getRoyPrimaryOpenLabel(filePath)

  if (!sessionId || !filePath) return null

  const openWorkbench = () => {
    openPreview(sessionId, {
      filePath,
      previewOnly: true,
      readOnly: true,
      ...(basePaths && basePaths.length > 0 ? { basePaths } : {}),
    })
  }

  const revealInFolder = () => {
    window.electronAPI.showItemInFolder(filePath, basePaths)
      .then((ok) => { if (!ok) toast.error(`未找到文件：${filePath}`) })
      .catch(() => toast.error(`未找到文件：${filePath}`))
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <span
          role="button"
          tabIndex={0}
          className={cn(
            'inline-flex shrink-0 items-center px-1.5 py-px rounded text-[11px] text-muted-foreground/70',
            'hover:text-foreground/80 hover:bg-muted/50',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
            'transition-colors duration-150 cursor-pointer select-none',
            className,
          )}
          onClick={(e) => {
            e.stopPropagation()
            openWorkbench()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              e.stopPropagation()
              openWorkbench()
            }
          }}
          title={`${primaryLabel}（右键可在文件夹中显示）`}
        >
          {primaryLabel}
        </span>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48 z-[9999]">
        <ContextMenuItem onClick={openWorkbench}>
          {ROY_OPEN_WORKBENCH_LABEL}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={revealInFolder}>
          {ROY_REVEAL_IN_FOLDER_LABEL}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

/** 工具结果顶部：路径 + 打开入口 */
export function ToolResultPathBar({
  filePath,
  basePath,
  className,
}: {
  filePath: string
  basePath?: string
  className?: string
}): React.ReactElement | null {
  if (!filePath) return null
  const basePaths = basePath ? [basePath] : undefined
  return (
    <div className={cn('mb-1.5 flex items-center gap-2 min-w-0 text-[12px]', className)}>
      <span className="truncate font-mono text-muted-foreground/70" title={filePath}>
        {filePath}
      </span>
      <PreviewOpenButton filePath={filePath} basePaths={basePaths} />
    </div>
  )
}
