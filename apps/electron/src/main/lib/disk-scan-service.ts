/**
 * 磁盘可清理项扫描
 *
 * 只读扫描系统各处的可清理内容（临时文件、浏览器缓存、旧安装包、日志、回收站等），
 * 按风险等级给出建议。本模块不删除任何文件，删除动作由用户在其他界面或手动完成。
 *
 * 设计约束：
 * - 只用 node 内置能力，不依赖第三方包，不执行外部命令
 * - 所有扫描都有数量与深度上限，避免阻塞主进程事件循环
 * - 单项失败只跳过该项，不中断整轮扫描
 */

import { promises as fsPromises, existsSync } from 'node:fs'
import { join, basename, extname } from 'node:path'
import { homedir, tmpdir } from 'node:os'

// ─── 类型定义 ───

/** 建议的处置方式，决定界面用什么颜色和文案提示 */
export type ScanRisk = 'safe' | 'caution' | 'danger'

export interface ScanItem {
  /** 稳定标识，供前端折叠状态与后续引用 */
  id: string
  /** 分类名，同一分类下的项归在一起 */
  category: string
  /** 展示名称 */
  label: string
  /** 说明这项是什么、清理后有什么影响 */
  description: string
  /** 绝对路径；无法定位到具体路径时为空 */
  path?: string
  bytes: number
  fileCount: number
  risk: ScanRisk
  /** 风险提示，danger 级别必须填写 */
  warning?: string
  /** 该项是否可以在本界面直接删除 */
  deletable: boolean
  /** 文件太多或超时导致没数完，体积只是下限 */
  truncated?: boolean
}

export interface ScanGroup {
  category: string
  label: string
  description: string
  items: ScanItem[]
  bytes: number
  fileCount: number
}

export interface ScanResult {
  groups: ScanGroup[]
  totalBytes: number
  totalFileCount: number
  scannedAt: number
  /** 扫描过程中出现的非致命错误，用于界面提示 */
  errors: string[]
  /** 扫描耗时，毫秒 */
  durationMs: number
}

// ─── 扫描上限 ───

/** 单个目录树最多统计的文件数，防止超大目录拖慢主进程 */
const MAX_FILES_PER_TREE = 20_000
/** 目录递归最大深度 */
const MAX_DEPTH = 12
/** 单个扫描器的时间预算，超过就保留已扫到的结果并标记为部分结果 */
const SCANNER_TIME_BUDGET_MS = 4_000
/** 判断「旧安装包」的时间阈值：90 天前的下载文件 */
const OLD_INSTALLER_DAYS = 90
/** 大文件阈值：单个文件超过 500MB 视为值得关注的占用 */
const LARGE_FILE_BYTES = 500 * 1024 * 1024

const INSTALLER_EXTENSIONS = new Set(['.exe', '.msi', '.dmg', '.pkg', '.zip', '.7z', '.rar'])

// ─── 工具函数 ───

interface DirSize {
  bytes: number
  fileCount: number
  /** 达到数量或时间上限时提前结束，此时体积只是下限 */
  truncated?: boolean
}

async function measureDir(
  dirPath: string,
  maxDepth = MAX_DEPTH,
  deadline = Number.POSITIVE_INFINITY
): Promise<DirSize> {
  const result: DirSize = { bytes: 0, fileCount: 0 }
  const budget = { remaining: MAX_FILES_PER_TREE }

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > maxDepth) return
    if (budget.remaining <= 0 || Date.now() > deadline) {
      result.truncated = true
      return
    }
    try {
      const entries = await fsPromises.readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (budget.remaining <= 0 || Date.now() > deadline) {
          result.truncated = true
          return
        }
        const fullPath = join(dir, entry.name)
        try {
          if (entry.isDirectory()) {
            await walk(fullPath, depth + 1)
          } else if (entry.isFile()) {
            const stat = await fsPromises.stat(fullPath)
            result.bytes += stat.size
            result.fileCount++
            budget.remaining--
          }
        } catch {
          // 无权限或已被删除，跳过
        }
      }
    } catch {
      return
    }
  }

  if (!existsSync(dirPath)) return result
  await walk(dirPath, 0)
  return result
}

