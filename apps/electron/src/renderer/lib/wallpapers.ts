/**
 * 壁纸库
 *
 * 内置壁纸：用主题自带的 7 张图（assets/theme-previews），和主题外观保持一致。
 * 动态壁纸：两种来源
 *   1. Wallpaper Engine 创意工坊里能直接播的视频型（mp4 / webm），由主进程扫描后交给渲染层播放；
 *   2. 内置的矢量动画，不依赖任何素材，没装 Wallpaper Engine 也能用。
 *
 * 壁纸只做背景覆盖层，不参与主题变量计算，因此不会破坏「特殊风格」。
 */

import type { ThemeStyle } from '../../types'

export type WallpaperMode = 'light' | 'dark'

export interface WallpaperPreset {
  /** 和同名特殊风格（配色）的 ThemeStyle 一致，选壁纸时配色一起换 */
  id: Exclude<ThemeStyle, 'default'>
  name: string
  mode: WallpaperMode
  /** 纯色（设置里的色块和背景都用它） */
  color: string
  /** 鼠标悬停提示 */
  tooltip?: string
  /** 直接给 background-image 用（纯色写成单色渐变） */
  url: string
}

const solid = (color: string): string => `linear-gradient(${color}, ${color})`

/**
 * 内置壁纸：与特殊风格同名同 id，选壁纸等于把整窗色调换成那一套。
 * 以前用的是主题预览小图（竖版、低清），铺开后放大发糊、两侧模糊补边，总有杂纹；
 * 现在一律改成同色调的纯色，干净不花。老 id 在 LEGACY_IDS 里兼容。
 */
const BASE_WALLPAPERS: Array<Omit<WallpaperPreset, 'url'>> = [
  { id: 'slate-light', name: '云朵舞者', mode: 'light', color: '#E9E4DA' },
  { id: 'ocean-light', name: '晴空碧海', mode: 'light', color: '#D9E7F2' },
  { id: 'forest-light', name: '森息晨光', mode: 'light', color: '#DCE6D3' },
  { id: 'ocean-dark', name: '远山暮霭', mode: 'dark', color: '#1E2632' },
  { id: 'forest-dark', name: '森息夜语', mode: 'dark', color: '#121C17' },
  { id: 'slate-dark', name: '莫兰迪夜', mode: 'dark', color: '#231F27' },
  { id: 'terminal-dark', name: '旧屏微光', mode: 'dark', color: '#10130D', tooltip: '该配色包含轻微闪烁动画' },
]

export const WALLPAPERS: WallpaperPreset[] = BASE_WALLPAPERS.map((preset) => ({ ...preset, url: solid(preset.color) }))

const LEGACY_IDS: Record<string, WallpaperPreset['id']> = {
  'cloud-dancer': 'slate-light',
  'forest-morning': 'forest-light',
  'forest-night': 'forest-dark',
  'morandi-night': 'slate-dark',
}

export function getWallpaper(id: string | undefined): WallpaperPreset | undefined {
  if (!id) return undefined
  const key = LEGACY_IDS[id] ?? id
  return WALLPAPERS.find((wallpaper) => wallpaper.id === key)
}

// ===== 内置动态壁纸 =====

const blob = (
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: string,
  opacity: number,
  id: string,
): string =>
  `<radialGradient id="${id}"><stop offset="0" stop-color="${color}" stop-opacity="${opacity}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient><ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#${id})"/>`

const dataUrl = (markup: string): string =>
  `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/'/g, '%27')}")`

const dynamicSvg = (top: string, bottom: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs><rect width="1600" height="1000" fill="url(#g)"/></svg>`

const overlaySvg = (blobs: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="none"><defs>${blobs}</defs></svg>`

export interface DynamicWallpaperPreset {
  id: string
  name: string
  mode: WallpaperMode
  /** 底色渐变 */
  url: string
  /** 叠在上面缓慢漂移的光斑层 */
  overlay: string
  /** 一个完整循环的时长（秒） */
  duration: number
}

const DYNAMIC_RAW = [
  { id: 'flow-aurora', name: '流动极光', mode: 'dark' as const, top: '#0a1526', bottom: '#101b33', duration: 28 },
  { id: 'flow-sunrise', name: '流动晨光', mode: 'light' as const, top: '#fdf3e3', bottom: '#e8eef7', duration: 32 },
  { id: 'flow-ocean', name: '流动深海', mode: 'dark' as const, top: '#061320', bottom: '#0a2030', duration: 36 },
  { id: 'flow-mint', name: '流动薄荷', mode: 'light' as const, top: '#eef7f2', bottom: '#e2f0f6', duration: 30 },
]

export const DYNAMIC_WALLPAPERS: DynamicWallpaperPreset[] = DYNAMIC_RAW.map((item) => ({
  id: item.id,
  name: item.name,
  mode: item.mode,
  url: dataUrl(dynamicSvg(item.top, item.bottom)),
  overlay: dataUrl(
    overlaySvg(
      blob(520, 420, 760, 520, item.mode === 'dark' ? '#3b7dd8' : '#ffffff', 0.34, 'a') +
        blob(1180, 700, 700, 480, item.mode === 'dark' ? '#6f4fd0' : '#cfe4f7', 0.3, 'b') +
        blob(880, 200, 620, 420, item.mode === 'dark' ? '#1f9f9f' : '#ffe3c2', 0.22, 'c'),
    ),
  ),
  duration: item.duration,
}))

export function getDynamicWallpaper(id: string | undefined): DynamicWallpaperPreset | undefined {
  if (!id) return undefined
  return DYNAMIC_WALLPAPERS.find((wallpaper) => wallpaper.id === id)
}

/** Wallpaper Engine 创意工坊里扫到的视频型壁纸。 */
export interface WorkshopWallpaper {
  id: string
  title: string
  /** 本地绝对路径（mp4 / webm） */
  file: string
}

export function isVideoWallpaper(file: string): boolean {
  return /\.(mp4|webm)$/i.test(file)
}
