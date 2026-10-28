/**
 * 网站经验（参照 Arthur electron/browser.js 的 web_note）
 *
 * AI 在某个网站摸索成功后（按钮在哪、先开哪页、要避开什么）记一句经验，
 * 下次用内置浏览器打开同一个网站时自动带给它。
 * 一个网站一个 Markdown 文件：<配置目录>/web-notes/<域名>.md，每条一行。
 * 带密码、密钥的经验不保存。
 */

import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getConfigDir } from './config-paths'

const MAX_NOTE_CHARS = 300
const MAX_NOTES_SHOWN = 30

const notesDir = (): string => join(getConfigDir(), 'web-notes')

export function hostOf(url: string): string {
  try {
    const u = new URL(/^[a-z][\w+.-]*:/i.test(url) ? url : `https://${url}`)
    if (!/^https?:$/.test(u.protocol)) return ''
    return u.hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return ''
  }
}

const fileOf = (host: string): string => join(notesDir(), `${host.replace(/[^\w.-]/g, '_')}.md`)

/** 看起来像密码、密钥、令牌的不存 */
export function looksSecret(text: string): boolean {
  return /(password|passwd|pwd|密码|口令|api[_ -]?key|secret|token|验证码|cookie)\s*[:：=是为]\s*\S{3,}/i.test(text)
    || /\b(sk|pk|ghp|gho|xox[bap])[-_][A-Za-z0-9]{12,}/.test(text)
    || /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/.test(text)
}

export function readWebNotes(host: string): string {
  if (!host) return ''
  const f = fileOf(host)
  if (!existsSync(f)) return ''
  const lines = readFileSync(f, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean)
  return lines.slice(-MAX_NOTES_SHOWN).join('\n')
}

/** 返回 null 表示保存了；否则是没保存的原因 */
export function addWebNote(site: string, note: string, now = new Date()): { host: string } | { error: string } {
  const host = hostOf(site)
  if (!host) return { error: '不知道是哪个网站，请传 site（域名或网址）' }
  const text = note.replace(/\s*\n\s*/g, ' ').trim().slice(0, MAX_NOTE_CHARS)
  if (!text) return { error: '经验是空的' }
  if (looksSecret(text)) return { error: '这条经验里看着带了密码或密钥，没有保存。去掉密码再记（登录状态浏览器会自己保存）。' }
  mkdirSync(notesDir(), { recursive: true })
  appendFileSync(fileOf(host), `- ${text}（${now.getMonth() + 1}-${now.getDate()}）\n`, 'utf8')
  return { host }
}

export interface WebNoteSite { site: string; text: string }

export function listWebNotes(): WebNoteSite[] {
  try {
    return readdirSync(notesDir())
      .filter((f) => f.endsWith('.md'))
      .map((f) => ({ site: f.slice(0, -3), text: readFileSync(join(notesDir(), f), 'utf8').trim() }))
      .filter((n) => n.text)
      .sort((a, b) => a.site.localeCompare(b.site))
  } catch {
    return []
  }
}

/** 设置页编辑：text 为空就删掉这个网站的经验 */
export function saveWebNotes(site: string, text: string): void {
  const host = hostOf(site) || site.replace(/[^\w.-]/g, '_')
  if (!host) return
  const f = fileOf(host)
  const body = text.trim()
  if (!body) { rmSync(f, { force: true }); return }
  if (looksSecret(body)) throw new Error('里面看着带了密码或密钥，没有保存')
  mkdirSync(notesDir(), { recursive: true })
  writeFileSync(f, body + '\n', 'utf8')
}
