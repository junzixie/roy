/**
 * Wallpaper Engine 动态壁纸扫描
 *
 * 直接从 Steam 创意工坊目录读取已订阅的壁纸，不启动 Wallpaper Engine 本体。
 * 视频型（mp4 / webm）直接播；场景型（scene.pkg）交给渲染层的 WebWallGL 实时渲染（照 Arthur）。
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** Wallpaper Engine 在 Steam 上的 AppID。 */
const WALLPAPER_ENGINE_APP_ID = '431960'

export interface WorkshopWallpaperItem {
  id: string
  title: string
  /** 视频文件的绝对路径 */
  file: string
  /** 'video' = mp4/webm 可直接播；'scene' = 需要 WE 渲染器，当前不支持 */
  kind: 'video' | 'scene'
}

/** 按「注册表里的 Steam 路径 → 常见安装盘符」的顺序找工坊目录。 */
function workshopDirs(): string[] {
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
  return dirs
}

function readProject(dir: string): { title?: string; type?: string; file?: string } | null {
  try {
    return JSON.parse(readFileSync(join(dir, 'project.json'), 'utf-8')) as { title?: string; type?: string; file?: string }
  } catch {
    return null
  }
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
      try {
        if (!statSync(itemDir).isDirectory()) continue
      } catch {
        continue
      }

      const project = readProject(itemDir)
      const type = String(project?.type ?? '').toLowerCase()

      // 场景型：存在 scene.pkg 就记录下来，但不提供给渲染层播放
      if (type === 'scene' || existsSync(join(itemDir, 'scene.pkg'))) {
        items.push({
          id,
          title: project?.title || id,
          file: join(itemDir, 'scene.pkg'),
          kind: 'scene',
        })
        continue
      }

      let videoFile = project?.file ? join(itemDir, project.file) : ''
      if (!videoFile || !existsSync(videoFile)) {
        const candidate = readdirSync(itemDir).find((name) => /\.(mp4|webm)$/i.test(name))
        videoFile = candidate ? join(itemDir, candidate) : ''
      }
      if (!videoFile) continue

      items.push({
        id,
        title: project?.title || id,
        file: videoFile,
        kind: 'video',
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

/**
 * 读一个场景型壁纸的 scene.pkg 和 project.json（照 Arthur），
 * 交给渲染进程用 WebWallGL（WebGL2）现场渲染，不需要 Wallpaper Engine 在后台跑。
 */
export function readSceneWallpaper(id: string): { id: string; pkg: Uint8Array; project: unknown } {
  if (!/^[\w.-]+$/.test(id)) throw new Error('壁纸编号不合法')
  for (const dir of workshopDirs()) {
    const itemDir = join(dir, id)
    const pkg = join(itemDir, 'scene.pkg')
    if (!existsSync(pkg)) continue
    return { id, pkg: new Uint8Array(readFileSync(pkg)), project: readProject(itemDir) }
  }
  throw new Error('没找到这张场景壁纸的 scene.pkg')
}
