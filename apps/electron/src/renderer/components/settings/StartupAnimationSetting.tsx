/**
 * 启动动画选择
 *
 * 启动页在 renderer 加载之前就显示，所以这里存的只是一个名字，
 * 由主进程通过 loadFile 的 query 传给 startup-splash/index.html。
 *
 * 布局照《声音库》：上方是当前选择的预览，下方是编号网格。
 */

import * as React from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

import thumbOrb from '@/assets/startup/orb.webp'
import thumbAnimBg2 from '@/assets/startup/anim-bg2.webp'
import thumbAnimHf1 from '@/assets/startup/anim-hf1.webp'
import thumbArches from '@/assets/startup/fb-arches.webp'
import thumbAstronaut from '@/assets/startup/fb-astronaut.webp'
import thumbPlanet from '@/assets/startup/fb-planet.webp'
import thumbNeonHelmet from '@/assets/startup/fb-neon-helmet.webp'
import thumbBolt from '@/assets/startup/fb-bolt.webp'
import thumbNight from '@/assets/startup/fb-night.webp'
import thumbGateway from '@/assets/startup/fb-gateway.webp'
import thumbAurora from '@/assets/startup/fb-aurora.webp'

interface StartupAnimationOption {
  id: string
  label: string
  /** 一句话描述画面，和声音库的 feel 描述同位置 */
  description: string
  /** 对应视频时长（秒）；粒子球是代码绘制，标 LIVE */
  duration: string
  image: string
}

/** 与 resources/startup-splash/ 下的文件一一对应。 */
export const STARTUP_ANIMATION_OPTIONS: StartupAnimationOption[] = [
  { id: 'orb', label: '粒子球', description: '几千个点绕轴自转的代码球', duration: 'LIVE', image: thumbOrb },
  { id: 'fb-gateway', label: '赤色门廊', description: '云海中的双塔与落日', duration: '14.0', image: thumbGateway },
  { id: 'fb-planet', label: '熔岩行星', description: '环带行星与红色星云', duration: '10.0', image: thumbPlanet },
  { id: 'fb-bolt', label: '蓝色电流', description: '暗场里的电光枝条', duration: '8.0', image: thumbBolt },
  { id: 'fb-arches', label: '水中拱门', description: '静水、拱门与远山', duration: '8.0', image: thumbArches },
  { id: 'fb-astronaut', label: '太空人', description: '一束光扫过的背影', duration: '10.0', image: thumbAstronaut },
  { id: 'fb-neon-helmet', label: '霓虹头盔', description: '紫光勾勒的机甲正面', duration: '12.0', image: thumbNeonHelmet },
  { id: 'fb-aurora', label: '极光地平线', description: '深色渐变与一道极光', duration: '10.0', image: thumbAurora },
  { id: 'fb-night', label: '夜航列车', description: '窗边的人与一条光带', duration: '8.0', image: thumbNight },
  { id: 'anim-bg2', label: '光照草丛', description: '逆光里摇动的草叶', duration: '8.0', image: thumbAnimBg2 },
  { id: 'anim-hf1', label: '绿野太空人', description: '草地上的宇航员', duration: '10.0', image: thumbAnimHf1 },
  { id: 'random', label: '随机', description: '每次启动从上面的动画里抽一个', duration: 'MIX', image: thumbOrb },
]

const DEFAULT_ANIMATION = 'orb'

/** 已删除的重复动画 → 保留的同款，老设置不至于落空。启动页 index.html 里有同一张表。 */
export const LEGACY_STARTUP_ANIMATION_ALIASES: Record<string, string> = {
  'anim-neon': 'fb-neon-helmet',
  'anim-hf2': 'fb-planet',
}

