import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http'
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { isIP } from 'node:net'
import type { MobileRemoteDevice } from '../../types/mobile-remote'

/** deviceKeyHash：手机浏览器里保存的随机标识的哈希；同一台手机重新扫码时据此替换旧记录 */
export interface RemoteDeviceRecord extends MobileRemoteDevice { tokenHash: string; deviceKeyHash?: string }
export interface RemoteGateway {
  bootstrap(): unknown
  search(query: string): unknown
  sessions(): unknown
  conversation(id: string, before?: number): unknown
  create(input: Record<string, unknown>): unknown
  send(id: string, input: Record<string, unknown>): unknown
  stop(id: string): unknown
  respond(id: string, input: Record<string, unknown>): unknown
}
interface Options {
  html: string
  devices: RemoteDeviceRecord[]
  save: (devices: RemoteDeviceRecord[]) => void
  approve: (name: string, address: string) => Promise<boolean>
  gateway: RemoteGateway
  /** 每次请求现查本机局域网 IP，换 Wi-Fi 后不用重启服务 */
  hosts: () => string[]
  /**
   * 公网入口的 Host 白名单（如 roy.382628.xyz）。
   * 配了以后，经反向代理/隧道转发进来的请求才被接受；没配就只能局域网访问。
   * 只放行 Host，不代表不验证身份：每个 API 仍需要已配对的 Bearer token。
   */
  publicHosts?: () => string[]
}
class RequestError extends Error { constructor(readonly status: number, message: string) { super(message) } }
const digest = (s: string): string => createHash('sha256').update(s).digest('hex')
export function isPrivateRemoteAddress(address: string): boolean {
  const ip = address.replace(/^::ffff:/, '')
  if (isIP(ip) !== 4) return false
  const [a, b] = ip.split('.').map(Number)
  return ip === '127.0.0.1' || a === 10 || (a === 192 && b === 168) || (a === 172 && b! >= 16 && b! <= 31) || (a === 169 && b === 254)
}
export class MobileRemoteServer {
  private server?: Server
  private devices: RemoteDeviceRecord[]
  private pairing?: { hash: string; expiresAt: number }
  private pairingBusy = false
  private clients = new Set<{ response: ServerResponse; deviceId: string }>()
  private sockets = new Set<import('node:net').Socket>()
  private rates = new Map<string, { count: number; until: number }>()
  private heartbeat?: ReturnType<typeof setInterval>
  private notifyTimer?: ReturnType<typeof setTimeout>
  port = 0
  constructor(private readonly options: Options) { this.devices = options.devices.slice(0, 10) }
  deviceList(): MobileRemoteDevice[] { return this.devices.map(({ tokenHash: _, ...device }) => ({ ...device })) }
  pairCode(): { code: string; expiresAt: number } {
    if (!this.server) throw new Error('请先开启手机遥控')
    const code = randomBytes(32).toString('base64url')
    const expiresAt = Date.now() + 5 * 60_000
    this.pairing = { hash: digest(code), expiresAt }
    return { code, expiresAt }
  }
  revoke(id: string): void {
    const next = this.devices.filter(d => d.id !== id)
    this.options.save(next)
    this.devices = next
    for (const client of this.clients) if (client.deviceId === id) client.response.end()
  }
  async listen(port = 0, host = '0.0.0.0'): Promise<void> {
    if (this.server) return
    const server = createServer((req, res) => { void this.handle(req, res).catch(error => {
      if (res.headersSent) { res.end(); return }
      this.json(res, error instanceof RequestError ? error.status : 500, { error: error instanceof RequestError ? error.message : '操作失败，请在电脑端检查 Roy 状态' })
    }) })
    this.server = server
    server.requestTimeout = 20_000
    server.headersTimeout = 10_000
    server.maxHeadersCount = 40
    server.on('connection', socket => { this.sockets.add(socket); socket.on('close', () => this.sockets.delete(socket)) })
    try {
      await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(port, host, () => { server.off('error', reject); resolve() }) })
      const addr = server.address()
      this.port = addr && typeof addr !== 'string' ? addr.port : 0
      this.heartbeat = setInterval(() => {
        for (const [key, value] of this.rates) if (value.until < Date.now()) this.rates.delete(key)
        for (const client of this.clients) {
          if (!this.devices.some(d => d.id === client.deviceId)) client.response.end()
          else if (!client.response.write(': heartbeat\n\n')) client.response.end()
        }
        // 审批变化、应用外部入口运行状态的兜底同步；不传整段历史。
        this.notify()
      }, 5000)
      this.heartbeat.unref()
    } catch (error) { this.server = undefined; server.close(); throw error instanceof Error ? error : new Error(String(error)) }
  }
  close(): void {
    this.pairing = undefined
    if (this.heartbeat) clearInterval(this.heartbeat)
    if (this.notifyTimer) clearTimeout(this.notifyTimer)
    if (this.textTimer) clearTimeout(this.textTimer)
    this.pendingText.clear()
    this.heartbeat = undefined; this.notifyTimer = undefined; this.textTimer = undefined
    for (const client of this.clients) client.response.end()
    this.clients.clear()
    for (const socket of this.sockets) socket.destroy()
    this.server?.close(); this.server = undefined; this.port = 0
  }
  private pendingText = new Map<string, { s: string; r: string; i: number; d: string }>()
  private textTimer?: ReturnType<typeof setTimeout>
  /** 正文增量：攒 50ms 合并后推给所有在线手机（event: text） */
  pushText(sessionId: string, rowId: string, index: number, text: string): void {
    const key = `${sessionId}|${rowId}|${index}`
    const prev = this.pendingText.get(key)
    if (prev) prev.d += text
    else this.pendingText.set(key, { s: sessionId, r: rowId, i: index, d: text })
    if (this.textTimer) return
    this.textTimer = setTimeout(() => {
      this.textTimer = undefined
      const items = [...this.pendingText.values()]
      this.pendingText.clear()
      const frame = `event: text\ndata: ${JSON.stringify(items)}\n\n`
      for (const client of this.clients) if (!client.response.write(frame)) client.response.end()
    }, 50)
    this.textTimer.unref()
  }
  notify(): void {
    if (this.notifyTimer) return
    this.notifyTimer = setTimeout(() => {
      this.notifyTimer = undefined
      for (const client of this.clients) if (!client.response.write('data: refresh\n\n')) client.response.end()
    }, 400)
    this.notifyTimer.unref()
  }
  private json(res: ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body))
  }
  private rate(key: string, max: number): void {
    let value = this.rates.get(key)
    if (!value || value.until < Date.now()) {
      if (this.rates.size > 4096) throw new RequestError(429, '访问过于频繁，请稍后重试')
      value = { count: 0, until: Date.now() + 60_000 }; this.rates.set(key, value)
    }
    if (++value.count > max) throw new RequestError(429, '访问过于频繁，请稍后重试')
  }
  private async body(req: IncomingMessage): Promise<Record<string, unknown>> {
    if (req.headers['content-type'] !== 'application/json') throw new RequestError(415, '仅接受 JSON 请求')
    let length = 0
    const chunks: Buffer[] = []
    for await (const chunk of req) {
      const b = Buffer.from(chunk); length += b.length
      if (length > 96 * 1024) throw new RequestError(413, '消息过长，请分段发送')
      chunks.push(b)
    }
    try {
      const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error()
      return value as Record<string, unknown>
    } catch { throw new RequestError(400, '请求格式不正确') }
  }
  private authenticate(req: IncomingMessage): RemoteDeviceRecord {
    const token = req.headers.authorization?.replace(/^Bearer /, '') ?? ''
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new RequestError(401, '请重新配对手机')
    const hash = digest(token)
    const device = this.devices.find(d => d.tokenHash === hash)
    if (!device) throw new RequestError(401, '配对已失效，请重新扫码')
    device.lastSeenAt = Date.now()
    return device
  }
  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
    if (!this.server) throw new RequestError(503, '手机遥控已关闭')
    const address = req.socket.remoteAddress ?? ''
    const host = req.headers.host ?? ''
    // 公网入口（Cloudflare 隧道 / 反向代理）会把请求从本机回环转发进来，
    // 所以先看 Host 是否在白名单里，命中就跳过私有 IP 限制。
    const publicHosts = this.options.publicHosts?.() ?? []
    const isPublicEntry = publicHosts.length > 0 && publicHosts.includes(host)
    if (!isPublicEntry && !isPrivateRemoteAddress(address)) throw new RequestError(403, '只允许局域网访问')
    const validHosts = [...this.options.hosts().map(ip => `${ip}:${this.port}`), ...publicHosts]
    if (!validHosts.includes(host)) throw new RequestError(403, '访问地址无效，请重新扫码')
    const origin = req.headers.origin
    // 公网入口走 https，Origin 是 https://域名；局域网是 http://ip:端口
    const allowedOrigins = isPublicEntry ? [`https://${host}`, `http://${host}`] : [`http://${host}`]
    if ((origin && !allowedOrigins.includes(origin)) || req.headers['sec-fetch-site'] === 'cross-site') throw new RequestError(403, '不允许跨站请求')
    const url = new URL(req.url ?? '/', `${isPublicEntry ? 'https' : 'http'}://${host}`)
    if (url.pathname === '/' && req.method === 'GET') {
      this.rate(`page:${address}`, 90)
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(this.options.html); return
    }
    if (url.pathname === '/api/pair' && req.method === 'POST') {
      this.rate(`pair:${address}`, 6)
      const input = await this.body(req)
      const code = typeof input.code === 'string' ? input.code : ''
      const pairing = this.pairing
      if (!pairing || pairing.expiresAt < Date.now() || code.length !== 43 || !timingSafeEqual(Buffer.from(digest(code)), Buffer.from(pairing.hash))) throw new RequestError(403, '二维码已过期或失效，请在电脑上重新生成')
      if (this.pairingBusy) throw new RequestError(409, '另一台手机正在连接，请稍后再扫')
      const deviceKey = typeof input.deviceKey === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(input.deviceKey) ? input.deviceKey : ''
      const deviceKeyHash = deviceKey ? digest(deviceKey) : undefined
      const sameDevice = deviceKeyHash ? this.devices.find(d => d.deviceKeyHash === deviceKeyHash) : undefined
      if (!sameDevice && this.devices.length >= 10) throw new RequestError(409, '已配对手机达到上限，请在电脑端移除旧设备')
      this.pairingBusy = true
      try {
        const name = (typeof input.name === 'string' ? input.name : '我的手机').replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 60) || '我的手机'
        const approved = await this.options.approve(name, address)
        if (!approved || this.pairing !== pairing || pairing.expiresAt < Date.now() || !this.server) throw new RequestError(403, '二维码已失效，请在电脑上重新生成')
        this.pairing = undefined
        const token = randomBytes(32).toString('base64url')
        const now = Date.now()
        // 同一台手机：沿用原来的记录（旧令牌作废），列表里不会多出一行
        const device: RemoteDeviceRecord = { id: sameDevice?.id ?? randomUUID(), name, tokenHash: digest(token), pairedAt: now, lastSeenAt: now, ...(deviceKeyHash ? { deviceKeyHash } : {}) }
        const next = sameDevice ? this.devices.map(d => d.id === sameDevice.id ? device : d) : [...this.devices, device]
        if (sameDevice) for (const client of this.clients) if (client.deviceId === sameDevice.id) client.response.end()
        this.options.save(next); this.devices = next
        this.json(res, 200, { token, device: { id: device.id, name } }); return
      } finally { this.pairingBusy = false }
    }
    this.rate(`api:${address}`, 180)
    // 手机浏览器的事件流不能带请求头，只有这一条允许用网址里的 token，且要在校验身份之前取出
    if (url.pathname === '/api/events' && req.method === 'GET') {
      const queryToken = url.searchParams.get('token') ?? ''
      if (queryToken) req.headers.authorization = `Bearer ${queryToken}`
    }
    const device = this.authenticate(req)
    if (url.pathname === '/api/events' && req.method === 'GET') {
      if ([...this.clients].filter(c => c.deviceId === device.id).length >= 3) throw new RequestError(429, '此手机打开的页面太多，请关闭重复页面')
      // X-Accel-Buffering：经过反向代理 / 隧道时也不要攒包，字要一个个到
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no', Connection: 'keep-alive' })
      res.socket?.setNoDelay(true)
      res.write('data: refresh\n\n')
      const client = { response: res, deviceId: device.id }; this.clients.add(client)
      res.on('close', () => this.clients.delete(client)); return
    }
    const gateway = this.options.gateway
    if (req.method === 'GET' && url.pathname === '/api/bootstrap') { this.json(res, 200, gateway.bootstrap()); return }
    if (req.method === 'GET' && url.pathname === '/api/sessions') { this.json(res, 200, gateway.sessions()); return }
    if (req.method === 'GET' && url.pathname === '/api/search') { this.json(res, 200, await gateway.search(url.searchParams.get('q') ?? '')); return }
    const match = /^\/api\/sessions\/([a-zA-Z0-9_-]{1,100})(?:\/(send|stop|respond))?$/.exec(url.pathname)
    if (match && req.method === 'GET' && !match[2]) {
      const value = url.searchParams.get('before')
      const before = value === null ? undefined : Number(value)
      if (before !== undefined && (!Number.isInteger(before) || before < 0)) throw new RequestError(400, '历史位置无效')
      this.json(res, 200, await gateway.conversation(match[1]!, before)); return
    }
    if (req.method === 'POST') {
      const input = await this.body(req)
      if (url.pathname === '/api/sessions') { this.json(res, 200, await gateway.create(input)); this.notify(); return }
      if (url.pathname === '/api/logout') { this.revoke(device.id); this.json(res, 200, { ok: true }); return }
      if (match) {
        let result: unknown
        if (match[2] === 'send') result = await gateway.send(match[1]!, input)
        else if (match[2] === 'stop') result = await gateway.stop(match[1]!)
        else if (match[2] === 'respond') result = await gateway.respond(match[1]!, input)
        else throw new RequestError(404, '操作不存在')
        this.json(res, 200, result ?? { ok: true }); this.notify(); return
      }
    }
    throw new RequestError(404, '页面不存在')
  }
}
