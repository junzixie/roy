/**
 * Roy 账号与 Pro 订阅（客户端）
 *
 * - 主地址直连服务器 IP（国内访问最快），用按 IP 签发的自签证书，客户端只信这一张，中间人无法冒充；
 *   连不上时退回 https://api.agares.cn（正规证书）
 * - 权益凭证由服务端用 Ed25519 签名，这里用内置公钥离线校验；启动时和每 6 小时联网刷新，
 *   离线时凭证在有效期内（最多 10 天）照常可用
 * - 登录令牌和凭证用系统加密（safeStorage）存在数据目录 account.bin
 *
 * Pro 功能只认 hasProFeature()，别处不要自己判断订阅状态。
 */

// 用命名空间导入：测试里的 electron 替身不一定带齐这些导出
import * as electron from 'electron'
import { request } from 'node:https'
import { createPublicKey, randomUUID, verify } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { hostname } from 'node:os'
import { join } from 'node:path'
import { SERVER_CERT } from './roy-server-cert'
import { getConfigDir } from './config-paths'

export const ACCOUNT_SERVER = 'https://api.agares.cn'
/** 备用：域名解析或 Cloudflare 出问题时直连服务器（固定证书） */
const ACCOUNT_SERVER_DIRECT = 'https://120.26.161.126:8443'


const ENTITLEMENT_PUBLIC_KEY = createPublicKey(`-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAs4Itz91Hgyhxm7HNZ8vUNvpiTJUA8LpxPQFnFCv9dvM=
-----END PUBLIC KEY-----`)

export type ProFeature = 'computer-control' | 'deepseek-mode' | 'mobile-remote-public' | 'cloud-sync' | 'unlimited-automation' | 'multi-agent' | 'long-memory'

/** 免费版的工作流 / 定时任务数量上限 */
export const FREE_AUTOMATION_LIMIT = 3

/** 免费版同一个主会话同时运行的协作子任务数（Pro 不限，最多 MAX_RUNNING_DELEGATIONS_PER_PARENT） */
export const FREE_PARALLEL_DELEGATIONS = 1

export const PRO_FEATURE_LABELS: Record<ProFeature, string> = {
  'computer-control': '电脑控制',
  'deepseek-mode': 'DeepSeek 优化模式（仅 DeepSeek 模型）',
  'mobile-remote-public': '公网手机遥控',
  'cloud-sync': '云同步',
  'unlimited-automation': '工作流和定时任务不限数量',
  'multi-agent': '多智能体并行（同时跑多个子任务）',
  'long-memory': '全局长期记忆（跨项目记住你的偏好）',
}

interface Entitlement {
  v: number
  sub: string
  email: string
  /** 2026-10 起注册时填写；老账号为 null */
  username?: string | null
  plan: 'free' | 'pro'
  features: ProFeature[]
  proExpiresAt: number | null
  deviceId: string
  iat: number
  validUntil: number
}

interface SignedEntitlement { payload: string; sig: string }
interface Stored { token: string; entitlement: SignedEntitlement }

export interface AccountView {
  signedIn: boolean
  email: string | null
  username: string | null
  plan: 'free' | 'pro'
  proExpiresAt: number | null
  features: ProFeature[]
  /** 上次成功联网刷新的时间 */
  verifiedAt: number | null
  offline: boolean
  server: string
}

const file = (): string => join(getConfigDir(), 'account.bin')
const deviceFile = (): string => join(getConfigDir(), 'device-id')

let stored: Stored | null | undefined
let current: Entitlement | null = null
let offline = false
let refreshTimer: ReturnType<typeof setInterval> | undefined

export function deviceId(): string {
  try { const id = readFileSync(deviceFile(), 'utf8').trim(); if (/^[A-Za-z0-9-]{8,64}$/.test(id)) return id } catch { /* 首次生成 */ }
  const id = randomUUID()
  mkdirSync(getConfigDir(), { recursive: true })
  writeFileSync(deviceFile(), id)
  return id
}

/** 校验签名、设备和有效期；不通过返回 null */
export function verifyEntitlement(signed: SignedEntitlement | undefined, device: string, now = Date.now()): Entitlement | null {
  if (!signed?.payload || !signed.sig) return null
  try {
    if (!verify(null, Buffer.from(signed.payload), ENTITLEMENT_PUBLIC_KEY, Buffer.from(signed.sig, 'base64url'))) return null
    const e = JSON.parse(Buffer.from(signed.payload, 'base64url').toString('utf8')) as Entitlement
    if (e.deviceId !== device || now > e.validUntil) return null
    return e
  } catch {
    return null
  }
}

function load(): Stored | null {
  if (stored !== undefined) return stored
  stored = null
  try {
    if (existsSync(file()) && electron.safeStorage?.isEncryptionAvailable()) {
      stored = JSON.parse(electron.safeStorage?.decryptString(readFileSync(file()))) as Stored
      current = verifyEntitlement(stored.entitlement, deviceId())
    }
  } catch { stored = null }
  return stored
}

