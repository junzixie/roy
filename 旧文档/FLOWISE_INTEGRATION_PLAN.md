# Flowise 集成到 Roy 实施计划

## 🎯 目标
将 Flowise 的核心工作流引擎嵌入到 Roy 中，实现 Coze 风格的可视化工作流系统。

## 📋 实施阶段

### Phase 1: 准备工作（Day 1-2）

#### 1.1 安装 Flowise 依赖
```bash
cd "C:/Users/Administrator/Downloads/Roy-main 原本/Roy-main"

# 安装 Flowise 核心包
bun add flowise-components flowise-server
bun add @xyflow/react
bun add reactflow  # React Flow 画布
```

#### 1.2 创建目录结构
```
apps/electron/src/main/lib/flowise/
├── engine/
│   ├── executor.ts           - 工作流执行引擎
│   ├── node-loader.ts        - 节点加载器
│   ├── variable-resolver.ts  - 变量解析
│   └── scheduler.ts          - 定时调度
├── nodes/
│   ├── base/                 - 基础节点
│   │   ├── StartNode.ts
│   │   ├── EndNode.ts
│   │   └── ...
│   ├── ai/                   - AI 节点
│   │   ├── LLMNode.ts
│   │   ├── ClaudeNode.ts
│   │   └── ...
│   ├── tools/                - 工具节点
│   │   ├── HTTPNode.ts
│   │   ├── CodeNode.ts
│   │   └── ...
│   └── custom/               - 自定义节点
│       ├── VideoNode.ts      - ai-video-studio
│       └── DouyinNode.ts     - 抖音发布
├── storage/
│   ├── workflow-store.ts     - 工作流存储
│   └── execution-log.ts      - 执行日志
└── index.ts                  - 入口

apps/electron/src/renderer/components/flowise/
├── Canvas/
│   ├── FlowCanvas.tsx        - 主画布
│   ├── NodeComponent.tsx     - 节点渲染
│   └── EdgeComponent.tsx     - 连线渲染
├── Panels/
│   ├── NodeLibrary.tsx       - 节点库
│   ├── PropertyPanel.tsx     - 属性面板
│   └── ExecutionLog.tsx      - 执行日志
└── index.tsx
```

---

### Phase 2: 核心引擎集成（Day 3-7）

