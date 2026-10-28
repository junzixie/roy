import { expect, test } from 'bun:test'

/**
 * 网页读取节点的选择器与文本提取：
 * xmldom 不支持 querySelector，这里用 tagName + 简单属性匹配兜底。
 * 这些辅助函数逻辑简单但容易写错，单独测一遍。
 */

// 与 light-nodes.ts 内的实现保持一致的纯逻辑（不依赖 DOM）
function parseSimpleSelector(selector: string): { tag?: string; attr?: string; value?: string } | null {
  const text = selector.trim()
  if (!text) return null
  // 形如 tag[attr="value"] / [attr="value"] / tag
  const match = text.match(/^([a-zA-Z][\w-]*)?(?:\[([\w-]+)(?:=(?:"([^"]*)"|'([^']*)'))?\])?$/)
  if (!match) return null
  const attr = match[2] ? match[2].toLowerCase() : undefined
  const value = match[3] ?? match[4] ?? undefined
  return { tag: match[1] ? match[1].toLowerCase() : undefined, attr, value }
}

function normalizeText(raw: string): string {
  return raw
    .replace(/[ \t\r\f]+/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

test('选择器解析：标签 / 属性 / 组合', () => {
  expect(parseSimpleSelector('article')).toEqual({ tag: 'article', attr: undefined, value: undefined })
  expect(parseSimpleSelector('H2')).toEqual({ tag: 'h2', attr: undefined, value: undefined })
  expect(parseSimpleSelector('[data-role="main"]')).toEqual({ tag: undefined, attr: 'data-role', value: 'main' })
  expect(parseSimpleSelector('div[class="post"]')).toEqual({ tag: 'div', attr: 'class', value: 'post' })
  expect(parseSimpleSelector("a[href='#x']")).toEqual({ tag: 'a', attr: 'href', value: '#x' })
})

test('选择器解析：不支持的形式返回 null，不静默匹配全部', () => {
  expect(parseSimpleSelector('div > p')).toBeNull()
  expect(parseSimpleSelector('article h2')).toBeNull()
  expect(parseSimpleSelector('.cls')).toBeNull()
  expect(parseSimpleSelector('')).toBeNull()
})

test('正文整理：压缩空格、去空行、保留段落', () => {
  const raw = '  第一段   文字  \n\n\n\n第二段\t内容\n   \n第三段'
  expect(normalizeText(raw)).toBe('第一段 文字\n\n第二段 内容\n\n第三段')
})

test('正文整理：空内容不产生多余空行', () => {
  expect(normalizeText('   \n\n  ')).toBe('')
})
