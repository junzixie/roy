/**
 * 上下文压缩阈值设置
 *
 * 对应 Arthur 的「什么时候自动静默压缩上下文」：占用到设定比例后，
 * 在一轮做完的空闲时把前面的对话压成摘要，腾出上下文。
 *
 * 这个值直接换算成 Pi SDK 的 reserveTokens，所以改了立刻影响下一次运行。
 */

import * as React from 'react'
import { PI_AUTO_COMPACTION_MAX_PERCENT, PI_AUTO_COMPACTION_MIN_PERCENT } from '@roy/shared'
import { SettingsCard, SettingsRow, SettingsSection } from './primitives'

const DEFAULT_PERCENT = 80

export function CompactionSettings(): React.ReactElement {
  const [percent, setPercent] = React.useState<number>(DEFAULT_PERCENT)
  const [loaded, setLoaded] = React.useState(false)

  React.useEffect(() => {
    void window.electronAPI
      .getSettings()
      .then((settings) => {
        const value = (settings as { autoCompactPercent?: number }).autoCompactPercent
        if (typeof value === 'number') setPercent(value)
      })
      .catch(() => { /* 读不到就用默认值 */ })
      .finally(() => setLoaded(true))
  }, [])

  const update = React.useCallback((next: number) => {
    setPercent(next)
    void window.electronAPI.updateSettings({ autoCompactPercent: next }).catch((error: unknown) => {
      console.error('[压缩设置] 保存失败:', error)
    })
  }, [])

  return (
    <SettingsSection
      title="上下文压缩"
      description="占用到设定比例后，在一轮做完的空闲时把前面的对话压成摘要，腾出上下文"
    >
      <SettingsCard>
        <SettingsRow
          label="自动静默压缩"
          description={
            percent >= 95
              ? `${percent}%：几乎撑满才压缩，尽量保留原文，但更容易在一次请求里撞上限`
              : percent <= 55
                ? `${percent}%：很早就压缩，省上下文但更容易丢细节`
                : `${percent}%：越低越早压缩、越省上下文；越高越保留原文`
          }
        >
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={PI_AUTO_COMPACTION_MIN_PERCENT}
              max={PI_AUTO_COMPACTION_MAX_PERCENT}
              step={1}
              value={percent}
              disabled={!loaded}
              onChange={(event) => update(Number(event.target.value))}
              className="w-40 accent-[hsl(var(--primary))]"
            />
            <span className="w-10 text-right text-[12.5px] tabular-nums text-foreground/60">
              {percent}%
            </span>
          </div>
        </SettingsRow>
      </SettingsCard>
    </SettingsSection>
  )
}
