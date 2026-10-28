/**
 * 复制按钮
 *
 * 移植自 CDS 的复制反馈状态机：点击后立即切成绿色勾选，
 * 静默展示 2.5s 再淡出恢复，避免用户没看到就消失，
 * 也避免长时间停留在“已复制”造成状态误判。
 */

import * as React from 'react'
import { CheckIcon, CopyIcon } from 'lucide-react'
import { MessageAction } from '@/components/ai-elements/message'
import { copyTextToClipboard } from '@/lib/clipboard'
import { cn } from '@/lib/utils'

interface CopyButtonProps {
  content: string
}

/** 勾选图标静默展示时长，之后开始淡出 */
const COPIED_HOLD_MS = 2500

export function CopyButton({ content }: CopyButtonProps): React.ReactElement {
  const [copied, setCopied] = React.useState(false)
  const timerRef = React.useRef<number | null>(null)

  // 卸载时清掉定时器，避免在已卸载组件上 setState
  React.useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
  }, [])

  const handleCopy = React.useCallback(async () => {
    try {
      await copyTextToClipboard(content)
      setCopied(true)
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => {
        setCopied(false)
        timerRef.current = null
      }, COPIED_HOLD_MS)
    } catch (error) {
      console.error('复制失败:', error)
    }
  }, [content])

  return (
    <MessageAction
      tooltip={copied ? '已复制' : '复制'}
      onClick={handleCopy}
    >
      {copied ? (
        <CheckIcon className={cn('size-4 text-emerald-600 dark:text-emerald-400', 'roy-copied-fade')} />
      ) : (
        <CopyIcon className="size-4" />
      )}
    </MessageAction>
  )
}
