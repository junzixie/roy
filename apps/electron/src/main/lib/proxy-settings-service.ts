/**
 * 全局代理配置服务
 *
 * 管理应用的全局代理配置，支持系统代理自动检测和手动配置。
 * 配置文件存储在 ~/.roy/proxy-settings.json。
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import type { ProxyConfig } from '@roy/shared'
import { getProxySettingsPath } from './config-paths'
import { detectSystemProxy } from './system-proxy-detector'

/**
 * 默认代理配置
 */
const DEFAULT_PROXY_CONFIG: ProxyConfig = {
  enabled: true,
  mode: 'system',
  manualUrl: '',
}

/** 缺失字段使用默认值；明确关闭或手动配置必须保留。 */
export function normalizeProxyConfig(input: unknown): ProxyConfig {
  const raw = input && typeof input === 'object' ? input as Partial<ProxyConfig> : {}
  return {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : DEFAULT_PROXY_CONFIG.enabled,
    mode: raw.mode === 'manual' ? 'manual' : 'system',
    manualUrl: typeof raw.manualUrl === 'string' ? raw.manualUrl : '',
  }
}

const SYSTEM_PROXY_CACHE_TTL_MS = 3_000
let systemProxyCache: { expiresAt: number; result: Awaited<ReturnType<typeof detectSystemProxy>> } | undefined
let pendingSystemProxyDetection: Promise<Awaited<ReturnType<typeof detectSystemProxy>>> | undefined

/**
 * 系统代理检测可能需要调用 OS 命令。合并并短暂缓存检测，避免网络请求热路径重复触发它。
 */
async function getCachedSystemProxy(): Promise<Awaited<ReturnType<typeof detectSystemProxy>>> {
  const now = Date.now()
  if (systemProxyCache && systemProxyCache.expiresAt > now) return systemProxyCache.result

  if (!pendingSystemProxyDetection) {
    pendingSystemProxyDetection = detectSystemProxy()
      .then((result) => {
        systemProxyCache = { result, expiresAt: Date.now() + SYSTEM_PROXY_CACHE_TTL_MS }
        return result
      })
      .finally(() => {
        pendingSystemProxyDetection = undefined
      })
  }

  return await pendingSystemProxyDetection
}

/** 代理 URL 可能携带认证信息；日志中绝不能输出其用户名或密码。 */
export function redactProxyUrl(proxyUrl: string): string {
  try {
    const url = new URL(proxyUrl)
    if (!['http:', 'https:', 'socks:', 'socks4:', 'socks5:'].includes(url.protocol)) {
      return '[invalid proxy URL]'
    }
    if (url.username || url.password) {
      url.username = '***'
      url.password = '***'
    }
    return url.toString()
  } catch {
    return '[invalid proxy URL]'
  }
}

/**
 * 读取代理配置
 *
 * 如果配置文件不存在，返回默认配置。
 */
export async function getProxySettings(): Promise<ProxyConfig> {
  const configPath = getProxySettingsPath()

  if (!existsSync(configPath)) {
    console.log('[代理配置] 配置文件不存在，使用默认配置')
    return normalizeProxyConfig(undefined)
  }

  try {
    const raw = readFileSync(configPath, 'utf-8')
    // 去 BOM：用户手改过的代理配置可能带 U+FEFF
    return normalizeProxyConfig(JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw))
  } catch (error) {
    console.error('[代理配置] 读取配置失败:', error)
    return normalizeProxyConfig(undefined)
  }
}

/**
 * 保存代理配置
 *
 * @param config 代理配置
 */
export async function saveProxySettings(config: ProxyConfig): Promise<void> {
  const configPath = getProxySettingsPath()

  try {
    writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
    systemProxyCache = undefined
    console.log('[代理配置] 配置已保存:', {
      ...config,
      manualUrl: config.manualUrl ? redactProxyUrl(config.manualUrl) : '',
    })
  } catch (error) {
    console.error('[代理配置] 保存配置失败:', error)
    throw new Error('保存代理配置失败')
  }
}

/**
 * 只在代理状态**发生变化**时打日志。
 *
 * `getEffectiveProxyUrl()` 是读函数，每次建连、每次请求都会调用。
 * 原来无条件 console.log，实测单次运行写入了 7659 行完全相同的
 * 「使用系统代理: http://127.0.0.1:7892/」——占整个 main.log 的 16.7%，
 * 把真正有用的诊断信息（压缩、Agent 编排）挤到了噪声里。
 *
 * 状态没变就不写，状态变了才写。这样日志里留下的是一条时间线，
 * 而不是同一句话刷屏。
 */
let lastProxyStateKey: string | null = null

function logProxyStateOnce(kind: string, detail: string | undefined): void {
  const key = `${kind}|${detail ?? ''}`
  if (key === lastProxyStateKey) return
  lastProxyStateKey = key
  if (kind === 'system') {
    console.log('[代理配置] 使用系统代理:', redactProxyUrl(detail ?? ''))
  } else if (kind === 'manual') {
    console.log('[代理配置] 使用手动配置代理:', redactProxyUrl(detail ?? ''))
  } else if (kind === 'system-failed') {
    console.log('[代理配置] 系统代理检测失败:', detail)
  } else if (kind === 'manual-empty') {
    console.log('[代理配置] 手动模式但未填地址，按直连处理')
  } else {
    console.log('[代理配置] 代理未启用')
  }
}

/** 仅供测试：重置去重状态。 */
export function resetProxyStateLogForTest(): void {
  lastProxyStateKey = null
}

/**
 * 获取当前生效的代理 URL
 *
 * 根据配置返回实际使用的代理地址：
 * - 如果代理未启用，返回 undefined
 * - 如果是系统代理模式，自动检测系统代理
 * - 如果是手动模式，返回手动配置的地址
 *
 * @returns 代理 URL（如果有）
 */
export async function getEffectiveProxyUrl(): Promise<string | undefined> {
  const config = await getProxySettings()

  if (!config.enabled) {
    logProxyStateOnce('disabled', undefined)
    return undefined
  }

  if (config.mode === 'system') {
    const result = await getCachedSystemProxy()
    if (result.success && result.proxyUrl) {
      logProxyStateOnce('system', result.proxyUrl)
      return result.proxyUrl
    }
    logProxyStateOnce('system-failed', result.message)
    return undefined
  }

  // 手动模式
  if (config.manualUrl.trim()) {
    logProxyStateOnce('manual', config.manualUrl.trim())
    return config.manualUrl.trim()
  }

  logProxyStateOnce('manual-empty', undefined)
  return undefined
}
