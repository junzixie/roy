/**
 * Wallpaper Engine 动态壁纸扫描
 *
 * 直接从 Steam 创意工坊目录读取已订阅的壁纸，不启动 Wallpaper Engine 本体。
 * 视频型（mp4 / webm）直接播；场景型（scene.pkg）交给渲染层的 WebWallGL 实时渲染（照 Arthur）。
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/** Wallpaper Engine 在 Steam 上的 AppID。 */
const WALLPAPER_ENGINE_APP_ID = '431960'

export interface WorkshopWallpaperItem {
  id: string
  title: string
  /** 视频文件的绝对路径；场景型指向 scene.pkg */
  file: string
  /** 'video' = mp4/webm 可直接播；'scene' = 用 WebWallGL 渲染 scene.pkg */
  kind: 'video' | 'scene'
  /**
   * 预览图绝对路径。
   *
   * Wallpaper Engine 的 project.json 里 `preview` 字段指向封面图（通常是
   * `preview.jpg`），以前这里把它丢掉了，设置页因此只能显示一个 Film 图标 +
   * 标题——几十张壁纸全是同样的图标，根本没法挑。现在保留下来交给渲染层。
   */
  preview: string
}

/**
 * 工坊目录缓存。
 *
 * `workshopDirs()` 在 Windows 上要起一个 `reg query` 子进程（约 20–60ms）再探
 * 16 个路径。设置页每次打开都会调一次列表接口，`hasWorkshopWallpapers()` 也会调，
 * 用户装了/卸了 Wallpaper Engine 才需要重算，所以按 5 分钟缓存一次。
 */
let cachedWorkshopDirs: { at: number; dirs: string[] } | null = null
const WORKSHOP_DIRS_TTL_MS = 5 * 60 * 1000

/** 清掉工坊目录缓存；测试和「手动重新扫描」用。 */
export function invalidateWorkshopDirCache(): void {
  cachedWorkshopDirs = null
}

/** 按「注册表里的 Steam 路径 → 常见安装盘符」的顺序找工坊目录。 */
function workshopDirs(): string[] {
  if (cachedWorkshopDirs && Date.now() - cachedWorkshopDirs.at < WORKSHOP_DIRS_TTL_MS) {
    return cachedWorkshopDirs.dirs
  }

  const roots = new Set<string>()

  if (process.platform === 'win32') {
    try {
      const output = execFileSync(
        'reg',
        ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'],
        { encoding: 'utf-8', timeout: 3000, windowsHide: true },
      )
      const match = /SteamPath\s+REG_SZ\s+(.+)/.exec(output)
      const steamPath = match?.[1]?.trim()
      if (steamPath) roots.add(steamPath)
    } catch {
      // 注册表读不到就走下面的常见路径
    }

    for (const drive of ['C', 'D', 'E', 'F', 'G']) {
      roots.add(`${drive}:/Program Files (x86)/Steam`)
      roots.add(`${drive}:/Steam`)
      roots.add(`${drive}:/SteamLibrary`)
    }
  }

  const dirs: string[] = []
  for (const root of roots) {
    const dir = join(root, 'steamapps', 'workshop', 'content', WALLPAPER_ENGINE_APP_ID)
    if (existsSync(dir)) dirs.push(dir)
  }
  cachedWorkshopDirs = { at: Date.now(), dirs }
  return dirs
}

interface ProjectJson {
  title?: string
  type?: string
  file?: string
  /** 封面图相对路径，Wallpaper Engine 里通常是 `preview.jpg` */
  preview?: string
}

function readProject(dir: string): ProjectJson | null {
  try {
    return JSON.parse(readFileSync(join(dir, 'project.json'), 'utf-8')) as ProjectJson
  } catch {
    return null
  }
}

/** 封面图候选扩展名：project.json 里的 preview 常常没写扩展名。 */
const PREVIEW_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp'] as const
/** 没有 project.json 声明时，按这些文件名猜封面。 */
const PREVIEW_BASENAMES = ['preview', 'Preview', 'thumbnail'] as const

/**
 * 在**已列出的目录项**里找封面，不再逐条 existsSync。
 *
 * 原来每张壁纸最多要做 15 次 `existsSync`（3 个文件名 × 5 个扩展名），
 * 100 张壁纸就是 1500 次同步 stat，全部压在主进程上——设置页打开时会卡一下。
 * 目录项本来就要列（找视频也要用），改成在内存里做大小写不敏感的匹配，
 * 系统调用从 O(壁纸数 × 15) 降到 O(壁纸数)。
 *
 * @param entries - 该壁纸目录的 `readdirSync` 结果。
 * @param declared - project.json 里声明的 `preview` 值。
 * @returns 封面文件名（不是绝对路径）；找不到返回空串。
 */
