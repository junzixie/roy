/**
 * 手机遥控「公网」模式的中转：用系统自带的 ssh 建一条反向隧道，
 * 把中转服务器上的 127.0.0.1:38643 接到本机手机遥控服务（默认 38641）。
 *
 *   手机 → https://roy.382628.xyz（Cloudflare 隧道）→ 服务器 127.0.0.1:38642（roy-front：更新文件 + 转发）
 *        → 服务器 127.0.0.1:38643（本隧道）→ 电脑 127.0.0.1:38641（Roy 手机遥控）
 *
 * 只用 Roy 自己生成的专用密钥（~/.roy/remote-relay/id_ed25519，无口令）。服务器上应把这把公钥限制为
 * 只能做这一条端口转发：restrict,port-forwarding,permitlisten="127.0.0.1:38643"。
 */

import { spawn, execFile, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getConfigDir } from './config-paths'

export const RELAY_REMOTE_PORT = 38643

export interface RelayTarget { user: string; host: string; port: number }
export type RelayState = 'off' | 'connecting' | 'connected' | 'error'
export interface RelayStatus { state: RelayState; target?: string; message?: string; publicKey?: string }

const relayDir = (): string => join(getConfigDir(), 'remote-relay')
const keyPath = (): string => join(relayDir(), 'id_ed25519')

/** 解析「用户@主机:端口」，端口默认 22 */
export function parseRelayTarget(value: string | undefined): RelayTarget | undefined {
  const m = /^\s*([A-Za-z0-9._-]{1,64})@([A-Za-z0-9.-]{1,253})(?::(\d{1,5}))?\s*$/.exec(value ?? '')
  if (!m) return undefined
  const port = m[3] ? Number(m[3]) : 22
  if (port < 1 || port > 65535) return undefined
  return { user: m[1]!, host: m[2]!, port }
}

function sshBinary(name: 'ssh' | 'ssh-keygen'): string {
  if (process.platform === 'win32') {
    const sys = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'OpenSSH', `${name}.exe`)
    if (existsSync(sys)) return sys
    return `${name}.exe`
  }
  return name
}

/** 没有专用密钥时生成一把（ed25519，无口令），返回公钥文本 */
export async function ensureRelayKey(): Promise<string> {
  mkdirSync(relayDir(), { recursive: true })
  if (!existsSync(keyPath())) {
    await new Promise<void>((resolve, reject) => {
      execFile(sshBinary('ssh-keygen'), ['-q', '-t', 'ed25519', '-N', '', '-C', 'roy-relay', '-f', keyPath()], { windowsHide: true }, (error) => error ? reject(new Error(`生成密钥失败：${error.message}`)) : resolve())
    })
  }
  return readFileSync(`${keyPath()}.pub`, 'utf-8').trim()
}

export function readRelayPublicKey(): string | undefined {
  try { return readFileSync(`${keyPath()}.pub`, 'utf-8').trim() } catch { return undefined }
}

let child: ChildProcess | undefined
let retryTimer: ReturnType<typeof setTimeout> | undefined
let connectedTimer: ReturnType<typeof setTimeout> | undefined
let wanted: { target: RelayTarget; localPort: number } | undefined
let status: RelayStatus = { state: 'off' }
let backoffMs = 2000
let onChange: (() => void) | undefined

export function setRelayChangeListener(fn: () => void): void { onChange = fn }
function setStatus(next: RelayStatus): void { status = next; onChange?.() }

export function relayStatus(): RelayStatus {
  return { ...status, publicKey: readRelayPublicKey() }
}

function launch(): void {
  if (!wanted) return
  const { target, localPort } = wanted
  const args = [
    '-N', '-T',
    '-i', keyPath(),
    '-p', String(target.port),
    '-o', 'BatchMode=yes',
    '-o', 'IdentitiesOnly=yes',
    '-o', 'ExitOnForwardFailure=yes',
    '-o', 'ServerAliveInterval=20',
    '-o', 'ServerAliveCountMax=3',
    '-o', 'StrictHostKeyChecking=accept-new',
    '-o', `UserKnownHostsFile=${join(relayDir(), 'known_hosts')}`,
    '-R', `127.0.0.1:${RELAY_REMOTE_PORT}:127.0.0.1:${localPort}`,
    `${target.user}@${target.host}`,
  ]
  const label = `${target.user}@${target.host}:${target.port}`
  setStatus({ state: 'connecting', target: label })
  let lastErr = ''
  const proc = spawn(sshBinary('ssh'), args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
  child = proc
  proc.stderr?.on('data', (d: Buffer) => {
    const line = d.toString().split(/\r?\n/).map(s => s.trim()).filter(Boolean).pop()
    if (line) lastErr = line
  })
  // ssh 没有“转发已建立”的输出；带 ExitOnForwardFailure 时 5 秒内没退出即视为连上
  connectedTimer = setTimeout(() => {
    if (child === proc && proc.exitCode === null) { backoffMs = 2000; setStatus({ state: 'connected', target: label }) }
  }, 5000)
  proc.on('error', (error) => { lastErr = error.message })
  proc.on('exit', () => {
    if (connectedTimer) clearTimeout(connectedTimer)
    if (child !== proc) return
    child = undefined
    if (!wanted) { setStatus({ state: 'off' }); return }
    const hint = /Permission denied|publickey/i.test(lastErr)
      ? '服务器拒绝了 Roy 的密钥：请把下面的公钥加到服务器的 ~/.ssh/authorized_keys'
      : /remote port forwarding failed|forwarding failed/i.test(lastErr)
        ? `服务器上的 ${RELAY_REMOTE_PORT} 端口被占用（可能还有旧连接没断开），稍后自动重试`
        : lastErr || '连接中断，稍后自动重试'
    setStatus({ state: 'error', target: label, message: hint })
    retryTimer = setTimeout(launch, backoffMs)
    backoffMs = Math.min(backoffMs * 2, 60_000)
  })
}

export async function startRelay(target: RelayTarget, localPort: number): Promise<void> {
  stopRelay()
  await ensureRelayKey()
  wanted = { target, localPort }
  backoffMs = 2000
  launch()
}

export function stopRelay(): void {
  wanted = undefined
  if (retryTimer) clearTimeout(retryTimer)
  if (connectedTimer) clearTimeout(connectedTimer)
  retryTimer = undefined
  const proc = child
  child = undefined
  if (proc && proc.exitCode === null) proc.kill()
  if (status.state !== 'off') setStatus({ state: 'off' })
}
