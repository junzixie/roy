/** Durable context ledger for compaction diagnostics and resumable handoffs. */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ContextLedgerEntry } from '@roy/shared'
import { getConfigDir } from './config-paths'

export type { ContextLedgerEntry }

const safeId = (id: string): string => id.replace(/[^A-Za-z0-9_-]/g, '_')
const ledgerFile = (sessionId: string): string => join(getConfigDir(), 'context-ledger', safeId(sessionId) + '.jsonl')

export function appendContextLedger(entry: ContextLedgerEntry): void {
  try {
    const file = ledgerFile(entry.sessionId)
    mkdirSync(join(getConfigDir(), 'context-ledger'), { recursive: true })
    appendFileSync(file, JSON.stringify(entry) + '\n', 'utf8')
  } catch (error) {
    console.warn('[context-ledger] write failed:', error)
  }
}

export function readContextLedger(sessionId: string): ContextLedgerEntry[] {
  const file = ledgerFile(sessionId)
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf8').split('\n').flatMap((line) => {
    if (!line.trim()) return []
    try {
      const value = JSON.parse(line) as ContextLedgerEntry
      return value && value.sessionId === sessionId ? [value] : []
    } catch { return [] }
  })
}

export function latestContextLedgerEntry(sessionId: string): ContextLedgerEntry | undefined {
  return readContextLedger(sessionId).at(-1)
}