function save(next: Stored | null): void {
  stored = next
  current = next ? verifyEntitlement(next.entitlement, deviceId()) : null
  mkdirSync(getConfigDir(), { recursive: true })
  if (!next) { try { writeFileSync(file(), Buffer.alloc(0)) } catch { /* ignore */ } return }
  if (!electron.safeStorage?.isEncryptionAvailable()) throw new Error('系统加密不可用，无法保存登录状态')
  writeFileSync(file(), electron.safeStorage?.encryptString(JSON.stringify(next)), { mode: 0o600 })
  notify()
}

function notify(): void {
  for (const w of (electron.BrowserWindow?.getAllWindows() ?? [])) if (!w.isDestroyed()) w.webContents.send('account:changed')
}

const NETWORK_ERROR = '连不上账号服务，请检查网络'

/** 先直连 IP，网络层失败（不是服务端返回的错误）时再走域名 */
async function call<T>(path: string, body: Record<string, unknown>, token?: string): Promise<T> {
  try {
    return await callOnce<T>(ACCOUNT_SERVER_DIRECT, SERVER_CERT, path, body, token)
  } catch (error) {
    if ((error as Error & { status?: number }).status) throw error
    return callOnce<T>(ACCOUNT_SERVER, undefined, path, body, token)
  }
}

function callOnce<T>(base: string, ca: string | undefined, path: string, body: Record<string, unknown>, token?: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body)
    const req = request(`${base}${path}`, {
      method: 'POST',
      ...(ca ? { ca } : {}),
      timeout: 15_000,
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data), 'user-agent': `Roy/${electron.app?.getVersion?.() ?? 'dev'}`, ...(token ? { authorization: `Bearer ${token}` } : {}) },
    }, (res) => {
      let raw = ''
      res.on('data', (c: Buffer) => { raw += c.toString() })
      res.on('end', () => {
        let json: Record<string, unknown> = {}
        try { json = JSON.parse(raw) } catch { /* 下面按状态码报错 */ }
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) resolve(json as T)
        else { const err = new Error(String(json.error || `账号服务出错（${res.statusCode}）`)); (err as Error & { status?: number }).status = res.statusCode; reject(err) }
      })
    })
    req.on('timeout', () => req.destroy(new Error(NETWORK_ERROR)))
    req.on('error', (e) => reject(new Error(/ECONN|ETIMEDOUT|EHOSTUNREACH|ENOTFOUND|EAI_AGAIN|socket hang up|连不上|certificate|CERT/i.test(e.message) ? NETWORK_ERROR : e.message)))
    req.end(data)
  })
}

/** 忘记密码：给注册邮箱发验证码 */
export async function requestPasswordReset(email: string): Promise<void> {
  await call('/v1/password/forgot', { email })
}

/** 用邮件里的验证码设新密码（成功后需要重新登录） */
export async function resetPassword(email: string, code: string, password: string): Promise<void> {
  await call('/v1/password/reset', { email, code, password })
}

/** 带登录令牌调用账号服务（云同步等用） */
/** 不需要登录的接口（例如内置模型价格标签） */
export function callPublic<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
  return call<T>(path, body)
}

export async function callAccount<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const s = load()
  if (!s) throw new Error('请先登录')
  return call<T>(path, body, s.token)
}

export function accountView(): AccountView {
  const s = load()
  const e = current
  return {
    signedIn: !!s,
    email: e?.email ?? null,
    username: e?.username ?? null,
    plan: e?.plan ?? 'free',
    proExpiresAt: e?.proExpiresAt ?? null,
    features: e?.features ?? [],
    verifiedAt: e?.iat ?? null,
    offline,
    server: ACCOUNT_SERVER,
  }
}

/** Pro 功能是否可用：凭证签名有效、属于本机、未过期且包含该功能 */
/** 当前登录令牌；没登录为 null。Roy 内置模型渠道用它向服务器鉴权并扣点数 */
export function accountSessionToken(): string | null {
  return load()?.token ?? null
}

export function hasProFeature(feature: ProFeature): boolean {
  load()
  return !!current && current.plan === 'pro' && current.features.includes(feature) && Date.now() <= current.validUntil
}

/** 校验并保存服务端返回的登录结果 */
function adoptSession(r: { token?: string; entitlement?: SignedEntitlement }): AccountView {
  if (!r.token || !verifyEntitlement(r.entitlement, deviceId())) throw new Error('账号服务返回的凭证校验失败')
  offline = false
  save({ token: r.token, entitlement: r.entitlement as SignedEntitlement })
  return accountView()
}

async function signIn(path: '/v1/login' | '/v1/register' | '/v1/register/verify' | '/v1/register/complete', fields: Record<string, string>): Promise<AccountView> {
  const r = await call<{ token: string; entitlement: SignedEntitlement }>(path, { ...fields, deviceId: deviceId(), deviceName: hostname() })
  return adoptSession(r)
}

