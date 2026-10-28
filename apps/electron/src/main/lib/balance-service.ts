/**
 * 供应商余额查询（IO 部分）
 *
 * 方案定义与 provider 映射在 balance-schemes.ts（纯逻辑，可直接单测）；
 * 这里只负责读渠道、解密 Key、按当前代理发请求。
 *
 * 只读：查询失败不影响任何渠道状态，也不写任何文件。
 */

import { getChannelById, decryptApiKey } from './channel-manager'
import { getEffectiveProxyUrl } from './proxy-settings-service'
import { createManagedProxyFetch } from './proxy-fetch'
import { balanceSchemeOf, BALANCE_SCHEMES, isOfficialDeepSeekBaseUrl, relayBillingBase, parseRelayBilling, type BalanceView } from './balance-schemes'

export type { BalanceView } from './balance-schemes'

export interface BalanceResult {
  supported: boolean
  view?: BalanceView
  /** 不支持或失败时的说明 */
  message?: string
}

/**
 * 查询某个渠道的余额。
 *
 * 渠道不存在、供应商没有公开余额接口、或请求失败时都返回 supported=false 加原因，
 * 由界面显示成一句说明，不抛异常。
 */
export async function getChannelBalance(channelId: string): Promise<BalanceResult> {
  const channel = getChannelById(channelId)
  if (!channel) return { supported: false, message: '渠道不存在' }

  const schemeId = balanceSchemeOf(channel.provider)
  const scheme = schemeId ? BALANCE_SCHEMES[schemeId] : undefined
  if (!scheme) return { supported: false, message: '该供应商没有公开的余额接口' }

  let apiKey: string
  try {
    apiKey = await decryptApiKey(channelId)
  } catch {
    return { supported: false, message: '读取密钥失败' }
  }
  if (!apiKey) return { supported: false, message: '还没有填写 API Key' }

  try {
    const proxyUrl = await getEffectiveProxyUrl()
    const managed = createManagedProxyFetch(proxyUrl)
    try {
      // 中转站没有官方的 /user/balance，访问只会返回网页；改查 OpenAI 兼容的
      // dashboard/billing 接口（和「用量详情」面板同一路径），不再报 JSON 解析错。
      if (channel.provider === 'deepseek' && !isOfficialDeepSeekBaseUrl(channel.baseUrl)) {
        const view = await relayBalanceView(managed.fetch, apiKey, channel.baseUrl)
        if (view) return { supported: true, view }
        return { supported: false, message: '这个中转站没有提供余额查询接口，请到中转站后台查看' }
      }
      // 智谱的 /api/paas/v4/balance 已经废弃（404），用量额度走 /api/monitor/usage/quota/limit，
      // 与「用量详情」面板相同；Authorization 直接带原始 Key。
      if (channel.provider === 'zhipu') {
        const view = await zhipuBalanceView(managed.fetch, apiKey, channel.baseUrl)
        if (view) return { supported: true, view }
        return { supported: false, message: '智谱没有返回额度数据，请到 bigmodel.cn 后台查看' }
      }
      const response = await managed.fetch(scheme.url(channel.baseUrl), {
        headers: { authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(15_000),
      })
      if (!response.ok) {
        const reason = response.status === 401 || response.status === 403
          ? 'Key 无权查询余额'
          : response.status === 429
            ? '请求过于频繁'
            : `查询失败（HTTP ${response.status}）`
        return { supported: false, message: reason }
      }
      const body = await response.json() as Record<string, unknown>
      return { supported: true, view: scheme.parse(body) }
    } finally {
      await managed.close()
    }
  } catch (error) {
    return {
      supported: false,
      message: error instanceof Error ? error.message.slice(0, 80) : '查询失败',
    }
  }
}

/** 查中转站的 OpenAI 兼容额度接口；拿不到就返回 undefined，不猜数字。 */
async function relayBalanceView(
  fetchFn: (url: string, init?: RequestInit) => Promise<Response>,
  apiKey: string,
  baseUrl: string,
): Promise<BalanceView | undefined> {
  let base: string
  try {
    base = relayBillingBase(baseUrl)
  } catch {
    return undefined
  }
  const getJson = async (url: string): Promise<Record<string, unknown> | undefined> => {
    try {
      const response = await fetchFn(url, {
        headers: { authorization: `Bearer ${apiKey}`, accept: 'application/json' },
        signal: AbortSignal.timeout(15_000),
      })
      if (!response.ok) return undefined
      const parsed: unknown = JSON.parse(await response.text())
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined
    } catch {
      return undefined
    }
  }
  const subscription = await getJson(`${base}/dashboard/billing/subscription`)
  if (!subscription) return undefined
  const now = new Date()
  const day = (d: Date): string => d.toISOString().slice(0, 10)
  const startDate = day(new Date(now.getTime() - 99 * 86_400_000))
  const endDate = day(new Date(now.getTime() + 86_400_000))
  const usage = await getJson(`${base}/dashboard/billing/usage?start_date=${startDate}&end_date=${endDate}`)
  const relay = parseRelayBilling(subscription, usage)
  if (!relay) return undefined
  if (relay.unlimited) return { isAvailable: true, currency: 'USD' }
  if (relay.remaining === undefined) return undefined
  return { isAvailable: relay.remaining > 0, currency: 'USD', total: relay.remaining.toFixed(2), limit: relay.limit?.toFixed(2), used: relay.used?.toFixed(2) }
}

interface ZhipuQuotaResponse {
  code?: number
  msg?: string
  success?: boolean
  data?: {
    limits?: Array<{ type?: string; percentage?: number; unit?: number; nextResetTime?: string }>
    level?: string
  }
}

/** 查智谱的用量额度接口（bigmodel.cn / api.z.ai 同路径）；拿不到就返回 undefined。 */
async function zhipuBalanceView(
  fetchFn: (url: string, init?: RequestInit) => Promise<Response>,
  apiKey: string,
  baseUrl: string,
): Promise<BalanceView | undefined> {
  let requestUrl = 'https://bigmodel.cn/api/monitor/usage/quota/limit'
  try {
    const hostname = new URL(baseUrl).hostname
    if (hostname === 'api.z.ai') requestUrl = 'https://api.z.ai/api/monitor/usage/quota/limit'
    else if (hostname === 'open.bigmodel.cn') requestUrl = 'https://open.bigmodel.cn/api/monitor/usage/quota/limit'
  } catch { /* 保持默认 */ }
  try {
    const response = await fetchFn(requestUrl, {
      headers: { authorization: apiKey, accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) return undefined
    const parsed = JSON.parse(await response.text()) as ZhipuQuotaResponse
    if (!parsed.success || parsed.code !== 200) return undefined
    const limits = parsed.data?.limits ?? []
    // 取第一个 TOKENS_LIMIT 作为剩余额度；接口按百分比报，没有绝对金额
    const token = limits.find((item) => item.type === 'TOKENS_LIMIT')
    if (!token || typeof token.percentage !== 'number') return undefined
    const remainingPercent = Math.max(0, Math.min(100, 100 - token.percentage))
    return { isAvailable: remainingPercent > 0, total: `${remainingPercent.toFixed(0)}%` }
  } catch {
    return undefined
  }
}
