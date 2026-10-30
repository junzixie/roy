/**
 * 上下文压缩策略（共用）
 *
 * 唯一生效设置：autoCompactPercent。
 * 使用体验页主推且默认只保留「保留缓存 · 90%」（对齐 Claude/Codex 近满再压）。
 * 不是「自己清缓存」——是窗口快满时在后台静默整理成摘要。
 */

import * as React from 'react'
import { normalizeCacheMode, normalizeCompactionPercent, type RoyCacheMode } from '@roy/shared'
import { SettingsCard, SettingsSection } from './primitives'
import { SettingsSegmentedControl } from './primitives/SettingsSegmentedControl'

/** 主推且默认的唯一策略：近满再压。 */
export const COMPACTION_PRESETS = [
  {
    value: 90,
    key: 'cache',
    label: '保留缓存',
    short: '90%',
    hint: '窗口用到约九成时才自动整理。不是手动清缓存，而是后台静默摘要，尽量保住提示缓存与原文——对齐 Claude / Codex。',
  },
] as const

/** 提示缓存档位。默认 high：Pi 的 short 在非 api.openai.com 地址上不发缓存亲和字段。 */
const CACHE_MODE_OPTIONS = [
  { value: 'high', label: '高缓存' },
  { value: 'standard', label: '标准' },
  { value: 'off', label: '关闭' },
]

export type CompactionPresetValue = (typeof COMPACTION_PRESETS)[number]['value']

const LOCKED_PERCENT = 90

export interface CompactionExperienceCardProps {
  title?: string
  description?: string
}

export function CompactionExperienceCard({
  title = '何时自动压缩上下文',
  description = '接近窗口上限时，在一轮做完的空闲里把前面的对话静默压成摘要。对齐 Claude / Codex：不打断聊天。',
}: CompactionExperienceCardProps): React.ReactElement {
  const [percent, setPercent] = React.useState<number>(LOCKED_PERCENT)
  const [loaded, setLoaded] = React.useState(false)
  /** 旧值被自动迁移到 90% 时记下原值，用于给用户可见提示。 */
  const [migratedFrom, setMigratedFrom] = React.useState<number | null>(null)
  const [cacheMode, setCacheMode] = React.useState<RoyCacheMode>('high')

  React.useEffect(() => {
    let cancelled = false
    void window.electronAPI
      .getSettings()
      .then((settings) => {
        if (cancelled) return
        const value = normalizeCompactionPercent((settings as { autoCompactPercent?: number }).autoCompactPercent)
        setPercent(value)
        setCacheMode(normalizeCacheMode((settings as { promptCacheMode?: string }).promptCacheMode))
        // 设置页只提供「保留缓存 90%」一个选项，旧值 70/80 需要迁到 90。
        // 迁移在设置页做是合理的（用户预期这里会改配置），但必须告知：
        // 静默改写用户配置是上一版的问题，这里补一句提示，让用户知道发生了什么。
        if (value !== LOCKED_PERCENT) {
          setPercent(LOCKED_PERCENT)
          setMigratedFrom(value)
          void window.electronAPI.updateSettings({ autoCompactPercent: LOCKED_PERCENT }).catch(() => undefined)
        }
      })
      .catch(() => {
        /* 读不到就用默认 90 */
      })
      .finally(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const preset = COMPACTION_PRESETS[0]

  const handleCacheModeChange = (value: string) => {
    const next = normalizeCacheMode(value)
    setCacheMode(next)
    void window.electronAPI.updateSettings({ promptCacheMode: next }).catch(() => undefined)
  }

  return (
    <SettingsSection title={title} description={description}>
      <SettingsCard>
        <div className="space-y-3 px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[13.5px] font-medium text-foreground">
                {preset.label} · {preset.short}
              </div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
                {preset.hint}
              </p>
            </div>
            <span className="shrink-0 rounded-full border border-border/70 bg-muted/40 px-2.5 py-1 text-[11.5px] tabular-nums text-foreground/70">
              {loaded ? `${percent}%` : '…'}
            </span>
          </div>

          <div className="border-t border-border/60 pt-3">
            <SettingsSegmentedControl
              label="提示缓存"
              description="多轮对话里重复的前缀可以命中服务端缓存，命中后这部分按更低价计费。高缓存保留更久，适合一轮一轮慢慢聊。"
              value={cacheMode}
              onValueChange={handleCacheModeChange}
              options={CACHE_MODE_OPTIONS}
            />
            {cacheMode === 'high' && (
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted-foreground">
                高缓存会带上会话亲和标记。部分按「缓存写入」单独计费的渠道可能反而更贵，遇到这种情况切到标准。
              </p>
            )}
          </div>

          <div className="space-y-1.5 border-t border-border/60 pt-3 text-[12px] leading-relaxed text-muted-foreground">
            {migratedFrom !== null && (
              <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-amber-700 dark:text-amber-400">
                检测到原来的 {migratedFrom}% 设置，已改为 90%。现在只保留「保留缓存」一种策略；
                如需更早压缩，请用会话里的 /compact 手动整理。
              </p>
            )}
            <p>自动整理在后台静默完成，聊天里不再弹出显眼的「正在整理上下文」。角标转圈表示在整理，不影响继续看消息。</p>
            <p>这不是「自己去清多少缓存」：到窗口约 90% 时系统才会自动摘要，尽量保住提示缓存命中。</p>
            <p>已验证窗口的模型按真实窗口算阈值；虚标超大窗口会保守封顶，避免永远不压或过早乱压。</p>
            <p>会话空闲约 45 秒且占用已过约 65% 水位时，会在后台静默预整理（与 90% 正式线、工具预截断、手动 /compact 不冲突）；聊天或回复中不会抢跑，一发消息就取消或让路。</p>
          </div>
        </div>
      </SettingsCard>
    </SettingsSection>
  )
}
