/**
 * 受管网页以 Roy 身份出现，但保留 Chromium 兼容 token 供站点正确选择页面能力。
 * 不伪造为其他浏览器，也不添加跨站识别用的自定义请求头。
 *
 * 注意：UA 里的产品 token 保持 "Proma"，上游服务端按它校验（Coding Plan 系列）。
 * 只把函数名与变量名改为 Roy。
 */
const UPSTREAM_UA_PRODUCT = 'Proma'

export function buildRoyBrowserUserAgent(defaultUserAgent: string, royVersion: string): string {
  const base = defaultUserAgent
    .replace(/\s+Electron\/[^\s]+/gi, '')
    .replace(new RegExp(`\\s+${UPSTREAM_UA_PRODUCT}\\/[^\\s]+`, 'gi'), '')
    .trim()
  return `${base} ${UPSTREAM_UA_PRODUCT}/${royVersion}`
}
