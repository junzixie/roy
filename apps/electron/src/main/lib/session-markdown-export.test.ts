import { expect, test } from 'bun:test'
import { buildSessionMarkdown, safeExportFileName, stripInjectedContext } from './session-markdown-export'

test('导出包含用户、回答和工具摘要，去掉注入上下文', () => {
  const md = buildSessionMarkdown('测试会话', [
    { type: 'user', parent_tool_use_id: null, message: { content: [{ type: 'text', text: '<workspace_state>secret</workspace_state>\n帮我查天气' }] } },
    { type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'text', text: '我查一下。' }, { type: 'tool_use', id: '1', name: 'web_search', input: { query: '上海天气' } }] } },
    { type: 'user', parent_tool_use_id: null, message: { content: [{ type: 'tool_result', tool_use_id: '1', content: 'x' }] } },
    { type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'text', text: '晴，25 度。' }] } },
  ] as never, new Date(0))
  expect(md).toContain('# 测试会话')
  expect(md).toContain('## 你\n\n帮我查天气')
  expect(md).not.toContain('secret')
  expect(md).toContain('> 🔧 搜索网页：`上海天气`')
  expect(md.match(/## Roy/g)?.length).toBe(1)
  expect(md).toContain('晴，25 度。')
})

test('文件名安全', () => {
  expect(safeExportFileName('a/b:c*?')).toBe('a b c.md')
  expect(safeExportFileName('')).toBe('会话.md')
  expect(stripInjectedContext('<system-reminder>x</system-reminder>hi')).toBe('hi')
})
