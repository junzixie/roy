/**
 * 本地多用户管理（参照 Arthur 的 users.js）
 *
 * - 名单：~/.roy-users/users.json；当前用户：current.txt
 * - 第一次在「设置 → 账号」里加用户时，先把现在的数据登记成第一个用户（数据仍在 ~/.roy）
 * - 密码可选，用 pbkdf2-sha512 加盐保存，比对用 timingSafeEqual
 * - 删除用户只从名单里去掉，不删他的数据文件夹（防误删）
 * - 切换用户 = 写 current.txt 后重启 Roy
 */

import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  getActiveLocalUser,
  getUserDataDirFor,
  getUsersRoot,
  isSafeUsername,
  readCurrentUsername,
  readLocalUsersFile,
  type LocalUserRecord,
  type LocalUsersFile,
} from './config-paths'

export interface LocalUserView {
  username: string
  displayName: string
  primary: boolean
  hasPassword: boolean
  current: boolean
  dataDir: string
  createdAt: number
}

export interface LocalUsersState {
  users: LocalUserView[]
  askOnStartup: boolean
  /** 这次启动用的是谁（切换后要重启才变） */
  active: string
}

function hash(password: string, salt: string): string {
  return pbkdf2Sync(password, salt, 100_000, 64, 'sha512').toString('hex')
}

function save(file: LocalUsersFile): void {
  mkdirSync(getUsersRoot(), { recursive: true })
  writeFileSync(join(getUsersRoot(), 'users.json'), JSON.stringify(file, null, 2), { encoding: 'utf8', mode: 0o600 })
}

function setCurrent(username: string): void {
  mkdirSync(getUsersRoot(), { recursive: true })
  writeFileSync(join(getUsersRoot(), 'current.txt'), username, 'utf8')
}

/** 名单为空时，把现在的数据登记成第一个用户 */
function ensureRegistry(primaryName = '我'): LocalUsersFile {
  const file = readLocalUsersFile()
  if (file.users.length) return file
  const first: LocalUserRecord = { username: 'me', displayName: primaryName.slice(0, 24) || '我', createdAt: Date.now(), primary: true }
  const next: LocalUsersFile = { users: [first], askOnStartup: true }
  save(next)
  setCurrent(first.username)
  return next
}

function view(u: LocalUserRecord, current: string, active: string): LocalUserView {
  return {
    username: u.username,
    displayName: u.displayName,
    primary: !!u.primary,
    hasPassword: !!u.passwordHash,
    current: u.username === current,
    dataDir: getUserDataDirFor(u),
    createdAt: u.createdAt,
  }
  void active
}

/** 这次启动用的是谁：启动时还没有名单（单用户），就是第一个用户 */
export function getActiveUsername(): string {
  return getActiveLocalUser()?.username ?? readLocalUsersFile().users.find((u) => u.primary)?.username ?? ''
}

export function getLocalUsersState(): LocalUsersState {
  const file = readLocalUsersFile()
  const current = readCurrentUsername() || file.users.find((u) => u.primary)?.username || ''
  const active = getActiveUsername()
  return { users: file.users.map((u) => view(u, current, active)), askOnStartup: file.askOnStartup !== false, active }
}

export function verifyLocalUserPassword(username: string, password: string): boolean {
  const u = readLocalUsersFile().users.find((x) => x.username === username)
  if (!u) return false
  if (!u.passwordHash || !u.salt) return true
  const got = Buffer.from(hash(password, u.salt), 'hex')
  const want = Buffer.from(u.passwordHash, 'hex')
  return got.length === want.length && timingSafeEqual(got, want)
}

export function createLocalUser(input: { username: string; displayName?: string; password?: string; primaryName?: string }): LocalUsersState {
  const username = input.username.trim().toLowerCase()
  if (!isSafeUsername(username)) throw new Error('用户名只能用英文字母、数字、下划线和短横线，最多 32 位，比如 xiaoming')
  const file = ensureRegistry(input.primaryName)
  if (file.users.some((u) => u.username === username)) throw new Error('这个用户名已经有了')
  if (file.users.length >= 20) throw new Error('最多 20 个用户')
  const user: LocalUserRecord = { username, displayName: (input.displayName ?? '').trim().slice(0, 24) || username, createdAt: Date.now() }
  if (input.password) {
    if (input.password.length < 4) throw new Error('密码至少 4 位')
    user.salt = randomBytes(16).toString('hex')
    user.passwordHash = hash(input.password, user.salt)
  }
  const dir = getUserDataDirFor(user)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  file.users.push(user)
  save(file)
  return getLocalUsersState()
}

export function renameLocalUser(username: string, displayName: string): LocalUsersState {
  const file = ensureRegistry()
  const u = file.users.find((x) => x.username === username)
  if (!u) throw new Error('找不到这个用户')
  u.displayName = displayName.trim().slice(0, 24) || u.username
  save(file)
  return getLocalUsersState()
}

export function changeLocalUserPassword(username: string, oldPassword: string, newPassword: string): LocalUsersState {
  const file = ensureRegistry()
  const u = file.users.find((x) => x.username === username)
  if (!u) throw new Error('找不到这个用户')
  if (!verifyLocalUserPassword(username, oldPassword)) throw new Error('原密码不对')
  delete u.passwordHash
  delete u.salt
  if (newPassword) {
    if (newPassword.length < 4) throw new Error('密码至少 4 位')
    u.salt = randomBytes(16).toString('hex')
    u.passwordHash = hash(newPassword, u.salt)
  }
  save(file)
  return getLocalUsersState()
}

export function deleteLocalUser(username: string): LocalUsersState {
  const file = readLocalUsersFile()
  const u = file.users.find((x) => x.username === username)
  if (!u) throw new Error('找不到这个用户')
  if (u.primary) throw new Error('第一个用户不能删')
  if (getActiveUsername() === username) throw new Error('不能删除正在用的用户，先切换到别的用户')
  file.users = file.users.filter((x) => x.username !== username)
  save(file)
  return getLocalUsersState()
}

export function setLocalUsersAskOnStartup(ask: boolean): LocalUsersState {
  const file = ensureRegistry()
  file.askOnStartup = ask
  save(file)
  return getLocalUsersState()
}

/** 选好下次启动用谁（调用方负责重启）；有密码的要先验证 */
export function selectLocalUser(username: string, password = ''): void {
  const u = readLocalUsersFile().users.find((x) => x.username === username)
  if (!u) throw new Error('找不到这个用户')
  if (!verifyLocalUserPassword(username, password)) throw new Error('密码不对')
  setCurrent(username)
}

/** 启动时要不要先弹登录窗：当前用户有密码，或者有多个用户且勾了「启动时选用户」 */
export function needsLoginOnStartup(): boolean {
  const file = readLocalUsersFile()
  if (!file.users.length) return false
  const active = getActiveLocalUser()
  if (active?.passwordHash) return true
  return file.users.length > 1 && file.askOnStartup !== false
}
