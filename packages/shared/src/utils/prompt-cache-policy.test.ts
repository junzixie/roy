/**
 * 提示缓存策略。
 *
 * 已核实的代码事实（pi-ai/dist/api/openai-completions.js:578-581）：
 *
 *   prompt_cache_key:
 *     (baseUrl 含 "api.openai.com" && retention !== "none")
 *     || (retention === "long" && compat.supportsLongCacheRetention)
 *       ? clampPromptCacheKey(options.sessionId)
 *       : undefined
 *
 * 走 DeepSeek / 中转站这类非 api.openai.com 地址时，不显式传 long 就不会带
 * prompt_cache_key。改动前 Roy 全仓未传过 cacheRetention（grep 0 行）。
 *
 * 未核实：上游是否真的因此命中/不命中缓存。本机日志里带 cached_tokens 的
 * 样本只有 18 条且 prompt_tokens 全在 65–195（标题生成类小请求），
 * 不足以判断真实对话的命中率。这里只测「该传什么」，不断言效果。
 */

import { describe, expect, test } from 'bun:test'
import {
  ROY_CACHE_MODE_TO_RETENTION,
  ROY_DEFAULT_CACHE_MODE,
  cacheKeyForSession,
  normalizeCacheMode,
  resolveCacheRetention,
} from './prompt-cache-policy'

describe('缓存档位归一化', () => {
  test('默认是高缓存', () => {
    expect(ROY_DEFAULT_CACHE_MODE).toBe('high')
  })

  test('三个合法值原样返回', () => {
    expect(normalizeCacheMode('high')).toBe('high')
    expect(normalizeCacheMode('standard')).toBe('standard')
    expect(normalizeCacheMode('off')).toBe('off')
  })

  test('未设置回落默认值', () => {
    expect(normalizeCacheMode(undefined)).toBe('high')
    expect(normalizeCacheMode(null)).toBe('high')
    expect(normalizeCacheMode('')).toBe('high')
  })

  test('非法值回落默认值（不抛错）', () => {
    expect(normalizeCacheMode('turbo')).toBe('high')
    expect(normalizeCacheMode(123)).toBe('high')
    expect(normalizeCacheMode({})).toBe('high')
  })
})

describe('档位到 SDK 值', () => {
  test('high 映射 long —— 这是让非 [OI] 地址也带 prompt_cache_key 的方式', () => {
    expect(resolveCacheRetention('high')).toBe('long')
    expect(ROY_CACHE_MODE_TO_RETENTION.high).toBe('long')
  })

  test('standard 映射 short（Pi 默认）', () => {
    expect(resolveCacheRetention('standard')).toBe('short')
  })

  test('off 映射 none', () => {
    expect(resolveCacheRetention('off')).toBe('none')
  })

  test('未设置时给出 long，而不是 Pi 的 short', () => {
    expect(resolveCacheRetention(undefined)).toBe('long')
  })
})

describe('会话缓存 key', () => {
  test('正常 sessionId 原样返回', () => {
    expect(cacheKeyForSession('b35a5a4a-1234-5678-9abc-def012345678')).toBe('b35a5a4a-1234-5678-9abc-def012345678')
  })

  test('缺失时返回 undefined（退化成服务端按前缀匹配）', () => {
    expect(cacheKeyForSession(undefined)).toBeUndefined()
    expect(cacheKeyForSession('')).toBeUndefined()
    expect(cacheKeyForSession('   ')).toBeUndefined()
  })

  test('超过 64 字符时返回 undefined，避免被截断后串味', () => {
    // Pi 会截到 64 字符；两个不同会话截断后可能相同，导致缓存互相污染
    const long = 'x'.repeat(65)
    expect(cacheKeyForSession(long)).toBeUndefined()
  })

  test('正好 64 字符仍可用', () => {
    const exact = 'y'.repeat(64)
    expect(cacheKeyForSession(exact)).toBe(exact)
  })

  test('按码点计数而不是 UTF-16 长度（emoji 等）', () => {
    // 32 个 emoji = 64 UTF-16 单元，但只有 32 个码点，应可用
    const emojis = '😀'.repeat(32)
    expect(cacheKeyForSession(emojis)).toBe(emojis)
  })
})
