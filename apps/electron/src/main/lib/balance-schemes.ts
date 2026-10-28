/**
 * 供应商余额方案（纯逻辑，不依赖 Electron）
 *
 * 移植自 Arthur 的 electron/balance.js（上游 dsh-usage，MIT，Copyright (c) Aisland-SJL）。
 * 每个方案知道相对 baseURL 的余额接口和响应解析方式；没有公开余额接口的供应商
 * 明确不属于任何方案，由调用方显示「不支持」，而不是猜一个数字。
 */

export interface BalanceView {
  /** 是否还有可用额度；接口没给就不填 */
  isAvailable?: boolean
  currency?: string
  /** 剩余总额 */
  total?: string
  /** 已用 */
  used?: string
  /** 总额度 */
  limit?: string
  /** 赠送额度 */
  granted?: string
  /** 充值余额 */
  toppedUp?: string
}

export interface BalanceResult {
  supported: boolean
  view?: BalanceView
  /** 不支持或失败时的说明 */
  message?: string
}

export interface BalanceScheme {
  url: (baseURL: string) => string
  parse: (json: Record<string, unknown>) => BalanceView
}

const num = (value: unknown): string | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return String(Number(value.toFixed(2)))
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return String(Number(parsed.toFixed(2)))
  }
  return undefined
}

export const BALANCE_SCHEMES: Record<string, BalanceScheme> = {
  /** DeepSeek: GET {origin}/user/balance */
  deepseek: {
    url: (baseURL) => new URL('/user/balance', baseURL).href,
    parse: (json) => {
      const infos = Array.isArray(json['balance_infos'])
        ? (json['balance_infos'] as Array<Record<string, unknown>>)
        : []
      const info = infos.find((entry) => entry?.['currency'] === 'CNY') ?? infos[0]
      return {
        isAvailable: json['is_available'] === true,
        currency: typeof info?.['currency'] === 'string' ? info['currency'] : undefined,
        total: num(info?.['total_balance']),
        granted: num(info?.['granted_balance']),
        toppedUp: num(info?.['topped_up_balance']),
      }
    },
  },

  /** Moonshot / Kimi: GET {origin}/v1/users/me/balance */
  moonshot: {
    url: (baseURL) => new URL('/v1/users/me/balance', baseURL).href,
    parse: (json) => {
      const data = (json['data'] ?? {}) as Record<string, unknown>
      const available = data['available_balance']
      return {
        isAvailable: typeof available === 'number' ? available > 0 : undefined,
        currency: typeof data['currency'] === 'string' ? data['currency'] : undefined,
        total: num(available),
        granted: num(data['voucher_balance']),
        toppedUp: num(data['cash_balance']),
      }
    },
  },

  /** 智谱 / Z.AI: GET {origin}/api/paas/v4/balance */
  zai: {
    url: (baseURL) => new URL('/api/paas/v4/balance', baseURL).href,
    parse: (json) => {
      const data = (json['data'] ?? {}) as Record<string, unknown>
      const total = typeof data['total_balance'] === 'number' ? data['total_balance'] : data['available_balance']
      return {
        isAvailable: typeof total === 'number' ? total > 0 : undefined,
        currency: typeof data['currency'] === 'string' ? data['currency'] : undefined,
        total: num(total),
        toppedUp: num(data['available_balance']),
      }
    },
  },

  /** OpenRouter 账户额度：需要 Management Key */
  openrouter: {
    url: (baseURL) => new URL('/api/v1/credits', baseURL).href,
    parse: (json) => {
      const data = (json['data'] ?? {}) as Record<string, unknown>
      const totalCredits = typeof data['total_credits'] === 'number' ? data['total_credits'] : undefined
      const totalUsage = typeof data['total_usage'] === 'number' ? data['total_usage'] : undefined
      const remaining = totalCredits !== undefined && totalUsage !== undefined ? totalCredits - totalUsage : undefined
      return {
        isAvailable: remaining !== undefined ? remaining > 0 : undefined,
        currency: 'USD',
        total: num(remaining),
        used: num(totalUsage),
        limit: num(totalCredits),
      }
    },
  },
}

/** 把 Roy 的 provider 映射到余额方案。没有公开接口的返回 null。 */
export function balanceSchemeOf(provider: string): string | null {
  switch (provider) {
    case 'deepseek':
      return 'deepseek'
    case 'kimi-api':
    case 'kimi-coding':
      return 'moonshot'
    case 'zhipu':
    case 'zhipu-coding':
    case 'zhipu-coding-team':
      return 'zai'
    default:
      return null
  }
}

/** 是否是 DeepSeek 官方地址（只有官方提供 /user/balance）。 */
export function isOfficialDeepSeekBaseUrl(baseUrl: string): boolean {
  try {
    const host = new URL(baseUrl).hostname.toLowerCase()
    return host === 'deepseek.com' || host.endsWith('.deepseek.com')
  } catch {
    return false
  }
}

/** 中转站的 OpenAI 兼容额度接口基址：保留 /v1，没有就补上。 */
export function relayBillingBase(baseUrl: string): string {
  const url = new URL(baseUrl)
  const path = url.pathname.replace(/\/+$/, '')
  const v1 = /\/v1$/i.test(path) ? path : `${path}/v1`
  return `${url.origin}${v1}`
}

export interface RelayBillingView {
  /** 剩余额度（美元口径，中转站一般按美元记） */
  remaining?: number
  limit?: number
  used?: number
  unlimited: boolean
}

/** 超过这个值的总额度视为「不限额」（new-api 等不限额时会返回 1 亿美元） */
const RELAY_UNLIMITED_USD = 10_000_000

/**
 * 解析中转站常见的 /dashboard/billing/subscription + /dashboard/billing/usage。
 * subscription.hard_limit_usd 是总额度（美元），usage.total_usage 是已用（美分）。
 * 拿不到总额度就返回 undefined，由调用方显示「不支持」，不猜数字。
 */
export function parseRelayBilling(
  subscription: Record<string, unknown> | undefined,
  usage: Record<string, unknown> | undefined,
): RelayBillingView | undefined {
  const limitRaw = subscription?.['hard_limit_usd'] ?? subscription?.['system_hard_limit_usd']
  const limit = typeof limitRaw === 'number' && Number.isFinite(limitRaw) ? limitRaw : undefined
  if (limit === undefined) return undefined
  if (limit >= RELAY_UNLIMITED_USD) return { unlimited: true, limit }
  const usedRaw = usage?.['total_usage']
  const used = typeof usedRaw === 'number' && Number.isFinite(usedRaw) ? usedRaw / 100 : undefined
  const remaining = used !== undefined ? Math.max(0, limit - used) : undefined
  return { unlimited: false, limit, used, remaining }
}
