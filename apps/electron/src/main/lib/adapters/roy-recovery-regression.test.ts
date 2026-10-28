import { describe, expect, test } from 'bun:test'
import { parseThinkTagsFromText } from '@roy/session-core'
import { convertResultMessage } from './pi-message-adapter'
import { attachedImagePaths, preflightAttachedImages } from './vision-attachment-preflight'
const result = (stopReason: string, text = '', errorMessage?: string) => convertResultMessage([{ role: 'assistant', stopReason, errorMessage, content: [{ type: 'text', text }] } as never], 'test') as unknown as { subtype: string; terminal_reason: string; errors?: string[] }
describe('标签与终态回归', () => {
  test('thinking标签分离', () => expect(parseThinkTagsFromText('<thinking>分析</thinking>答复')).toEqual([{ type: 'thinking', thinking: '分析' }, { type: 'text', text: '答复' }]))
  test('未闭合标签和半片段不进入正文', () => {
    expect(parseThinkTagsFromText('<thi')).toEqual([])
    expect(parseThinkTagsFromText('<thinking>分析')).toEqual([{ type: 'thinking', thinking: '分析' }])
  })
  test('代码示例保留', () => {
    const text = '```xml\n<thinking>示例</thinking>\n```\n`<think>`'
    expect(parseThinkTagsFromText(text)).toEqual([{ type: 'text', text }])
  })
  test('孤立闭合标签不泄漏', () => expect(parseThinkTagsFromText('</thinking>答复')).toEqual([{ type: 'text', text: '答复' }]))
  test('供应商空错误仍为失败', () => { expect(result('error').subtype).toBe('error_during_execution'); expect(result('error').terminal_reason).toBe('error') })
  test('取消不标成功', () => expect(result('aborted').terminal_reason).toBe('aborted'))
  test('仅承诺不标成功', () => expect(result('stop', '我这就去读取文件').subtype).toBe('error_during_execution'))
  test('正常完成不受影响', () => expect(result('stop', '已核对，结果一致。').subtype).toBe('success'))
  test('内容过滤保留原始原因', () => expect(result('error', '', 'Provider finish_reason: content_filter').errors).toEqual(['Provider finish_reason: content_filter']))
})
describe('附件预处理', () => {
  const prompt = '<attached_files>\n- 图: C:\\images\\a.png\n- 重复: C:\\images\\a.png\n- 文档: C:\\a.pdf\n</attached_files>\n查看图片'
  test('只解析附件且去重', () => { expect(attachedImagePaths(prompt)).toHaveLength(1); expect(attachedImagePaths('看看 C:\\a.png')).toEqual([]) })
  test('无附件不调用视觉请求', async () => { let calls = 0; expect(await preflightAttachedImages('你好', async () => { calls++; return {} }, new AbortController().signal)).toBe('你好'); expect(calls).toBe(0) })
  test('失败明确注入，不伪装成功', async () => { const out = await preflightAttachedImages(prompt, async () => ({ ok: false, code: 'VISION_PROVIDER_ERROR' }), new AbortController().signal); expect(out).toContain('VISION_PROVIDER_ERROR'); expect(out).toContain('不可信资料') })
  test('取消后不再调用', async () => { const c = new AbortController(); c.abort(); let calls = 0; await expect(preflightAttachedImages(prompt, async () => { calls++; return {} }, c.signal)).rejects.toThrow(); expect(calls).toBe(0) })
  test('自动识图上限', async () => { const p = '<attached_files>\n' + Array.from({ length: 6 }, (_, i) => `- 图: C:/img/${i}.png`).join('\n') + '\n</attached_files>'; let calls = 0; const out = await preflightAttachedImages(p, async () => { calls++; return {} }, new AbortController().signal); expect(calls).toBe(4); expect(out).toContain('skipped') })
})

describe('协议显示隔离', () => {
  test('DSML正文不显示且不执行', () => expect(parseThinkTagsFromText('<｜DSML｜ calls><｜DSML｜ invoke name="bash">命令</｜DSML｜ calls>答复')).toEqual([{ type: 'text', text: '答复' }]))
  test('协议半片段不显示', () => expect(parseThinkTagsFromText('<｜DSM')).toEqual([]))
  test('代码围栏中的协议示例保留', () => { const text = '```xml\n<｜DSML｜ calls>示例</｜DSML｜ calls>\n```'; expect(parseThinkTagsFromText(text)).toEqual([{ type: 'text', text }]) })
})
