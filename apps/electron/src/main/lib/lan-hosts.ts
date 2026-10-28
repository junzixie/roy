/** 虚拟网卡（Hyper-V、WSL、VMware、VirtualBox、Docker、蓝牙、远程软件等）手机连不上，二维码不用它们 */
const VIRTUAL_NIC = /vethernet|hyper-?v|wsl|vmware|virtualbox|vbox|docker|bluetooth|蓝牙|loopback|tap|tun|vpn|zerotier|tailscale|sunlogin|向日葵|oray|gameviewer|npcap|pseudo|teredo|isatap/i

/** 给手机用的地址：去掉虚拟网卡和 169.254，按 192.168 → 10 → 172.16-31 排序 */
export function rankLanHosts(ifaces: Record<string, Array<{ family: string | number; internal: boolean; address: string }> | undefined>): string[] {
  const rank = (ip: string): number => {
    const [a, b] = ip.split('.').map(Number)
    if (a === 192 && b === 168) return 0
    if (a === 10) return 1
    if (a === 172 && b! >= 16 && b! <= 31) return 2
    return 3
  }
  const list: string[] = []
  for (const [name, items] of Object.entries(ifaces)) {
    if (VIRTUAL_NIC.test(name)) continue
    for (const x of items ?? []) {
      if ((x.family !== 'IPv4' && x.family !== 4) || x.internal) continue
      if (x.address.startsWith('169.254.')) continue
      list.push(x.address)
    }
  }
  return [...new Set(list)].sort((p, q) => rank(p) - rank(q))
}