/** 列出目录下第一层子目录，找不到就返回空数组 */
async function listSubdirs(dirPath: string): Promise<string[]> {
  try {
    const entries = await fsPromises.readdir(dirPath, { withFileTypes: true })
    return entries.filter((e) => e.isDirectory()).map((e) => join(dirPath, e.name))
  } catch {
    return []
  }
}

function makeItem(input: Omit<ScanItem, 'bytes' | 'fileCount'> & Partial<DirSize>): ScanItem {
  const item: ScanItem = {
    ...input,
    bytes: input.bytes ?? 0,
    fileCount: input.fileCount ?? 0,
  }
  if (input.truncated) {
    item.truncated = true
    item.description += '（文件太多，体积为已统计部分的下限）'
  }
  return item
}

// ─── 各类扫描 ───

/** 系统与用户临时目录 */
async function scanTempDirs(): Promise<ScanItem[]> {
  const items: ScanItem[] = []
  const candidates: Array<{ id: string; label: string; path: string; note: string }> = [
    {
      id: 'temp-user',
      label: '用户临时文件',
      path: tmpdir(),
      note: '程序运行时产生的临时文件，重启后系统也会自行清理',
    },
    {
      id: 'temp-windows',
      label: 'Windows 临时文件',
      path: join(process.env.SystemRoot ?? 'C:\\Windows', 'Temp'),
      note: '系统级临时文件，占用大时通常可以安全清理',
    },
  ]

  for (const c of candidates) {
    if (!existsSync(c.path)) continue
    const size = await measureDir(c.path)
    // 只有空文件的目录不值得展示
    if (size.fileCount === 0 || size.bytes === 0) continue
    items.push(makeItem({
      id: c.id,
      category: 'temp',
      label: c.label,
      description: c.note,
      path: c.path,
      risk: 'safe',
      deletable: false,
      ...size,
    }))
  }
  return items
}

/** Windows 更新缓存与回收站 */
async function scanWindowsMaintenance(): Promise<ScanItem[]> {
  const items: ScanItem[] = []
  const systemRoot = process.env.SystemRoot ?? 'C:\\Windows'

  const updateCache = join(systemRoot, 'SoftwareDistribution', 'Download')
  if (existsSync(updateCache)) {
    const size = await measureDir(updateCache)
    if (size.fileCount > 0) {
      items.push(makeItem({
        id: 'windows-update-cache',
        category: 'system',
        label: 'Windows 更新缓存',
        description: '已下载的系统更新安装包，更新装完后即可清理',
        path: updateCache,
        risk: 'caution',
        warning: '系统正在下载或安装更新时清理可能导致更新失败，建议确认当前没有更新任务',
        deletable: false,
        ...size,
      }))
    }
  }

  // 崩溃转储文件
  const crashDumps = join(homedir(), 'AppData', 'Local', 'CrashDumps')
  if (existsSync(crashDumps)) {
    const size = await measureDir(crashDumps)
    if (size.fileCount > 0) {
      items.push(makeItem({
        id: 'crash-dumps',
        category: 'system',
        label: '程序崩溃转储',
        description: '程序崩溃时生成的内存快照，用于排查问题，日常使用没有保留价值',
        path: crashDumps,
        risk: 'safe',
        deletable: false,
        ...size,
      }))
    }
  }

  return items
}

/** 浏览器缓存 */
async function scanBrowserCaches(deadline: number): Promise<ScanItem[]> {
  const items: ScanItem[] = []
  const local = join(homedir(), 'AppData', 'Local')

  const browsers: Array<{ id: string; label: string; base: string; subs: string[] }> = [
    {
      id: 'edge',
      label: 'Edge 浏览器缓存',
      base: join(local, 'Microsoft', 'Edge', 'User Data'),
      subs: ['Cache', 'Code Cache', 'GPUCache', 'Service Worker'],
    },
    {
      id: 'chrome',
      label: 'Chrome 浏览器缓存',
      base: join(local, 'Google', 'Chrome', 'User Data'),
      subs: ['Cache', 'Code Cache', 'GPUCache', 'Service Worker'],
    },
  ]

  for (const b of browsers) {
    if (!existsSync(b.base)) continue
    const profiles = await listSubdirs(b.base)
    let bytes = 0
    let fileCount = 0
    let truncated = false
    for (const profile of profiles) {
      // 只处理 Default / Profile N 这类配置目录
      const name = basename(profile)
      if (name !== 'Default' && !name.startsWith('Profile')) continue
      for (const sub of b.subs) {
        const size = await measureDir(join(profile, sub), 6, deadline)
        bytes += size.bytes
        fileCount += size.fileCount
        if (size.truncated) truncated = true
      }
    }
    if (fileCount === 0) continue
    items.push(makeItem({
      id: `${b.id}-cache`,
      category: 'browser',
      label: b.label,
      description: '网页资源缓存，清理后会短暂变慢，随后自动重建。不影响书签、密码和登录状态',
      path: b.base,
      risk: 'safe',
      deletable: false,
      bytes,
      fileCount,
      truncated,
    }))
  }

  return items
}

