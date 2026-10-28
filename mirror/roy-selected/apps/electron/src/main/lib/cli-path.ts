/**
 * Roy CLI 用户 PATH 接入（对照 Arthur cliPathStatus / cliPathSet）
 *
 * - 只改当前用户 PATH，无需管理员
 * - PATH 条目是包含 roy.exe / roy 的 bin 目录（不是 exe 本身）
 * - 非 Windows 返回 supported:false（本轮不写 mac/linux PATH）
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { execFileAsync } from './async-command'

export interface CliPathStatus {
  /** bin 目录绝对路径（应加入 PATH 的那一项） */
  bin: string
  /** bin 内是否已有 roy 可执行文件 */
  binaryExists: boolean
  /** 用户 PATH 是否已包含该 bin */
  inPath: boolean
  /** 当前平台是否支持一键改 PATH */
  supported: boolean
}

function psQuote(value: string): string {
  return `'${String(value).replace(/'/g, "''")}'`
}

function normalizePathEntry(value: string): string {
  return value.trim().replace(/[\\/]+$/, '').toLowerCase()
}

/**
 * 解析 Roy CLI 的 bin 目录。
 * 打包：process.resourcesPath/bin
 * 开发：apps/electron/resources/bin（相对 main 编译产物上溯）
 */
export function getCliBinDir(): string {
  const { app } = require('electron') as { app: { isPackaged: boolean } }
  if (app.isPackaged) {
    return join(process.resourcesPath, 'bin')
  }
  // __dirname ≈ apps/electron/dist/... → 上溯到 apps/electron/resources/bin
  return join(__dirname, '..', 'resources', 'bin')
}

export function getCliBinaryName(): string {
  return process.platform === 'win32' ? 'roy.exe' : 'roy'
}

async function readUserPath(): Promise<string> {
  const { stdout } = await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', "[Environment]::GetEnvironmentVariable('Path','User')"],
    { timeout: 15_000 },
  )
  return String(stdout ?? '').trim()
}

export async function cliPathStatus(): Promise<CliPathStatus> {
  const bin = getCliBinDir()
  const binaryExists = existsSync(join(bin, getCliBinaryName()))
  if (process.platform !== 'win32') {
    return { bin, binaryExists, inPath: false, supported: false }
  }
  try {
    const user = await readUserPath()
    const inPath = user
      .split(';')
      .some((entry) => entry && normalizePathEntry(entry) === normalizePathEntry(bin))
    return { bin, binaryExists, inPath, supported: true }
  } catch {
    return { bin, binaryExists, inPath: false, supported: true }
  }
}

/**
 * 打开或关闭：把 Roy bin 目录写入 / 移出「当前用户」PATH。
 */
export async function cliPathSet(on: boolean): Promise<CliPathStatus> {
  if (process.platform !== 'win32') {
    return cliPathStatus()
  }
  const bin = getCliBinDir()
  const script =
    `$b=${psQuote(bin)}; $p=[Environment]::GetEnvironmentVariable('Path','User'); if(-not $p){$p=''}; ` +
    `$l=@($p -split ';' | Where-Object { $_ -and ($_.TrimEnd('\\') -ne $b.TrimEnd('\\')) }); ` +
    (on ? '$l += $b; ' : '') +
    `[Environment]::SetEnvironmentVariable('Path', ($l -join ';'), 'User')`
  await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    { timeout: 20_000 },
  )
  return cliPathStatus()
}
