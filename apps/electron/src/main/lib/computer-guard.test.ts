import { describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { APP_NOTES_MAX_CHARS, appNotesSlug, createAppNotesStore, friendlyComputerError, SCREEN_MAX_AGE_MS, staleScreenReason } from './computer-guard'

const wechat = { h: 100, t: '微信', x: 10, y: 10, w: 800, hh: 600 }

describe('画面过期拦截', () => {
  test('没截过图：拒绝，提示先截图', () => {
    expect(staleScreenReason(undefined, wechat)).toContain('还没有截过屏')
  })
  test('截图后什么都没变：放行', () => {
    expect(staleScreenReason({ at: 1_000, fg: wechat }, { ...wechat, x: 14 }, 2_000)).toBeNull()
  })
  test('截图太旧：拒绝', () => {
    expect(staleScreenReason({ at: 0, fg: wechat }, wechat, SCREEN_MAX_AGE_MS + 1)).toContain('分钟前')
  })
  test('前台窗口换了：拒绝，并说清从哪个换成哪个', () => {
    const r = staleScreenReason({ at: 0, fg: wechat }, { h: 200, t: '记事本', x: 0, y: 0, w: 500, hh: 400 }, 1)
    expect(r).toContain('「微信」变成了「记事本」')
  })
  test('窗口挪了或改了大小：拒绝', () => {
    expect(staleScreenReason({ at: 0, fg: wechat }, { ...wechat, x: 300 }, 1)).toContain('移动或改变了大小')
    expect(staleScreenReason({ at: 0, fg: wechat }, { ...wechat, w: 1200 }, 1)).toContain('移动或改变了大小')
  })
  test('读不到前台窗口时不拦（检查本身出错不能让电脑控制完全不能用）', () => {
    expect(staleScreenReason({ at: 0, fg: wechat }, null, 1)).toBeNull()
    expect(staleScreenReason({ at: 0, fg: null }, wechat, 1)).toBeNull()
  })
})

describe('错误翻译', () => {
  test('权限不够', () => {
    expect(friendlyComputerError('SendInput failed 5 (blocked by a higher-privilege window?)')).toContain('管理员身份')
  })
  test('超时、助手退出、锁屏、窗口没了', () => {
    expect(friendlyComputerError('输入助手没有响应')).toContain('操作超时')
    expect(friendlyComputerError('输入助手退出了')).toContain('意外退出')
    expect(friendlyComputerError('截不到屏幕')).toContain('锁屏')
    expect(friendlyComputerError('Exception calling "BgClick": window gone')).toContain('computer_windows')
  })
  test('认不出的错误原样保留', () => {
    expect(friendlyComputerError('奇怪的错误')).toBe('奇怪的错误')
  })
  test('翻译后保留原始信息', () => {
    expect(friendlyComputerError('输入助手没有响应')).toContain('原始信息：输入助手没有响应')
  })
})

describe('App 操作经验', () => {
  test('软件名归一：微信 / WeChat / weixin 是同一份', () => {
    expect(appNotesSlug('微信')).toBe('wechat-windows')
    expect(appNotesSlug(' WeChat ')).toBe('wechat-windows')
    expect(appNotesSlug('weixin')).toBe('wechat-windows')
    expect(appNotesSlug('Microsoft Excel')).toBe('microsoft-excel-windows')
    expect(appNotesSlug('a/b:c')).toBe('a-b-c-windows')
    expect(() => appNotesSlug('   ')).toThrow()
  })

  test('没有记录时：微信有内置经验，其他软件为空；保存后读到自己的', () => {
    const dir = mkdtempSync(join(tmpdir(), 'roy-app-notes-'))
    try {
      const store = createAppNotesStore(join(dir, 'apps'))
      const builtin = store.read('微信')
      expect(builtin.source).toBe('builtin')
      expect(builtin.content).toContain('Ctrl+F')
      expect(store.read('记事本').source).toBe('none')

      store.save('WeChat', '## 搜索\n- 状态：已验证\n- Ctrl+F 后等 0.5 秒再输入')
      const saved = store.read('微信')
      expect(saved.source).toBe('saved')
      expect(saved.content).toContain('等 0.5 秒')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('空内容和超长内容不保存', () => {
    const dir = mkdtempSync(join(tmpdir(), 'roy-app-notes-'))
    try {
      const store = createAppNotesStore(dir)
      expect(() => store.save('记事本', '   ')).toThrow('不能为空')
      expect(() => store.save('记事本', 'x'.repeat(APP_NOTES_MAX_CHARS + 1))).toThrow('精简')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
