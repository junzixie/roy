/**
 * Telegram 机器人桥（参照钉钉桥 + Arthur 的 Telegram Bot）
 *
 * 用 Bot API 的长轮询（getUpdates）收消息，不需要公网地址；回复用 sendMessage。
 * 命令（/new、/list、/switch、/stop、/model、/workspace、/help）和普通消息都交给通用的
 * BridgeCommandHandler 处理，和飞书、钉钉一样。
 *
 * 安全：Token 用系统加密存（safeStorage）；可以只允许指定的 Telegram 用户 ID，
 * 不在名单里的人发消息直接拒绝。名单为空时，第一个发消息的人自动成为主人（之后只认他）。
 * 网络：跟随「设置 → 代理」（国内一般要代理才能连 api.telegram.org）。
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { safeStorage } from 'electron'
import { BridgeCommandHandler } from './bridge-command-handler'
import { createJsonBridgeChatBindingStore } from './bridge-binding-store'
import { redactSensitiveLogText } from './bridge-log-redaction'
import { getConfigDir } from './config-paths'
import { getFetchFn } from './proxy-fetch'
import { getEffectiveProxyUrl } from './proxy-settings-service'

export interface TelegramConfig {
  enabled: boolean
  /** 加密后的 Bot Token（base64）；明文不落盘 */
  tokenEncrypted?: string
  /** 只认这些用户 ID（空 = 第一个发消息的人自动成为主人） */
  allowedUserIds: number[]
  defaultWorkspaceId?: string
}

export interface TelegramStatus {
  status: 'disconnected' | 'connecting' | 'connected' | 'error'
  botName?: string
  errorMessage?: string
  connectedAt?: number
}

/** 设置页看到的配置：不带 Token 本身 */
export interface TelegramPublicConfig {
  enabled: boolean
  hasToken: boolean
  allowedUserIds: number[]
}

const configPath = (): string => join(getConfigDir(), 'telegram.json')
const TG_MAX = 4000

export function getTelegramConfig(): TelegramConfig {
  try {
    if (existsSync(configPath())) {
      const raw = JSON.parse(readFileSync(configPath(), 'utf8')) as Partial<TelegramConfig>
      return {
        enabled: raw.enabled === true,
        tokenEncrypted: typeof raw.tokenEncrypted === 'string' ? raw.tokenEncrypted : undefined,
        allowedUserIds: Array.isArray(raw.allowedUserIds) ? raw.allowedUserIds.filter((n) => Number.isInteger(n)) : [],
        defaultWorkspaceId: typeof raw.defaultWorkspaceId === 'string' ? raw.defaultWorkspaceId : undefined,
      }
    }
  } catch { /* 坏文件按默认 */ }
  return { enabled: false, allowedUserIds: [] }
}

function writeTelegramConfig(config: TelegramConfig): void {
  writeFileSync(configPath(), JSON.stringify(config, null, 2), 'utf8')
}

export function getTelegramPublicConfig(): TelegramPublicConfig {
  const c = getTelegramConfig()
  return { enabled: c.enabled, hasToken: !!c.tokenEncrypted, allowedUserIds: c.allowedUserIds }
}

function encryptToken(token: string): string {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('这台电脑上的系统加密不可用，不能安全保存 Token')
  return safeStorage.encryptString(token).toString('base64')
}

function decryptToken(config: TelegramConfig): string {
  if (!config.tokenEncrypted) return ''
  try { return safeStorage.decryptString(Buffer.from(config.tokenEncrypted, 'base64')) } catch { return '' }
}

/** token 传 undefined 表示不改；传空字符串表示清掉 */
export function saveTelegramConfig(patch: { enabled?: boolean; token?: string; allowedUserIds?: number[] }): TelegramPublicConfig {
  const c = getTelegramConfig()
  if (patch.token !== undefined) {
    const t = patch.token.trim()
    if (t && !/^\d{5,}:[\w-]{30,}$/.test(t)) throw new Error('Token 格式不对，应该像 123456789:AAH...（找 @BotFather 要）')
    c.tokenEncrypted = t ? encryptToken(t) : undefined
  }
  if (patch.enabled !== undefined) c.enabled = patch.enabled
  if (patch.allowedUserIds) c.allowedUserIds = [...new Set(patch.allowedUserIds.filter((n) => Number.isInteger(n) && n > 0))]
  writeTelegramConfig(c)
  return getTelegramPublicConfig()
}

