/**
 * 文件检查点（参考 Arthur electron/checkpoints.js；改成存到硬盘，关掉也能恢复）
 *
 * AI 每次写文件/改文件之前，先把原文件备份一份；原来不存在就记一条「新建」。
 * 用户撤回到某条消息时，把这之后的关键文件恢复成改之前的样子。
 *
 * 编号：<配置目录>/checkpoints/<会话 ID>/index.jsonl + blobs/
 * 策略：单文件默认上限 10 MB；会话总备份上限 500 MB；路径条数上限 20000；
 * 保留 14 天；符号链接跳过（避免撤到链接目标外）。超限写入 skipReason。
 *
 * 对照 Feibo checkpoint.ts：容量/保留/不可撤销理由；本模块保持 API 兼容。
 */

import { appendFileSync, copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { getConfigDir } from './config-paths'

/** 单文件备份上限（字节） */
export const CHECKPOINT_MAX_FILE_BYTES = 10 * 1024 * 1024
/** 单会话 blobs 总容量上限（字节）——对齐 Feibo MAX_TOTAL 量级 */
export const CHECKPOINT_MAX_TOTAL_BYTES = 500 * 1024 * 1024
/** 单会话检查点路径条数上限 */
export const CHECKPOINT_MAX_PATHS = 20_000
/** 过期清理天数 */
export const CHECKPOINT_KEEP_DAYS = 14

/** @deprecated 使用 CHECKPOINT_MAX_FILE_BYTES */
const MAX_FILE_BYTES = CHECKPOINT_MAX_FILE_BYTES
/** @deprecated 使用 CHECKPOINT_KEEP_DAYS */
const KEEP_DAYS = CHECKPOINT_KEEP_DAYS

export interface CheckpointRecord {
  /** 备份时间（毫秒） */
  at: number
  /** 改动的文件（绝对路径） */
  file: string
  /** 改之前文件是否存在 */
  existed: boolean
  /** 备份文件名（existed 为 false 时为空） */
  blob?: string
  /** 文件太大/超总容量/符号链接等没有备份 */
  skipped?: boolean
  /** 跳过原因（用户/日志可读） */
  skipReason?: string
}

const root = (): string => join(getConfigDir(), 'checkpoints')
const safeId = (id: string): string => id.replace(/[^A-Za-z0-9_-]/g, '_')
const sessionDir = (sessionId: string): string => join(root(), safeId(sessionId))

/** 同一会话、同一个文件，同一分钟内只备份第一次（同一工具链的多次写只留最初版） */
const recent = new Map<string, number>()

export function readCheckpoints(sessionId: string): CheckpointRecord[] {
  const f = join(sessionDir(sessionId), 'index.jsonl')
  if (!existsSync(f)) return []
  const out: CheckpointRecord[] = []
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    if (!line.trim()) continue
    try { out.push(JSON.parse(line) as CheckpointRecord) } catch { /* ignore */ }
  }
  return out
}

function writeCheckpoints(sessionId: string, list: CheckpointRecord[]): void {
  const dir = sessionDir(sessionId)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'index.jsonl'), list.map((r) => JSON.stringify(r)).join('\n') + (list.length ? '\n' : ''), 'utf8')
}

