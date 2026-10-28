/**
 * VersionHistory - 版本历史
 *
 * 读安装包内置的更新说明（lib/changelog.ts），不依赖网络。
 * 原来读 GitHub Release，但 Roy 没有公开仓库，一直加载失败；旧实现备份在 backups/replaced-20261025。
 */

import * as React from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { CHANGELOG } from '@/lib/changelog'
import { ChangelogEntryView } from '@/components/onboarding/OnboardingGuide'
import { SettingsCard } from './primitives'

const INITIAL_VISIBLE = 5

export function VersionHistory(): React.ReactElement {
  const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set(CHANGELOG[0] ? [CHANGELOG[0].version] : []))
  const [showAll, setShowAll] = React.useState(false)
  const visible = showAll ? CHANGELOG : CHANGELOG.slice(0, INITIAL_VISIBLE)

  const toggle = (version: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(version)) next.delete(version)
      else next.add(version)
      return next
    })
  }

  return (
    <SettingsCard>
      <div className="border-b p-4">
        <h3 className="text-sm font-medium">版本历史</h3>
      </div>
      <div className="divide-y">
        {visible.map((entry, index) => {
          const isOpen = expanded.has(entry.version)
          return (
            <div key={entry.version} className="p-4">
              <button
                type="button"
                onClick={() => toggle(entry.version)}
                className="-m-4 flex w-[calc(100%+2rem)] items-center justify-between rounded-lg p-4 text-left transition-colors hover:bg-accent/50"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-medium">v{entry.version}</span>
                    {index === 0 && <span className="text-xs font-medium text-primary">最新</span>}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{entry.headline}</p>
                </div>
                <span className="ml-2 shrink-0 text-xs text-muted-foreground">{entry.date}</span>
                {isOpen
                  ? <ChevronUp className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
                  : <ChevronDown className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />}
              </button>
              {isOpen && <div className="mt-4"><ChangelogEntryView entry={entry} /></div>}
            </div>
          )
        })}
      </div>
      {!showAll && CHANGELOG.length > INITIAL_VISIBLE && (
        <div className="border-t p-3 text-center">
          <button type="button" className="text-xs text-primary hover:underline" onClick={() => setShowAll(true)}>显示全部</button>
        </div>
      )}
    </SettingsCard>
  )
}
