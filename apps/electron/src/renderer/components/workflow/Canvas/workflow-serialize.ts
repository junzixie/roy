/**
 * 画布状态 → 主进程工作流结构的序列化
 *
 * 抽成纯函数是为了能直接测：画布组件本身没有组件测试环境，而这里只做映射，
 * 不依赖 React 和窗口。
 */

import type { Edge } from '@xyflow/react'
import type { WorkflowFlowNode, WorkflowPayload } from './workflow-canvas-types'

export interface SerializeWorkflowOptions {
  /** 已有工作流的 ID；为空表示新建，此时使用 fallbackId */
  workflowId?: string
  /** 画布上填写的工作流名称 */
  name: string
  /** 新建工作流时使用的 ID（由调用方生成，便于测试注入固定值） */
  fallbackId: string
}

const FALLBACK_NAME = '未命名工作流'

/** 把画布节点和连线映射成 Workflow 执行器接受的 Workflow 结构。 */
export function serializeWorkflow(
  nodes: WorkflowFlowNode[],
  edges: Edge[],
  options: SerializeWorkflowOptions
): WorkflowPayload {
  const name = options.name.trim() || FALLBACK_NAME

  return {
    id: options.workflowId || options.fallbackId,
    name,
    description: '',
    nodes: nodes.map((node) => ({
      id: node.id,
      type: node.type ?? 'llm',
      data: {
        // Workflow 执行器按 data.inputs 取值，data.name 只用于展示和排错
        name: node.data.label || node.type || '节点',
        inputs: node.data.inputs ?? {},
        outputs: node.data.outputs ?? {}
      },
      position: { x: node.position.x, y: node.position.y }
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle ?? undefined,
      targetHandle: edge.targetHandle ?? undefined
    })),
    variables: {}
  }
}
