/** 伙伴：侧栏「伙伴」进入，只显示已安装的伙伴；全部伙伴在市场 → 伙伴。 */
import React from 'react'
import { Search, X } from 'lucide-react'
import { PartnersTab } from '@/components/agent-skills/PartnersTab'

export function PartnersView(): React.ReactElement {
  const [query, setQuery] = React.useState('')
  return (
    <div className="roy-page-enter flex h-full min-h-0 flex-col bg-content-area">
      <div className="flex shrink-0 items-center gap-3 px-6 pb-3 pt-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-[16px] font-semibold text-foreground">伙伴</h1>
          <p className="mt-0.5 text-[12.5px] text-foreground/45">已安装的伙伴；在输入框右下角切换，更多伙伴去市场添加</p>
        </div>
        <label className="flex h-8 w-64 items-center gap-2 rounded-lg border border-border bg-background px-2.5 focus-within:border-foreground/30">
          <Search size={14} className="shrink-0 text-foreground/40" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜已安装的伙伴" className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-foreground/35" />
          {query && <button type="button" aria-label="清空" onClick={() => setQuery('')} className="text-foreground/40 hover:text-foreground"><X size={13} /></button>}
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-8">
        <PartnersTab mode="installed" search={React.useDeferredValue(query)} />
      </div>
    </div>
  )
}
