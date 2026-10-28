import { describe, expect, mock, test } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const configDir = mkdtempSync(join(tmpdir(), 'roy-webnotes-'))
mock.module('./config-paths', () => ({ getConfigDir: () => configDir }))
const { addWebNote, hostOf, listWebNotes, looksSecret, readWebNotes, saveWebNotes } = await import('./web-notes')

describe('网站经验', () => {
  test('域名统一去掉 www，非网页地址不算', () => {
    expect(hostOf('https://www.Bilibili.com/video/1')).toBe('bilibili.com')
    expect(hostOf('zhihu.com')).toBe('zhihu.com')
    expect(hostOf('file:///C:/a.txt')).toBe('')
  })
  test('带密码、密钥的不保存', () => {
    expect(looksSecret('登录密码：abc12345')).toBe(true)
    expect(looksSecret('api_key=sk-1234567890abcdef')).toBe(true)
    expect(looksSecret('发布按钮在右上角，先点「创作中心」')).toBe(false)
    expect('error' in addWebNote('zhihu.com', 'password: hunter22')).toBe(true)
  })
  test('记下后下次能读到，设置页能改能删', () => {
    expect('host' in addWebNote('https://www.zhihu.com/q', '发布按钮在右上角')).toBe(true)
    expect(readWebNotes('zhihu.com')).toContain('发布按钮在右上角')
    expect(listWebNotes().map((n) => n.site)).toEqual(['zhihu.com'])
    saveWebNotes('zhihu.com', '- 改过的经验')
    expect(readWebNotes('zhihu.com')).toBe('- 改过的经验')
    saveWebNotes('zhihu.com', '')
    expect(listWebNotes()).toEqual([])
  })
})
