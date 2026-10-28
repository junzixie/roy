/**
 * 输入框「+」菜单（照 Arthur）
 *
 * Agent：添加文件或图片（Ctrl+U）/ 添加文件夹 / 用技能 / / 引用文件 @
 * Chat：只有添加文件或图片。干活 / 对话的切换在左上角，不放在这里。
 */

import * as React from 'react'
import { AtSign, Folder, Paperclip, Plus, Sparkles } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

interface ComposerPlusMenuProps {
  className?: string
  onAttach: () => void
  /** 单独添加文件夹（Agent） */
  onAttachFolder?: () => void
  /** 往输入框插入 / @ 触发补全（Agent） */
  onInsertText?: (token: string) => void
  /** 兼容旧调用，不再显示在菜单里（底栏有单独的清空按钮） */
  onClearContext?: () => void
  voiceNode?: React.ReactNode
  toolsNode?: React.ReactNode
}

const itemClass = 'gap-2 rounded-lg px-2.5 py-1.5 text-[13px]'
const hint = (t: string): React.ReactElement => <span className="text-[11px] text-foreground/40">{t}</span>

export function ComposerPlusMenu({ className, onAttach, onAttachFolder, onInsertText }: ComposerPlusMenuProps): React.ReactElement {
  const [open, setOpen] = React.useState(false)
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const attachRef = React.useRef(onAttach)
  attachRef.current = onAttach

  // Ctrl+U 添加文件：只响应焦点在自己这个输入框里的情况（多个输入框并存时不会一起弹）
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'u') return
      const active = document.activeElement
      let box: HTMLElement | null = triggerRef.current
      for (let i = 0; box && i < 10; i++) {
        box = box.parentElement
        if (box && active && box.contains(active) && box.querySelector('.ProseMirror, textarea')) {
          e.preventDefault()
          attachRef.current()
          return
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          title="添加"
          className={cn(
            'grid size-7 place-items-center rounded-md text-foreground/60 transition-[background-color,transform] hover:bg-foreground/[0.06] hover:text-foreground active:scale-[0.97] data-[state=open]:bg-foreground/[0.06] data-[state=open]:text-foreground',
            className,
          )}
        >
          <Plus className="size-[17px]" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" sideOffset={6} className="w-[210px] rounded-xl p-1 shadow-lg" onCloseAutoFocus={(event) => event.preventDefault()}>
        <DropdownMenuItem onSelect={onAttach} className={itemClass}>
          <Paperclip size={14} /> <span className="flex-1">添加文件或图片 {hint('Ctrl+U')}</span>
        </DropdownMenuItem>
        {onAttachFolder && (
          <DropdownMenuItem onSelect={onAttachFolder} className={itemClass}>
            <Folder size={14} /> 添加文件夹
          </DropdownMenuItem>
        )}
        {onInsertText && (
          <>
            <DropdownMenuItem onSelect={() => { setTimeout(() => onInsertText('/'), 0) }} className={itemClass}>
              <Sparkles size={14} /> <span className="flex-1">用技能 {hint('/')}</span>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => { setTimeout(() => onInsertText('@'), 0) }} className={itemClass}>
              <AtSign size={14} /> <span className="flex-1">引用文件 {hint('@')}</span>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
