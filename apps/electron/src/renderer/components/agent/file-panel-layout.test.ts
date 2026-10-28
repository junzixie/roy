import { describe, expect, test } from 'bun:test'
import {
  DEFAULT_FILES_PANEL_SOURCE,
  resolveInitialFileSource,
  shouldShowBothFileSources,
} from './file-panel-layout'

describe('右侧文件面板布局', () => {
  test('任何宽度都只渲染单栏，不再并排展示两个文件来源', () => {
    expect(shouldShowBothFileSources()).toBe(false)
  })

  test('给定设置为会话文件时，默认打开会话文件', () => {
    expect(resolveInitialFileSource('session')).toBe('session')
  })

  test('给定设置为项目文件时，默认打开项目文件', () => {
    expect(resolveInitialFileSource('project')).toBe('project')
  })

  test('给定未设置时，回退到默认来源', () => {
    expect(resolveInitialFileSource(undefined)).toBe(DEFAULT_FILES_PANEL_SOURCE)
  })
})
