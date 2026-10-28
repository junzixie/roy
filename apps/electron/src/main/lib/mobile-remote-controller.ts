import { networkInterfaces } from 'node:os'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import QRCode from 'qrcode'
import { rankLanHosts } from './lan-hosts'
import { BrowserWindow, Notification } from 'electron'
import { getSettings, updateSettings } from './settings-service'
import { getConfigDir } from './config-paths'
import { MobileRemoteServer, type RemoteDeviceRecord } from './mobile-remote-server'
import { MobileRemoteGateway } from './mobile-remote-gateway'
import { MOBILE_REMOTE_HTML } from './mobile-remote-page'
import { parseRelayTarget, relayStatus, setRelayChangeListener, startRelay, stopRelay } from './mobile-remote-relay'
import type { MobileRemotePairing, MobileRemoteStatus } from '../../types/mobile-remote'
import { hasProFeature } from './roy-account'

let server: MobileRemoteServer | undefined
let gateway: MobileRemoteGateway | undefined
let lastError = ''
const file = (): string => join(getConfigDir(), 'mobile-remote.json')
function loadDevices(): RemoteDeviceRecord[] {
  try { const value = JSON.parse(readFileSync(file(), 'utf8')); return Array.isArray(value.devices) ? value.devices : [] } catch { return [] }
}
function saveDevices(devices: RemoteDeviceRecord[]): void {
  mkdirSync(getConfigDir(), { recursive: true }); writeFileSync(file(), JSON.stringify({ devices }), { mode: 0o600 })
}
function hosts(): string[] {
  return Object.values(networkInterfaces()).flat().filter(x => x && x.family === 'IPv4' && !x.internal).map(x => x!.address)
}
function lanHosts(): string[] {
  const ranked = rankLanHosts(networkInterfaces())
  return ranked.length ? ranked : hosts()
}
/** 公网入口 Host 白名单：来自设置，形如 roy.382628.xyz */
function publicHosts(): string[] {
  const list = getSettings().mobileRemotePublicHosts
  return Array.isArray(list) ? list.map(h => h.trim().toLowerCase()).filter(Boolean) : []
}
export function mobileRemoteStatus(): MobileRemoteStatus {
  return { enabled: !!getSettings().mobileRemoteEnabled, running: !!server, addresses: server ? lanHosts() : [], devices: server?.deviceList() ?? loadDevices().map(({ tokenHash: _, ...d }) => d), error: lastError || undefined, relay: relayStatus() }
}
setRelayChangeListener(() => {
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('mobile-remote:changed')
})
/** 公网模式且配了中转服务器时，建立 SSH 反向隧道；否则断开 */
async function syncRelay(): Promise<void> {
  const settings = getSettings()
  const target = parseRelayTarget(settings.mobileRemoteRelay)
  if (server && settings.mobileRemoteNetworkMode === 'public' && target && hasProFeature('mobile-remote-public')) await startRelay(target, server.port)
  else stopRelay()
}
export async function setMobileRemoteEnabled(enabled: boolean): Promise<MobileRemoteStatus> {
  updateSettings({ mobileRemoteEnabled: enabled })
  if (enabled) await startMobileRemote(); else stopMobileRemote()
  return mobileRemoteStatus()
}
export async function startMobileRemote(): Promise<void> {
  if (!getSettings().mobileRemoteEnabled || server) return
  gateway = new MobileRemoteGateway(() => server?.notify(), (s, r, i, t) => server?.pushText(s, r, i, t))
  server = new MobileRemoteServer({ html: MOBILE_REMOTE_HTML, devices: loadDevices(), save: saveDevices, hosts, publicHosts, gateway, approve: async (name, address) => {
    // 二维码是一次性的（43 位随机码、5 分钟过期、用过即失效），只有看得到这台电脑屏幕的人能扫到，
    // 所以不再弹确认框；连上后发一条不用点的通知，可在设置 → 手机遥控里随时移除。
    try { if (Notification.isSupported()) new Notification({ title: '手机已连接 Roy', body: `${name}（${address.replace(/^::ffff:/, '')}）已连接，可在设置 → 手机遥控里移除` }).show() } catch { /* 通知失败不影响配对 */ }
    for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('mobile-remote:changed')
    return true
  } })
  // 固定端口 38641：重启 Roy 后手机上的网页还能接着用；被占用才换随机端口
  try {
    try { await server.listen(38641, '0.0.0.0') } catch { await server.listen(0, '0.0.0.0') }
    lastError = ''
  } catch (error) { lastError = error instanceof Error ? error.message : '手机遥控启动失败'; stopMobileRemote(); return }
  try { await syncRelay() } catch (error) { lastError = error instanceof Error ? error.message : '公网中转启动失败' }
}
export function stopMobileRemote(): void { stopRelay(); server?.close(); gateway?.dispose(); server = undefined; gateway = undefined }
/** 切换局域网 / 公网或修改中转服务器后调用 */
export async function refreshMobileRemoteRelay(): Promise<MobileRemoteStatus> {
  try { await syncRelay(); lastError = '' } catch (error) { lastError = error instanceof Error ? error.message : '公网中转启动失败' }
  return mobileRemoteStatus()
}
export async function createMobileRemotePairing(): Promise<MobileRemotePairing> {
  if (!server) throw new Error('请先开启手机遥控')
  const pairing = server.pairCode()
  // 配了公网入口就优先用公网地址：手机不在同一 Wi-Fi 也能扫。
  const mode = getSettings().mobileRemoteNetworkMode
  const publicEntry = mode === 'lan' || !hasProFeature('mobile-remote-public') ? undefined : publicHosts()[0]
  if (mode === 'public' && !hasProFeature('mobile-remote-public')) throw new Error('公网手机遥控需要激活 Pro（设置 → 账号 → 软件激活）；局域网模式免费')
  if (mode === 'public' && !publicEntry) throw new Error('当前选了公网模式，但还没填公网地址')
  if (publicEntry) {
    const url = `https://${publicEntry}/?code=${encodeURIComponent(pairing.code)}`
    return { url, qr: await QRCode.toDataURL(url, { margin: 1, width: 280 }), expiresAt: pairing.expiresAt }
  }
  const address = lanHosts()[0]
  if (!address) throw new Error('没有可用的局域网地址，请确认已连接 Wi-Fi')
  const url = `http://${address}:${server.port}/?code=${encodeURIComponent(pairing.code)}`
  return { url, qr: await QRCode.toDataURL(url, { margin: 1, width: 280 }), expiresAt: pairing.expiresAt }
}
export function revokeMobileRemoteDevice(id: string): MobileRemoteStatus { server?.revoke(id); return mobileRemoteStatus() }
