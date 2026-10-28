/**
 * 壁纸状态
 *
 * 把 settings.wallpaper 读成可直接渲染的形态。三种来源（照 Arthur）：
 * - 内置壁纸（builtin）：随包内置的着色器动效（procedural-wallpapers.ts）；旧版 preset 主题图已停用
 * - 动态壁纸（dynamic）：Wallpaper Engine 工坊——视频型直接播，场景型用 WebWallGL 渲染；也能选本地视频
 * - 自己的图片（custom）：复制到数据目录后的本地路径
 *
 * 本地文件只存原始路径，渲染时再换成本次运行有效的 roy-file:// 地址（见 WallpaperLayer）。
 */

import { atom } from 'jotai'
import type { WallpaperSettings } from '../../types'
import { getProceduralWallpaper } from '@/lib/procedural-wallpapers'

export type WallpaperKind = 'none' | 'image' | 'video' | 'scene' | 'procedural'

export interface WallpaperEffective {
  kind: WallpaperKind
  /**
   * image：CSS background-image 值（内置壁纸 / 旧版 data URL），或本地路径（needsResolve）
   * video：本地路径（或旧版已是 URL）
   * scene：工坊壁纸 id
   * procedural：内置程序化壁纸 id（procedural-wallpapers.ts）
   */
  src: string
  /** src 是本地路径，需要换成 roy-file:// 地址 */
  needsResolve: boolean
  scope: 'chat' | 'all'
  strength: number
  boldText: boolean
  /** 内置壁纸原图偏小时的放大倍数 */
  imageScale: number
  /** 内置壁纸的裁切焦点 */
  objectPosition: string
  sceneFps: number
  scenePause: boolean
  /** 竖版低清图：按高度铺、两侧模糊补满，不硬放大 */
  fitHeight: boolean
}

export type WallpaperConfig = WallpaperSettings

const EMPTY: WallpaperEffective = {
  kind: 'none',
  src: '',
  needsResolve: false,
  scope: 'chat',
  strength: 40,
  boldText: false,
  imageScale: 1,
  objectPosition: 'center',
  sceneFps: 30,
  scenePause: true,
  fitHeight: false,
}

export const wallpaperConfigAtom = atom<WallpaperConfig>({
  source: 'none',
  scope: 'chat',
  strength: 40,
  boldText: false,
})

const isUrl = (value: string): boolean => /^(data:|https?:|roy-file:|file:|blob:)/i.test(value)

/** 计算最终要渲染的壁纸 */
export const wallpaperEffectiveAtom = atom<WallpaperEffective>((get) => {
  const config = get(wallpaperConfigAtom)
  const base = {
    ...EMPTY,
    scope: config.scope ?? 'chat',
    strength: config.strength ?? 40,
    boldText: config.boldText ?? false,
    sceneFps: config.sceneFps ?? 30,
    scenePause: config.scenePause !== false,
  }

  // 旧版「内置壁纸」已并入主题配色，不再铺背景层
  if (config.source === 'preset') return EMPTY

  if (config.source === 'builtin') {
    return config.dynamic && getProceduralWallpaper(config.dynamic)
      ? { ...base, kind: 'procedural', src: config.dynamic }
      : EMPTY
  }

  if (config.source === 'dynamic') {
    if (config.scene) return { ...base, kind: 'scene', src: config.scene }
    if (config.videoFile) {
      // 旧版存的是 roy-file:// 地址（重启后失效），这种按失效处理，界面会提示重新选
      const legacyUrl = isUrl(config.videoFile)
      return { ...base, kind: 'video', src: config.videoFile, needsResolve: !legacyUrl }
    }
    return EMPTY
  }

  if (config.source === 'custom' && config.custom) {
    if (isUrl(config.custom)) return { ...base, kind: 'image', src: `url("${config.custom}")` }
    return { ...base, kind: 'image', src: config.custom, needsResolve: true }
  }

  return EMPTY
})

/** 当前窗口实际加载状态，不持久化。初始为未检查，避免壁纸其实开着却先报“未启用”。 */
export const wallpaperStatusAtom = atom<{state: string; message: string}>({state: 'idle', message: '正在读取壁纸状态…'})
