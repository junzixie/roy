/**
 * Roy 内置模型点数 IPC：余额和账目都以服务器为准，这里只做转发，本地不存、不改。
 * 充值只能兑换激活码（由服务端校验），不提供任何本地加点入口。
 */

import { ipcMain } from 'electron'
import { BALANCE_IPC_CHANNELS } from '@roy/shared'
import { callAccount, callPublic, redeemCode, type RedeemResult } from './roy-account'

export interface BalanceLedgerEntry {
  kind: 'usage' | 'recharge' | 'adjust'
  amount: number
  model: string | null
  inputTokens: number | null
  outputTokens: number | null
  cacheReadTokens: number | null
  /** 1 表示上游没返回用量、按已输出内容估算 */
  estimated: number
  note: string | null
  createdAt: number
}

export interface BalanceView {
  points: number
  ledger: BalanceLedgerEntry[]
}

/** 内置模型价格标签：选模型时显示「Nx | X折」，数字由服务器按实际计费规则算好 */
export interface LlmPricing {
  baseline: string
  models: Record<string, { multiplier: number; discount: number | null }>
}

const PRICING_TTL_MS = 10 * 60 * 1000
let pricingCache: { at: number; value: LlmPricing } | null = null

async function getLlmPricing(): Promise<LlmPricing | null> {
  if (pricingCache && Date.now() - pricingCache.at < PRICING_TTL_MS) return pricingCache.value
  try {
    const value = await callPublic<LlmPricing>('/v1/llm/pricing')
    pricingCache = { at: Date.now(), value }
    return value
  } catch (error) {
    console.warn('[点数] 读取内置模型价格失败:', error)
    // 连不上时沿用上次的，没有就不显示标签
    return pricingCache?.value ?? null
  }
}

export function registerBalanceIPC(): void {
  ipcMain.handle(BALANCE_IPC_CHANNELS.PRICING, (): Promise<LlmPricing | null> => getLlmPricing())

  ipcMain.handle(BALANCE_IPC_CHANNELS.GET_BALANCE, (_event, limit?: number): Promise<BalanceView> => {
    return callAccount<BalanceView>('/v1/balance', { limit: limit ?? 50 })
  })

  ipcMain.handle(BALANCE_IPC_CHANNELS.REDEEM, (_event, code: unknown): Promise<RedeemResult> => {
    return redeemCode(String(code ?? '').trim())
  })
}