/** 按 Telegram 4096 字上限分段，优先在换行处断 */
export function splitTelegramText(text: string, max = TG_MAX): string[] {
  const out: string[] = []
  let rest = text.trim()
  while (rest.length > max) {
    let cut = rest.lastIndexOf('\n', max)
    if (cut < max * 0.5) cut = max
    out.push(rest.slice(0, cut))
    rest = rest.slice(cut).replace(/^\n+/, '')
  }
  if (rest) out.push(rest)
  return out
}

interface TgUpdate {
  update_id: number
  message?: { chat: { id: number; type: string }; from?: { id: number; username?: string; first_name?: string }; text?: string; caption?: string }
}

class TelegramBridge {
  private status: TelegramStatus = { status: 'disconnected' }
  private running = false
  private abort: AbortController | null = null
  private offset = 0
  private token = ''
  private fetchFn: typeof globalThis.fetch = fetch
  private queue: Promise<void> = Promise.resolve()
  private handler: BridgeCommandHandler

  constructor() {
    this.handler = new BridgeCommandHandler({
      platformName: 'Telegram',
      adapter: {
        sendText: async (chatId: string, text: string) => {
          for (const part of splitTelegramText(text)) {
            await this.call('sendMessage', { chat_id: Number(chatId), text: part }).catch((e: unknown) => {
              console.warn('[Telegram Bridge] 发送失败:', redactSensitiveLogText(e instanceof Error ? e.message : String(e)))
            })
          }
        },
      },
      getDefaultWorkspaceId: () => getTelegramConfig().defaultWorkspaceId,
      bindingStore: createJsonBridgeChatBindingStore(join(getConfigDir(), 'telegram-bindings.json'), 'Telegram Bridge'),
      onWorkspaceSwitched: (workspaceId) => {
        const c = getTelegramConfig()
        writeTelegramConfig({ ...c, defaultWorkspaceId: workspaceId })
      },
    })
  }

  private async send(chatId: string, text: string): Promise<void> {
    await this.call('sendMessage', { chat_id: Number(chatId), text }).catch(() => undefined)
  }

  getStatus(): TelegramStatus {
    return { ...this.status }
  }

