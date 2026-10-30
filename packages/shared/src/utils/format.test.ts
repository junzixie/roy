/**
 * `formatBytes` / `formatDuration` 的行为约定。
 *
 * 这两个函数是从 7 个文件里的重复实现收敛来的，各实现精度不同（同一个值
 * 在一处显示 `1.5 MB`、另一处 `1.50 MB`）。这些用例把统一后的规则钉住，
 * 避免以后又被就地改成各写一份。
 */

import { describe, expect, test } from 'bun:test'
import { formatBytes, formatDuration } from './format'

describe('formatBytes', () => {
  test('Given 0 或负数 When 格式化 Then 显示 0 B', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(-1)).toBe('0 B')
    expect(formatBytes(-1024)).toBe('0 B')
  })

  test('Given 不足 1 KB When 格式化 Then 不带小数', () => {
    expect(formatBytes(1)).toBe('1 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1023)).toBe('1023 B')
  })

  test('Given 恰好 1 KB When 格式化 Then 进位到 KB', () => {
    expect(formatBytes(1024)).toBe('1.0 KB')
  })

  test('Given 常见大小 When 格式化 Then 保留一位小数', () => {
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB')
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1.0 GB')
    expect(formatBytes(1024 * 1024 * 1024 * 1024)).toBe('1.0 TB')
  })

  test('Given 跨多级单位的大数 When 格式化 Then 直接跳到合适单位', () => {
    // 1.5 GB，不会显示成 1536.0 MB
    expect(formatBytes(1024 * 1024 * 1024 * 1.5)).toBe('1.5 GB')
  })

  test('Given 非法输入 When 格式化 Then 返回空串而不是 NaN', () => {
    expect(formatBytes(null)).toBe('')
    expect(formatBytes(undefined)).toBe('')
    expect(formatBytes(Number.NaN)).toBe('')
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe('')
  })
})

describe('formatDuration', () => {
  test('Given 不足 1 秒 When 格式化 Then 用 ms', () => {
    expect(formatDuration(0)).toBe('0ms')
    expect(formatDuration(850)).toBe('850ms')
    expect(formatDuration(999)).toBe('999ms')
  })

  test('Given 秒级时长 When 格式化 Then 保留一位小数', () => {
    expect(formatDuration(1000)).toBe('1.0s')
    expect(formatDuration(3200)).toBe('3.2s')
  })

  test('Given 分钟级时长 When 格式化 Then 分钟+补零秒', () => {
    expect(formatDuration(60_000)).toBe('1m00s')
    expect(formatDuration(312_000)).toBe('5m12s')
    expect(formatDuration(65_000)).toBe('1m05s')
  })

  test('Given 秒数四舍五入到 60 When 格式化 Then 进位到下一分钟而不是显示 5m60s', () => {
    // 5 分 59.7 秒 → 秒数四舍五入为 60，必须进位
    expect(formatDuration(359_700)).toBe('6m')
  })

  test('Given 小时级时长 When 格式化 Then 小时+补零分钟', () => {
    expect(formatDuration(3_600_000)).toBe('1h00m')
    expect(formatDuration(7_500_000)).toBe('2h05m')
  })

  test('Given 非法输入 When 格式化 Then 返回空串', () => {
    expect(formatDuration(null)).toBe('')
    expect(formatDuration(undefined)).toBe('')
    expect(formatDuration(-1)).toBe('')
    expect(formatDuration(Number.NaN)).toBe('')
  })
})
