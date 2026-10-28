/**
 * 内置技能目录（市场）
 *
 * 读取随应用分发的 resources/roy-library/skills 下的技能包（Roy 自己写的内置技能），供市场页展示。
 * 只做只读扫描，不读取 ~/.workbuddy 的连接器，也不向外部发请求。
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { MarketSkillEntry } from '@roy/shared'

export type { MarketSkillEntry }

interface Frontmatter {
  name?: string
  description?: string
  version?: string
  author?: string
  license?: string
}

/** 解析 SKILL.md 开头的 --- 元数据，只认单行的 key: value。 */
export function parseSkillFrontmatter(text: string): { meta: Frontmatter; body: string } {
  const normalized = String(text).replace(/^\uFEFF/, '')
  const matched = normalized.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!matched) return { meta: {}, body: normalized.trim() }

  const meta: Record<string, string> = {}
  const lines = (matched[1] ?? '').split(/\r?\n/)
  let lastKey = ''
  for (const line of lines) {
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/)
    if (kv) {
      const key = kv[1] ?? ''
      if (!key) continue
      lastKey = key
      const raw = (kv[2] ?? '').trim()
      // 多行块标量（> / |）先留空，后续缩进行再拼接
      meta[key] = /^[>|][-+]?$/.test(raw) ? '' : raw.replace(/^["']|["']$/g, '').trim()
      continue
    }
    if (lastKey && /^\s+\S/.test(line)) {
      meta[lastKey] = `${meta[lastKey] ?? ''} ${line.trim()}`.trim()
    }
  }
  return { meta: meta as Frontmatter, body: (matched[2] ?? '').trim() }
}

function countFiles(dir: string, depth = 0): number {
  if (depth > 4) return 0
  let total = 0
  let entries: import('node:fs').Dirent[]
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return 0
  }
  for (const entry of entries) {
    if (entry.isDirectory()) total += countFiles(join(dir, entry.name), depth + 1)
    else total += 1
  }
  return total
}

/**
 * 扫描内置技能目录。
 * 缺少 SKILL.md 的目录、以及技能包之外的杂项文件会被跳过。
 */
export function listBuiltinMarketSkills(builtinSkillsDir: string): MarketSkillEntry[] {
  if (!existsSync(builtinSkillsDir)) return []

  const result: MarketSkillEntry[] = []
  const seen = new Set<string>()

  let entries: import('node:fs').Dirent[]
  try {
    entries = readdirSync(builtinSkillsDir, { withFileTypes: true })
  } catch {
    return []
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const dir = join(builtinSkillsDir, entry.name)
    const skillMdPath = join(dir, 'SKILL.md')
    if (!existsSync(skillMdPath)) continue

    let raw: string
    try {
      raw = readFileSync(skillMdPath, 'utf-8')
    } catch {
      continue
    }

    const { meta, body } = parseSkillFrontmatter(raw)
    const name = (meta.name ?? '').trim() || entry.name
    if (seen.has(name)) continue
    seen.add(name)

    result.push({
      slug: entry.name,
      name,
      description: (meta.description ?? '').replace(/\s+/g, ' ').trim().slice(0, 400),
      version: (meta.version ?? '').trim(),
      author: (meta.author ?? '').trim(),
      license: (meta.license ?? '').trim(),
      fileCount: countFiles(dir),
      source: 'builtin',
      body: body.slice(0, 20000),
    })
  }

  return result.sort((a, b) => a.name.localeCompare(b.name, 'zh'))
}
