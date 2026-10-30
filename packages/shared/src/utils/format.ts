/**
 * 人类可读的数值格式化。
 *
 * 这些函数以前在渲染层各写一份：`formatBytes` 有 6 个实现、`formatDuration` 有
 * 3 个，精度各不相同（同一个 1.5 MB 在一处显示 `1.5 MB`、另一处 `1.50 MB`）。
 * 收敛到这里之后，所有界面上的同一类数字用同一套规则。
 */

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'] as const

/**
 * 把字节数格式化成 `1.5 MB` 这样的字符串。
 *
 * 规则：
 * - `0` / 负数 → `0 B`
 * - 不足 1 KB 时不带小数（`512 B`，而不是 `512.0 B`）
 * - 其余保留一位小数
 * - 非法值（NaN / Infinity / null / undefined）→ 空串，调用方直接渲染成空
 *
 * @param bytes - 字节数。
 * @returns 可直接展示的字符串。
 */
export function formatBytes(bytes?: number | null): string {
  if (bytes == null || !Number.isFinite(bytes)) return ''
  if (bytes <= 0) return '0 B'

  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024
    unit += 1
  }
  // 字节单位下的小数没有意义
  return unit === 0 ? `${Math.round(value)} ${BYTE_UNITS[unit]}` : `${value.toFixed(1)} ${BYTE_UNITS[unit]}`
}

/**
 * 把毫秒格式化成紧凑的时长。
 *
 * - 不足 1 秒 → `850ms`
 * - 不足 1 分钟 → `3.2s`
 * - 不足 1 小时 → `5m12s`
 * - 其余 → `2h05m`
 *
 * @param ms - 毫秒数。
 * @returns 可直接展示的字符串；非法值返回空串。
 */
export function formatDuration(ms?: number | null): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return ''
  if (ms < 1000) return `${Math.round(ms)}ms`
  const totalSeconds = ms / 1000
  if (totalSeconds < 60) return `${totalSeconds.toFixed(1)}s`

  const totalMinutes = Math.floor(totalSeconds / 60)
  const seconds = Math.round(totalSeconds - totalMinutes * 60)
  if (totalMinutes < 60) {
    // 四舍五入到 60 秒时进位，避免出现 `5m60s`
    return seconds === 60 ? `${totalMinutes + 1}m` : `${totalMinutes}m${String(seconds).padStart(2, '0')}s`
  }

  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes - hours * 60
  return `${hours}h${String(minutes).padStart(2, '0')}m`
}