export function pickPreviewName(entries: readonly string[], declared?: string): string {
  // 大小写不敏感查表：Wallpaper Engine 在 Windows 上写的名字大小写不固定
  const byLower = new Map<string, string>()
  for (const name of entries) byLower.set(name.toLowerCase(), name)

  if (declared) {
    const found = byLower.get(declared.toLowerCase())
    if (found) return found
    // 声明里没扩展名时补一个
    if (!/\.[a-z0-9]+$/i.test(declared)) {
      for (const ext of PREVIEW_EXTENSIONS) {
        const found = byLower.get(`${declared}.${ext}`.toLowerCase())
        if (found) return found
      }
    }
  }

  for (const base of PREVIEW_BASENAMES) {
    for (const ext of PREVIEW_EXTENSIONS) {
      const found = byLower.get(`${base}.${ext}`.toLowerCase())
      if (found) return found
    }
  }
  return ''
}

/**
 * 列出本机已订阅的动态壁纸。
 *
 * 没有装 Wallpaper Engine 时返回空数组，调用方据此隐藏入口。
 */
export function listWorkshopWallpapers(): WorkshopWallpaperItem[] {
  const items: WorkshopWallpaperItem[] = []

  for (const dir of workshopDirs()) {
    let ids: string[]
    try {
      ids = readdirSync(dir)
    } catch {
      continue
    }

    for (const id of ids) {
      const itemDir = join(dir, id)
      // 列一次目录项，后面找封面、找视频都复用，不再各自 readdir / existsSync
      let entries: string[]
      try {
        if (!statSync(itemDir).isDirectory()) continue
        entries = readdirSync(itemDir)
      } catch {
        continue
      }
      const lower = new Set(entries.map((name) => name.toLowerCase()))

      const project = readProject(itemDir)
      const type = String(project?.type ?? '').toLowerCase()
      const previewName = pickPreviewName(entries, project?.preview?.trim())
      const preview = previewName ? join(itemDir, previewName) : ''

      // 场景型：存在 scene.pkg 就记录下来，交给渲染层用 WebWallGL 播
      if (type === 'scene' || lower.has('scene.pkg')) {
        items.push({
          id,
          title: project?.title || id,
          file: join(itemDir, 'scene.pkg'),
          kind: 'scene',
          preview,
        })
        continue
      }

      // project.json 声明的视频可能已被用户删掉，退回目录里的第一个视频
      const declaredVideo = project?.file?.trim()
      let videoFile = ''
      if (declaredVideo && lower.has(declaredVideo.toLowerCase())) {
        // 用目录项里的真实大小写，Windows 上大小写不敏感但其它平台敏感
        const actual = entries.find((name) => name.toLowerCase() === declaredVideo.toLowerCase())
        videoFile = join(itemDir, actual ?? declaredVideo)
      } else {
        const candidate = entries.find((name) => /\.(mp4|webm)$/i.test(name))
        videoFile = candidate ? join(itemDir, candidate) : ''
      }
      if (!videoFile) continue

      items.push({
        id,
        title: project?.title || id,
        file: videoFile,
        kind: 'video',
        preview,
      })
    }
  }

  // 标题排序，顺带去掉重复 id（同一个订阅可能在多个库目录里出现）
  const seen = new Set<string>()
  return items
    .filter((item) => (seen.has(item.id) ? false : (seen.add(item.id), true)))
    .sort((a, b) => Number(b.kind === 'video') - Number(a.kind === 'video') || a.title.localeCompare(b.title, 'zh-CN'))
}

/** 供渲染层确认本机是否装了 Wallpaper Engine。 */
export function hasWorkshopWallpapers(): boolean {
  return workshopDirs().length > 0
}

/** 场景包大小上限：超过就拒绝，避免把主进程和渲染进程一起撑爆。 */
const MAX_SCENE_PKG_BYTES = 512 * 1024 * 1024

/**
 * 读一个场景型壁纸的 scene.pkg 和 project.json（照 Arthur），
 * 交给渲染进程用 WebWallGL（WebGL2）现场渲染，不需要 Wallpaper Engine 在后台跑。
 *
 * 用异步读而不是 `readFileSync`：场景包常见几十到几百 MB，同步读会把主进程
 * 完全卡住（窗口拖动、IPC 全部停摆），而且这块数据还要再经 IPC 结构化克隆
 * 复制一份到渲染进程，同步路径上等于连续两次大块内存分配。
 *
 * @param id - 创意工坊壁纸编号。
 * @returns 场景包字节与 project.json。
 * @throws 编号非法、找不到包、包超过上限或读取失败时抛错。
 */
export async function readSceneWallpaper(id: string): Promise<{ id: string; pkg: Uint8Array; project: unknown }> {
  if (!/^[\w.-]+$/.test(id)) throw new Error('壁纸编号不合法')
  for (const dir of workshopDirs()) {
    const itemDir = join(dir, id)
    const pkgPath = join(itemDir, 'scene.pkg')
    if (!existsSync(pkgPath)) continue

    const size = statSync(pkgPath).size
    if (size > MAX_SCENE_PKG_BYTES) {
      throw new Error(`场景包过大（${Math.round(size / 1024 / 1024)}MB），超过 512MB 上限`)
    }
    const buffer = await readFile(pkgPath)
    return { id, pkg: new Uint8Array(buffer), project: readProject(itemDir) }
  }
  throw new Error('没找到这张场景壁纸的 scene.pkg')
}
