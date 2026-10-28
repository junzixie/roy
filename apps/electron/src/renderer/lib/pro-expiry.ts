/**
 * Pro 到期时间的显示。
 *
 * 账号服务器把永久授权的到期时间设成 3000-01-01（LIFETIME_EXPIRES），
 * 这里看到 2999 年以后的到期时间就当作永久，显示「永久有效」而不是一个遥远的日期。
 */

/** 和服务器 LIFETIME_EXPIRES = Date.UTC(3000, 0, 1) 对应，留一年余量 */
const LIFETIME_THRESHOLD = Date.UTC(2999, 0, 1)

export function isLifetimePro(expiresAt: number | null | undefined): boolean {
  return typeof expiresAt === 'number' && expiresAt >= LIFETIME_THRESHOLD
}

/** 「永久有效」/「有效期到 2027/1/1」/ ''（没有到期时间） */
export function formatProValidity(expiresAt: number | null | undefined): string {
  if (!expiresAt) return ''
  if (isLifetimePro(expiresAt)) return '永久有效'
  return `有效期到 ${new Date(expiresAt).toLocaleDateString('zh-CN')}`
}
