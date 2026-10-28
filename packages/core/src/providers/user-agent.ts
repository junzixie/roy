// UA 标识符改为 Roy，但保留 "Proma/<version>" 字面量：
// 上游（Kimi Coding Plan / 智谱 Coding / 小米 Token Plan）按 Proma UA 校验，改成 Roy 会被 403。
// 只改导出名与变量名，不改协议串。

export const ROY_REPO_URL = 'https://github.com/roy-ai/Roy'

let _royVersion = '0.0.0'

export function setRoyVersion(version: string): void {
  _royVersion = version
}

export function getRoyVersion(): string {
  return _royVersion
}

/** 上游服务端按 "Proma/<version>" 校验，不要改这个字面量。 */
const UPSTREAM_UA_PRODUCT = 'Proma'

export function getRoyUserAgent(version?: string): string {
  const v = version ?? _royVersion
  return `${UPSTREAM_UA_PRODUCT}/${v} (+${ROY_REPO_URL})`
}
