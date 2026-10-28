import { describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findUniqueFileUnderRoots } from './relative-file-search'

function tree(files: string[]): string {
  const root = mkdtempSync(join(tmpdir(), 'roy-find-'))
  for (const f of files) {
    const full = join(root, ...f.split('/'))
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, 'x')
  }
  return root
}

describe('相对路径兜底查找', () => {
  test('只写文件名时在子目录里找到唯一的那个', () => {
    const root = tree(['tools/draft_storyboard.py', 'README.md'])
    expect(findUniqueFileUnderRoots('draft_storyboard.py', [root])).toBe(join(root, 'tools', 'draft_storyboard.py'))
  })

  test('不完整的相对路径按后缀匹配', () => {
    const root = tree(['src/tools/a.py', 'other/a.py'])
    expect(findUniqueFileUnderRoots('tools/a.py', [root])).toBe(join(root, 'src', 'tools', 'a.py'))
  })

  test('同名文件不止一个时不猜', () => {
    const root = tree(['a/x.py', 'b/x.py'])
    expect(findUniqueFileUnderRoots('x.py', [root])).toBeNull()
  })

  test('跳过 node_modules，拒绝 ..', () => {
    const root = tree(['node_modules/pkg/x.py'])
    expect(findUniqueFileUnderRoots('x.py', [root])).toBeNull()
    expect(findUniqueFileUnderRoots('../x.py', [root])).toBeNull()
  })
})
