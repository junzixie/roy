/**
 * React Flow 画布组件 - 工作流可视化编辑器
 *
 * 选中左侧已保存的工作流时，会把节点和连线读进画布；保存和执行都走主进程的
 * workflow IPC，不在渲染层直接拼请求。
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type NodeTypes,
  type ReactFlowInstance
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { WorkflowNode } from './WorkflowNode'
import { NodeLibrary } from './NodeLibrary'
import { PropertyPanel } from './PropertyPanel'
import { serializeWorkflow } from './workflow-serialize'
import type {
  WorkflowFlowNode,
  WorkflowNodeData,
  WorkflowPayload
} from './workflow-canvas-types'

const nodeTypes: NodeTypes = {
  rss: WorkflowNode,
  webpage: WorkflowNode,
  transform: WorkflowNode,
  file: WorkflowNode,
  llm: WorkflowNode,
  http: WorkflowNode,
  code: WorkflowNode,
  notification: WorkflowNode,
  condition: WorkflowNode,
  variable: WorkflowNode,
  schedule: WorkflowNode
}

interface FlowCanvasProps {
  workflowId?: string
  onSave?: (workflow: WorkflowPayload) => void | Promise<void>
}

export function FlowCanvas({ workflowId, onSave }: FlowCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowFlowNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [selectedNode, setSelectedNode] = useState<WorkflowFlowNode | null>(null)
  const executingId = React.useRef<string | null>(null)
  const draftId = React.useRef(`wf-${Date.now()}`)
  const [workflowName, setWorkflowName] = useState('新工作流')
  const [isLoading, setIsLoading] = useState(Boolean(workflowId))
  const [isExecuting, setIsExecuting] = useState(false)
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const [flow, setFlow] = useState<ReactFlowInstance<WorkflowFlowNode, Edge> | null>(null)
  /** 已经为哪个工作流对过视图；换工作流时重新对一次，用户自己缩放后不再打扰 */
  const fittedFor = useRef<string | null>(null)

  // 载入已保存的工作流
  useEffect(() => {
    if (!workflowId) {
      setIsLoading(false)
      return
    }

    let cancelled = false
    setIsLoading(true)

    window.electronAPI
      .workflowGet(workflowId)
      .then((raw) => {
        if (cancelled || !raw) return

        const saved = raw as WorkflowPayload
        setWorkflowName(saved.name ?? '未命名工作流')
        setNodes(
          (saved.nodes ?? []).map((node) => ({
            id: node.id,
            type: node.type,
            position: node.position,
            data: {
              label: node.data?.name ?? node.type,
              type: node.type,
              inputs: node.data?.inputs ?? {},
              outputs: node.data?.outputs ?? {}
            } satisfies WorkflowNodeData
          }))
        )
        setEdges(
          (saved.edges ?? []).map((edge) => ({
            id: edge.id,
            source: edge.source,
            target: edge.target,
            sourceHandle: edge.sourceHandle ?? null,
            targetHandle: edge.targetHandle ?? null
          }))
        )
      })
      .catch((error: unknown) => {
        console.error('[工作流] 读取失败:', error)
        toast.error('读取工作流失败')
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [workflowId, setNodes, setEdges])

  // fitView 属性只在画布挂载时生效，那时节点还没读进来；读完再对一次，让整张图正好铺满画布
  useEffect(() => {
    const key = workflowId ?? 'draft'
    if (!flow || isLoading || nodes.length === 0 || fittedFor.current === key) return
    fittedFor.current = key
    requestAnimationFrame(() => { void flow.fitView({ padding: 0.2, maxZoom: 1, minZoom: 0.3 }) })
  }, [flow, isLoading, nodes.length, workflowId])

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  )

  const onNodeClick = useCallback((_event: React.MouseEvent, node: WorkflowFlowNode) => {
    setSelectedNode(node)
  }, [])

  const onPaneClick = useCallback(() => {
    setSelectedNode(null)
  }, [])

  const addNode = useCallback((type: string) => {
    const defaults: Record<string, Record<string,string>> = { variable:{value:'{}'},rss:{hours:'24',limit:'20'},transform:{items:'{{upstream.items}}',key:'link',limit:'10'},condition:{value:'{{upstream.items}}',operator:'notEmpty'},file:{filename:'结果.md',content:'{{upstream.response}}'},notification:{title:'工作流完成',body:'成品已保存'} }
    const labels: Record<string,string> = {variable:'输入参数',rss:'RSS 新闻',transform:'数据整理',condition:'条件门',file:'保存成品',notification:'完成通知',llm:'Agent / Skill',http:'HTTP 读取'}
    const id = `${type}-${Date.now()}`
    const newNode: WorkflowFlowNode = {
      id,
      type,
      position: { x: 250, y: 250 },
      data: {
        label: labels[type] || type,
        type,
        inputs: defaults[type] || {},
        outputs: {}
      }
    }

    setNodes((nds) => [...nds, newNode])
  }, [setNodes])

  const updateNodeData = useCallback((nodeId: string, data: Partial<WorkflowNodeData>) => {
    setNodes((nds) =>
      nds.map((node) =>
        node.id === nodeId
          ? { ...node, data: { ...node.data, ...data } }
          : node
      )
    )
  }, [setNodes])

  /** 把当前画布序列化成主进程能接受的 Workflow 结构。 */
  const buildWorkflow = useCallback(
    () => serializeWorkflow(nodes, edges, {
      workflowId,
      name: workflowName,
      fallbackId: draftId.current
    }),
    [nodes, edges, workflowId, workflowName]
  )

  /** 保存：优先走父组件的 onSave，让左侧列表同步刷新。 */
  const persist = useCallback(async (workflow: WorkflowPayload) => {
    if (onSave) {
      await onSave(workflow)
      return
    }
    await window.electronAPI.workflowSave(workflow)
  }, [onSave])

  const handleSave = useCallback(() => {
    void persist(buildWorkflow())
  }, [persist, buildWorkflow])

  const handleExecute = useCallback(async () => {
    if (isExecuting) return

    setIsExecuting(true)

    try {
      // 先落盘再执行，否则未保存的改动在画布上、执行器读到的却是旧版本
      const workflow = buildWorkflow()
      await persist(workflow)
      executingId.current = workflow.id

      const result = await window.electronAPI.workflowExecute(workflow.id, {}) as {
        success?: boolean
        error?: string
      }

      if (result?.success) {
        toast.success('工作流执行成功')
      } else {
        toast.error(`工作流执行失败：${result?.error ?? '未知错误'}`)
      }
    } catch (error) {
      toast.error(`执行错误：${error instanceof Error ? error.message : String(error)}`)
    } finally {
      executingId.current = null
      setIsExecuting(false)
    }
  }, [buildWorkflow, persist, isExecuting])

  return (
    <div className="flex h-full w-full">
      {/* 左侧：节点库 */}
      <NodeLibrary onAddNode={addNode} />

      {/* 中间：画布 */}
      <div ref={reactFlowWrapper} className="relative min-w-0 flex-1 overflow-hidden">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          nodeTypes={nodeTypes}
          onInit={setFlow}
          fitView
          fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
          // 默认最小只能缩到 0.5，节点多、画布窄时两头会被裁掉看不到
          minZoom={0.3}
        >
          <Background />
          <Controls />
          <MiniMap />
        </ReactFlow>

        {/* 顶部工具栏 */}
        {/* 右边界也钉住：打开属性面板后画布变窄，名字框先缩，按钮不换行、不压到面板上 */}
        <div className="absolute left-4 right-4 top-4 z-10 flex items-center gap-2">
          <input
            type="text"
            value={workflowName}
            onChange={(event) => setWorkflowName(event.target.value)}
            aria-label="工作流名称"
            className="h-9 w-44 min-w-0 shrink rounded border border-border bg-content-area px-3 text-sm text-foreground outline-none focus:border-foreground/30"
          />
          <button
            type="button"
            onClick={handleSave}
            className="h-9 shrink-0 whitespace-nowrap rounded bg-blue-500 px-4 text-sm text-white hover:bg-blue-600"
          >
            保存
          </button>
          <button
            type="button"
            onClick={() => void handleExecute()}
            disabled={isExecuting}
            className="h-9 shrink-0 whitespace-nowrap rounded bg-green-500 px-4 text-sm text-white hover:bg-green-600 disabled:opacity-50"
          >
            {isExecuting ? '执行中…' : '执行'}
          </button>
        </div>

        {isExecuting && <button className="absolute bottom-4 right-4 rounded bg-red-600 px-4 py-2 text-white" onClick={() => { if (executingId.current) void window.electronAPI.workflowStop(executingId.current) }}>停止运行</button>}
        {isLoading && (
          <div className="absolute inset-0 z-20 grid place-items-center bg-content-area/60">
            <div className="flex items-center gap-2 text-[12.5px] text-foreground/50">
              <Loader2 size={14} className="animate-spin" />
              正在读取工作流…
            </div>
          </div>
        )}
      </div>

      {/* 右侧：属性面板 */}
      {selectedNode && (
        <PropertyPanel
          node={nodes.find(n => n.id === selectedNode.id) || selectedNode}
          onChange={(data) => updateNodeData(selectedNode.id, data)}
          onClose={() => setSelectedNode(null)}
        />
      )}
    </div>
  )
}
