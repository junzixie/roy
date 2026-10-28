/**
 * 右侧文件面板布局
 *
 * 面板固定单栏：会话文件与项目文件共用一个列表，用顶部标签切换来源。
 * 之前在面板足够宽时会并排渲染两栏，看起来像「两个项目文件栏」，已取消。
 */

export type FileSourceScope = 'project' | 'session'

/** 打靠面板时默认显示哪一类文件。 */
export type FilesPanelDefaultSource = 'project' | 'session'

export const DEFAULT_FILES_PANEL_SOURCE: FilesPanelDefaultSource = 'project'

export function shouldShowBothFileSources(): boolean {
  return false
}

export function resolveInitialFileSource(value: FilesPanelDefaultSource | undefined): FileSourceScope {
  return value === 'session' ? 'session' : 'project'
}
