import { expect, test } from 'bun:test'
import { MobileRemoteServer, isPrivateRemoteAddress, type RemoteGateway } from './mobile-remote-server'
const gateway: RemoteGateway = { bootstrap: () => ({ ok: true }), search: () => ({ results: [] }), sessions: () => ({ sessions: [] }), conversation: () => ({ messages: [] }), create: () => ({ id: 's' }), send: () => ({ ok: true }), stop: () => ({ ok: true }), respond: () => ({ ok: true }) }
test('仅允许私有 IPv4', () => { expect(isPrivateRemoteAddress('192.168.1.8')).toBe(true); expect(isPrivateRemoteAddress('::ffff:10.0.0.2')).toBe(true); expect(isPrivateRemoteAddress('8.8.8.8')).toBe(false); expect(isPrivateRemoteAddress('::1')).toBe(false) })
test('配对码一次有效且需电脑批准', async () => {
  const saved: unknown[] = []
  let approved = false
  const server = new MobileRemoteServer({ html: '<html>Roy</html>', devices: [], save: devices => { saved.push(devices) }, hosts: () => ['127.0.0.1'], gateway, approve: async () => approved })
  await server.listen(0, '127.0.0.1')
  const pairing = server.pairCode(); const base = `http://127.0.0.1:${server.port}`
  const page = await fetch(base); if (page.status !== 200) throw new Error(await page.text()); expect(page.status).toBe(200)
  approved = false
  expect((await fetch(base + '/api/pair', { method: 'POST', headers: { 'Content-Type': 'application/json', Host: `127.0.0.1:${server.port}` }, body: JSON.stringify({ code: pairing.code, name: '手机' }) })).status).toBe(403)
  approved = true
  const ok = await fetch(base + '/api/pair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: pairing.code, name: '手机' }) })
  expect(ok.status).toBe(200); const token = (await ok.json()).token
  expect((await fetch(base + '/api/bootstrap', { headers: { Authorization: `Bearer ${token}` } })).status).toBe(200)
  expect((await fetch(base + '/api/pair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: pairing.code }) })).status).toBe(403)
  server.revoke((saved[0] as [{ id: string }])[0].id)
  expect((await fetch(base + '/api/sessions', { headers: { Authorization: `Bearer ${token}` } })).status).toBe(401)
  server.close()
})
test('事件流可用网址 token 连接，地址不符会被拒', async () => {
  const server = new MobileRemoteServer({ html: '<html>Roy</html>', devices: [], save: () => {}, hosts: () => ['127.0.0.1'], gateway, approve: async () => true })
  await server.listen(0, '127.0.0.1')
  const base = `http://127.0.0.1:${server.port}`
  const pairing = server.pairCode()
  const token = (await (await fetch(base + '/api/pair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: pairing.code }) })).json()).token
  expect((await fetch(base + '/api/events')).status).toBe(401)
  const controller = new AbortController()
  const events = await fetch(base + '/api/events?token=' + token, { signal: controller.signal })
  expect(events.status).toBe(200)
  expect(events.headers.get('content-type')).toContain('text/event-stream')
  controller.abort()
  expect((await fetch(`http://localhost:${server.port}/`)).status).toBe(403)
  server.close()
})

test('公网入口：Host 白名单放行，未配置时仍然拒绝', async () => {
  const devices: never[] = []
  const base = { html: '<html>Roy</html>', devices, save: () => {}, gateway, approve: async () => true }
  // 未配公网入口：外部 Host 一律拒绝
  const strict = new MobileRemoteServer({ ...base, hosts: () => ['127.0.0.1'] })
  await strict.listen(0, '127.0.0.1')
  const strictBase = `http://127.0.0.1:${strict.port}`
  expect((await fetch(strictBase + '/', { headers: { Host: 'roy.382628.xyz' } })).status).toBe(403)
  strict.close()

  // 配了公网入口：该 Host 通过，其他 Host 仍拒绝
  const open = new MobileRemoteServer({ ...base, hosts: () => ['127.0.0.1'], publicHosts: () => ['roy.382628.xyz'] })
  await open.listen(0, '127.0.0.1')
  const openBase = `http://127.0.0.1:${open.port}`
  const okPage = await fetch(openBase + '/', { headers: { Host: 'roy.382628.xyz' } })
  expect(okPage.status).toBe(200)
  expect((await fetch(openBase + '/', { headers: { Host: 'evil.example.com' } })).status).toBe(403)
  // 公网 Host 下 API 仍然要 token，不能白拿
  expect((await fetch(openBase + '/api/bootstrap', { headers: { Host: 'roy.382628.xyz' } })).status).toBe(401)
  open.close()
})

test('正文增量通过事件流逐段推给手机（合并后发送）', async () => {
  const server = new MobileRemoteServer({ html: '<html>Roy</html>', devices: [], save: () => {}, hosts: () => ['127.0.0.1'], gateway, approve: async () => true })
  await server.listen(0, '127.0.0.1')
  const base = `http://127.0.0.1:${server.port}`
  const token = (await (await fetch(base + '/api/pair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: server.pairCode().code }) })).json()).token
  const controller = new AbortController()
  const events = await fetch(base + '/api/events?token=' + token, { signal: controller.signal })
  const reader = events.body!.getReader()
  server.pushText('s1', 'row1', 0, '你')
  server.pushText('s1', 'row1', 0, '好')
  let text = ''
  const decoder = new TextDecoder()
  while (!text.includes('event: text')) text += decoder.decode((await reader.read()).value)
  while (!text.includes('\n\n', text.indexOf('event: text'))) text += decoder.decode((await reader.read()).value)
  const frame = text.slice(text.indexOf('event: text'))
  const items = JSON.parse((frame.split('\n')[1] ?? '').replace(/^data: /, ''))
  expect(items).toEqual([{ s: 's1', r: 'row1', i: 0, d: '你好' }])
  controller.abort()
  server.close()
})
