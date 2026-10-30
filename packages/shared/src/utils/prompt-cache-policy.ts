/**
 * 提示缓存保留策略（Prompt Cache Retention）
 *
 * 已核实的代码事实：
 *
 * 1. Pi SDK 的 `cacheRetention` 默认值是 `"short"`
 *    【已核 apps/electron/node_modules/@earendil-works/pi-ai/dist/api/anthropic-messages.js:22-29
 *     的 resolveCacheRetention：未传时回落到 "short"】。
 *
 * 2. `prompt_cache_key` 只在两种情况下发送
 *    【已核 .../pi-ai/dist/api/openai-completions.js:578-581】：
 *
 *      (baseUrl 含 "api.openai.com" && retention !== "none")
 *      || (retention === "long" && compat.supportsLongCacheRetention)
 *
 *    也就是说：走 DeepSeek / 中转站这类非 api.openai.com 地址时，
 *    **不显式传 `long` 就不会带 `prompt_cache_key`**。
 *
 * 3. 改动前 Roy 全仓没有传过 `cacheRetention`
 *    【实测：grep -rn "cacheRetention" apps/electron/src packages/shared/src 返回 0 行】。
 *
 * 未核实、不要当结论的部分：
 *
 * - **上游是否真的命中缓存**。本机日志里带 `cached_tokens` 的样本只有 18 条，
 *   且 `prompt_tokens` 全部落在 65–195 之间（最大 195），都是标题生成这类极小请求
 *   【实测：grep -o '"cached_tokens":[0-9]*' main.log | sort | uniq -c → 18 条全为 0】。
 *   短前缀本就不该命中，所以这批数据**不能**证明真实对话的缓存命中情况。
 * - DeepSeek 官方接口本身是「自动上下文缓存」，可能不需要 `prompt_cache_key`
 *   也能命中【推断，未核实其服务端行为】。
 *
 * 因此这里的改动是：把「发不发缓存亲和字段」的选择权交给用户，
 * 默认取 `long`（带上字段），而不是替上游断言缓存一定没生效。
 */

/**
 * 与 pi-ai 的 `CacheRetention` 同构。
 *
 * 这里不复用 SDK 的 import：`@roy/shared` 不依赖 pi-ai，而 shared 会被渲染层
 * 一起打包，引入 SDK 类型会把整个 pi-ai 拖进渲染进程的类型图。用同构字面量
 * 联合类型即可，赋值处由调用方（主进程）自然对齐。
 */
export type CacheRetentionValue = 'none' | 'short' | 'long'

/** Roy 的缓存档位（面向用户设置，比 SDK 的三态更语义化）。 */
export type RoyCacheMode = 'high' | 'standard' | 'off'

/** 用户设置 → SDK 值。 */
export const ROY_CACHE_MODE_TO_RETENTION: Record<RoyCacheMode, CacheRetentionValue> = {
  high: 'long',
  standard: 'short',
  off: 'none',
}

/** 默认值：高缓存。绝大多数场景下这能显著降低重复前缀的 input 成本。 */
export const ROY_DEFAULT_CACHE_MODE: RoyCacheMode = 'high'

export function normalizeCacheMode(value: unknown): RoyCacheMode {
  return value === 'high' || value === 'standard' || value === 'off' ? value : ROY_DEFAULT_CACHE_MODE
}

export function resolveCacheRetention(mode: unknown): CacheRetentionValue {
  return ROY_CACHE_MODE_TO_RETENTION[normalizeCacheMode(mode)]
}

/**
 * 会话 ID 是否适合直接当作 `prompt_cache_key`。
 *
 * Pi 会把超长 key 截到 64 字符，但截断会让两个不同会话可能撞到同一个 key，
 * 反而造成缓存串味。这里提前判断，宁可返回 undefined（不带 key，退化成
 * 服务端按前缀自动匹配）也不冒串味风险。
 */
export function cacheKeyForSession(sessionId: string | undefined): string | undefined {
  if (!sessionId) return undefined
  const trimmed = sessionId.trim()
  if (!trimmed) return undefined
  // 64 是 OPENAI_PROMPT_CACHE_KEY_MAX_LENGTH，超了就会被截断
  if (Array.from(trimmed).length > 64) return undefined
  return trimmed
}
