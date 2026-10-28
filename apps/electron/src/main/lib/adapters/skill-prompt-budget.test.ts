import { describe, expect, test } from 'bun:test'
import { compactSkillDescription } from './slim-mode'
import { buildRoyWorkStylePrompt } from '../system-prompts/roy-work-style'
import { readFileSync } from 'node:fs'

describe('技能目录预算与执行收敛', () => {
  test('普通模式保留短说明、压缩长说明，不修改原对象', () => {
    const skill = { name: 'server-audit', description: '服务器配置排查。'.repeat(100), filePath: 'skills/server-audit/SKILL.md' }
    const original = skill.description
    const brief = { ...skill, description: compactSkillDescription(skill.description, 320) }
    expect(brief.description.length).toBeLessThan(350)
    expect(brief.name).toBe(skill.name)
    expect(brief.filePath).toBe(skill.filePath)
    expect(skill.description).toBe(original)
    expect(compactSkillDescription('只读检查服务器', 320)).toBe('只读检查服务器')
  })
  test('目录空白归一化，保留按需读取正文提示', () => {
    expect(compactSkillDescription('  读取\n文档  ', 320)).toBe('读取 文档')
    expect(compactSkillDescription('字'.repeat(500), 320)).toContain('使用前读取技能正文')
    expect(compactSkillDescription('字'.repeat(500))).toHaveLength(100 + '…（使用前读取技能正文）'.length)
  })
  test('收敛规则不允许省略安全与必要验证', () => {
    const prompt = buildRoyWorkStylePrompt()
    expect(prompt).toContain('已有证据足以回答或验证当前目标时，立即收束')
    expect(prompt).toContain('必要的验证、安全校验和用户要求不得省略')
    expect(prompt).toContain('不同权限边界的操作不得盲目合并')
    expect(prompt).toContain('保留已完成结果')
  })
  test('普通模式和精简模式均限制目录描述，仍保留全部已授权技能', () => {
    const src = readFileSync(new URL('./pi-agent-adapter.ts', import.meta.url), 'utf8')
    expect(src).toContain('compactSkillDescription(skill.description, slim ? 100 : 320)')
    expect(src).toContain('isRoySkillPath(skill.filePath, allowedRoots)')
    expect(src).toContain("additionalSkillPaths: input.assistantMode === 'conversation' ? [] : input.additionalSkillPaths ?? []")
    expect(src).toContain("input.assistantMode === 'conversation' ? () => ({ skills: [], diagnostics: [] }) : createRoySkillsOverride")
  })
})
