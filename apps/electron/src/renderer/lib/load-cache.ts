/** 仅缓存只读目录，合并并发请求；失败不缓存，最多保留 16 项。 */
const entries = new Map<string, { at: number; value: unknown }>()
const pending = new Map<string, Promise<unknown>>()
export function cachedLoad<T>(key: string, loader: () => Promise<T>, refresh = false, ttl = 60000): Promise<T> {
  const running = pending.get(key)
  if (running) return running as Promise<T>
  const hit = entries.get(key)
  if (!refresh && hit && Date.now() - hit.at < ttl) return Promise.resolve(hit.value as T)
  const request = Promise.resolve().then(loader).then(value => {
    entries.delete(key)
    entries.set(key, { at: Date.now(), value })
    if (entries.size > 16) entries.delete(entries.keys().next().value!)
    return value
  }).finally(() => { pending.delete(key) })
  pending.set(key, request)
  return request
}
