import { describe, expect, test } from 'bun:test'
import { normalizeSkillSlug, sha256Text, verifySkillPackageMeta } from './skill-integrity'

describe('skill-integrity', () => {
  test('normalize 与 verify', () => {
    expect(normalizeSkillSlug('My Skill_Name')).toBe('my-skill-name')
    expect(verifySkillPackageMeta({ slug: 'ok-skill' }).ok).toBe(true)
    expect(verifySkillPackageMeta({ slug: '!!!' }).ok).toBe(false)
    expect(verifySkillPackageMeta({ slug: 'x', version: 'not-hex' }).ok).toBe(false)
    expect(verifySkillPackageMeta({ slug: 'x', version: 'abcdef012345', sha256: 'a'.repeat(64) }).ok).toBe(true)
  })

  test('sha256Text 稳定', () => {
    expect(sha256Text('abc')).toBe(sha256Text('abc'))
    expect(sha256Text('abc')).not.toBe(sha256Text('abd'))
  })
})