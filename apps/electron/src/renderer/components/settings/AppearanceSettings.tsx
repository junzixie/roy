/**
 * AppearanceSettings - 外观设置页
 *
 * 主题（浅色 / 深色 / 跟随系统 / 6 套彩色配色）+ 壁纸（不铺 / 动态壁纸 / 自己的图片）。
 * 主题只管配色，壁纸只管背景，两者互不清除。
 * 通过 Jotai atom 管理状态，持久化到 ~/.roy/settings.json。
 */

import * as React from 'react'
import { useAtom, useAtomValue } from 'jotai'
import {
  SettingsSection,
  SettingsCard,
  SettingsRow,
  SettingsSegmentedControl,
} from './primitives'
import {
  themeModeAtom,
  themeStyleAtom,
  systemIsDarkAtom,
  updateThemeSelection,
  applyThemeToDOM,
} from '@/atoms/theme'
import {
  markdownFontSizeAtom,
  updateMarkdownFontSize,
} from '@/atoms/markdown-font-size'
import {
  uiFontSizeAtom,
  chatWidthAtom,
  filesPanelDefaultSourceAtom,
  updateUiFontSize,
  updateChatWidth,
  updateWallpaper,
} from '@/atoms/appearance'
import { wallpaperConfigAtom, wallpaperStatusAtom } from '@/atoms/wallpaper'
import { PROCEDURAL_WALLPAPERS } from '@/lib/procedural-wallpapers'
import { StartupAnimationSetting } from './StartupAnimationSetting'
import { cn } from '@/lib/utils'
import { Check } from 'lucide-react'
import { toast } from 'sonner'
import type { ThemeMode, ThemeStyle, MarkdownFontSize } from '../../../types'

interface ThemeCard {
  id: string
  name: string
  desc: string
  mode: ThemeMode
  style: ThemeStyle
  /** 预览色：侧栏 / 对话区 / 文字 / 强调 */
  side: string
  main: string
  text: string
  accent: string
}

/** 主题：明暗三项 + 完整配色（每套同时换底色、侧栏、卡片、文字、边框、按钮） */
const THEME_CARDS: ThemeCard[] = [
  { id: 'light', name: '浅色', desc: '默认白色', mode: 'light', style: 'default', side: '#F4F4F2', main: '#FFFFFF', text: '#1F1E1D', accent: '#2F6B4F' },
  { id: 'dark', name: '深色', desc: '默认深灰', mode: 'dark', style: 'default', side: '#1B1B1D', main: '#232326', text: '#ECECEC', accent: '#6FB08F' },
  { id: 'system', name: '跟随系统', desc: '随 Windows 明暗', mode: 'system', style: 'default', side: '#F4F4F2', main: '#232326', text: '#888888', accent: '#6FB08F' },
  { id: 'slate-light', name: '暖米色', desc: '浅色 · 柔和', mode: 'special', style: 'slate-light', side: '#E3DDD1', main: '#F2EEE6', text: '#3A342C', accent: '#9A7B56' },
  { id: 'ocean-light', name: '雾蓝', desc: '浅色 · 清爽', mode: 'special', style: 'ocean-light', side: '#D3E2EE', main: '#EAF2F8', text: '#22364A', accent: '#3D7BB0' },
  { id: 'forest-light', name: '鼠尾草绿', desc: '浅色 · 自然', mode: 'special', style: 'forest-light', side: '#D5E0CC', main: '#ECF1E7', text: '#2C3A2A', accent: '#4E7A4A' },
  { id: 'ocean-dark', name: '深蓝灰', desc: '深色 · 适合动态壁纸', mode: 'special', style: 'ocean-dark', side: '#18202B', main: '#1E2632', text: '#DCE4EE', accent: '#6FA3D8' },
  { id: 'forest-dark', name: '墨绿', desc: '深色 · 安静', mode: 'special', style: 'forest-dark', side: '#0E1612', main: '#152019', text: '#D6E4D9', accent: '#6FB08F' },
  { id: 'slate-dark', name: '灰紫', desc: '深色 · 莫兰迪', mode: 'special', style: 'slate-dark', side: '#1C1920', main: '#262229', text: '#E6DEE8', accent: '#C49AB0' },
]

/** Markdown 字号选项 */
const MARKDOWN_FONT_SIZE_OPTIONS = [
  { value: 'small', label: '小' },
  { value: 'medium', label: '中' },
  { value: 'large', label: '大' },
]

/** 根据平台返回缩放快捷键提示 */
const isMac = navigator.userAgent.includes('Mac')
const ZOOM_HINT = isMac
  ? '使用 ⌘+ 放大、⌘- 缩小、⌘0 恢复默认大小'
  : '使用 Ctrl++ 放大、Ctrl+- 缩小、Ctrl+0 恢复默认大小'

