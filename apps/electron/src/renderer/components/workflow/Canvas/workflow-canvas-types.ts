/**
 * 工作流画布的节点类型定义
 *
 * @xyflow/react 的 useState/useNodesState 在初始值为空数组时会把状态推断成
 * never[]，导致画布上所有节点读写都退化、属性面板取字段全部报错。这里显式
 * 声明节点数据类型，供画布、节点组件和属性面板共用。
 */

import type { Node } from '@xyflow/react'

/**
 * 画布节点数据。
 *
 * inputs 的值统一按字符串处理，与属性面板里的输入控件一致；节点运行时由主进程
 * 的 Workflow 执行器负责把它解析成真实类型。
 */
export interface WorkflowNodeData extends Record<string, unknown> {
  /** 画布上显示的名称 */
  label: string
  /** 节点类型，与 nodeTypes 的 key 一致 */
  type: string
  /** 节点图标（emoji） */
  icon?: string
  /** 副标题，可选 */
  subtitle?: string
  /** 用户在属性面板填写的输入 */
  inputs?: Record<string, string>
  /** 节点输出，由执行器写入 */
  outputs?: Record<string, unknown>
}

/** 画布使用的节点类型。 */
export type WorkflowFlowNode = Node<WorkflowNodeData>

/** 保存给主进程的工作流结构，与 workflow 的 Workflow 类型对齐。 */
export interface WorkflowPayload {
  id: string
  name: string
  description?: string
  nodes: Array<{
    id: string
    type: string
    data: {
      name: string
      inputs: Record<string, string>
      outputs: Record<string, unknown>
    }
    position: { x: number; y: number }
  }>
  edges: Array<{
    id: string
    source: string
    target: string
    sourceHandle?: string
    targetHandle?: string
  }>
  variables: Record<string, unknown>
}
