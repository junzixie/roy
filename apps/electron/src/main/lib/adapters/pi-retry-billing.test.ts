/**
 * 回归：pi-ai 补丁里的「余额 / 额度不重试」规则（patches/@earendil-works%2Fpi-ai@1.3.0.patch）
 * 升级 pi 时如果补丁没打上，这里会失败。
 */
import { describe, expect, test } from 'bun:test'
import type { AssistantMessage } from '@earendil-works/pi-ai'
import { isRetryableAssistantError } from '@earendil-works/pi-ai/compat'

const failed = (errorMessage: string): AssistantMessage => ({
  role: 'assistant', content: [], api: 'openai-completions', provider: 'test', model: 'm',
  usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
  stopReason: 'error', errorMessage, timestamp: Date.now(),
}) as unknown as AssistantMessage

describe('余额、额度用完不重试', () => {
  for (const text of [
    '429 {"error":{"message":"账户余额不足，请充值后再试"}}',
    '429 Too Many Requests: 今日额度已用完',
    '429 当前套餐额度已耗尽',
    '403 账号已欠费',
    '429 Insufficient Balance',
    '429 You exceeded your current quota, please check your plan and billing details',
    'Error: 套餐已到期，请续费',
  ]) {
    test(text, () => expect(isRetryableAssistantError(failed(text))).toBe(false))
  }
})

describe('临时故障照常重试', () => {
  for (const text of [
    '429 Too Many Requests: rate limit reached, please slow down',
    '503 Service Unavailable',
    'incomplete chunked read',
    'TypeError: Failed to fetch',
    'Network changed timeout：检测到网络切换，之后 10 秒没有收到模型数据',
  ]) {
    test(text, () => expect(isRetryableAssistantError(failed(text))).toBe(true))
  }
})
