// Roy 公网入口（运行在中转服务器上，cloudflared: roy.382628.xyz -> 127.0.0.1:38642）
//  - /roy-update/*  静默更新文件（latest.yml、安装包、blockmap），支持 Range / 多段 Range（差量更新）
//  - 其余请求       转发到 127.0.0.1:38643，即电脑上 Roy 通过 SSH 反向隧道接进来的手机遥控服务
import http from 'node:http'
import { createReadStream, statSync } from 'node:fs'
import { join, normalize, extname, sep } from 'node:path'
import { randomBytes } from 'node:crypto'

const LISTEN_PORT = Number(process.env.ROY_FRONT_PORT || 38642)
const BACKEND_PORT = Number(process.env.ROY_BACKEND_PORT || 38643)
const UPDATE_ROOT = process.env.ROY_UPDATE_ROOT || '/data/lzx/roy-update'
const TYPES = { '.yml': 'text/yaml; charset=utf-8', '.yaml': 'text/yaml; charset=utf-8', '.exe': 'application/octet-stream', '.blockmap': 'application/octet-stream', '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.zip': 'application/zip', '.dmg': 'application/octet-stream' }

function serveUpdate(req, res, rel) {
  const file = normalize(join(UPDATE_ROOT, decodeURIComponent(rel)))
  if (!file.startsWith(UPDATE_ROOT + sep)) { res.writeHead(403).end(); return }
  let st
  try { st = statSync(file) } catch { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found'); return }
  if (!st.isFile()) { res.writeHead(404).end(); return }
  const type = TYPES[extname(file).toLowerCase()] || 'application/octet-stream'
  const base = { 'Accept-Ranges': 'bytes', 'Last-Modified': st.mtime.toUTCString(), 'Cache-Control': extname(file) === '.yml' ? 'no-cache' : 'public, max-age=3600' }
  const range = req.headers.range
  const m = range && /^bytes=(.+)$/.exec(range)
  if (!m) {
    res.writeHead(200, { ...base, 'Content-Type': type, 'Content-Length': st.size })
    if (req.method === 'HEAD') return res.end()
    createReadStream(file).pipe(res); return
  }
  const parts = m[1].split(',').map(s => s.trim()).map(s => {
    const [a, b] = s.split('-')
    let start = a === '' ? st.size - Number(b) : Number(a)
    let end = a === '' || b === '' || b === undefined ? st.size - 1 : Number(b)
    if (a !== '' && b === '') end = st.size - 1
    return { start: Math.max(0, start), end: Math.min(end, st.size - 1) }
  }).filter(p => Number.isFinite(p.start) && Number.isFinite(p.end) && p.start <= p.end)
  if (!parts.length) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }).end(); return }
  if (parts.length === 1) {
    const { start, end } = parts[0]
    res.writeHead(206, { ...base, 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 })
    if (req.method === 'HEAD') return res.end()
    createReadStream(file, { start, end }).pipe(res); return
  }
  const boundary = randomBytes(12).toString('hex')
  const heads = parts.map(p => `\r\n--${boundary}\r\nContent-Type: ${type}\r\nContent-Range: bytes ${p.start}-${p.end}/${st.size}\r\n\r\n`)
  const tail = `\r\n--${boundary}--\r\n`
  const length = heads.reduce((n, h, i) => n + Buffer.byteLength(h) + parts[i].end - parts[i].start + 1, 0) + Buffer.byteLength(tail)
  res.writeHead(206, { ...base, 'Content-Type': `multipart/byteranges; boundary=${boundary}`, 'Content-Length': length })
  if (req.method === 'HEAD') return res.end()
  let i = 0
  const next = () => {
    if (i >= parts.length) { res.end(tail); return }
    const p = parts[i]; res.write(heads[i]); i++
    const s = createReadStream(file, { start: p.start, end: p.end })
    s.on('error', () => res.destroy()); s.on('end', next); s.pipe(res, { end: false })
  }
  next()
}

const OFFLINE = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Roy</title><body style="font:16px/1.6 -apple-system,sans-serif;padding:40px 24px;color:#333"><h2>电脑上的 Roy 暂时连不上</h2><p>请确认电脑已开机、Roy 正在运行，并在 设置 → 手机遥控 里选了「公网」。连上后刷新本页即可。</p></body>'

function proxy(req, res) {
  const up = http.request({ host: '127.0.0.1', port: BACKEND_PORT, method: req.method, path: req.url, headers: req.headers }, (r) => {
    res.writeHead(r.statusCode || 502, r.headers)
    r.pipe(res)
  })
  up.on('error', () => {
    if (res.headersSent) { res.destroy(); return }
    const wantsHtml = (req.headers.accept || '').includes('text/html')
    res.writeHead(502, { 'Content-Type': wantsHtml ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
    res.end(wantsHtml ? OFFLINE : JSON.stringify({ error: '电脑上的 Roy 暂时连不上，请确认电脑已开机且 Roy 正在运行' }))
  })
  req.on('aborted', () => up.destroy())
  res.on('close', () => up.destroy())
  req.pipe(up)
}

const server = http.createServer((req, res) => {
  const path = (req.url || '/').split('?')[0]
  if (path === '/roy-front/health') { res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok'); return }
  if (path.startsWith('/roy-update/') && (req.method === 'GET' || req.method === 'HEAD')) { serveUpdate(req, res, path.slice('/roy-update/'.length)); return }
  proxy(req, res)
})
server.keepAliveTimeout = 65_000
server.requestTimeout = 0
server.listen(LISTEN_PORT, '127.0.0.1', () => console.log(`[roy-front] :${LISTEN_PORT} -> update ${UPDATE_ROOT}, backend :${BACKEND_PORT}`))
