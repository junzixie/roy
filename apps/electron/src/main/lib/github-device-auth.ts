/**
 * GitHub 网页授权（OAuth Device Flow，RFC 8628）。
 *
 * GitHub 不支持 MCP 规范里的动态客户端注册，所以不能像 Notion / Linear 那样即点即授权；
 * Device Flow 只需要一个公开的 Client ID（不需要也不保存 Client Secret）：
 * 1. 向 github.com 申请一次性代码 → 自动复制到剪贴板并打开 github.com/login/device；
 * 2. 用户在 GitHub 官网确认授权；
 * 3. 主进程轮询拿到 token，加密保存为该 MCP 的 Authorization 凭据，token 不回传渲染器或 Agent。
 *
 * Client ID 来自 Roy 自己在 GitHub 注册的 OAuth App（Settings → Developer settings → OAuth Apps，
 * 勾选 Enable Device Flow）。填到 ROY_GITHUB_OAUTH_CLIENT_ID，或用同名环境变量覆盖。
 */

import { randomUUID } from 'node:crypto'
import { clipboard, shell } from 'electron'
import type { GithubDeviceAuthStatus, StartGithubDeviceAuthInput, StartGithubDeviceAuthResult } from '@roy/shared'
import { saveMcpApiKey } from './mcp-oauth-service'
import { runWithOAuthProxyScope } from './oauth-proxy-scope'

/** Roy 的 GitHub OAuth App Client ID（公开值，可写进安装包）。留空时 GitHub 卡片回退到「生成令牌」页面。 */
export const ROY_GITHUB_OAUTH_CLIENT_ID = ''

const DEVICE_CODE_URL = 'https://github.com/login/device/code'
const TOKEN_URL = 'https://github.com/login/oauth/access_token'
const DEFAULT_SCOPES = ['repo', 'read:org', 'read:user', 'workflow', 'notifications', 'gist', 'project']
const ALLOWED_SERVER_HOSTS = new Set(['api.githubcopilot.com'])

interface PendingFlow {
  input: StartGithubDeviceAuthInput
  clientId: string
  deviceCode: string
  intervalMs: number
  expiresAt: number
  promise?: Promise<void>
}

const flows = new Map<string, PendingFlow>()

function getClientId(): string {
  return (process.env.ROY_GITHUB_OAUTH_CLIENT_ID ?? ROY_GITHUB_OAUTH_CLIENT_ID).trim()
}

export function getGithubDeviceAuthStatus(): GithubDeviceAuthStatus {
  return getClientId()
    ? { available: true }
    : { available: false, reason: '尚未配置 Roy 的 GitHub OAuth App Client ID' }
}

async function postForm<T>(url: string, body: Record<string, string>): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  })
  if (response.status === 404) throw new Error('GitHub 不认识这个 Client ID：请确认 Roy 的 OAuth App Client ID 正确且已勾选 Enable Device Flow')
  if (!response.ok) throw new Error(`GitHub 授权服务返回 HTTP ${response.status}`)
  return response.json() as Promise<T>
}

function assertGithubServerUrl(serverUrl: string): void {
  const url = new URL(serverUrl)
  if (url.protocol !== 'https:' || !ALLOWED_SERVER_HOSTS.has(url.hostname)) {
    throw new Error('GitHub 授权只能绑定到 GitHub 官方远程 MCP')
  }
}

export async function startGithubDeviceAuth(input: StartGithubDeviceAuthInput): Promise<StartGithubDeviceAuthResult> {
  const clientId = getClientId()
  if (!clientId) throw new Error('尚未配置 Roy 的 GitHub OAuth App Client ID')
  assertGithubServerUrl(input.serverUrl)
  const scopes = (input.scopes?.length ? input.scopes : DEFAULT_SCOPES).join(' ')
  const data = await runWithOAuthProxyScope(() => postForm<{
    device_code?: string
    user_code?: string
    verification_uri?: string
    expires_in?: number
    interval?: number
    error?: string
    error_description?: string
  }>(DEVICE_CODE_URL, { client_id: clientId, scope: scopes }))
  if (!data.device_code || !data.user_code || !data.verification_uri) {
    throw new Error(data.error_description || data.error || 'GitHub 没有返回授权代码；请确认 OAuth App 已勾选 Enable Device Flow')
  }
  const verificationUri = new URL(data.verification_uri)
  if (verificationUri.protocol !== 'https:' || verificationUri.hostname !== 'github.com') {
    throw new Error('GitHub 返回了非官方授权地址，已拒绝打开')
  }
  const flowId = randomUUID()
  const expiresAt = Date.now() + Math.max(60, data.expires_in ?? 900) * 1000
  flows.set(flowId, {
    input,
    clientId,
    deviceCode: data.device_code,
    intervalMs: Math.max(5, data.interval ?? 5) * 1000,
    expiresAt,
  })
  try { clipboard.writeText(data.user_code) } catch { /* 剪贴板不可用时用户仍可在界面看到代码 */ }
  await shell.openExternal(verificationUri.toString())
  return { flowId, userCode: data.user_code, verificationUri: verificationUri.toString(), expiresAt }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

async function pollUntilAuthorized(flowId: string, flow: PendingFlow): Promise<void> {
  let intervalMs = flow.intervalMs
  while (Date.now() < flow.expiresAt) {
    await sleep(intervalMs)
    if (!flows.has(flowId)) throw new Error('GitHub 授权已取消')
    const result = await runWithOAuthProxyScope(() => postForm<{
      access_token?: string
      error?: string
      error_description?: string
      interval?: number
    }>(TOKEN_URL, {
      client_id: flow.clientId,
      device_code: flow.deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    }))
    if (result.access_token) {
      saveMcpApiKey({
        workspaceSlug: flow.input.workspaceSlug,
        serverName: flow.input.serverName,
        serverUrl: flow.input.serverUrl,
        headerName: 'Authorization',
        value: `Bearer ${result.access_token}`,
      })
      return
    }
    if (result.error === 'authorization_pending') continue
    if (result.error === 'slow_down') {
      intervalMs = Math.max(intervalMs + 5000, (result.interval ?? 0) * 1000)
      continue
    }
    if (result.error === 'access_denied') throw new Error('你在 GitHub 页面拒绝了授权')
    if (result.error === 'expired_token') break
    throw new Error(result.error_description || result.error || 'GitHub 授权失败')
  }
  throw new Error('GitHub 授权代码已过期，请重新点击连接')
}

/** 等待用户在 GitHub 官网完成授权；成功时 token 已加密保存。重复调用同一 flowId 复用同一次轮询。 */
export async function waitGithubDeviceAuth(flowId: string): Promise<void> {
  const flow = flows.get(flowId)
  if (!flow) throw new Error('GitHub 授权会话不存在或已结束')
  flow.promise ??= pollUntilAuthorized(flowId, flow).finally(() => flows.delete(flowId))
  return flow.promise
}
