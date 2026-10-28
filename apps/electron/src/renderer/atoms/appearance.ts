/**
 * 外观偏好（字体、字号、对话宽度、壁纸）
 *
 * 统一驱动 :root 上的 CSS 变量，并持久化到 ~/.roy/settings.json。
 * 壁纸只做覆盖层，不参与主题变量，所以与「特殊风格」不冲突。
 */

import { atom } from 'jotai'
import {
  DEFAULT_CHAT_WIDTH,
  DEFAULT_UI_FONT_SIZE,
  type ChatWidth,
  type UiFontSize,
  type WallpaperSettings,
} from '../../types'

/** 界面字号档位 → 根字号 */
const UI_FONT_PX: Record<UiFontSize, number> = {
  compact: 13,
  normal: 14,
  comfortable: 15,
}

/** 对话宽度档位 → 消息列最大宽度 */
const CHAT_WIDTH_PX: Record<ChatWidth, number> = {
  narrow: 680,
  medium: 820,
  wide: 1040,
}

export const uiFontSizeAtom = atom<UiFontSize>(DEFAULT_UI_FONT_SIZE)
export const chatWidthAtom = atom<ChatWidth>(DEFAULT_CHAT_WIDTH)
/** 右侧文件面板打开时默认显示哪一类文件。 */
export const filesPanelDefaultSourceAtom = atom<'project' | 'session'>('project')

export function applyUiFontSizeToDOM(size: UiFontSize): void {
  document.documentElement.style.setProperty('--roy-ui-font-size', `${UI_FONT_PX[size]}px`)
}

export function applyChatWidthToDOM(width: ChatWidth): void {
  document.documentElement.style.setProperty('--roy-chat-max-width', `${CHAT_WIDTH_PX[width]}px`)
}

export async function initializeAppearancePreferences(
  setUiFontSize: (size: UiFontSize) => void,
  setChatWidth: (width: ChatWidth) => void,
  setWallpaper: (value: WallpaperSettings) => void,
  setFilesPanelDefaultSource?: (value: 'project' | 'session') => void,
): Promise<void> {
  try {
    const settings = await window.electronAPI.getSettings()
    const uiSize = settings.uiFontSize ?? DEFAULT_UI_FONT_SIZE
    const chatWidth = settings.chatWidth ?? DEFAULT_CHAT_WIDTH
    setUiFontSize(uiSize)
    setChatWidth(chatWidth)
    applyUiFontSizeToDOM(uiSize)
    applyChatWidthToDOM(chatWidth)
    setFilesPanelDefaultSource?.(settings.filesPanelDefaultSource ?? 'project')

    const wallpaper = settings.wallpaper
    if (wallpaper) {
      // 兼容旧内置壁纸设置；不影响已有主题、动态壁纸及自选图片。
      setWallpaper(wallpaper.source === 'preset' ? { ...wallpaper, source: 'none' } : wallpaper)
    }
  } catch (error) {
    console.error('[外观] 初始化失败:', error)
    applyUiFontSizeToDOM(DEFAULT_UI_FONT_SIZE)
    applyChatWidthToDOM(DEFAULT_CHAT_WIDTH)
  }
}

export async function updateUiFontSize(size: UiFontSize): Promise<void> {
  applyUiFontSizeToDOM(size)
  try {
    await window.electronAPI.updateSettings({ uiFontSize: size })
  } catch (error) {
    console.error('[外观] 界面字号持久化失败:', error)
  }
}

export async function updateChatWidth(width: ChatWidth): Promise<void> {
  applyChatWidthToDOM(width)
  try {
    await window.electronAPI.updateSettings({ chatWidth: width })
  } catch (error) {
    console.error('[外观] 对话宽度持久化失败:', error)
  }
}

export async function updateWallpaper(value: WallpaperSettings): Promise<void> {
  try {
    await window.electronAPI.updateSettings({ wallpaper: value })
  } catch (error) {
    console.error('[外观] 壁纸持久化失败:', error)
  }
}
