import { describe, expect, test } from 'bun:test'
import { changelogSince, compareVersions, type ChangelogEntry } from './changelog'

const entries: ChangelogEntry[] = ['0.20.10', '0.20.9', '0.20.8'].map((version) => ({ version, date: '', headline: version, sections: [] }))

describe('更新说明', () => {
  test('版本号按数字比较', () => {
    expect(compareVersions('0.20.10', '0.20.9')).toBeGreaterThan(0)
    expect(compareVersions('0.20.9', '0.20.10')).toBeLessThan(0)
    expect(compareVersions('1.0.0', '1.0')).toBe(0)
  })

  test('跨多个版本升级时展示中间所有版本，新的在前', () => {
    expect(changelogSince('0.20.7', '0.20.10', entries).map((e) => e.version)).toEqual(['0.20.10', '0.20.9', '0.20.8'])
  })

  test('全新安装、同版本、降级都不弹', () => {
    expect(changelogSince(undefined, '0.20.10', entries)).toEqual([])
    expect(changelogSince('0.20.10', '0.20.10', entries)).toEqual([])
    expect(changelogSince('0.20.11', '0.20.10', entries)).toEqual([])
  })

  test('当前版本没有条目时不包含更新的条目', () => {
    expect(changelogSince('0.20.8', '0.20.9', entries).map((e) => e.version)).toEqual(['0.20.9'])
  })
})
