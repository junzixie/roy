/**
 * 使用体验（原「性能优化」草稿页）
 *
 * 只暴露真正接到运行时的项。旧面板里的 compactionThresholdPercent:60、
 * keepRecentTokens、虚拟滚动、性能监控等从未接线，已全部拿掉，避免误导。
 */

import * as React from 'react'
import { CompactionExperienceCard } from './CompactionExperienceCard'
import { SettingsCard, SettingsSection } from './primitives'

export function PerformanceSettings(): React.ReactElement {
  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h2 className="text-[17px] font-semibold text-foreground">使用体验</h2>
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          管「什么时候自动整理上下文」。固定为「保留缓存 · 90%」，对齐 Claude / Codex 近满再压；改完下一步生效。
        </p>
      </div>

      <CompactionExperienceCard />

      <SettingsSection
        title="说明"
        description="下面这些以前出现在性能优化草稿里，但从未接到 Roy 运行时，所以不再提供开关。"
      >
        <SettingsCard>
          <ul className="space-y-2 px-4 py-3 text-[12.5px] leading-relaxed text-muted-foreground">
            <li>「压缩触发阈值 60% / 保留 6000 tokens」——写入无效字段，真正生效的是上面的 autoCompactPercent。</li>
            <li>「完整轮次切分 / 虚拟滚动 / 动画 / 性能监控」——没有对应 IPC 与运行时开关。</li>
            <li>保留原文预算由系统按窗口自动计算，压缩后残留偏高还会再收紧，无需手填。</li>
          </ul>
        </SettingsCard>
      </SettingsSection>
    </div>
  )
}