#### 2.1 工作流执行引擎
```typescript
// apps/electron/src/main/lib/flowise/engine/executor.ts

import { EventEmitter } from 'events'

export interface WorkflowNode {
  id: string
  type: string
  data: {
    name: string
    inputs: Record<string, any>
    outputs: Record<string, any>
  }
  position: { x: number; y: number }
}

export interface WorkflowEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
}

export interface Workflow {
  id: string
  name: string
  description?: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  variables: Record<string, any>
}

export class WorkflowExecutor extends EventEmitter {
  private nodeRegistry: Map<string, NodeExecutor> = new Map()
  
  constructor() {
    super()
    this.loadNodes()
  }
  
  private loadNodes() {
    // 加载所有节点类型
    // 从 flowise-components 适配
  }
  
  async execute(workflow: Workflow, inputs: Record<string, any>) {
    // 1. 拓扑排序（确定执行顺序）
    const executionOrder = this.topologicalSort(workflow)
    
    // 2. 初始化变量
    const context = {
      variables: { ...workflow.variables, ...inputs },
      results: new Map<string, any>()
    }
    
    // 3. 按顺序执行节点
    for (const nodeId of executionOrder) {
      const node = workflow.nodes.find(n => n.id === nodeId)!
      const executor = this.nodeRegistry.get(node.type)
      
      if (!executor) {
        throw new Error(`Unknown node type: ${node.type}`)
      }
      
      this.emit('node:start', { nodeId, node })
      
      try {
        // 解析输入（从前置节点获取）
        const inputs = this.resolveInputs(node, workflow, context)
        
        // 执行节点
        const output = await executor.execute(inputs)
        
        // 保存输出
        context.results.set(nodeId, output)
        
        this.emit('node:complete', { nodeId, output })
      } catch (error) {
        this.emit('node:error', { nodeId, error })
        throw error
      }
    }
    
    return context.results
  }
  
  private topologicalSort(workflow: Workflow): string[] {
    // DAG 拓扑排序
    const graph = new Map<string, string[]>()
    const inDegree = new Map<string, number>()
    
    // 构建图
    workflow.nodes.forEach(node => {
      graph.set(node.id, [])
      inDegree.set(node.id, 0)
    })
    
    workflow.edges.forEach(edge => {
      graph.get(edge.source)!.push(edge.target)
      inDegree.set(edge.target, inDegree.get(edge.target)! + 1)
    })
    
    // Kahn 算法
    const queue = workflow.nodes
      .filter(node => inDegree.get(node.id) === 0)
      .map(node => node.id)
    
    const result: string[] = []
    
    while (queue.length > 0) {
      const nodeId = queue.shift()!
      result.push(nodeId)
      
      graph.get(nodeId)!.forEach(targetId => {
        inDegree.set(targetId, inDegree.get(targetId)! - 1)
        if (inDegree.get(targetId) === 0) {
          queue.push(targetId)
        }
      })
    }
    
    if (result.length !== workflow.nodes.length) {
      throw new Error('Workflow contains cycles')
    }
    
    return result
  }
  
  private resolveInputs(
    node: WorkflowNode,
    workflow: Workflow,
    context: ExecutionContext
  ): Record<string, any> {
    const inputs: Record<string, any> = {}
    
    // 从前置节点获取输出
    const incomingEdges = workflow.edges.filter(e => e.target === node.id)
    
    incomingEdges.forEach(edge => {
      const sourceOutput = context.results.get(edge.source)
      if (edge.sourceHandle && edge.targetHandle) {
        inputs[edge.targetHandle] = sourceOutput?.[edge.sourceHandle]
      }
    })
    
    // 合并节点自己的配置
    return { ...node.data.inputs, ...inputs }
  }
}

interface NodeExecutor {
  execute(inputs: Record<string, any>): Promise<any>
}

interface ExecutionContext {
  variables: Record<string, any>
  results: Map<string, any>
}
```

#### 2.2 节点定义系统
```typescript
// apps/electron/src/main/lib/flowise/nodes/base/base-node.ts

export abstract class BaseNode {
  abstract type: string
  abstract name: string
  abstract description: string
  abstract icon: string
  
  abstract inputs: NodeInput[]
  abstract outputs: NodeOutput[]
  
  abstract execute(inputs: Record<string, any>): Promise<any>
  
  validate(inputs: Record<string, any>): ValidationResult {
    const errors: string[] = []
    
    this.inputs
      .filter(input => input.required)
      .forEach(input => {
        if (inputs[input.name] === undefined) {
          errors.push(`Missing required input: ${input.name}`)
        }
      })
    
    return { valid: errors.length === 0, errors }
  }
}

export interface NodeInput {
  name: string
  label: string
  type: 'string' | 'number' | 'boolean' | 'object' | 'array'
  required: boolean
  default?: any
  description?: string
}

export interface NodeOutput {
  name: string
  label: string
  type: string
  description?: string
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
}
```

---

### Phase 3: 核心节点实现（Day 8-14）

#### 3.1 LLM 节点（支持 Claude）
```typescript
// apps/electron/src/main/lib/flowise/nodes/ai/LLMNode.ts

import { BaseNode } from '../base/base-node'
import Anthropic from '@anthropic-ai/sdk'

export class LLMNode extends BaseNode {
  type = 'llm'
  name = 'LLM'
  description = '调用大语言模型'
  icon = '🤖'
  
  inputs = [
    {
      name: 'prompt',
      label: '提示词',
      type: 'string' as const,
      required: true,
      description: '发送给模型的提示词'
    },
    {
      name: 'model',
      label: '模型',
      type: 'string' as const,
      required: true,
      default: 'claude-opus-5-5',
      description: '使用的模型'
    },
    {
      name: 'temperature',
      label: '温度',
      type: 'number' as const,
      required: false,
      default: 1.0
    },
    {
      name: 'maxTokens',
      label: '最大tokens',
      type: 'number' as const,
      required: false,
      default: 4096
    }
  ]
  
  outputs = [
    {
      name: 'response',
      label: '响应',
      type: 'string',
      description: '模型的响应文本'
    }
  ]
  
  async execute(inputs: Record<string, any>) {
    const { prompt, model, temperature, maxTokens } = inputs
    
    // 使用 Roy 已有的 channel-manager
    const apiKey = await this.getApiKey()
    
    const anthropic = new Anthropic({ apiKey })
    
    const message = await anthropic.messages.create({
      model,
      max_tokens: maxTokens,
      temperature,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    })
    
    return {
      response: message.content[0].type === 'text' 
        ? message.content[0].text 
        : ''
    }
  }
  
  private async getApiKey(): Promise<string> {
    // 从 Roy 的 channel-manager 获取 API key
    // 这样可以复用 Roy 已有的配置
    return process.env.ANTHROPIC_API_KEY || ''
  }
}
```

