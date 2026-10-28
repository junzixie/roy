/**
 * 磁盘管理增强功能
 *
 * 新增功能：
 * 1. 归档项目识别与清理建议
 * 2. 残余文件类型分析
 * 3. 项目最后访问时间跟踪
 * 4. 智能清理优先级排序
 */

import { existsSync, statSync } from 'node:fs'
import { promises as fsPromises } from 'node:fs'
import { join, extname } from 'node:path'

export interface ResidualFileAnalysis {
  /** 残余文件类型分布 */
  fileTypes: Record<string, { count: number; bytes: number }>
  /** 最大的几个残余文件 */
  largestFiles: Array<{ path: string; bytes: number; type: string }>
  /** 可安全删除的文件类型 */
  safeToDeleteTypes: string[]
  /** 需要确认的文件类型 */
  needsConfirmationTypes: string[]
}

export interface ArchiveProjectInfo {
  slug: string
  name: string
  bytes: number
  sessionCount: number
  /** 是否是归档项目（超过 N 天未访问） */
  isArchived: boolean
  /** 最后访问时间 */
  lastAccessedAt: number
  /** 归档天数 */
  archivedDays: number
  /** 清理优先级（1-5，5 最高） */
  cleanupPriority: number
  /** 清理建议 */
  cleanupSuggestion: string
  /** 残余文件分析 */
  residualFiles?: ResidualFileAnalysis
}

const ARCHIVED_PROJECT_THRESHOLD_DAYS = 30

// 可安全删除的文件类型
const SAFE_TO_DELETE_EXTENSIONS = new Set([
  '.log', '.tmp', '.temp', '.cache',
  '.DS_Store', 'Thumbs.db', '.swp', '.swo',
  '~', '.bak', '.old',
])

// 需要用户确认的文件类型
const NEEDS_CONFIRMATION_EXTENSIONS = new Set([
  '.md', '.txt', '.json', '.yaml', '.yml',
  '.js', '.ts', '.jsx', '.tsx', '.py',
  '.java', '.go', '.rs', '.c', '.cpp',
])

/**
 * 分析项目残余文件
 */
export async function analyzeResidualFiles(
  projectPath: string,
  maxFiles: number = 100,
): Promise<ResidualFileAnalysis> {
  const fileTypes: Record<string, { count: number; bytes: number }> = {}
  const largestFiles: Array<{ path: string; bytes: number; type: string }> = []
  const safeToDeleteTypes = new Set<string>()
  const needsConfirmationTypes = new Set<string>()

  let scannedCount = 0

  async function scan(dir: string, depth: number = 0): Promise<void> {
    if (depth > 6 || scannedCount >= maxFiles) return
    if (!existsSync(dir)) return

    try {
      const entries = await fsPromises.readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (scannedCount >= maxFiles) break

        const fullPath = join(dir, entry.name)

        try {
          if (entry.isDirectory()) {
            // 跳过明显的系统目录
            if (['node_modules', '.git', '.next', 'dist', 'build'].includes(entry.name)) {
              continue
            }
            await scan(fullPath, depth + 1)
          } else if (entry.isFile()) {
            const stat = await fsPromises.stat(fullPath)
            const ext = extname(entry.name).toLowerCase()
            const type = ext || '(无扩展名)'

            // 统计文件类型
            if (!fileTypes[type]) {
              fileTypes[type] = { count: 0, bytes: 0 }
            }
            fileTypes[type]!.count++
            fileTypes[type]!.bytes += stat.size

            // 记录大文件
            if (largestFiles.length < 10 || stat.size > (largestFiles[largestFiles.length - 1]?.bytes ?? 0)) {
              largestFiles.push({ path: fullPath, bytes: stat.size, type })
              largestFiles.sort((a, b) => b.bytes - a.bytes)
              if (largestFiles.length > 10) largestFiles.pop()
            }

            // 分类文件类型
            if (SAFE_TO_DELETE_EXTENSIONS.has(ext)) {
              safeToDeleteTypes.add(type)
            } else if (NEEDS_CONFIRMATION_EXTENSIONS.has(ext)) {
              needsConfirmationTypes.add(type)
            }

            scannedCount++
          }
        } catch {
          // 跳过无权限的文件
        }
      }
    } catch {
      // 跳过无权限的目录
    }
  }

  await scan(projectPath)

  return {
    fileTypes,
    largestFiles,
    safeToDeleteTypes: Array.from(safeToDeleteTypes),
    needsConfirmationTypes: Array.from(needsConfirmationTypes),
  }
}

/**
 * 获取项目最后访问时间
 */
export async function getProjectLastAccessTime(projectPath: string): Promise<number> {
  if (!existsSync(projectPath)) return 0

  try {
    const stat = await fsPromises.stat(projectPath)
    return stat.mtimeMs
  } catch {
    return 0
  }
}

/**
 * 计算清理优先级（1-5，5 最高）
 */
