/**
 * 壁纸设置（照 Arthur）
 *
 * 来源选一种：不铺 / 动态壁纸 / 自己的图片
 * 主题独立管理整套配色，不再提供内置壁纸。
 * - 动态壁纸：Wallpaper Engine 创意工坊订阅的都能用——视频型（mp4 / webm）直接播，
 *   场景型（scene.pkg）用 WebWallGL 实时渲染，都不用 Wallpaper Engine 在后台跑；也能直接选本地视频
 * - 自己的图片：选一张图，复制到数据目录（原图删了也不影响）
 */

import * as React from 'react'
import { Check, Film, ImagePlus, Monitor, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import type { WallpaperSettings } from '../../../types'
import { cn } from '@/lib/utils'
import { PROCEDURAL_WALLPAPERS, getProceduralWallpaper } from '@/lib/procedural-wallpapers'

interface WallpaperPickerProps {
  value: WallpaperSettings | undefined
  onChange: (next: WallpaperSettings) => void
}

interface WorkshopItem {
  id: string
  title: string
  file: string
  path: string
  kind: 'video' | 'scene'
}

/** 系统自带壁纸（Windows\\Web\\Wallpaper） */
interface BuiltinItem {
  path: string
  name: string
  group: string
}

/** 系统壁纸缩略图：拿到 roy-file 地址后再显示，避免直接引用本地路径被拦 */
function BuiltinThumb({ path }: { path: string }): React.ReactElement {
  const [url, setUrl] = React.useState('')
  React.useEffect(() => {
    let cancelled = false
    void window.electronAPI.getWallpaperFileUrl(path).then((next) => {
      if (!cancelled) setUrl(next ?? '')
    }).catch(() => {})
    return () => { cancelled = true }
  }, [path])
  if (!url) return <div className="h-full w-full bg-foreground/[0.06]" />
  return <img src={url} alt="" loading="lazy" className="h-full w-full object-cover transition-transform group-hover:scale-105" />
}

const DEFAULT_VALUE: WallpaperSettings = {
  source: 'none',
  scope: 'chat',
  strength: 40,
  boldText: false,
}

const SOURCES: Array<{ id: WallpaperSettings['source']; label: string }> = [
  { id: 'builtin', label: '内置壁纸' },
  { id: 'dynamic', label: '动态壁纸' },
  { id: 'custom', label: '自己的图片' },
]

const btnClass =
  'inline-flex h-8 items-center gap-1.5 rounded-md border border-border/70 px-2.5 text-[12.5px] text-foreground/75 transition-colors hover:bg-foreground/[0.05] hover:text-foreground'

function Segmented<T extends string>({ value, options, onChange }: {
  value: T
  options: Array<{ id: T; label: string }>
  onChange: (value: T) => void
}): React.ReactElement {
  return (
    <div className="flex items-center gap-0.5 rounded-lg bg-foreground/[0.05] p-0.5 text-[12.5px]">
      {options.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          className={cn(
            'rounded-md px-2.5 py-1 transition-colors',
            value === item.id
              ? 'bg-background font-medium text-foreground shadow-sm'
              : 'text-foreground/55 hover:text-foreground',
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

function Row({ label, description, children }: {
  label: string
  description?: React.ReactNode
  children?: React.ReactNode
}): React.ReactElement {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="text-[13px] text-foreground/85">{label}</div>
        {description && <div className="mt-0.5 text-[11.5px] text-foreground/45">{description}</div>}
      </div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </div>
  )
}

export function WallpaperPicker({ value, onChange }: WallpaperPickerProps): React.ReactElement {
  const config = value ?? DEFAULT_VALUE
  // 旧版「内置壁纸」已并入主题：按不铺显示，配色由主题决定
  const sourceValue: WallpaperSettings['source'] = config.source === 'preset' ? 'none' : config.source
  const [workshop, setWorkshop] = React.useState<WorkshopItem[] | null>(null)
  const [imageUrl, setImageUrl] = React.useState('')
  const [scanning, setScanning] = React.useState(false)
  const [builtin, setBuiltin] = React.useState<BuiltinItem[] | null>(null)
  const [builtinLoading, setBuiltinLoading] = React.useState(false)

  /** 读取 Windows 自带壁纸（只读扫描，失败不报错） */
  const loadBuiltin = async (): Promise<void> => {
    if (builtin) { setBuiltin(null); return }
    setBuiltinLoading(true)
    try {
      const list = await window.electronAPI.listBuiltinWallpapers()
      setBuiltin(list ?? [])
      if (!list?.length) toast('没找到系统自带壁纸')
    } catch (error) {
      console.error('[壁纸] 读取系统壁纸失败:', error)
      setBuiltin([])
      toast.error('读取系统壁纸失败')
    } finally {
      setBuiltinLoading(false)
    }
  }

  const patch = React.useCallback((next: Partial<WallpaperSettings>) => {
    onChange({ ...config, ...next })
  }, [config, onChange])

  // 自己的图片：缩略图要换成本次有效的地址
  React.useEffect(() => {
    const file = config.custom
    if (!file) {
      setImageUrl('')
      return
    }
    if (/^(data:|https?:|roy-file:|file:)/i.test(file)) {
      setImageUrl(file)
      return
    }
    let cancelled = false
    void window.electronAPI.getWallpaperFileUrl(file).then((url) => {
      if (!cancelled) setImageUrl(url ?? '')
    })
    return () => { cancelled = true }
  }, [config.custom])

  const changeSource = (source: WallpaperSettings['source']): void => {
    if (source === sourceValue) return
    onChange({ ...config, source })
    setWorkshop(null)
  }

  const scanWorkshop = async (): Promise<void> => {
    setScanning(true)
    try {
      const list = (await window.electronAPI.listWorkshopWallpapers()) as WorkshopItem[]
      if (!list?.length) {
        toast('没扫到工坊里的壁纸。也可以直接「选视频文件」挑一个 mp4 / webm')
        setWorkshop(null)
        return
      }
      setWorkshop(list)
    } catch (error) {
      console.error('[壁纸] 扫描 Wallpaper Engine 工坊失败:', error)
      toast.error('扫描创意工坊失败')
    } finally {
      setScanning(false)
    }
  }

  const pickImage = async (): Promise<void> => {
    try {
      const file = await window.electronAPI.pickWallpaperImage()
      if (file) patch({ source: 'custom', custom: file })
    } catch (error) {
      toast.error(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : '选图片失败')
    }
  }

  const pickVideo = async (): Promise<void> => {
    const file = await window.electronAPI.pickWallpaperVideo()
    if (file) patch({ source: 'dynamic', videoFile: file, scene: undefined, dynamic: undefined })
  }

  const procedural = getProceduralWallpaper(config.dynamic)
  const dynamicName = config.scene
    ? workshop?.find((item) => item.id === config.scene)?.title ?? `场景壁纸 ${config.scene}`
    : config.videoFile
      ? config.videoFile.split(/[\\/]/).pop()
      : ''
  const legacyVideo = !!config.videoFile && /^roy-file:/i.test(config.videoFile)
  const hasWallpaper =
    (config.source === 'builtin' && !!procedural) ||
    (config.source === 'dynamic' && (!!config.scene || !!config.videoFile)) ||
    (config.source === 'custom' && !!config.custom)

  return (
    <div className="space-y-3 px-4 py-3">
      <Row label="壁纸" description="内置壁纸、动态壁纸或自己的图片；清除后显示主题底色，换主题不会清掉壁纸">
        <Segmented value={sourceValue} options={SOURCES} onChange={changeSource} />
      </Row>

      {/* 内置壁纸：几 KB 着色器，随包内置、不联网 */}
      {config.source === 'builtin' && (
        <div className="space-y-2.5">
          <Row
            label="内置壁纸"
            description={procedural ? `正在用：${procedural.name}。${procedural.description}` : '随 Roy 内置的动态效果，不联网、不占磁盘，窗口切走自动暂停'}
          >
            {procedural && (
              <button type="button" className={cn(btnClass, 'px-2')} title="去掉内置壁纸" onClick={() => patch({ dynamic: undefined })}>
                <Trash2 className="size-3.5" />
              </button>
            )}
          </Row>
          <div className="grid grid-cols-3 gap-2">
            {PROCEDURAL_WALLPAPERS.map((item) => {
              const selected = config.dynamic === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  title={item.description}
                  onClick={() => patch({ source: 'builtin', dynamic: item.id })}
                  className={cn(
                    'group relative overflow-hidden rounded-lg border text-left transition-colors',
                    selected ? 'border-primary ring-1 ring-primary/40' : 'border-border/70 hover:border-foreground/30',
                  )}
                >
                  <div className="aspect-[16/10] w-full transition-transform group-hover:scale-105" style={{ background: item.thumb }} />
                  <div className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-black/70 to-transparent px-2 pb-1.5 pt-4 text-[12px] text-white">
                    <span className="truncate">{item.name}</span>
                    {selected && <Check className="ml-auto size-3.5 shrink-0" />}
                  </div>
                </button>
              )
            })}
          </div>
          {procedural && (
            <>
              <Row label="帧率" description="这类效果变化很慢，30 帧和 60 帧看不出差别">
                <Segmented
                  value={String(config.sceneFps ?? 30)}
                  options={[{ id: '60', label: '60' }, { id: '30', label: '30' }, { id: '24', label: '24' }]}
                  onChange={(next) => patch({ sceneFps: Number(next) })}
                />
              </Row>
              <Row label="切走时暂停" description="窗口最小化或切到别的程序时停掉渲染，省电省显卡">
                <input
                  type="checkbox"
                  checked={config.scenePause !== false}
                  onChange={(event) => patch({ scenePause: event.target.checked })}
                  className="size-4 accent-[hsl(var(--primary))]"
                />
              </Row>
            </>
          )}
        </div>
      )}

      {/* 动态壁纸 */}
      {config.source === 'dynamic' && (
        <div className="space-y-2.5">
          <Row
            label="动态壁纸"
            description={
              legacyVideo
                ? '这张是旧版本选的，重启后失效了，请重新挑一次'
                : dynamicName
                  ? `正在用：${dynamicName}`
                  : '支持工坊视频型壁纸；场景型用 WebGL 渲染，部分效果可能不兼容，无需 Wallpaper Engine 在后台运行'
            }
          >
            <button type="button" className={btnClass} disabled={scanning} onClick={() => { void scanWorkshop() }}>
              <Film className="size-3.5" />
              {scanning ? '正在扫…' : '从工坊挑'}
            </button>
            <button type="button" className={btnClass} onClick={() => { void pickVideo() }}>
              <Upload className="size-3.5" />
              选视频文件
            </button>
            {(config.scene || config.videoFile) && (
              <button
                type="button"
                className={cn(btnClass, 'px-2')}
                title="去掉动态壁纸"
                onClick={() => patch({ scene: undefined, videoFile: undefined })}
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
          </Row>

          {workshop && (
            <div className="rounded-lg border border-border/70 bg-foreground/[0.02] p-2">
              <div className="mb-1.5 flex items-center justify-between px-1">
                <span className="text-[12px] text-foreground/45">扫到 {workshop.length} 个壁纸；场景型个别可能不兼容</span>
                <button type="button" className="text-[12px] text-foreground/45 hover:text-foreground" onClick={() => setWorkshop(null)}>收起</button>
              </div>
              <div className="max-h-52 overflow-y-auto">
                {workshop.map((item) => {
                  const selected = item.kind === 'scene' ? config.scene === item.id : config.videoFile === item.path
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={cn(
                        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] transition-colors',
                        selected ? 'bg-primary/10 text-foreground' : 'text-foreground/70 hover:bg-foreground/[0.05] hover:text-foreground',
                      )}
                      onClick={() => {
                        if (item.kind === 'scene') patch({ scene: item.id, videoFile: undefined, dynamic: undefined })
                        else patch({ videoFile: item.path, scene: undefined, dynamic: undefined })
                        toast(`已选择「${item.title}」，正在加载`)
                      }}
                    >
                      <Film className="size-3.5 shrink-0" />
                      <span className="truncate">{item.title}</span>
                      {selected && <Check className="size-3.5 shrink-0 text-primary" />}
                      <span className="ml-auto shrink-0 rounded bg-primary/15 px-1.5 py-px text-[10.5px] text-primary">
                        {item.kind === 'video' ? '视频' : '场景'}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {config.scene && (
            <>
              <Row label="帧率" description="动态壁纸跑满刷新率会让笔记本发热；调到 30 一般看不出差别">
                <Segmented
                  value={String(config.sceneFps ?? 30)}
                  options={[{ id: '60', label: '60' }, { id: '30', label: '30' }, { id: '24', label: '24' }]}
                  onChange={(next) => patch({ sceneFps: Number(next) })}
                />
              </Row>
              <Row label="切走时暂停" description="窗口最小化或切到别的程序时停掉渲染，省电省显卡">
                <input
                  type="checkbox"
                  checked={config.scenePause !== false}
                  onChange={(event) => patch({ scenePause: event.target.checked })}
                  className="size-4 accent-[hsl(var(--primary))]"
                />
              </Row>
            </>
          )}
        </div>
      )}

      {/* 自己的图片 */}
      {config.source === 'custom' && (
        <Row label="图片" description={config.custom ? '图片已复制到数据目录，原图删了也不影响' : '支持 png / jpg / webp / gif / bmp，20MB 以内'}>
          {imageUrl ? (
            <img src={imageUrl} alt="壁纸预览" className="h-10 w-16 rounded-md object-cover ring-1 ring-border/60" />
          ) : null}
          <button type="button" className={btnClass} onClick={() => { void pickImage() }}>
            <ImagePlus className="size-3.5" />
            {config.custom ? '换一张' : '选图片'}
          </button>
          {config.custom && (
            <button type="button" className={cn(btnClass, 'px-2')} title="去掉自己的图片" onClick={() => patch({ custom: undefined })}>
              <Trash2 className="size-3.5" />
            </button>
          )}
          <button type="button" className={btnClass} disabled={builtinLoading} onClick={() => { void loadBuiltin() }}>
            <Monitor className="size-3.5" />
            {builtinLoading ? '正在读…' : builtin ? '收起本机图片' : '本机图片'}
          </button>
        </Row>
      )}

      {/* 本机图片：Windows 自带壁纸库，只读扫描 */}
      {config.source === 'custom' && builtin && (
        <div className="rounded-lg border border-border/70 bg-foreground/[0.02] p-2">
          <div className="mb-1.5 flex items-center justify-between px-1">
            <span className="text-[12px] text-foreground/45">
              {builtin.length ? `系统自带壁纸 ${builtin.length} 张` : '没找到系统自带壁纸'}
            </span>
            <button type="button" className="text-[12px] text-foreground/45 hover:text-foreground" onClick={() => setBuiltin(null)}>收起</button>
          </div>
          {builtin.length > 0 && (
            <div className="grid max-h-64 grid-cols-4 gap-2 overflow-y-auto p-1">
              {builtin.map((item) => {
                const selected = config.custom === item.path
                return (
                  <button
                    key={item.path}
                    type="button"
                    title={item.name}
                    className={cn(
                      'group relative aspect-video overflow-hidden rounded-md ring-1 transition-all',
                      selected ? 'ring-2 ring-primary' : 'ring-border/60 hover:ring-foreground/30',
                    )}
                    onClick={() => {
                      patch({ custom: item.path })
                      toast(`已选择系统壁纸「${item.name}」`)
                    }}
                  >
                    <BuiltinThumb path={item.path} />
                    {selected && (
                      <span className="absolute right-1 top-1 rounded-full bg-primary p-0.5 text-primary-foreground">
                        <Check className="size-3" />
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      <Row label="回复时降低视觉效果" description="AI 回复期间暂停毛玻璃，减少重绘；回复结束自动恢复">
        <input type="checkbox" aria-label="回复时降低视觉效果" checked={config.reduceEffectsWhileReplying !== false} onChange={event => patch({ reduceEffectsWhileReplying: event.target.checked })} />
      </Row>
      {/* 铺法与强度：有壁纸时才显示 */}
      {hasWallpaper && (
        <>
          <Row label="铺在哪" description="整个窗口：侧栏、标签栏都透出壁纸">
            <Segmented
              value={config.scope}
              options={[{ id: 'chat', label: '只在对话区' }, { id: 'all', label: '整个窗口' }]}
              onChange={(scope) => patch({ scope })}
            />
          </Row>
          <Row
            label="面板不透明度"
            description={`${config.strength}%：越低壁纸透出越多，越高面板越实。字看不清就往上调；动态壁纸建议 25%～45%`}
          >
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={config.strength}
              onChange={(event) => patch({ strength: Number(event.target.value) })}
              className="w-40 accent-[hsl(var(--primary))]"
            />
          </Row>
          <Row label="文字清晰度" description="从原始文字到更粗、更高对比度；深色主题保持浅色文字">
            <input
              type="range" min={0} max={100} step={25} aria-label="文字清晰度"
              value={config.textClarity ?? (config.boldText ? 50 : 0)}
              onChange={(event) => patch({ textClarity: Number(event.target.value), boldText: Number(event.target.value) > 0 })}
              className="w-40 accent-[hsl(var(--primary))]"
            />
          </Row>
        </>
      )}
    </div>
  )
}