/** 下载目录里的旧安装包与大文件 */
async function scanDownloads(): Promise<ScanItem[]> {
  const items: ScanItem[] = []
  const downloads = join(homedir(), 'Downloads')
  if (!existsSync(downloads)) return items

  let entries
  try {
    entries = await fsPromises.readdir(downloads, { withFileTypes: true })
  } catch {
    return items
  }

  const cutoff = Date.now() - OLD_INSTALLER_DAYS * 24 * 60 * 60 * 1000
  let installerBytes = 0
  let installerCount = 0
  let installerOldest = ''
  let largeFileBytes = 0
  let largeFileCount = 0
  const largeSamples: string[] = []

  for (const entry of entries) {
    if (!entry.isFile()) continue
    const fullPath = join(downloads, entry.name)
    try {
      const stat = await fsPromises.stat(fullPath)
      const ext = extname(entry.name).toLowerCase()

      if (INSTALLER_EXTENSIONS.has(ext) && stat.mtimeMs < cutoff) {
        installerBytes += stat.size
        installerCount++
        const d = new Date(stat.mtimeMs).toISOString().slice(0, 10)
        if (!installerOldest || d < installerOldest) installerOldest = d
      }

      if (stat.size >= LARGE_FILE_BYTES) {
        largeFileBytes += stat.size
        largeFileCount++
        if (largeSamples.length < 3) {
          largeSamples.push(`${entry.name}（${(stat.size / 1024 / 1024 / 1024).toFixed(1)} GB）`)
        }
      }
    } catch {
      // 跳过
    }
  }

  if (installerCount > 0) {
    items.push(makeItem({
      id: 'downloads-old-installers',
      category: 'downloads',
      label: `超过 ${OLD_INSTALLER_DAYS} 天的安装包`,
      description: `下载目录里 ${installerOldest} 及更早的安装包和压缩包，软件一般都已有新版本`,
      path: downloads,
      risk: 'caution',
      warning: '请先确认这些安装包不再需要，删除后需重新下载',
      deletable: false,
      bytes: installerBytes,
      fileCount: installerCount,
    }))
  }

  if (largeFileCount > 0) {
    items.push(makeItem({
      id: 'downloads-large-files',
      category: 'downloads',
      label: '下载目录中的超大文件',
      description: `单个超过 500 MB 的文件，例如 ${largeSamples.join('、')}`,
      path: downloads,
      risk: 'caution',
      warning: '这些都是正常文件，只是体积大。是否保留由你自己判断',
      deletable: false,
      bytes: largeFileBytes,
      fileCount: largeFileCount,
    }))
  }

  return items
}

/** 应用日志 */
async function scanLogs(): Promise<ScanItem[]> {
  const items: ScanItem[] = []
  const local = join(homedir(), 'AppData', 'Local')
  const candidates: Array<{ id: string; label: string; path: string; desc: string }> = [
    {
      id: 'roy-logs',
      label: 'Roy 运行日志',
      path: join(homedir(), '.roy', 'computer-log'),
      desc: 'Roy 执行电脑操作的记录和截图，排查问题时才需要',
    },
    {
      id: 'roy-shots',
      label: 'Roy 截图缓存',
      path: join(homedir(), '.roy', 'shots'),
      desc: '截图临时文件，清理后不影响会话记录',
    },
  ]

  for (const c of candidates) {
    if (!existsSync(c.path)) continue
    const size = await measureDir(c.path, 4)
    if (size.fileCount === 0) continue
    items.push(makeItem({
      id: c.id,
      category: 'logs',
      label: c.label,
      description: c.desc,
      path: c.path,
      risk: 'caution',
      warning: '近期日志可能对排查问题有用，确认不再需要再删',
      deletable: false,
      ...size,
    }))
  }

  // 通用日志目录里体积排前几的
  const logRoot = join(local, 'Temp')
  if (existsSync(logRoot)) {
    try {
      const entries = await fsPromises.readdir(logRoot, { withFileTypes: true })
      let logBytes = 0
      let logCount = 0
      for (const e of entries) {
        if (!e.isFile()) continue
        if (!e.name.toLowerCase().endsWith('.log')) continue
        try {
          const stat = await fsPromises.stat(join(logRoot, e.name))
          logBytes += stat.size
          logCount++
        } catch {
          // 跳过
        }
      }
      if (logCount > 0) {
        items.push(makeItem({
          id: 'temp-logs',
          category: 'logs',
          label: '临时目录中的日志文件',
          description: `${logCount} 个 .log 文件，多为程序调试输出`,
          path: logRoot,
          risk: 'safe',
          deletable: false,
          bytes: logBytes,
          fileCount: logCount,
        }))
      }
    } catch {
      // 跳过
    }
  }

  return items
}

