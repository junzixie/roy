import { describe, expect, test } from 'bun:test'
import type { Edge } from '@xyflow/react'
import { serializeWorkflow } from './workflow-serialize'
import type { WorkflowFlowNode } from './workflow-canvas-types'

function makeNode(overrides: Partial<WorkflowFlowNode> = {}): WorkflowFlowNode {
  return {
    id: 'llm-1',
    type: 'llm',
    position: { x: 10, y: 20 },
    data: {
      label: '生成脚本',
      type: 'llm',
      inputs: { model: 'claude-opus-5-5' },
      outputs: {}
    },
    ...overrides
  }
}

describe('画布序列化', () => {
  test('给定画布节点和连线，序列化后保留 id、位置与输入', () => {
    const edges: Edge[] = [
      { id: 'e1', source: 'http-1', target: 'llm-1', sourceHandle: 'data', targetHandle: 'news' }
    ]

    const result = serializeWorkflow([makeNode()], edges, {
      workflowId: 'wf-existing',
      name: '每日新闻',
      fallbackId: 'wf-new'
    })

    expect(result.id).toBe('wf-existing')
    expect(result.name).toBe('每日新闻')
    expect(result.nodes).toHaveLength(1)
    expect(result.nodes[0]).toEqual({
      id: 'llm-1',
      type: 'llm',
      data: {
        name: '生成脚本',
        inputs: { model: 'claude-opus-5-5' },
        outputs: {}
      },
      position: { x: 10, y: 20 }
    })
    expect(result.edges[0]).toEqual({
      id: 'e1',
      source: 'http-1',
      target: 'llm-1',
      sourceHandle: 'data',
      targetHandle: 'news'
    })
  })

  test('给定新建工作流，序列化时使用 fallbackId', () => {
    const result = serializeWorkflow([], [], {
      name: '新工作流',
      fallbackId: 'wf-generated'
    })

    expect(result.id).toBe('wf-generated')
    expect(result.nodes).toEqual([])
    expect(result.edges).toEqual([])
  })

  test('给定空白名称，序列化时回落到默认名称', () => {
    const result = serializeWorkflow([], [], {
      name: '   ',
      fallbackId: 'wf-1'
    })

    expect(result.name).toBe('未命名工作流')
  })

  test('给定空 sourceHandle，序列化后为 undefined 而不是 null', () => {
    const edges: Edge[] = [
      { id: 'e1', source: 'a', target: 'b', sourceHandle: null, targetHandle: null }
    ]

    const result = serializeWorkflow([], edges, {
      name: '连线',
      fallbackId: 'wf-1'
    })

    expect(result.edges[0]?.sourceHandle).toBeUndefined()
    expect(result.edges[0]?.targetHandle).toBeUndefined()
  })

  test('给定缺少 label 和 inputs 的节点，序列化后仍产出可用结构', () => {
    const bare: WorkflowFlowNode = {
      id: 'bare',
      type: 'http',
      position: { x: 0, y: 0 },
      data: { label: '', type: 'http' }
    }

    const result = serializeWorkflow([bare], [], {
      name: '兜底',
      fallbackId: 'wf-1'
    })

    expect(result.nodes[0]?.data.name).toBe('http')
    expect(result.nodes[0]?.data.inputs).toEqual({})
    expect(result.nodes[0]?.data.outputs).toEqual({})
  })
})
