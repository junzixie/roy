/**
 * 接口类型自动检测（搬自 Arthur electron/providers.js 的 detectApi）
 *
 * 拿一个模型把三种格式各发一句最短的话，看哪个能通；再按模型推荐最合适的：
 * - Claude 模型且 /v1/messages 能通 → Anthropic Messages
 * - gpt / o 系列 / codex 且 /responses 能通 → Responses
 * - 其余 → Chat Completions
 */

import type { ChannelApi } from '@roy/shared'
import { getFetchFn } from './proxy-fetch'
import { getEffectiveProxyUrl } from './proxy-settings-service'

export interface ChannelDetectInput {
  baseUrl: string
  apiKey: string
  model: string
  /** 是否走「代理设置」里配的代理 */
  useProxy?: boolean
  /** 只测这一种格式（模型的「测试」按钮用）；不填三种都测 */
  only?: ChannelApi
}

export interface ChannelDetectPathResult {
  ok: boolean
  ms: number
  err: string
}

export interface ChannelDetectResult {
  results: Record<ChannelApi, ChannelDetectPathResult>
  best: ChannelApi | ''
  /** 推荐协议对应的 Base URL（Anthropic 用根地址，其余用 /v1 地址） */
  baseUrl: string
}

const TIMEOUT_MS = 30_000

export async function detectChannelApi(input: ChannelDetectInput): Promise<ChannelDetectResult> {
  const b = (input.baseUrl || '').trim().replace(/\/+$/, '')
  if (!b) throw new Error('请先填 Base URL')
  const model = (input.model || '').trim()
  if (!model) throw new Error('先选一个模型（或手动输入一个模型 ID），检测要用它发一句话')
  const apiKey = input.apiKey.trim()

  // 用户可能填的是完整端点，先还原成协议根
  const cleaned = b
    .replace(/\/chat\/completions$/, '')
    .replace(/\/responses$/, '')
    .replace(/\/v1\/messages$/, '')
    .replace(/\/messages$/, '')
  const root = cleaned.replace(/\/v1$/, '')
  const v1 = /\/v\d[\w.-]*$/.test(cleaned) ? cleaned : `${cleaned}/v1`
  const bearer = { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' }

  const tries: Record<ChannelApi, { url: string; headers: Record<string, string>; body: unknown }> = {
    'chat-completions': {
      url: `${v1}/chat/completions`,
      headers: bearer,
      body: { model, messages: [{ role: 'user', content: 'hi' }], max_tokens: 8 },
    },
    responses: {
      url: `${v1}/responses`,
      headers: bearer,
      body: { model, input: 'hi', max_output_tokens: 16 },
    },
    'anthropic-messages': {
      url: `${root}/v1/messages`,
      headers: { ...bearer, 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: { model, max_tokens: 8, messages: [{ role: 'user', content: 'hi' }] },
    },
  }

  const proxyUrl = await getEffectiveProxyUrl()
  const fetchFn = getFetchFn(proxyUrl)
  const results = {} as Record<ChannelApi, ChannelDetectPathResult>

  const apis = input.only ? [input.only] : (Object.keys(tries) as ChannelApi[])
  for (const api of Object.keys(tries) as ChannelApi[]) {
    if (!apis.includes(api)) results[api] = { ok: false, ms: 0, err: '未测' }
  }
  await Promise.all(apis.map(async (api) => {
    const t = tries[api]
    const started = Date.now()
    try {
      const response = await fetchFn(t.url, {
        method: 'POST',
        headers: t.headers,
        body: JSON.stringify(t.body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      const text = await response.text()
      let ok = response.ok
      // 有的中转站出错也回 200，正文里带 error
      try {
        const json = JSON.parse(text) as { error?: unknown; type?: string }
        if (json.error || json.type === 'error') ok = false
      } catch {
        if (response.ok && !/data:|"choices"|"output"|"content"/.test(text)) ok = false
      }
      results[api] = {
        ok,
        ms: Date.now() - started,
        err: ok ? '' : `HTTP ${response.status} ${text.slice(0, 120)}`,
      }
    } catch (error) {
      const err = error as Error
      results[api] = {
        ok: false,
        ms: Date.now() - started,
        err: err?.name === 'TimeoutError' ? '30 秒没回应' : String(err?.message || err).slice(0, 120),
      }
    }
  }))

  const m = model.toLowerCase()
  let best: ChannelApi | '' = ''
  if (/claude/.test(m) && results['anthropic-messages'].ok) best = 'anthropic-messages'
  else if (/(^|\/)(gpt|o\d|codex)/.test(m) && results.responses.ok) best = 'responses'
  else if (results['chat-completions'].ok) best = 'chat-completions'
  else best = (Object.keys(results) as ChannelApi[]).find((k) => results[k].ok) ?? ''

  return { results, best, baseUrl: best === 'anthropic-messages' ? root : v1 }
}