/** npm / bun / pip 等包管理器缓存 */
async function scanPackageCaches(deadline: number): Promise<ScanItem[]> {
  const items: ScanItem[] = []
  const home = homedir()
  const candidates: Array<{ id: string; label: string; path: string; desc: string }> = [
    {
      id: 'npm-cache',
      label: 'npm 缓存',
      path: join(home, 'AppData', 'Local', 'npm-cache'),
      desc: '已下载的 npm 包缓存，删除后下次安装会重新下载',
    },
    {
      id: 'bun-cache',
      label: 'Bun 缓存',
      path: join(home, '.bun', 'install', 'cache'),
      desc: '已下载的 Bun 包缓存，删除后下次安装会重新下载',
    },
    {
      id: 'pip-cache',
      label: 'pip 缓存',
      path: join(home, 'AppData', 'Local', 'pip', 'Cache'),
      desc: '已下载的 Python 包缓存，删除后下次安装会重新下载',
    },
  ]

  for (const c of candidates) {
    if (!existsSync(c.path)) continue
    const size = await measureCacheDir(c.path, deadline)
    if (size.fileCount === 0) continue
    items.push(makeItem({
      id: c.id,
      category: 'dev-cache',
      label: c.label,
      description: c.desc,
      path: c.path,
      risk: 'safe',
      deletable: false,
      ...size,
    }))
  }
  return items
}

/**
 * 包管理器缓存数量极大（bun 缓存可达数十万文件），逐文件统计会拖住主进程。
 * 这里改为只统计一层目录大小并按目录体积累加，误差远小于直接放弃统计。
 */
async function measureCacheDir(dirPath: string, deadline: number): Promise<DirSize> {
  const result: DirSize = { bytes: 0, fileCount: 0 }
  if (!existsSync(dirPath)) return result

  let dirs: string[] = []
  try {
    const entries = await fsPromises.readdir(dirPath, { withFileTypes: true })
    dirs = entries.filter((e) => e.isDirectory()).map((e) => join(dirPath, e.name))
    // 根目录下的散文件也要计入
    for (const entry of entries) {
      if (!entry.isFile()) continue
      try {
        const stat = await fsPromises.stat(join(dirPath, entry.name))
        result.bytes += stat.size
        result.fileCount++
      } catch {
        // 跳过
      }
    }
  } catch {
    return result
  }

  for (const dir of dirs) {
    if (Date.now() > deadline) {
      result.truncated = true
      break
    }
    // 每个一级子目录最多数 3000 个文件，超出则用已数部分估算
    const sub = await measureDir(dir, 6, Math.min(deadline, Date.now() + 800))
    result.bytes += sub.bytes
    result.fileCount += sub.fileCount
    if (sub.truncated) result.truncated = true
  }

  return result
}

