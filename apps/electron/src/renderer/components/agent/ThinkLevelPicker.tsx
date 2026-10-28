import { supportedThinkingIndexes, recommendedThinkingIndex, selectThinkingLevel } from './thinking-level-options'
/**
 * 思考强度（照 Arthur）
 *
 * 底栏是一个彩色档位名，点开是一条蓝到紫的渐变滑块：轻度 / 中 / 高 / 极高 / Ultra。
 * 当前模型不支持的档位灰掉、拖不过去；档位名切换带一个短动画。
 * 旧配置里的「关闭 / 最小」按「轻度」显示。
 */

import * as React from 'react'
import { RotateCcw } from 'lucide-react'
import type { AgentThinkingLevel } from '@roy/shared'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export const THINK: Array<{ v: AgentThinkingLevel; n: string; c: string; d: string }> = [
  { v: 'low', n: '轻度', c: '#4f7cf0', d: '想一下再答，最快最省，日常聊天、简单改动' },
  { v: 'medium', n: '中', c: '#5f6cf2', d: '认真想，写代码、分析问题推荐' },
  { v: 'high', n: '高', c: '#7a5cf3', d: '很仔细，难题用，慢一些' },
  { v: 'xhigh', n: '极高', c: '#9352f2', d: '非常仔细、更慢更贵；只有较新的推理模型支持，老模型会忽略' },
  { v: 'max', n: 'Ultra', c: '#a646ef', d: '拉满：最慢最贵，新一代 Claude（Opus 4.6 以后、Sonnet 5）才支持' },
]

const indexOf = (v: AgentThinkingLevel | undefined): number => Math.max(0, THINK.findIndex((t) => t.v === v))

interface ThinkLevelPickerProps {
  level: AgentThinkingLevel
  /** 当前模型支持的档位 */
  levels: readonly AgentThinkingLevel[]
  modelLabel?: string
  compact?: boolean
  onChange: (level: AgentThinkingLevel) => void
}

export function ThinkLevelPicker({ level, levels, modelLabel, compact, onChange }: ThinkLevelPickerProps): React.ReactElement {
  const [open, setOpen] = React.useState(false)
  const [drag, setDrag] = React.useState<number | null>(null)
  // 当前模型真正支持的档位（THINK 下标）。滑块只在可用档位之间均匀排布，
  // 而不是按 low/medium/high/xhigh/max 的绝对位置留出空洞。
  const slots = supportedThinkingIndexes(levels)
  const lastSlot = Math.max(0, slots.length - 1)
  const slotOf = (k: number): number => {
    const found = slots.indexOf(k)
    if (found >= 0) return found
    let best = 0
    for (let n = 0; n < slots.length; n += 1) {
      if (Math.abs(slots[n]! - k) < Math.abs(slots[best]! - k)) best = n
    }
    return best
  }
  const i = drag ?? indexOf(level)
  const t = THINK[i]!
  const slot = slotOf(i)
  const pick = (k: number): void => {
    const value = selectThinkingLevel(k, levels)
    if (value && levels.includes(value) && value !== level) onChange(value)
  }
  const done = (): void => {
    if (drag != null) pick(drag)
    setDrag(null)
  }
  const at = (n: number): string => (lastSlot === 0 ? '50%' : `calc(14px + (100% - 28px) * ${n / lastSlot})`)
  const pos = at(slot)
  const filled = slots.length === 1 ? '100%' : `calc(${pos} + 14px)`

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={`思考强度：${t.d}`}
          className={cn('flex h-7 shrink-0 items-center rounded-md px-1.5 text-[12.5px] transition-colors hover:bg-foreground/[0.06]', open && 'bg-foreground/[0.06]')}
          style={{ color: t.c }}
        >
          {compact ? t.n.slice(0, 1) : t.n}
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" sideOffset={8} className="w-[300px] rounded-xl p-0 shadow-lg" onOpenAutoFocus={(e) => e.preventDefault()}>
        <div className="relative px-4 pb-4 pt-3">
          <button
            type="button"
            onClick={() => pick(recommendedThinkingIndex(levels))}
            disabled={slots.length === 0}
            title="恢复推荐：支持中度时用中度，否则使用最低可用档"
            className="absolute right-2.5 top-2.5 rounded-md p-1 text-foreground/40 hover:bg-foreground/[0.06] hover:text-foreground"
          >
            <RotateCcw size={13} />
          </button>
          <div className="relative h-7 overflow-hidden text-center">
            <div key={t.v} className="text-[17px] font-semibold duration-150 animate-in fade-in slide-in-from-bottom-3 zoom-in-90" style={{ color: t.c }}>
              {t.n}
            </div>
          </div>
          <div className="text-center text-[11.5px] text-foreground/45">
            {t.v}
            {modelLabel ? ` · ${modelLabel}` : ''}
          </div>
          <div className="relative mt-3 h-8 rounded-full bg-foreground/[0.06]">
            <div
              className="absolute inset-y-0 left-0 rounded-full transition-[width,box-shadow] duration-200 ease-out"
              style={{ width: filled, background: `linear-gradient(90deg, #3b5bdb, ${t.c})`, boxShadow: `0 0 14px ${t.c}55` }}
            />
            {slots.map((k, n) => (
              <span
                key={THINK[k]!.v}
                className="pointer-events-none absolute top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{ left: at(n), opacity: n > slot ? 0.9 : 0.6, background: n > slot ? 'hsl(var(--muted-foreground))' : '#fff' }}
              />
            ))}
            <span
              className="pointer-events-none absolute top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-md ring-1 ring-black/10 transition-[left] duration-200 ease-out"
              style={{ left: pos }}
            />
            <input
              type="range"
              min={0}
              max={lastSlot}
              step={1}
              value={slot}
              disabled={slots.length === 0}
              onChange={(e) => setDrag(slots[Number(e.target.value)] ?? null)}
              onPointerUp={done}
              onKeyUp={done}
              onBlur={done}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              aria-label="思考强度"
            />
          </div>
          <div className="mt-1.5 flex justify-between text-[11px] text-foreground/45">
            {slots.map((k) => (
              <button type="button" title={THINK[k]!.d} onClick={() => pick(k)} key={THINK[k]!.v} className={cn('w-10 text-center', k === slots[0] && 'text-left', k === slots[slots.length - 1] && 'text-right', k === i && 'font-medium text-foreground')}>
                {THINK[k]!.n}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[12px] leading-5 text-foreground/50">{t.d}</p>
          {slots.length < THINK.length && (
            <p className="mt-1 text-[11.5px] leading-5 text-foreground/45">这个模型只支持 {slots.length} 个档位，滑块已按可用档位均分</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
