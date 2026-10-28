/**
 * LongConversationHint — 对话太长时，在输入框上方建议「总结后换新对话」
 *
 * 判断依据和输入框右侧的上下文圆环相同：本轮输入 token / 模型上下文窗口。
 * 用到 70% 起显示；不知道窗口大小时按 12 万 token 算。
 * 点「不再提示」只对当前对话生效（本次运行期间）。
 */

import * as React from 'react'
import { useAtomValue } from 'jotai'
import { FileText, X } from 'lucide-react'
import { agentSessionViewStreamStateAtomFamily } from '@/atoms/agent-atoms'

const SHOW_RATIO = 0.7
const FALLBACK_TOKENS = 120_000
const dismissed = new Set<string>()

export function LongConversationHint({ sessionId, streaming, disabled, onSummarize }: {
  sessionId: string
  streaming: boolean
  disabled?: boolean
  onSummarize: () => void
}): React.ReactElement | null {
  const state = useAtomValue(agentSessionViewStreamStateAtomFamily(sessionId))
  const [, force] = React.useReducer((x: number) => x + 1, 0)
  const tokens = state.inputTokens ?? 0
  const ctxWindow = state.contextWindow
  const ratio = ctxWindow && ctxWindow > 0 ? tokens / ctxWindow : tokens / FALLBACK_TOKENS * SHOW_RATIO
  if (streaming || dismissed.has(sessionId) || tokens <= 0 || ratio < SHOW_RATIO) return null
  const percent = ctxWindow && ctxWindow > 0 ? Math.min(99, Math.round(ratio * 100)) : undefined

  return (
    <div className="flex items-center gap-2 px-3 pb-1 pt-2.5">
      <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2 text-[12.5px] text-foreground/80">
        <FileText size={14} className="shrink-0 text-amber-600 dark:text-amber-400" />
        <span className="min-w-0 flex-1 leading-5">
          这段对话已经很长{percent !== undefined ? `（上下文用了 ${percent}%）` : ''}，继续聊回复会变慢、更容易忘前面的内容。建议总结成摘要，在新对话里接着做。
        </span>
        <button
          type="button"
          disabled={disabled}
          onClick={onSummarize}
          className="shrink-0 rounded-md bg-primary px-2.5 py-1 text-[12px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          总结并换新对话
        </button>
        <button
          type="button"
          aria-label="不再提示"
          title="这个对话不再提示"
          onClick={() => { dismissed.add(sessionId); force() }}
          className="shrink-0 rounded p-0.5 text-foreground/40 hover:bg-foreground/[0.06] hover:text-foreground"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  )
}
