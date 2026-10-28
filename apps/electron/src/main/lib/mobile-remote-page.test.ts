import { expect, test } from 'bun:test'
import { MOBILE_REMOTE_HTML } from './mobile-remote-page'

// 页面脚本写在 TS 模板字符串里，单个反斜杠会被吃掉（如 /\n$/ 变成真换行），
// 整段脚本语法错误时手机扫码后只看到空白页。这里保证脚本能被解析。
test('手机遥控页面内联脚本语法正确', () => {
  const scripts = [...MOBILE_REMOTE_HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1] ?? '')
  expect(scripts.length).toBeGreaterThan(0)
  for (const src of scripts) expect(() => new Function(src)).not.toThrow()
})
