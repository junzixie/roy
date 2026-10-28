/**
 * 节点库 - 显示所有可用的节点类型
 */

import React, { useState, useEffect } from 'react'

interface NodeType {
  type: string
  name: string
  description: string
  icon: string
  category: string
}

interface NodeLibraryProps {
  onAddNode: (type: string) => void
}

export function NodeLibrary({ onAddNode }: NodeLibraryProps) {
  const [nodeTypes, setNodeTypes] = useState<NodeType[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string>('all')

  useEffect(() => {
    // 从主进程获取节点类型（IPC 返回 unknown[]，这里收敛成节点元数据）
    window.electronAPI
      .workflowNodeTypes()
      .then((types) => {
        setNodeTypes((types ?? []) as NodeType[])
      })
      .catch((error: unknown) => {
        console.error('[工作流] 读取节点类型失败:', error)
      })
  }, [])

  const categories = [
    { id: 'all', name: '全部' },
    { id: 'ai', name: 'AI' },
    { id: 'tools', name: '工具' },
    { id: 'control', name: '控制' },
    { id: 'triggers', name: '触发器' }
  ]

  const filteredNodes = selectedCategory === 'all'
    ? nodeTypes
    : nodeTypes.filter(node => node.category === selectedCategory)

  return (
    <div className="flex w-64 flex-col border-r border-border bg-foreground/[0.02]">
      <div className="border-b border-border p-4">
        <h2 className="text-[13px] font-medium text-foreground/70">节点库</h2>
      </div>

      {/* 分类筛选 */}
      <div className="flex flex-wrap gap-1 border-b border-border p-2">
        {categories.map(category => (
          <button
            key={category.id}
            type="button"
            onClick={() => setSelectedCategory(category.id)}
            className={`
              rounded px-3 py-1 text-sm
              ${selectedCategory === category.id
                ? 'bg-blue-500 text-white'
                : 'bg-content-area text-foreground/70 hover:bg-foreground/[0.06]'}
            `}
          >
            {category.name}
          </button>
        ))}
      </div>

      {/* 节点列表 */}
      <div className="flex-1 overflow-y-auto p-2">
        {filteredNodes.map(node => (
          <button
            key={node.type}
            type="button"
            onClick={() => onAddNode(node.type)}
            className="mb-2 w-full rounded border border-border bg-content-area p-3 text-left transition-colors hover:bg-foreground/[0.06]"
          >
            <div className="mb-1 flex items-center gap-2">
              <span className="text-xl">{node.icon}</span>
              <span className="font-medium">{node.name}</span>
            </div>
            <div className="text-xs text-foreground/50">{node.description}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