export function AppearanceSettings(): React.ReactElement {
  const [themeMode, setThemeMode] = useAtom(themeModeAtom)
  const [themeStyle, setThemeStyle] = useAtom(themeStyleAtom)
  const systemIsDark = useAtomValue(systemIsDarkAtom)
  const [markdownFontSize, setMarkdownFontSize] = useAtom(markdownFontSizeAtom)
  const [uiFontSize, setUiFontSize] = useAtom(uiFontSizeAtom)
  const [chatWidth, setChatWidth] = useAtom(chatWidthAtom)
  const [filesPanelSource, setFilesPanelSource] = useAtom(filesPanelDefaultSourceAtom)
  const [wallpaper, setWallpaper] = useAtom(wallpaperConfigAtom)
  const wallpaperStatus = useAtomValue(wallpaperStatusAtom)

  /** 选主题：只改配色，不动壁纸 */
  const applyTheme = React.useCallback((card: ThemeCard) => {
    setThemeMode(card.mode)
    setThemeStyle(card.style)
    void updateThemeSelection(card.mode, card.style).catch(() => {
      toast.error('主题保存失败，请重新选择')
    })
    applyThemeToDOM(card.mode, card.style, systemIsDark)
  }, [setThemeMode, setThemeStyle, systemIsDark])

  const currentTheme = themeMode === 'special'
    ? (THEME_CARDS.find((card) => card.style === themeStyle)?.id ?? 'dark')
    : themeMode
  const wallpaperOn = wallpaper.source === 'builtin' || wallpaper.source === 'dynamic' || wallpaper.source === 'custom'

  /** 主题下方的内置动态壁纸：再点一次已选中的就关掉 */
  const toggleBuiltinWallpaper = React.useCallback((id: string) => {
    const selected = wallpaper.source === 'builtin' && wallpaper.dynamic === id
    const next = selected ? { ...wallpaper, source: 'none' as const } : { ...wallpaper, source: 'builtin' as const, dynamic: id }
    setWallpaper(next)
    void updateWallpaper(next)
  }, [wallpaper, setWallpaper])

  /** 切换 Markdown 字号 */
  const handleMarkdownFontSizeChange = React.useCallback((value: string) => {
    const size = value as MarkdownFontSize
    setMarkdownFontSize(size)
    updateMarkdownFontSize(size)
  }, [setMarkdownFontSize])

  return (
    <div className="space-y-6">
      {/* 壁纸只用主题里那三张内置动态壁纸；以前选过的自定义图片 / 动态壁纸在这里能关掉，出错时也在这里提示 */}
      {(wallpaperStatus.state === 'error' || (wallpaper.source !== 'none' && wallpaper.source !== 'builtin' && wallpaper.source !== 'preset')) && (
        <div role="status" className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-4 py-3 text-sm">
          <p className={wallpaperStatus.state === 'error' ? 'text-red-500' : 'text-foreground'}>
            {wallpaperStatus.state === 'error' ? wallpaperStatus.message : '正在使用以前选的自定义壁纸'}
          </p>
          <button type="button" className="shrink-0 rounded border border-border px-3 py-1 text-[12.5px] hover:bg-foreground/[0.05]" onClick={() => {
            const next = { ...wallpaper, source: 'none' as const }
            setWallpaper(next); void updateWallpaper(next)
          }}>关闭壁纸</button>
        </div>
      )}
      <SettingsSection
        title="外观设置"
        description="自定义应用的视觉风格"
      >
        <SettingsCard>
          <div className="space-y-3 px-4 py-3">
            <div>
              <div className="text-[13px] text-foreground/85">主题</div>
              <div className="mt-0.5 text-[11.5px] text-foreground/45">
                整套配色一起换：侧栏、输入框、卡片、文字和按钮。和壁纸互不影响{wallpaperOn ? '；开着壁纸时推荐深蓝灰或墨绿' : ''}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              {THEME_CARDS.map((card) => {
                const on = card.id === currentTheme
                return (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => applyTheme(card)}
                    className={cn(
                      'overflow-hidden rounded-xl border text-left transition-colors',
                      on ? 'border-primary ring-1 ring-primary' : 'border-border/60 hover:border-border',
                    )}
                  >
                    <div className="flex h-[64px]" style={{ background: card.id === 'system' ? `linear-gradient(135deg, ${card.side} 50%, ${card.main} 50%)` : card.main }}>
                      <div className="w-[30%] space-y-1.5 p-2" style={{ background: card.id === 'system' ? 'transparent' : card.side }}>
                        <div className="h-1.5 w-3/4 rounded-full opacity-30" style={{ background: card.text }} />
                        <div className="h-1.5 w-1/2 rounded-full opacity-20" style={{ background: card.text }} />
                      </div>
                      <div className="flex flex-1 flex-col justify-end gap-1.5 p-2">
                        <div className="ml-auto h-2 w-1/2 rounded-full opacity-20" style={{ background: card.text }} />
                        <div className="flex items-center gap-1.5">
                          <div className="h-2 flex-1 rounded-full opacity-25" style={{ background: card.text }} />
                          <span className="size-3 rounded-full" style={{ background: card.accent }} />
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 border-t border-border/60 px-2.5 py-1.5">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] font-medium text-foreground">{card.name}</span>
                        <span className="block truncate text-[11px] text-foreground/45">{card.desc}</span>
                      </span>
                      {on && <Check className="size-3.5 shrink-0 text-primary" />}
                    </div>
                  </button>
                )
              })}
              {/* 内置动态壁纸：和主题卡片同一套样式，排在深色主题那一行下面；只开壁纸，不改配色 */}
              {PROCEDURAL_WALLPAPERS.map((item) => {
                const on = wallpaper.source === 'builtin' && wallpaper.dynamic === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    title={on ? '再点一次关掉壁纸' : item.description}
                    onClick={() => toggleBuiltinWallpaper(item.id)}
                    className={cn(
                      'overflow-hidden rounded-xl border text-left transition-colors',
                      on ? 'border-primary ring-1 ring-primary' : 'border-border/60 hover:border-border',
                    )}
                  >
                    <div className="h-[64px]" style={{ background: item.thumb }} />
                    <div className="flex items-center gap-1.5 border-t border-border/60 px-2.5 py-1.5">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] font-medium text-foreground">{item.name}</span>
                        <span className="block truncate text-[11px] text-foreground/45">动态壁纸 · {item.description}</span>
                      </span>
                      {on && <Check className="size-3.5 shrink-0 text-primary" />}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>


          <SettingsRow
            label="界面缩放"
            description={ZOOM_HINT}
          />

          <SettingsRow
            label="文字大小"
            description="统一调整界面与 AI 回复；需要单独调回复时展开高级选项"
          >
            <div className="flex items-center gap-0.5 rounded-lg bg-foreground/[0.05] p-0.5 text-[12.5px]">
              {[
                { id: 'compact', label: '紧凑' },
                { id: 'normal', label: '标准' },
                { id: 'comfortable', label: '舒适' },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setUiFontSize(item.id as typeof uiFontSize)
                    void updateUiFontSize(item.id as typeof uiFontSize)
                    const replySize = ({ compact: 'small', normal: 'medium', comfortable: 'large' } as const)[item.id as 'compact' | 'normal' | 'comfortable']
                    setMarkdownFontSize(replySize)
                    void updateMarkdownFontSize(replySize)
                  }}
                  className={cn(
                    'rounded-md px-2.5 py-1 transition-colors',
                    uiFontSize === item.id
                      ? 'bg-background font-medium text-foreground shadow-sm'
                      : 'text-foreground/55 hover:text-foreground',
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </SettingsRow>

          <SettingsRow
            label="阅读布局"
            description="控制消息区和输入框宽度，不改变字号"
          >
            <div className="flex items-center gap-0.5 rounded-lg bg-foreground/[0.05] p-0.5 text-[12.5px]">
              {[
                { id: 'narrow', label: '窄' },
                { id: 'medium', label: '中' },
                { id: 'wide', label: '宽' },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setChatWidth(item.id as typeof chatWidth)
                    void updateChatWidth(item.id as typeof chatWidth)
                  }}
                  className={cn(
                    'rounded-md px-2.5 py-1 transition-colors',
                    chatWidth === item.id
                      ? 'bg-background font-medium text-foreground shadow-sm'
                      : 'text-foreground/55 hover:text-foreground',
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </SettingsRow>

          <details className="px-4 py-2"><summary className="cursor-pointer text-sm text-muted-foreground">高级：单独调整回复字号</summary>
          <SettingsSegmentedControl
            label="回复字号"
            description="调整 AI 回复与 Markdown 编辑器的正文字号"
            value={markdownFontSize}
            onValueChange={handleMarkdownFontSizeChange}
            options={MARKDOWN_FONT_SIZE_OPTIONS}
          />
          </details>

          <SettingsRow
            label="右侧文件面板默认显示"
            description="文件面板固定单栏，打开时先停在哪一类文件"
          >            <div className="flex items-center gap-0.5 rounded-lg bg-foreground/[0.05] p-0.5 text-[12.5px]">
              {[
                { id: 'project' as const, label: '项目文件' },
                { id: 'session' as const, label: '会话文件' },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setFilesPanelSource(item.id)
                    void window.electronAPI.updateSettings({ filesPanelDefaultSource: item.id })
                  }}
                  className={cn(
                    'rounded-md px-2.5 py-1 transition-colors',
                    filesPanelSource === item.id
                      ? 'bg-background font-medium text-foreground shadow-sm'
                      : 'text-foreground/55 hover:text-foreground',
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </SettingsRow>

          {/* 启动动画：启动页在 renderer 之前显示，这里只选名字，主进程传给 splash */}
          <StartupAnimationSetting />


        </SettingsCard>
      </SettingsSection>

    </div>
  )
}
