/**
 * 相对路径兜底查找。
 *
 * AI 回复里常只写文件名或不完整的相对路径（如 `draft_storyboard.py`，实际在 `tools/` 下），
 * 按工作目录直接拼接找不到，预览就显示成空文件。这里在已授权的目录里按路径后缀找一遍：
 * 只在授权根之内查找，不扩大访问范围；找到多个同名文件时不猜，返回 null。
 */
import { readdirSync } from 'node:fs'
import { join, sep } from 'node:path'

const SKIP_DIRS = new Set(['node_modules', '.git', '.svn', '.hg', 'dist', 'build', 'out', '.next', '.venv', 'venv', '__pycache__', '.cache', '.idea', '.vscode', 'release', 'coverage'])

export interface RelativeFileSearchOptions {
  maxDepth?: number
  /** 最多看多少个目录，防止在超大目录里卡住主进程 */
  maxDirs?: number
}

/** 把 `a\\b/c.py`、`./c.py` 规范成路径段 */
function segments(relativePath: string): string[] {
  return relativePath.split(/[\\/]+/).filter((part) => part && part !== '.')
}

export function findUniqueFileUnderRoots(
  relativePath: string,
  roots: readonly string[],
  options: RelativeFileSearchOptions = {},
): string | null {
  const parts = segments(relativePath)
  if (parts.length === 0 || parts.includes('..')) return null
  const name = parts[parts.length - 1]!
  const suffix = parts.join(sep).toLowerCase()
  const maxDepth = options.maxDepth ?? 6
  const maxDirs = options.maxDirs ?? 4000
  const matches = new Set<string>()
  let visited = 0

  for (const root of roots) {
    const queue: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }]
    while (queue.length > 0) {
      const { dir, depth } = queue.shift()!
      if (++visited > maxDirs) break
      let entries: import('node:fs').Dirent[]
      try { entries = readdirSync(dir, { withFileTypes: true }) } catch { continue }
      for (const entry of entries) {
        const full = join(dir, entry.name)
        if (entry.isFile()) {
          if (entry.name.toLowerCase() !== name.toLowerCase()) continue
          const lower = full.toLowerCase()
          if (lower === suffix || lower.endsWith(sep + suffix)) matches.add(full)
        } else if (entry.isDirectory() && depth < maxDepth && !SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
          queue.push({ dir: full, depth: depth + 1 })
        }
      }
      if (matches.size > 1) return null
    }
  }
  return matches.size === 1 ? [...matches][0]! : null
}