  private async call<T = unknown>(method: string, body: Record<string, unknown>, signal?: AbortSignal, token = this.token): Promise<T> {
    const res = await this.fetchFn(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: signal ?? AbortSignal.timeout(20_000),
    })
    const data = await res.json() as { ok: boolean; result?: T; description?: string }
    if (!data.ok) throw new Error(data.description || `HTTP ${res.status}`)
    return data.result as T
  }

  /** 用 getMe 验证 Token，返回机器人用户名 */
  async test(token?: string): Promise<{ ok: boolean; botName?: string; message?: string }> {
    const t = token?.trim() || decryptToken(getTelegramConfig())
    if (!t) return { ok: false, message: '还没填 Token' }
    this.fetchFn = getFetchFn(await getEffectiveProxyUrl())
    try {
      const me = await this.call<{ username: string }>('getMe', {}, AbortSignal.timeout(15_000), t)
      return { ok: true, botName: `@${me.username}` }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { ok: false, message: /fetch failed|timeout|ECONN|ETIMEDOUT|aborted/i.test(msg) ? `连不上 Telegram（${redactSensitiveLogText(msg)}）。国内一般要在「设置 → 代理」里配好代理` : redactSensitiveLogText(msg) }
    }
  }

  async start(): Promise<void> {
    this.stop()
    const config = getTelegramConfig()
    this.token = decryptToken(config)
    if (!this.token) throw new Error('还没填 Telegram Bot Token')
    this.status = { status: 'connecting' }
    this.fetchFn = getFetchFn(await getEffectiveProxyUrl())
    try {
      const me = await this.call<{ username: string }>('getMe', {})
      // 长轮询和 webhook 不能同时用；清掉可能残留的 webhook
      await this.call('deleteWebhook', { drop_pending_updates: false }).catch(() => undefined)
      await this.call('setMyCommands', {
        commands: [
          { command: 'new', description: '开一个新会话' },
          { command: 'list', description: '看最近的会话' },
          { command: 'switch', description: '切换会话' },
          { command: 'stop', description: '停止当前任务' },
          { command: 'model', description: '换模型' },
          { command: 'workspace', description: '换项目' },
          { command: 'help', description: '帮助' },
        ],
      }).catch(() => undefined)
      this.status = { status: 'connected', botName: `@${me.username}`, connectedAt: Date.now() }
    } catch (e) {
      const msg = redactSensitiveLogText(e instanceof Error ? e.message : String(e))
      this.status = { status: 'error', errorMessage: msg }
      throw new Error(msg)
    }
    this.handler.subscribe()
    this.running = true
    void this.loop()
    console.log(`[Telegram Bridge] 已连接 ${this.status.botName}`)
  }

  stop(): void {
    this.running = false
    this.abort?.abort()
    this.abort = null
    this.handler.unsubscribe()
    if (this.status.status !== 'error') this.status = { status: 'disconnected' }
  }

  private async loop(): Promise<void> {
    let failures = 0
    while (this.running) {
      this.abort = new AbortController()
      const timer = setTimeout(() => this.abort?.abort(), 40_000)
      try {
        const updates = await this.call<TgUpdate[]>('getUpdates', { offset: this.offset, timeout: 30, allowed_updates: ['message'] }, this.abort.signal)
        failures = 0
        if (this.status.status !== 'connected') this.status = { ...this.status, status: 'connected', errorMessage: undefined }
        for (const u of updates) {
          this.offset = u.update_id + 1
          this.queue = this.queue.then(() => this.onUpdate(u)).catch((e: unknown) => console.error('[Telegram Bridge] 处理消息失败:', redactSensitiveLogText(String(e))))
        }
      } catch (e) {
        if (!this.running) break
        failures++
        const msg = redactSensitiveLogText(e instanceof Error ? e.message : String(e))
        if (/Unauthorized|401/.test(msg)) {
          this.status = { status: 'error', errorMessage: 'Token 无效或已被重置' }
          this.running = false
          break
        }
        if (failures >= 3) this.status = { ...this.status, status: 'error', errorMessage: msg }
        await new Promise((r) => setTimeout(r, Math.min(30_000, 2000 * failures)))
      } finally {
        clearTimeout(timer)
      }
    }
  }

  private async onUpdate(u: TgUpdate): Promise<void> {
    const m = u.message
    if (!m || !m.from) return
    const text = (m.text ?? m.caption ?? '').trim()
    if (!text) return
    const chatId = String(m.chat.id)
    // 只认私聊（群里谁都能发，风险大）
    if (m.chat.type !== 'private') {
      await this.send(chatId, 'Roy 只在私聊里干活，请直接私聊机器人。')
      return
    }
    const config = getTelegramConfig()
    if (config.allowedUserIds.length === 0) {
      // 第一个发消息的人自动成为主人
      writeTelegramConfig({ ...config, allowedUserIds: [m.from.id] })
      await this.send(chatId, `已把你（ID ${m.from.id}）设为这台电脑上 Roy 的主人，之后只有你能用。可以在 Roy「设置 → Telegram」里改。`)
    } else if (!config.allowedUserIds.includes(m.from.id)) {
      await this.send(chatId, `你没有权限使用这个 Roy（你的 ID 是 ${m.from.id}，可以让主人加到允许名单里）。`)
      return
    }
    // 去掉 /cmd@BotName 里的 @BotName
    const normalized = text.replace(/^(\/\w+)@\w+/, '$1')
    await this.handler.handleIncomingMessage(chatId, normalized, { telegramUserId: m.from.id })
  }

  removeBindingsForDeletedWorkspace(workspaceId: string, sessionIds: Iterable<string>): number {
    return this.handler.removeBindingsForDeletedWorkspace(workspaceId, sessionIds)
  }
}

export const telegramBridge = new TelegramBridge()
