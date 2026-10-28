/**
 * 存量会话图片外置迁移脚本。
 *
 * 背景：历史 jsonl 把 base64 图片直接写进行内，实测 398MB 会话里 353MB（89%）
 * 是 base64 图片，单条 tool_result 文本 27 字符却有 2.17MB。这导致每次点开会话
 * 都要读/解析/序列化几十 MB。
 *
 * 本脚本把每个 jsonl 里的内联图片抽到 {sid}/media/ 目录，行内只留
 * `{type:'image', mimeType, media:'<hash>.<ext>'}`，与原实现读取时回填的引用格式一致。
 *
 * 用法：
 *   bun run scripts/migrate-session-images.ts --dry-run     # 只看收益，不写盘
 *   bun run scripts/migrate-session-images.ts               # 实际执行（会先备份）
 */

import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const MIME_EXT_MAP: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
  'image/svg+xml': 'svg',
}

/** 小于该体积保持内联，避免碎片文件得不偿失。 */
const INLINE_IMAGE_MAX_BASE64 = 32 * 1024

interface Stats {
  files: number
  changedFiles: number
  images: number
  bytesBefore: number
  bytesAfter: number
}

function configDir(): string {
  const home = process.env.USERPROFILE ?? process.env.HOME ?? ''
  return join(home, '.roy')
}

function extractImages(
  sessionId: string,
  mediaDir: string,
  value: unknown,
  stats: Stats,
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => extractImages(sessionId, mediaDir, item, stats))
  }
  if (!value || typeof value !== 'object') return value

  const record = value as Record<string, unknown>
  if (record.type === 'image' && typeof record.data === 'string') {
    const data = record.data
    if (data.length > INLINE_IMAGE_MAX_BASE64) {
      const mimeType = typeof record.mimeType === 'string' ? record.mimeType : 'image/png'
      const ext = MIME_EXT_MAP[mimeType] ?? 'bin'
      const hash = createHash('sha1').update(data).digest('hex')
      const filename = `${hash}.${ext}`
      const target = join(mediaDir, filename)
      if (!existsSync(target)) {
        mkdirSync(mediaDir, { recursive: true })
        writeFileSync(target, Buffer.from(data, 'base64'))
      }
      stats.images += 1
      return { type: 'image', mimeType, media: filename }
    }
  }

  const next: Record<string, unknown> = {}
  let changed = false
  for (const [key, item] of Object.entries(record)) {
    const replaced = extractImages(sessionId, mediaDir, item, stats)
    if (replaced !== item) changed = true
    next[key] = replaced
  }
  return changed ? next : value
}

function main(): void {
  const dryRun = process.argv.includes('--dry-run')
  const sessionsDir = join(configDir(), 'agent-sessions')
  if (!existsSync(sessionsDir)) {
    console.error(`找不到会话目录: ${sessionsDir}`)
    process.exit(1)
  }

  const stats: Stats = { files: 0, changedFiles: 0, images: 0, bytesBefore: 0, bytesAfter: 0 }
  const files = readdirSync(sessionsDir).filter((name) => name.endsWith('.jsonl'))

  for (const name of files) {
    const sessionId = name.slice(0, -'.jsonl'.length)
    const filePath = join(sessionsDir, name)
    const before = statSync(filePath).size
    stats.files += 1
    stats.bytesBefore += before

    let raw: string
    try {
      raw = readFileSync(filePath, 'utf-8')
    } catch (error) {
      console.warn(`跳过（读取失败）${name}:`, error)
      stats.bytesAfter += before
      continue
    }

    // 快速跳过：没有 base64 图片的文件不解析。
    if (!raw.includes('"mimeType"')) {
      stats.bytesAfter += before
      continue
    }

    const mediaDir = join(sessionsDir, 'media', sessionId)
    const lines = raw.split('\n')
    const out: string[] = []
    let touched = false
    const fileStats: Stats = { ...stats, images: 0 }

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) {
        out.push(line)
        continue
      }
      let parsed: unknown
      try {
        parsed = JSON.parse(trimmed)
      } catch {
        out.push(line)
        continue
      }
      const replaced = extractImages(sessionId, mediaDir, parsed, fileStats)
      if (replaced !== parsed) {
        touched = true
        out.push(JSON.stringify(replaced))
      } else {
        out.push(line)
      }
    }
    stats.images += fileStats.images

    if (!touched) {
      stats.bytesAfter += before
      continue
    }

    const nextRaw = out.join('\n')
    const after = Buffer.byteLength(nextRaw)
    stats.bytesAfter += after
    stats.changedFiles += 1

    console.log(
      `${name.slice(0, 8)}  ${(before / 1048576).toFixed(1)}MB → ${(after / 1048576).toFixed(1)}MB  ` +
      `(-${Math.round((1 - after / Math.max(1, before)) * 100)}%)  图片 ${fileStats.images}`,
    )

    if (!dryRun) {
      const backup = `${filePath}.bak-before-image-migration`
      if (!existsSync(backup)) copyFileSync(filePath, backup)
      writeFileSync(filePath, nextRaw, 'utf-8')
    }
  }

  const savedMb = (stats.bytesBefore - stats.bytesAfter) / 1048576
  console.log('\n===== 汇总 =====')
  console.log(`扫描文件      : ${stats.files}`)
  console.log(`改动文件      : ${stats.changedFiles}`)
  console.log(`外置图片      : ${stats.images}`)
  console.log(`迁移前        : ${(stats.bytesBefore / 1048576).toFixed(0)}MB`)
  console.log(`迁移后        : ${(stats.bytesAfter / 1048576).toFixed(0)}MB`)
  console.log(`节省          : ${savedMb.toFixed(0)}MB (${Math.round(savedMb / Math.max(1, stats.bytesBefore / 1048576) * 100)}%)`)
  if (dryRun) console.log('\n[dry-run] 未写入任何文件')
}

main()