#### 3.2 HTTP 请求节点
```typescript
// apps/electron/src/main/lib/flowise/nodes/tools/HTTPNode.ts

import { BaseNode } from '../base/base-node'

export class HTTPNode extends BaseNode {
  type = 'http'
  name = 'HTTP 请求'
  description = '发送 HTTP 请求'
  icon = '🌐'
  
  inputs = [
    {
      name: 'url',
      label: 'URL',
      type: 'string' as const,
      required: true
    },
    {
      name: 'method',
      label: '方法',
      type: 'string' as const,
      required: true,
      default: 'GET'
    },
    {
      name: 'headers',
      label: '请求头',
      type: 'object' as const,
      required: false,
      default: {}
    },
    {
      name: 'body',
      label: '请求体',
      type: 'object' as const,
      required: false
    }
  ]
  
  outputs = [
    {
      name: 'data',
      label: '响应数据',
      type: 'object'
    },
    {
      name: 'status',
      label: '状态码',
      type: 'number'
    }
  ]
  
  async execute(inputs: Record<string, any>) {
    const { url, method, headers, body } = inputs
    
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      body: body ? JSON.stringify(body) : undefined
    })
    
    const data = await response.json()
    
    return {
      data,
      status: response.status
    }
  }
}
```

#### 3.3 定时触发节点
```typescript
// apps/electron/src/main/lib/flowise/nodes/triggers/ScheduleNode.ts

import { BaseNode } from '../base/base-node'
import cron from 'node-cron'

export class ScheduleNode extends BaseNode {
  type = 'schedule'
  name = '定时触发'
  description = '按 Cron 表达式定时触发工作流'
  icon = '⏰'
  
  inputs = [
    {
      name: 'cron',
      label = 'Cron 表达式',
      type: 'string' as const,
      required: true,
      default: '0 8 * * *',  // 每天 8:00
      description: '例如：0 8 * * * 表示每天 8:00'
    },
    {
      name: 'timezone',
      label: '时区',
      type: 'string' as const,
      required: false,
      default: 'Asia/Shanghai'
    }
  ]
  
  outputs = [
    {
      name: 'timestamp',
      label: '触发时间',
      type: 'string'
    }
  ]
  
  private task: cron.ScheduledTask | null = null
  
  async execute(inputs: Record<string, any>) {
    const { cron: cronExpr, timezone } = inputs
    
    return {
      timestamp: new Date().toISOString()
    }
  }
  
  // 启动定时任务
  start(workflowId: string, onTrigger: () => void) {
    if (this.task) {
      this.task.stop()
    }
    
    this.task = cron.schedule(
      this.inputs[0].default as string,
      onTrigger,
      {
        timezone: this.inputs[1].default as string
      }
    )
  }
  
  stop() {
    if (this.task) {
      this.task.stop()
      this.task = null
    }
  }
}
```

---

### Phase 4: React Flow 画布（Day 15-21）