function sessionBlobBytes(sessionId: string): number {
  const dir = join(sessionDir(sessionId), 'blobs')
  if (!existsSync(dir)) return 0
  let total = 0
  try {
    for (const name of readdirSync(dir)) {
      try { total += statSync(join(dir, name)).size } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
  return total
}

/** 写工具执行前调用；args 里取 path / file_path */
export function snapshotBeforeWrite(sessionId: string, cwd: string, args: Record<string, unknown> | undefined, now = Date.now()): void {
  try {
    const rel = typeof args?.path === 'string' ? args.path : typeof args?.file_path === 'string' ? args.file_path : ''
    if (!rel || !sessionId) return
    const file = isAbsolute(rel) ? resolve(rel) : resolve(cwd, rel)
    const key = `${sessionId}\n${file.toLowerCase()}`
    const last = recent.get(key)
    if (last != null && now - last < 60_000) return
    recent.set(key, now)

    const dir = sessionDir(sessionId)
    mkdirSync(join(dir, 'blobs'), { recursive: true })
    const existing = readCheckpoints(sessionId)
    if (existing.length >= CHECKPOINT_MAX_PATHS) {
      appendFileSync(join(dir, 'index.jsonl'), JSON.stringify({
        at: now, file, existed: existsSync(file), skipped: true, skipReason: 'path_limit',
      } satisfies CheckpointRecord) + '\n', 'utf8')
      return
    }

    const existed = existsSync(file)
    const rec: CheckpointRecord = { at: now, file, existed }
    if (existed) {
      let st
      try { st = lstatSync(file) } catch {
        rec.skipped = true
        rec.skipReason = 'stat_failed'
        appendFileSync(join(dir, 'index.jsonl'), JSON.stringify(rec) + '\n', 'utf8')
        return
      }
      if (st.isSymbolicLink()) {
        rec.skipped = true
        rec.skipReason = 'symlink'
      } else if (st.size > MAX_FILE_BYTES) {
        rec.skipped = true
        rec.skipReason = 'file_too_large'
      } else if (sessionBlobBytes(sessionId) + st.size > CHECKPOINT_MAX_TOTAL_BYTES) {
        rec.skipped = true
        rec.skipReason = 'session_total_limit'
      } else {
        rec.blob = `${now}-${Math.random().toString(36).slice(2, 8)}`
        copyFileSync(file, join(dir, 'blobs', rec.blob))
      }
    }
    appendFileSync(join(dir, 'index.jsonl'), JSON.stringify(rec) + '\n', 'utf8')
  } catch (error) {
    console.error('[文件检查点] 备份失败:', error)
  }
}

/** cutAt 之后的关键文件（每个文件取最早那份备份） */
export function checkpointsAfter(sessionId: string, cutAt: number): CheckpointRecord[] {
  const seen = new Set<string>()
  const out: CheckpointRecord[] = []
  for (const r of readCheckpoints(sessionId).filter((x) => x.at > cutAt).sort((a, b) => a.at - b.at)) {
    const k = r.file.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(r)
  }
  return out
}

export interface RestoreResult { restored: string[]; failed: string[]; skipped: string[] }

/** 把 cutAt 之后的关键文件恢复成改之前的样子，并删除那些检查点 */
export function restoreCheckpoints(sessionId: string, cutAt: number): RestoreResult {
  const result: RestoreResult = { restored: [], failed: [], skipped: [] }
  const dir = sessionDir(sessionId)
  for (const r of checkpointsAfter(sessionId, cutAt)) {
    try {
      if (r.skipped) { result.skipped.push(r.file); continue }
      if (r.existed && r.blob) {
        mkdirSync(dirname(r.file), { recursive: true })
        copyFileSync(join(dir, 'blobs', r.blob), r.file)
      } else if (!r.existed) {
        rmSync(r.file, { force: true })
      }
      result.restored.push(r.file)
    } catch {
      result.failed.push(r.file)
    }
  }
  dropCheckpointsAfter(sessionId, cutAt)
  for (const k of [...recent.keys()]) if (k.startsWith(`${sessionId}\n`)) recent.delete(k)
  return result
}

/** 对话只截断、不恢复文件时，也要丢掉之后的检查点，免得下次恢复把中间态混进去 */
export function dropCheckpointsAfter(sessionId: string, cutAt: number): void {
  const all = readCheckpoints(sessionId)
  if (!all.length) return
  const keep = all.filter((x) => x.at <= cutAt)
  const dir = sessionDir(sessionId)
  for (const r of all) if (r.at > cutAt && r.blob) rmSync(join(dir, 'blobs', r.blob), { force: true })
  writeCheckpoints(sessionId, keep)
}

export function deleteSessionCheckpoints(sessionId: string): void {
  rmSync(sessionDir(sessionId), { recursive: true, force: true })
}

export function cleanupOldCheckpoints(now = Date.now()): void {
  const cut = now - KEEP_DAYS * 864e5
  try {
    for (const name of readdirSync(root())) {
      const dir = join(root(), name)
      const list = readCheckpoints(name)
      const newest = list.reduce((m, r) => Math.max(m, r.at), 0)
      if (!list.length || newest < cut) rmSync(dir, { recursive: true, force: true })
    }
  } catch { /* 没有目录 */ }
}