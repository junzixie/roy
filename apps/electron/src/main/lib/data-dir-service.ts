/**
 * 数据文件夹（默认项目存放位置）
 *
 * 设置 → 通用 →「数据文件夹」：项目（Agent 工作区）默认放在 ~/.roy/agent-workspaces，
 * 可以改到别的盘。改的时候可以选择把已有项目一起搬过去；改完重启应用生效
 * （路径在 config-paths 里只算一次，运行中的会话也在用旧路径，所以必须重启）。
 */

import { app } from 'electron'
import { cpSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { getDefaultAgentWorkspacesRoot, resolveAgentWorkspacesRoot } from './config-paths'
import { getSettings, updateSettings } from './settings-service'
import { hasActiveAgentSessions } from './agent-service'
import { destroyTray } from '../tray'

export interface DataDirInfo {
  /** 当前生效的位置（本次启动时读到的） */
  current: string
  /** 默认位置 */
  defaultDir: string
  /** 设置里保存的位置（改了还没重启时和 current 不一样） */
  saved: string
  /** 当前位置里有几个项目 */
  projectCount: number
}

function countEntries(dir: string): number {
  try {
    return readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).length
  } catch {
    return 0
  }
}

export function getDataDirInfo(): DataDirInfo {
  const current = resolveAgentWorkspacesRoot()
  const defaultDir = getDefaultAgentWorkspacesRoot()
  const saved = (getSettings().dataDir ?? '').trim() || defaultDir
  return { current, defaultDir, saved, projectCount: countEntries(current) }
}

function isInside(child: string, parent: string): boolean {
  const rel = relative(parent, child)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

export interface ChangeDataDirResult {
  dir: string
  moved: number
  needsRestart: boolean
}

/**
 * 改数据文件夹。
 * @param target 新位置；传空字符串表示恢复默认
 * @param move 是否把当前位置里的项目搬过去
 */
export async function changeDataDir(target: string, move: boolean): Promise<ChangeDataDirResult> {
  const current = resolveAgentWorkspacesRoot()
  const defaultDir = getDefaultAgentWorkspacesRoot()
  const next = target.trim() ? resolve(target.trim()) : defaultDir

  if (!isAbsolute(next)) throw new Error('请选择一个完整的文件夹路径')
  if (next !== current && (isInside(next, current) || isInside(current, next))) {
    throw new Error('新位置不能放在当前数据文件夹里面，也不能是它的上级文件夹')
  }

  let moved = 0
  if (move && next !== current && existsSync(current)) {
    if (hasActiveAgentSessions()) throw new Error('还有任务在运行，等它们结束后再搬')
    mkdirSync(next, { recursive: true })
    const entries = readdirSync(current)
    const clash = entries.filter((name) => existsSync(join(next, name)))
    if (clash.length) {
      throw new Error(`新位置里已经有同名的内容：${clash.slice(0, 3).join('、')}${clash.length > 3 ? ' 等' : ''}，请换一个空文件夹`)
    }
    for (const name of entries) {
      const from = join(current, name)
      const to = join(next, name)
      try {
        // 同一个盘直接改名，瞬间完成
        renameSync(from, to)
      } catch {
        // 跨盘：先复制，复制成功再删旧的
        cpSync(from, to, { recursive: true, errorOnExist: true, force: false })
        rmSync(from, { recursive: true, force: true })
      }
      if (statSync(to).isDirectory()) moved += 1
    }
  } else {
    mkdirSync(next, { recursive: true })
  }

  await updateSettings({ dataDir: next === defaultDir ? '' : next })
  return { dir: next, moved, needsRestart: next !== current }
}

export function relaunchApp(): void {
  app.relaunch()
  // app.exit 不触发 before-quit，先手动撤托盘图标，否则重启后右下角多一个残影
  destroyTray()
  app.exit(0)
}