export interface RegistrationStart {
  /** true：验证码已发到邮箱，等用户输入；false：已直接注册并登录（view 有值） */
  pending: boolean
  view?: AccountView
}

/**
 * 注册第一步：提交用户名、邮箱、密码，服务端给邮箱发验证码。
 * 服务端没配发信邮箱时会直接注册；服务端还没升级（没有这个接口）时退回老的直接注册。
 */
export async function startRegistration(username: string, email: string, password: string): Promise<RegistrationStart> {
  const fields = { username: username.trim(), email: email.trim(), password }
  try {
    const r = await call<{ pending?: boolean; token?: string; entitlement?: SignedEntitlement }>('/v1/register/start', { ...fields, deviceId: deviceId(), deviceName: hostname() })
    if (r.pending) return { pending: true }
    return { pending: false, view: adoptSession(r) }
  } catch (error) {
    if ((error as Error & { status?: number }).status === 404) return { pending: false, view: await registerAccount(username, email, password) }
    throw error
  }
}

/**
 * 单页注册第一步：填好用户名和邮箱后发验证码。
 * 返回 legacy=true 表示账号服务还是旧版（没有这个接口），调用方改走 startRegistration 的两步流程。
 */
export async function sendRegisterCode(username: string, email: string): Promise<{ legacy: boolean }> {
  try {
    await call('/v1/register/send-code', { username: username.trim(), email: email.trim() })
    return { legacy: false }
  } catch (error) {
    if ((error as Error & { status?: number }).status === 404) return { legacy: true }
    throw error
  }
}

/** 单页注册第二步：用户名 + 邮箱 + 验证码 + 密码，验证码对了才创建账号并登录 */
export const completeRegistration = (username: string, email: string, code: string, password: string): Promise<AccountView> =>
  signIn('/v1/register/complete', { username: username.trim(), email: email.trim(), code: code.trim(), password })

/** 注册第二步：输入邮件里的验证码，通过后创建账号并登录 */
export const verifyRegistration = (email: string, code: string): Promise<AccountView> =>
  signIn('/v1/register/verify', { email: email.trim(), code: code.trim() })

/** 重新发送注册验证码 */
export async function resendRegistrationCode(email: string): Promise<void> {
  await call('/v1/register/resend', { email: email.trim() })
}

/** 用户名 + 邮箱 + 密码注册 */
export const registerAccount = (username: string, email: string, password: string): Promise<AccountView> =>
  signIn('/v1/register', { username: username.trim(), email: email.trim(), password })
/** 用户名或邮箱 + 密码登录（account 含 @ 时服务端按邮箱查） */
export const loginAccount = (account: string, password: string): Promise<AccountView> =>
  signIn('/v1/login', { account: account.trim(), password })

export interface RedeemResult {
  account: AccountView
  /** 兑换后的点数余额（老服务端不返回时为 null） */
  points: number | null
  /** 这张码充了多少点；Pro 码为 0 */
  addedPoints: number
}

/** 兑换激活码：Pro 码开通 / 续期 Pro，点数码充 Roy 点数（由服务端按码的类型决定） */
export async function redeemCode(code: string): Promise<RedeemResult> {
  const s = load()
  if (!s) throw new Error('请先登录')
  const r = await call<{ entitlement: SignedEntitlement; points?: number; addedPoints?: number }>('/v1/activate', { code }, s.token)
  save({ token: s.token, entitlement: r.entitlement })
  return { account: accountView(), points: typeof r.points === 'number' ? r.points : null, addedPoints: Number(r.addedPoints) || 0 }
}

export async function activateCode(code: string): Promise<AccountView> {
  return (await redeemCode(code)).account
}

export async function refreshAccount(): Promise<AccountView> {
  const s = load()
  if (!s) return accountView()
  try {
    const r = await call<{ entitlement: SignedEntitlement }>('/v1/entitlement', { deviceName: hostname() }, s.token)
    offline = false
    save({ token: s.token, entitlement: r.entitlement })
  } catch (error) {
    const status = (error as Error & { status?: number }).status
    if (status === 401) save(null) // 登录失效：清掉，回到免费版
    else { offline = true; notify() } // 网络问题：沿用离线凭证
  }
  return accountView()
}

export async function logoutAccount(): Promise<AccountView> {
  const s = load()
  if (s) await call('/v1/logout', {}, s.token).catch(() => undefined)
  save(null)
  notify()
  return accountView()
}

/** 启动后联网刷新一次，之后每 6 小时一次 */
export function startAccountRefresh(): void {
  if (refreshTimer) return
  setTimeout(() => { void refreshAccount() }, 5_000)
  refreshTimer = setInterval(() => { void refreshAccount() }, 6 * 3600 * 1000)
}
