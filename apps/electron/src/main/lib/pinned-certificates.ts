/**
 * 自家服务器（120.26.161.126）用的是按 IP 签发的自签证书：域名备案前，更新源和账号服务都直连 IP。
 * 这里让 Roy 的所有网络会话（包括自动更新）只对这台服务器、只认这一张证书；
 * 其他网站一律交回 Chromium 的默认校验，不放宽任何东西。
 */

import { app, session, type Session } from 'electron'

const PINNED: Record<string, string> = {
  // 与 roy-account.ts 里 SERVER_CERT 是同一张证书（DER 的 SHA-256）
  '120.26.161.126': 'sha256/U00Far0FpqnxtWO62U2cwqxGl5Fq5p0KEHDzqdpwHl0=',
}

function pin(s: Session): void {
  s.setCertificateVerifyProc((request, callback) => {
    const expected = PINNED[request.hostname]
    if (!expected) { callback(-3); return } // -3：沿用 Chromium 默认校验结果
    callback(request.certificate.fingerprint === expected ? 0 : -2) // 0 信任；-2 拒绝
  })
}

let installed = false

/** 在 app ready 之后调用一次：默认会话和之后新建的会话都生效 */
export function installPinnedCertificates(): void {
  if (installed) return
  installed = true
  pin(session.defaultSession)
  app.on('session-created', pin)
}
