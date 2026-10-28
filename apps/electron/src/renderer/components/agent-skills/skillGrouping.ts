import type { SkillMeta } from '@roy/shared'
import { SKILL_GROUPS, localizeSkill } from '@/lib/skill-zh'

export interface SkillGroup {
  id: string
  title: string
  skills: SkillMeta[]
}

const UNGROUPED_TITLE = '其他'

/**
 * 分组标题：优先用中文对照表给出的分类，其次用技能自带的 group，
 * 都没有时归到「其他」。这样同一批技能不会一半中文一半英文。
 */
export function getSkillGroupTitle(skill: SkillMeta): string {
  const group = localizeSkill(skill).group.trim()
  return group || UNGROUPED_TITLE
}

export function groupSkills(skills: SkillMeta[]): SkillGroup[] {
  const groups = new Map<string, SkillMeta[]>()

  for (const skill of skills) {
    const title = getSkillGroupTitle(skill)
    const group = groups.get(title) ?? []
    group.push(skill)
    groups.set(title, group)
  }

  return [...groups.entries()]
    .map(([title, groupSkills]) => ({
      id: title.toLowerCase(),
      title,
      skills: groupSkills,
    }))
    .sort((a, b) => compareGroupTitle(a.title, b.title))
}

/** 按 SKILL_GROUPS 的固定顺序排，未知分组按中文排序排在后面。 */
function compareGroupTitle(a: string, b: string): number {
  const order = (title: string): number => {
    const index = (SKILL_GROUPS as readonly string[]).indexOf(title)
    return index === -1 ? SKILL_GROUPS.length : index
  }

  const diff = order(a) - order(b)
  if (diff !== 0) return diff
  return a.localeCompare(b, 'zh-CN')
}
