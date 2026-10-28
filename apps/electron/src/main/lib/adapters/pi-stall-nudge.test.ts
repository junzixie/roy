import { describe, expect, test } from 'bun:test'
import { buildStallNudge, cleanStalledAssistant, convertPiMessage, convertResultMessage, detectStalledTurn, isInternalStallNudge, stripLeakedToolMarkup } from './pi-message-adapter'

const assistant = (content: unknown[], stopReason = 'stop') => ({ role: 'assistant', content, stopReason } as never)
const DSML = '<｜DSML｜ calls> <｜DSML｜ invoke name="bash"> <｜DSML｜ parameter name="command" string="true">ls ~/.libtv</｜DSML｜ parameter> </｜DSML｜ invoke> </｜DSML｜ calls>'

describe('只说不做识别', () => {
  test('工具调用原文漏进正文', () => {
    expect(detectStalledTurn(assistant([{ type: 'text', text: '先确认版本。\n\n' + DSML }]))).toBe('leaked-tool-markup')
  })
  test('正文和思考一样', () => {
    const t = 'Skill installed. Now check account info.'
    expect(detectStalledTurn(assistant([{ type: 'thinking', thinking: t }, { type: 'text', text: t }]))).toBe('echoed-thinking')
  })
  test('只说一句我这就去做', () => {
    expect(detectStalledTurn(assistant([{ type: 'text', text: '好的，我先来检查一下安装目录：' }]))).toBe('promise-only')
  })
  test('中文「我再…」也算只说不动手', () => {
    // 实测原话：这句被判成 stop，一句提醒都没发，任务停在半路
    expect(detectStalledTurn(assistant([{ type: 'text', text: '`mirror` 存的是从别的产品摘录的源码，存在授权风险。我再确认 Roy 打出去的包里有没有带它。' }]))).toBe('promise-only')
    expect(detectStalledTurn(assistant([{ type: 'text', text: '我再确认几个关键点。' }]))).toBe('promise-only')
    expect(detectStalledTurn(assistant([{ type: 'text', text: '我再检查一下 mirror 是否被打进包里。' }]))).toBe('promise-only')
    expect(detectStalledTurn(assistant([{ type: 'text', text: '然后我再看下 package.json。' }]))).toBe('promise-only')
  })
  test('已交代完成或只剩可选补充时不误判为只说不动手', () => {
    for (const text of [
      '以上都已检查完，无其他遗留问题。',
      '结论：可以上传，如需我再补充细节请说。',
      '这个还需要再确认吗？',
      '建议你再去核对一下日志。',
      '我会再考虑一下这个方案。',
    ]) {
      expect(detectStalledTurn(assistant([{ type: 'text', text }]))).toBeUndefined()
    }
  })
  test('正常答复不误判', () => {
    expect(detectStalledTurn(assistant([{ type: 'text', text: '安装完成，CLI 版本 1.2.0，已登录。' }]))).toBeUndefined()
  })
  test('有结构化工具调用不算卡住', () => {
    expect(detectStalledTurn(assistant([{ type: 'text', text: '我先来看看：' }, { type: 'toolCall', id: '1', name: 'bash', arguments: {} }], 'toolUse'))).toBeUndefined()
  })
  test('清理后不再带原文，提醒语在界面上隐藏', () => {
    expect(stripLeakedToolMarkup('前文\n' + DSML)).toBe('前文')
    const cleaned = cleanStalledAssistant(assistant([{ type: 'text', text: DSML }]) as never) as unknown as { content: unknown[] }
    expect(cleaned.content.length).toBe(0)
    expect(convertPiMessage({ role: 'user', content: buildStallNudge('promise-only') } as never, 's')).toBeNull()
  })
  test('思考被当正文重复发时只显示思考', () => {
    const t = 'thinking text'
    const m = convertPiMessage(assistant([{ type: 'thinking', thinking: t }, { type: 'text', text: t }]), 's') as unknown as { message: { content: { type: string }[] } }
    expect(m.message.content.map((b) => b.type)).toEqual(['thinking'])
  })
  test('思考把输出上限吃光', () => {
    expect(detectStalledTurn(assistant([{ type: 'thinking', thinking: 'long plan...' }], 'length'))).toBe('thought-overflow')
    expect(detectStalledTurn(assistant([{ type: 'thinking', thinking: 'x' }, { type: 'text', text: 'a'.repeat(500) }], 'length'))).toBeUndefined()
  })
  test('上游返回空 end_turn 算卡住，不报成功', () => {
    expect(detectStalledTurn(assistant([]))).toBe('empty-output')
    expect(detectStalledTurn(assistant([{ type: 'text', text: '   ' }]))).toBe('empty-output')
    expect(convertResultMessage([assistant([])], 's')).toMatchObject({ subtype: 'error_during_execution', terminal_reason: 'error' })
    expect(isInternalStallNudge(buildStallNudge('empty-output'))).toBe(true)
  })
})
