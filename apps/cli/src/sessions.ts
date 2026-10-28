import { existsSync, readFileSync, statSync } from 'node:fs'
import { getSessionMessagesPath, getSessionsIndexPath, type PathOpts } from './paths'

export interface SessionMeta {
  id: string
  title?: string
  updatedAt?: number
  workspaceId?: string
  modelId?: string
  archived?: boolean
  [key: string]: unknown
}

export function readSessionIndex(opts: PathOpts = {}): SessionMeta[] {
  const indexPath = getSessionsIndexPath(opts)
  if (!existsSync(indexPath)) return []
  try {
    const data = JSON.parse(readFileSync(indexPath, 'utf-8')) as { sessions?: SessionMeta[] }
    return Array.isArray(data?.sessions) ? data.sessions : []
  } catch {
    return []
  }
}

export function listSessions(opts: PathOpts = {}): SessionMeta[] {
  return readSessionIndex(opts).sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
}

export function getSessionMeta(id: string, opts: PathOpts = {}): SessionMeta | undefined {
  return readSessionIndex(opts).find((s) => s.id === id)
}

export function resolveSession(
  target: string,
  opts: PathOpts = {},
): { id: string; filePath: string; meta?: SessionMeta; bytes: number } | undefined {
  if (target.endsWith('.jsonl') && existsSync(target)) {
    const id = target.replace(/\.jsonl$/, '').split(/[\\/]/).pop() ?? target
    return { id, filePath: target, meta: getSessionMeta(id, opts), bytes: safeBytes(target) }
  }
  const filePath = getSessionMessagesPath(target, opts)
  if (!existsSync(filePath)) return undefined
  return { id: target, filePath, meta: getSessionMeta(target, opts), bytes: safeBytes(filePath) }
}

function safeBytes(path: string): number {
  try {
    return statSync(path).size
  } catch {
    return 0
  }
}