#### 4.1 主画布组件
```typescript
// apps/electron/src/renderer/components/flowise/Canvas/FlowCanvas.tsx

import React, { useCallback, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Node,
  type Edge
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { NodeComponent } from './NodeComponent'
import { NodeLibrary } from '../Panels/NodeLibrary'
import { PropertyPanel } from '../Panels/PropertyPanel'
import { ExecutionLog } from '../Panels/ExecutionLog'

const nodeTypes = {
  llm: NodeComponent,
  http: NodeComponent,
  schedule: NodeComponent,
  video: NodeComponent,
  // ... 其他节点类型
}

export function FlowCanvas() {
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [selectedNode, setSelectedNode] = useState<Node | null>(null)
  
  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  )
  
  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    setSelectedNode(node)
  }, [])
  
  const addNode = useCallback((type: string) => {
    const newNode: Node = {
      id: `${type}-${Date.now()}`,
      type,
      position: { x: 250, y: 250 },
      data: {
        name: type,
        inputs: {},
        outputs: {}
      }
    }
    
    setNodes((nds) => [...nds, newNode])
  }, [setNodes])
  
  return (
    <div className="flex h-full">
      {/* 左侧：节点库 */}
      <NodeLibrary onAddNode={addNode} />
      
      {/* 中间：画布 */}
      <div className="flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          nodeTypes={nodeTypes}
          fitView
        >
          <Background />
          <Controls />
          <MiniMap />
        </ReactFlow>
      </div>
      
      {/* 右侧：属性面板 */}
      {selectedNode && (
        <PropertyPanel
          node={selectedNode}
          onChange={(data) => {
            setNodes((nds) =>
              nds.map((n) =>
                n.id === selectedNode.id
                  ? { ...n, data: { ...n.data, ...data } }
                  : n
              )
            )
          }}
        />
      )}
      
      {/* 底部：执行日志 */}
      <ExecutionLog />
    </div>
  )
}
```

---

### Phase 5: 视频生成集成（Day 22-28）

#### 5.1 从 Arthur 移植 ai-video-studio
```bash
# 复制 Arthur 的视频生成技能
cp -r "D:/ai-projects/aixiangmu/Arthur/skills/ai-video-studio" \
     "C:/Users/Administrator/Downloads/Roy-main 原本/Roy-main/apps/electron/resources/skills/"
```

#### 5.2 创建视频生成节点
```typescript
// apps/electron/src/main/lib/flowise/nodes/custom/VideoNode.ts

import { BaseNode } from '../base/base-node'
import { execSkill } from '../../skills/executor'

export class VideoNode extends BaseNode {
  type = 'video'
  name = 'AI 视频生成'
  description = '使用 ai-video-studio 生成视频'
  icon = '🎬'
  
  inputs = [
    {
      name: 'script',
      label: '视频脚本',
      type: 'string' as const,
      required: true
    },
    {
      name: 'style',
      label: '视频风格',
      type: 'string' as const,
      required: false,
      default: '科技新闻'
    },
    {
      name: 'duration',
      label: '时长（秒）',
      type: 'number' as const,
      required: false,
      default: 180
    }
  ]
  
  outputs = [
    {
      name: 'videoPath',
      label: '视频文件路径',
      type: 'string'
    },
    {
      name: 'metadata',
      label: '元数据',
      type: 'object'
    }
  ]
  
  async execute(inputs: Record<string, any>) {
    const { script, style, duration } = inputs
    
    // 调用 ai-video-studio
    const result = await execSkill('ai-video-studio', {
      script,
      style,
      duration
    })
    
    return {
      videoPath: result.videoPath,
      metadata: result.metadata
    }
  }
}
```

---

## 🎬 完成后的效果

### 你的视频生成工作流
```
[定时触发] 每天 8:00
  ↓
[HTTP 请求] 获取 AI 新闻
  ↓
[LLM 节点] Claude 生成脚本
  ↓
[视频生成] ai-video-studio
  ↓
[发布节点] 抖音
  ↓
[通知节点] 完成通知
```

### 功能特性
- ✅ 可视化拖拽编辑
- ✅ 支持所有主流 LLM（Claude/GPT/Gemini）
- ✅ 400+ 节点类型
- ✅ 定时任务
- ✅ 执行日志
- ✅ 变量系统
- ✅ 错误处理

---

## 📅 时间表

- **Day 1-2**: 准备工作
- **Day 3-7**: 核心引擎
- **Day 8-14**: 核心节点
- **Day 15-21**: React Flow 画布
- **Day 22-28**: 视频生成集成

**总计：4 周**

---

## 🚀 立即开始

我现在开始实施 Day 1 的工作：
1. 安装 Flowise 依赖
2. 创建目录结构
3. 搭建基础架构

准备好了吗？我立即开始！
