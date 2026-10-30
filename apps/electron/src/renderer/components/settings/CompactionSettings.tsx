/**
 * 上下文压缩阈值设置（模型配置页内）
 *
 * 与「使用体验」页、对话角标共用同一 autoCompactPercent。
 */

import * as React from 'react'
import { CompactionExperienceCard } from './CompactionExperienceCard'

export function CompactionSettings(): React.ReactElement {
  return (
    <CompactionExperienceCard
      title="上下文压缩"
      description="占用到设定比例后，在一轮做完的空闲时把前面的对话压成摘要，腾出上下文。与「使用体验」和输入框角标同步。"
    />
  )
}
