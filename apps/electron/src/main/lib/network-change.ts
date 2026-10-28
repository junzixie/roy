/**
 * 网络切换检测（换 Wi-Fi、开关 VPN、拔网线、休眠唤醒后 IP 变化）
 *
 * 切换网络后，旧的 TCP 连接往往不会立刻报错，而是一直挂着，直到流式看门狗的空闲超时（120 秒）才断开。
 * 这里定时比对本机非回环网卡地址，一旦变化就通知订阅方，让正在进行的模型请求尽快重连。
 *
 * - 只在有订阅时轮询（有模型请求进行中），没有请求时不占资源
 * - 只用 Node 自带的 os.networkInterfaces()，主进程和 utility 进程都能用
 */
import { networkInterfaces } from 'node:os'

/** 网络切换后，若这段时间内仍没有收到模型新数据，就判定旧连接已失效 */
export const NETWORK_CHANGE_STALL_MS = 10_000
const POLL_MS = 2_000

type InterfacesReader = () => ReturnType<typeof networkInterfaces>

/** 网卡地址指纹：只看非回环地址；顺序无关 */
export function networkFingerprint(read: InterfacesReader = networkInterfaces): string {
  const parts: string[] = []
  try {
    for (const [name, addrs] of Object.entries(read())) {
      for (const a of addrs ?? []) {
        if (a.internal) continue
        // IPv6 临时地址会周期性轮换，链路本地地址也会随网卡重建变化，只按 IPv4 和全局 IPv6 判断
        if (a.family === 'IPv6' && (/^fe80:/i.test(a.address) || (a as { scopeid?: number }).scopeid)) continue
        parts.push(`${name}|${a.family}|${a.address}`)
      }
    }
  } catch {
    return ''
  }
  return parts.sort().join(',')
}

export interface NetworkChangeMonitor {
  /** 订阅网络变化；返回取消订阅函数 */
  subscribe(listener: () => void): () => void
  /** 立即比对一次（测试用，也用于唤醒后主动检查） */
  check(): void
}

export function createNetworkChangeMonitor(options: { read?: InterfacesReader; pollMs?: number } = {}): NetworkChangeMonitor {
  const read = options.read ?? networkInterfaces
  const pollMs = options.pollMs ?? POLL_MS
  const listeners = new Set<() => void>()
  let last = ''
  let timer: ReturnType<typeof setInterval> | undefined

  const check = (): void => {
    const next = networkFingerprint(read)
    // 读失败（空指纹）不算变化，避免误判
    if (!next) return
    if (last && next !== last) {
      for (const listener of [...listeners]) {
        try { listener() } catch { /* 单个订阅方出错不影响其他 */ }
      }
    }
    last = next
  }

  return {
    subscribe(listener) {
      listeners.add(listener)
      if (!timer) {
        last = networkFingerprint(read)
        timer = setInterval(check, pollMs)
        timer.unref?.()
      }
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0 && timer) {
          clearInterval(timer)
          timer = undefined
        }
      }
    },
    check,
  }
}

/** 进程内共用一个监视器 */
export const networkChangeMonitor = createNetworkChangeMonitor()