export function calculateCleanupPriority(
  bytes: number,
  archivedDays: number,
  sessionCount: number,
  hasResidualFiles: boolean,
): number {
  let priority = 1

  // 归档时间越长，优先级越高
  if (archivedDays > 90) priority += 2
  else if (archivedDays > 60) priority += 1

  // 占用空间越大，优先级越高
  const sizeGB = bytes / (1024 * 1024 * 1024)
  if (sizeGB > 5) priority += 2
  else if (sizeGB > 1) priority += 1

  // 会话数少的项目优先级更高（可能是测试项目）
  if (sessionCount <= 2) priority += 1

  // 有残余文件的优先级更高
  if (hasResidualFiles) priority += 1

  return Math.min(5, priority)
}

/**
 * 生成清理建议
 */
export function generateCleanupSuggestion(info: ArchiveProjectInfo): string {
  const suggestions: string[] = []

  if (info.isArchived) {
    suggestions.push(`已归档 ${info.archivedDays} 天`)
  }

  const sizeGB = info.bytes / (1024 * 1024 * 1024)
  if (sizeGB > 5) {
    suggestions.push(`占用 ${sizeGB.toFixed(1)} GB 空间`)
  }

  if (info.sessionCount <= 2) {
    suggestions.push('会话数少，可能是测试项目')
  }

  if (info.residualFiles) {
    const safeCount = info.residualFiles.safeToDeleteTypes.length
    if (safeCount > 0) {
      suggestions.push(`包含 ${safeCount} 种可安全删除的文件类型`)
    }
  }

  if (info.cleanupPriority >= 4) {
    return '【高优先级】' + suggestions.join('；')
  } else if (info.cleanupPriority >= 3) {
    return '【中优先级】' + suggestions.join('；')
  } else {
    return '【低优先级】' + suggestions.join('；')
  }
}

/**
 * 识别归档项目并生成清理建议
 */
export async function identifyArchivedProjects(
  projectPaths: Array<{ slug: string; name: string; path: string; bytes: number; sessionCount: number }>,
): Promise<ArchiveProjectInfo[]> {
  const results: ArchiveProjectInfo[] = []
  const now = Date.now()
  const thresholdMs = ARCHIVED_PROJECT_THRESHOLD_DAYS * 24 * 60 * 60 * 1000

  for (const project of projectPaths) {
    const lastAccessedAt = await getProjectLastAccessTime(project.path)
    const isArchived = lastAccessedAt > 0 && (now - lastAccessedAt) > thresholdMs
    const archivedDays = lastAccessedAt > 0 ? Math.floor((now - lastAccessedAt) / (24 * 60 * 60 * 1000)) : 0

    // 分析残余文件（仅对归档项目）
    let residualFiles: ResidualFileAnalysis | undefined
    if (isArchived) {
      residualFiles = await analyzeResidualFiles(project.path)
    }

    const cleanupPriority = calculateCleanupPriority(
      project.bytes,
      archivedDays,
      project.sessionCount,
      !!residualFiles && Object.keys(residualFiles.fileTypes).length > 0,
    )

    const info: ArchiveProjectInfo = {
      slug: project.slug,
      name: project.name,
      bytes: project.bytes,
      sessionCount: project.sessionCount,
      isArchived,
      lastAccessedAt,
      archivedDays,
      cleanupPriority,
      cleanupSuggestion: '',
      residualFiles,
    }

    info.cleanupSuggestion = generateCleanupSuggestion(info)

    results.push(info)
  }

  // 按清理优先级降序排序
  results.sort((a, b) => b.cleanupPriority - a.cleanupPriority)

  return results
}

/**
 * 生成磁盘清理报告
 */
export interface DiskCleanupReport {
  totalProjects: number
  archivedProjects: number
  totalBytes: number
  archivedBytes: number
  highPriorityProjects: ArchiveProjectInfo[]
  mediumPriorityProjects: ArchiveProjectInfo[]
  lowPriorityProjects: ArchiveProjectInfo[]
  summary: string
}

export function generateCleanupReport(projects: ArchiveProjectInfo[]): DiskCleanupReport {
  const archivedProjects = projects.filter(p => p.isArchived)
  const totalBytes = projects.reduce((sum, p) => sum + p.bytes, 0)
  const archivedBytes = archivedProjects.reduce((sum, p) => sum + p.bytes, 0)

  const highPriority = projects.filter(p => p.cleanupPriority >= 4)
  const mediumPriority = projects.filter(p => p.cleanupPriority === 3)
  const lowPriority = projects.filter(p => p.cleanupPriority <= 2)

  const summary = [
    `共 ${projects.length} 个项目，其中 ${archivedProjects.length} 个已归档`,
    `总占用 ${(totalBytes / (1024 * 1024 * 1024)).toFixed(1)} GB`,
    `归档项目占用 ${(archivedBytes / (1024 * 1024 * 1024)).toFixed(1)} GB`,
    highPriority.length > 0 ? `${highPriority.length} 个高优先级清理项` : '',
  ].filter(Boolean).join('，')

  return {
    totalProjects: projects.length,
    archivedProjects: archivedProjects.length,
    totalBytes,
    archivedBytes,
    highPriorityProjects: highPriority,
    mediumPriorityProjects: mediumPriority,
    lowPriorityProjects: lowPriority,
    summary,
  }
}
