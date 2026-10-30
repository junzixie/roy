import { describe, expect, test } from 'bun:test'
import type { SDKContentBlock } from '@roy/shared'
import {
  buildAssistantTurnRenderItems,
  cleanAssistantBlocks,
  collectFinalAnswerText,
  type AssistantTurnRenderItem,
} from './assistant-turn-layout'

const text = (t: string): SDKContentBlock => ({ type: 'text', text: t }) as SDKContentBlock
const think = (t: string): SDKContentBlock => ({ type: 'thinking', thinking: t }) as SDKContentBlock
const tool = (name: string, id = name): SDKContentBlock => ({ type: 'tool_use', id, name, input: {} }) as SDKContentBlock
const HIDDEN = new Set(['TaskCreate', 'TaskUpdate'])

/** 把渲染项简化成便于断言的结构：G[...] 表示执行过程组，其余为外置块的类型。 */
function shape(items: AssistantTurnRenderItem[]): string[] {
  return items.map((item) => item.type === 'process-group'
    ? `G[${item.items.map(({ block }) => block.type).join(',')}]`
    : item.item.block.type)
}

describe('回合分层：执行过程折叠，最终答复独立', () => {
  test('工具调用后的正文作为最终答复外置', () => {
    const items = buildAssistantTurnRenderItems([think('想'), text('我先看看'), tool('read'), text('结论如下')])
    expect(shape(items)).toEqual(['G[thinking]', 'text', 'G[tool_use]', 'text'])
  })

  test('普通问答没有过程块时全部直接展示', () => {
    expect(shape(buildAssistantTurnRenderItems([text('你好')]))).toEqual(['text'])
  })

  test('答复后再更新任务进度，不会把答复卷进折叠', () => {
    const items = buildAssistantTurnRenderItems(
      [tool('read'), text('最终答复'), tool('TaskUpdate')],
      { hiddenToolNames: HIDDEN },
    )
    expect(shape(items)).toEqual(['G[tool_use]', 'text'])
    expect(collectFinalAnswerText(items, [tool('read'), text('最终答复')])).toBe('最终答复')
  })

  test('只剩隐藏工具时不生成空的执行过程行', () => {
    const items = buildAssistantTurnRenderItems([text('答复'), tool('TaskCreate')], { hiddenToolNames: HIDDEN })
    expect(shape(items)).toEqual(['text'])
  })

  test('与正文相同的思考块只显示一次', () => {
    const cleaned = cleanAssistantBlocks([tool('read'), think('同一段  话'), text('同一段 话')])
    expect(cleaned.map(({ block }) => block.type)).toEqual(['tool_use', 'text'])
  })

  test('内容不同的思考块保留', () => {
    expect(cleanAssistantBlocks([think('分析'), text('答复')])).toHaveLength(2)
  })

  test('空白正文和空白思考不渲染、不计数', () => {
    const items = buildAssistantTurnRenderItems([think('  '), tool('bash'), text('\n'), text('完成')])
    expect(shape(items)).toEqual(['G[tool_use]', 'text'])
  })

  test('保留原始下标作为渲染 key', () => {
    const items = buildAssistantTurnRenderItems([think(''), tool('read'), text('答')])
    const last = items.at(-1)
    expect(last?.type === 'block' && last.item.index).toBe(2)
  })

  test('工具开始后，之前的正文仍保留在原位置', () => {
    const items = buildAssistantTurnRenderItems([text('我先看看'), tool('read')], { isStreaming: true })
    expect(shape(items)).toEqual(['text', 'G[tool_use]'])
  })

  test('流式中末尾出现正文时先外置展示', () => {
    const items = buildAssistantTurnRenderItems([tool('read'), text('结论')], { isStreaming: true })
    expect(shape(items)).toEqual(['G[tool_use]', 'text'])
  })

  test('复制只取最终答复，不带中间说明', () => {
    const blocks = [text('我先看看'), tool('read'), text('结论 A'), text('结论 B')]
    const items = buildAssistantTurnRenderItems(blocks)
    expect(collectFinalAnswerText(items, blocks)).toBe('结论 A\n\n结论 B')
  })

  test('没有最终答复时复制退回全部正文', () => {
    const blocks = [text('我先看看'), tool('read')]
    expect(collectFinalAnswerText(buildAssistantTurnRenderItems(blocks), blocks)).toBe('我先看看')
  })


  test('相邻两段相同正文只留一段；整段翻倍收成一半', () => {
    const cleaned = cleanAssistantBlocks([text('同一答复'), text('同一答复')])
    expect(cleaned).toHaveLength(1)
    expect((cleaned[0]!.block as { text: string }).text).toBe('同一答复')

    const doubled = '完整一段话完整一段话'
    const one = cleanAssistantBlocks([text(doubled)])
    expect(one).toHaveLength(1)
    expect((one[0]!.block as { text: string }).text.trim()).toBe('完整一段话')
  })
})
