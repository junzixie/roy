import { describe, expect, test } from 'bun:test'
import { SKILL_GROUPS, localizeSkill } from './skill-zh'

describe('技能中文展示', () => {
  test('给定对照表里的技能，返回中文标题、说明与分组', () => {
    const result = localizeSkill({
      slug: 'docx',
      name: 'docx',
      description: 'Use this skill whenever the user wants to create Word documents.',
    })

    expect(result.title).toBe('Word 文档')
    expect(result.group).toBe('文档办公')
    // 原文是英文，说明取对照表的中文
    expect(result.desc).toContain('Word 文档')
  })

  test('给定自身说明已是中文的技能，说明优先用原文', () => {
    const own = '在真实浏览器里带登录态复现页面问题。'

    const result = localizeSkill({
      slug: 'browser-repro-local-webapp',
      name: 'browser-repro-local-webapp',
      description: own,
    })

    expect(result.title).toBe('本机网页问题复现')
    expect(result.desc).toBe(own)
  })

  test('给定目录名是 ID、name 能对上对照表时，按 name 命中', () => {
    const result = localizeSkill({
      slug: 'skill_2053082401071824896',
      name: 'minimax-xlsx',
      description: 'Open, create, read, analyze, edit Excel files.',
    })

    expect(result.title).toBe('Excel 表格（MiniMax）')
    expect(result.group).toBe('数据分析')
  })

  test('给定对照表里没有的技能，回退到自身 name 与 description', () => {
    const result = localizeSkill({
      slug: 'unknown-skill',
      name: 'unknown-skill',
      description: 'Some brand new capability.',
    })

    expect(result.title).toBe('unknown-skill')
    expect(result.desc).toBe('Some brand new capability.')
    expect(result.group).toBe('其他')
  })

  test('给定既无说明也无分组的技能，仍给出可用结构', () => {
    const result = localizeSkill({ slug: 'bare', name: 'bare' })

    expect(result.desc).toBe('暂无说明')
    expect(result.group).toBe('其他')
    expect(SKILL_GROUPS as readonly string[]).toContain(result.group)
  })
})
