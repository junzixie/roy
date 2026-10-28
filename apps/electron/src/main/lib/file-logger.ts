/**
 * 主进程日志落盘。
 *
 * Windows 打包版没有控制台，console 输出原本全部丢失，用户报问题时拿不到任何线索。
 * 这里把 console.log/info/warn/error 同时追加写到 <logs>/main.log：
 * - 超过 MAX_BYTES 时轮转为 main.old.log（只保留一份旧文件）
 * - 写入前经过 redactSensitiveLogText 脱敏，避免把 token / API Key 写进文件
 * - 同步追加（量小，且保证崩溃前最后几行也落盘）；写失败只放弃落盘，不影响原 console
 */
import { appendFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { format } from 'node:util'
import { redactSensitiveLogText } from './bridge-log-redaction'

export const MAX_LOG_BYTES = 5 * 1024 * 1024
const LEVELS = ['log', 'info', 'warn', 'error'] as const
type Level = typeof LEVELS[number]

let installedDir: string | null = null

export function formatLogLine(level: Level, args: unknown[], now = new Date()): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, '0')
  const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${pad(now.getMilliseconds(), 3)}`
  return `[${ts}] [${level.toUpperCase()}] ${redactSensitiveLogText(format(...args))}\n`
}

/** 追加一行；文件超限时先轮转。导出给测试用。 */
export function appendLogLine(dir: string, line: string, maxBytes = MAX_LOG_BYTES): void {
  const file = join(dir, 'main.log')
  try {
    if (existsSync(file) && statSync(file).size + line.length > maxBytes) {
      const old = join(dir, 'main.old.log')
      try { rmSync(old, { force: true }) } catch { /* ignore */ }
      renameSync(file, old)
    }
    appendFileSync(file, line)
  } catch { /* 落盘失败不影响程序 */ }
}

/** 安装一次；返回日志目录。重复调用无副作用。 */
export function installFileLogger(dir: string): string {
  if (installedDir) return installedDir
  try { mkdirSync(dir, { recursive: true }) } catch { return dir }
  installedDir = dir
  for (const level of LEVELS) {
    const original = console[level].bind(console)
    console[level] = (...args: unknown[]) => {
      original(...args)
      appendLogLine(dir, formatLogLine(level, args))
    }
  }
  appendLogLine(dir, `\n===== Roy 启动 pid=${process.pid} ${new Date().toISOString()} =====\n`)
  process.on('uncaughtException', (err) => appendLogLine(dir, formatLogLine('error', ['[uncaughtException]', err])))
  process.on('unhandledRejection', (reason) => appendLogLine(dir, formatLogLine('error', ['[unhandledRejection]', reason])))
  return dir
}

export function getLogDir(): string | null {
  return installedDir
}
