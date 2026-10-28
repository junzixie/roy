/**
 * 工作流节点组件
 */

import React, { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { WorkflowNodeData } from './workflow-canvas-types'

const NODE_COLORS: Record<string, string> = {
  variable: 'bg-pink-500',
  http: 'bg-blue-500',
  rss: 'bg-sky-600',
  webpage: 'bg-cyan-600',
  transform: 'bg-teal-600',
  condition: 'bg-orange-500',
  llm: 'bg-purple-500',
  file: 'bg-slate-600',
  notification: 'bg-green-500',
  code: 'bg-yellow-500',
  schedule: 'bg-red-500',
}

/** 和主进程节点库（workflow:get-node-types）同一套图标；保存的工作流里不存图标，载入时按类型补上 */
const NODE_ICONS: Record<string, string> = {
  variable: '📦',
  http: '🌐',
  rss: '📰',
  webpage: '🌍',
  transform: '🧹',
  condition: '🔀',
  llm: '🤖',
  file: '📄',
  notification: '🔔',
  code: '💻',
  schedule: '⏰',
}

export const WorkflowNode = memo(({ data, selected }: NodeProps) => {
  // NodeProps 的 data 在 @xyflow/react 里是 Record<string, unknown>，这里收窄成画布
  // 自己的节点数据，避免每个字段取用都要单独断言。
  const nodeData = data as WorkflowNodeData
  const type = nodeData.type ?? ''

  return (
    <div
      className={`
        min-w-[160px] rounded-lg px-4 py-3 text-white shadow-lg
        ${NODE_COLORS[type] ?? 'bg-gray-500'}
        ${selected ? 'ring-2 ring-white' : ''}
      `}
    >
      {/* 左进右出：模板和常见流程都是从左往右排 */}
      <Handle type="target" position={Position.Left} />

      <div className="flex items-center gap-2">
        <span className="text-lg">{nodeData.icon || NODE_ICONS[type] || '📦'}</span>
        <div className="flex-1">
          <div className="text-sm font-semibold">{nodeData.label || type}</div>
          {nodeData.subtitle && (
            <div className="text-xs opacity-75">{nodeData.subtitle}</div>
          )}
        </div>
      </div>

      <Handle type="source" position={Position.Right} />
    </div>
  )
})

WorkflowNode.displayName = 'WorkflowNode'
