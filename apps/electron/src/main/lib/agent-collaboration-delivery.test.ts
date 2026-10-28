import { describe, expect, test } from 'bun:test'
import { buildDelegationDeliveryText } from './agent-collaboration-utils'

describe('协作结果自动送达文本', () => {
  test('包含每个子任务的标题、状态、ID 和结果', () => {
    const { text, displayText } = buildDelegationDeliveryText([
      { delegationId: 'd1', title: '查竞品', status: 'completed', resultSummary: '竞品 A 价格 99 元' },
      { delegationId: 'd2', title: '写测试', status: 'failed', error: '超时' },
    ])
    expect(text).toContain('<collaboration_results>')
    expect(text).toContain('delegationId: d1')
    expect(text).toContain('竞品 A 价格 99 元')
    expect(text).toContain('失败原因：超时')
    expect(displayText).toBe('【协作结果送达】查竞品（已完成）、写测试（失败）')
  })

  test('过长的结果会截断', () => {
    const { text } = buildDelegationDeliveryText([
      { delegationId: 'd1', title: '长报告', status: 'completed', resultSummary: 'x'.repeat(10_000) },
    ])
    expect(text.length).toBeLessThan(7_000)
    expect(text).toContain('已截断')
  })
})