export function StartupAnimationSetting(): React.ReactElement {
  const [value, setValue] = React.useState<string>(DEFAULT_ANIMATION)

  React.useEffect(() => {
    void window.electronAPI
      .getSettings()
      .then((settings) => {
        const saved = (settings as { startupAnimation?: string }).startupAnimation
        setValue(saved && saved !== '' ? (LEGACY_STARTUP_ANIMATION_ALIASES[saved] ?? saved) : DEFAULT_ANIMATION)
      })
      .catch(() => { /* 读不到就用默认的粒子球 */ })
  }, [])

  const update = React.useCallback((next: string) => {
    setValue(next)
    void window.electronAPI.updateSettings({ startupAnimation: next }).catch((error: unknown) => {
      console.error('[启动动画] 保存失败:', error)
    })
  }, [])

  const selectedIndex = Math.max(0, STARTUP_ANIMATION_OPTIONS.findIndex((option) => option.id === value))
  const selected: StartupAnimationOption = STARTUP_ANIMATION_OPTIONS[selectedIndex] ?? {
    id: DEFAULT_ANIMATION,
    label: '粒子球',
    description: '几千个点绕轴自转的代码球',
    duration: 'LIVE',
    image: thumbOrb,
  }
  const poolSize = STARTUP_ANIMATION_OPTIONS.filter((option) => option.id !== 'random').length

  return (
    <div className="border-t border-border/25 px-4 py-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-foreground">开场动画</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            下次启动生效，当前 {STARTUP_ANIMATION_OPTIONS.length} 个可选
          </div>
        </div>
        <span className="hidden shrink-0 text-[11px] text-muted-foreground sm:inline">
          {value === 'random' ? `随机 · 从 ${poolSize} 个里抽` : '固定'}
        </span>
      </div>

      {/* 当前选择：大预览 + 信息 + 编号 */}
      <div className="overflow-hidden border-2 border-foreground/70 bg-background/45 shadow-[4px_4px_0_rgba(122,110,206,0.4)]">
        <div className="grid grid-cols-[88px_1fr] items-center gap-3 px-3 py-2.5 sm:grid-cols-[104px_1fr]">
          <div className="relative aspect-[1.25] overflow-hidden border border-foreground/50 bg-muted">
            <img src={selected.image} alt="" className="size-full object-cover" />
            <span className="absolute left-1 top-1 bg-background/90 px-1 py-0.5 text-[9px] font-semibold tabular-nums">
              {String(selectedIndex + 1).padStart(2, '0')}
            </span>
          </div>
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="truncate text-base font-semibold text-foreground">{selected.label}</span>
              <span className="hidden shrink-0 text-[10px] uppercase tracking-[0.12em] text-muted-foreground sm:inline">
                {selected.duration === 'LIVE' ? 'CANVAS · 程序生成'
                  : selected.duration === 'MIX' ? 'RANDOM'
                    : `${selected.duration} S · VIDEO`}
              </span>
            </div>
            <p className="mt-1 truncate text-xs text-muted-foreground">{selected.description}</p>
          </div>
        </div>

        {/* 编号网格：每个格子点一下即选中 */}
        <div className="grid grid-cols-3 border-t-2 border-foreground/55 sm:grid-cols-4 lg:grid-cols-6">
          {STARTUP_ANIMATION_OPTIONS.map((option, index) => {
            const isSelected = option.id === value
            return (
              <div key={option.id} className="relative min-w-0 border-b border-r border-foreground/20 last:border-r-0">
                <button
                  type="button"
                  aria-pressed={isSelected}
                  title={`${option.label} · ${option.description}`}
                  onClick={() => update(option.id)}
                  className={cn(
                    'group/card flex min-h-[132px] w-full flex-col bg-background text-left transition-[background-color,transform] duration-150 hover:bg-muted/45 active:scale-[0.98]',
                    isSelected && 'bg-muted/70'
                  )}
                >
                  <span className="relative block aspect-[1.5] overflow-hidden border-b border-foreground/25">
                    <img
                      src={option.image}
                      alt=""
                      className="size-full object-cover transition-transform duration-200 group-hover/card:scale-105"
                    />
                    <span className="absolute left-1.5 top-1.5 bg-background/90 px-1 py-0.5 text-[9px] font-semibold tabular-nums">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    {isSelected && (
                      <Check className="absolute right-1.5 top-1.5 size-3.5 rounded-full bg-foreground p-0.5 text-background" />
                    )}
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5 px-2 py-1.5">
                    <span className="truncate text-xs font-medium text-foreground">{option.label}</span>
                    <span className="truncate text-[10px] leading-4 text-muted-foreground">{option.description}</span>
                  </span>
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
