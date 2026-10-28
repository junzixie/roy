/**
 * CLI inbox：Roy 未开时把任务落盘，并尝试拉起 App（对照 Arthur handOff）。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, renameSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { spawn } from 'node:child_process'
import type { PathOpts } from './paths'
import { resolveConfigDir } from './paths'

export interface InboxJob {
  id: string
  at: number
  op: string
  body: Record<string, unknown>
}

function uid(): string {
  return `j${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

export function getInboxDir(opts: PathOpts = {}): string {
  return join(resolveConfigDir(opts), 'cli-inbox')
}

export function getBridgeInfoPath(opts: PathOpts = {}): string {
  return join(resolveConfigDir(opts), 'cli-bridge.json')
}

export function readBridgeInfo(opts: PathOpts = {}): { port: number; token: string; pid?: number } | null {
  const file = getBridgeInfoPath(opts)
  if (!existsSync(file)) return null
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as { port: number; token: string; pid?: number }
  } catch {
    return null
  }
}

export function isBridgeAlive(opts: PathOpts = {}): boolean {
  const info = readBridgeInfo(opts)
  if (!info?.pid) return !!info
  try {
    process.kill(info.pid, 0)
    return true
  } catch {
    return false
  }
}

/** 猜测已安装 / 开发态 Roy 可执行文件 */
export function resolveRoyAppExecutable(): string | null {
  const envPath = process.env.ROY_APP || process.env.ROY_ELECTRON
  if (envPath && existsSync(envPath)) return envPath

  const execPath = process.execPath
  const base = dirname(execPath)
  // resources/bin/roy.exe → ../../Roy.exe
  const candidates = [
    join(base, '..', '..', 'Roy.exe'),
    join(base, '..', '..', 'roy.exe'),
    join(base, '..', 'Roy.exe'),
    join(homedir(), 'AppData', 'Local', 'Programs', 'Roy', 'Roy.exe'),
    join(homedir(), 'AppData', 'Local', 'roy', 'Roy.exe'),
  ]
  for (const c of candidates) {
    if (existsSync(c)) return c
  }
  return null
}

export function launchRoyApp(): { launched: boolean; path: string | null; error?: string } {
  const appPath = resolveRoyAppExecutable()
  if (!appPath) {
    return {
      launched: false,
      path: null,
      error: '找不到 Roy.exe。请先打开一次 Roy，或设置环境变量 ROY_APP 指向 Roy 可执行文件。',
    }
  }
  try {
    spawn(appPath, [], { detached: true, stdio: 'ignore', windowsHide: false }).unref()
    return { launched: true, path: appPath }
  } catch (error) {
    return {
      launched: false,
      path: appPath,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export function enqueueInbox(op: string, body: Record<string, unknown>, opts: PathOpts = {}): InboxJob {
  const dir = getInboxDir(opts)
  mkdirSync(dir, { recursive: true })
  const job: InboxJob = { id: uid(), at: Date.now(), op, body }
  writeFileSync(join(dir, `${job.id}.json`), JSON.stringify(job), 'utf8')
  return job
}

export async function waitForBridge(
  opts: PathOpts = {},
  timeoutMs = 60_000,
): Promise<{ port: number; token: string; pid?: number }> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const info = readBridgeInfo(opts)
    if (info && isBridgeAlive(opts)) return info
    await new Promise((r) => setTimeout(r, 400))
  }
  throw new Error('等了很久 Roy 还是没起来，请手动打开 Roy 后再试')
}

/** 列出待处理 inbox（主进程用同目录） */
export function listInboxJobs(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter((f) => f.endsWith('.json') && !f.endsWith('.doing.json'))
}

export function claimInboxFile(dir: string, name: string): string | null {
  const src = join(dir, name)
  const dst = join(dir, name.replace(/\.json$/i, '.doing.json'))
  try {
    renameSync(src, dst)
    return dst
  } catch {
    return null
  }
}