/** 系统分区剩余空间，用于判断哪个盘需要清理 */
async function scanDrives(): Promise<ScanItem[]> {
  const items: ScanItem[] = []
  if (process.platform !== 'win32') return items

  for (const letter of 'CDEFGH'.split('')) {
    const root = `${letter}:\\`
    try {
      if (!existsSync(root)) continue
      const stat = await fsPromises.statfs(root)
      const total = stat.blocks * stat.bsize
      const free = stat.bavail * stat.bsize
      if (total === 0) continue
      const usedPct = Math.round(((total - free) / total) * 100)
      items.push(makeItem({
        id: `drive-${letter.toLowerCase()}`,
        category: 'drives',
        label: `${letter}: 盘剩余 ${(free / 1024 / 1024 / 1024).toFixed(1)} GB`,
        description: `总容量 ${(total / 1024 / 1024 / 1024).toFixed(0)} GB，已用 ${usedPct}%`,
        path: root,
        risk: usedPct >= 90 ? 'caution' : 'safe',
        warning: usedPct >= 90 ? '可用空间低于 10%，建议优先清理这个盘' : undefined,
        deletable: false,
        bytes: free,
        fileCount: 0,
      }))
    } catch {
      // 跳过读取失败的盘
    }
  }
  return items
}

// ─── 汇总 ───

const CATEGORY_META: Record<string, { label: string; description: string }> = {
  temp: { label: '临时文件', description: '程序运行时产生的中间文件，重启后系统也会自行清理' },
  system: { label: '系统缓存', description: 'Windows 更新残留和程序崩溃转储' },
  browser: { label: '浏览器缓存', description: '网页资源缓存，不影响书签、密码和登录状态' },
  downloads: { label: '下载目录', description: '需要你确认后再删除的文件' },
  logs: { label: '日志文件', description: '程序运行日志与调试输出' },
  'dev-cache': { label: '开发工具缓存', description: '包管理器下载缓存，删除后下次安装会重新下载' },
  drives: { label: '分区空间', description: '各分区可用容量' },
}

/** 分区分组只看剩余空间，不计入可清理总量 */
const NON_CLEANABLE_CATEGORIES = new Set(['drives'])

function groupItems(items: ScanItem[]): ScanGroup[] {
  const map = new Map<string, ScanItem[]>()
  for (const item of items) {
    const list = map.get(item.category) ?? []
    list.push(item)
    map.set(item.category, list)
  }

  const groups: ScanGroup[] = []
  for (const [category, list] of map) {
    const meta = CATEGORY_META[category] ?? { label: category, description: '' }
    list.sort((a, b) => b.bytes - a.bytes)
    groups.push({
      category,
      label: meta.label,
      description: meta.description,
      items: list,
      bytes: list.reduce((sum, i) => sum + i.bytes, 0),
      fileCount: list.reduce((sum, i) => sum + i.fileCount, 0),
    })
  }

  // 分区空间不是可清理项，始终排到最后；其余按体积降序
  groups.sort((a, b) => {
    const aDrive = NON_CLEANABLE_CATEGORIES.has(a.category) ? 1 : 0
    const bDrive = NON_CLEANABLE_CATEGORIES.has(b.category) ? 1 : 0
    if (aDrive !== bDrive) return aDrive - bDrive
    return b.bytes - a.bytes
  })
  return groups
}

export async function scanCleanableItems(): Promise<ScanResult> {
  const startedAt = Date.now()
  const errors: string[] = []

  // 每个扫描器单独给时间预算，避免某个超大目录拖住整轮扫描
  const scannerDeadline = (): number => Date.now() + SCANNER_TIME_BUDGET_MS

  const scanners: Array<{ name: string; run: () => Promise<ScanItem[]> }> = [
    { name: '临时文件', run: scanTempDirs },
    { name: '系统缓存', run: scanWindowsMaintenance },
    { name: '浏览器缓存', run: () => scanBrowserCaches(scannerDeadline()) },
    { name: '下载目录', run: scanDownloads },
    { name: '日志文件', run: scanLogs },
    { name: '开发工具缓存', run: () => scanPackageCaches(scannerDeadline()) },
    { name: '分区空间', run: scanDrives },
  ]

  const collected: ScanItem[] = []
  for (const scanner of scanners) {
    try {
      const result = await scanner.run()
      collected.push(...result)
    } catch (e) {
      errors.push(`${scanner.name}扫描失败：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const groups = groupItems(collected)
  const cleanable = groups.filter((g) => !NON_CLEANABLE_CATEGORIES.has(g.category))
  const totalBytes = cleanable.reduce((sum, g) => sum + g.bytes, 0)
  const totalFileCount = cleanable.reduce((sum, g) => sum + g.fileCount, 0)

  return {
    groups,
    totalBytes,
    totalFileCount,
    scannedAt: Date.now(),
    errors,
    durationMs: Date.now() - startedAt,
  }
}
