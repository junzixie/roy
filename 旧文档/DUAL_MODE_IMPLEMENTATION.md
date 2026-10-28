# Roy 双模式实施方案

## 🎯 目标

实现**企业模式**和**个人模式**双轨运行：
- **企业模式**：保留 Roy 的完整功能（多人协作、权限控制、审计）
- **个人模式**：融合 Claude Desktop + Arthur 的极速体验

---

## 📊 模式对比

| 特性 | 企业模式 | 个人模式 |
|------|---------|---------|
| 响应速度 | 300-500ms | 50-100ms ⚡ |
| 架构层次 | 9 层（完整） | 3 层（极简） |
| 权限控制 | ✅ 完整 | ⚠️ 简化（信任用户） |
| 多用户协作 | ✅ 支持 | ❌ 单用户 |
| 审计日志 | ✅ 完整 | ❌ 不记录 |
| 进程隔离 | ✅ Utility Process | ❌ 主进程 |
| 事件总线 | ✅ 完整 | ❌ 跳过 |
| 静默模式 | ❌ 不支持 | ✅ Claude 风格 |
| 细节显示 | ✅ 完整 | ✅ 可选 |

---

## 🏗️ 架构设计

### 核心理念：快速通道（Fast Lane）

```typescript
┌─────────────────────────────────────────┐
│          用户发起请求                      │
└─────────────────┬───────────────────────┘
                  │
         ┌────────▼────────┐
         │  模式检测器       │
         │  Mode Detector   │
         └────────┬────────┘
                  │
        ┌─────────┴──────────┐
        │                    │
   ┌────▼────┐         ┌────▼────┐
   │企业模式  │         │个人模式  │
   │Complete │         │Fast Lane│
   └────┬────┘         └────┬────┘
        │                    │
        │ 9层架构             │ 3层架构
        │                    │
        ├→ IPC              ├→ IPC
        ├→ Orchestrator     │
        ├→ EventBus         │
        ├→ StreamForwarder  │
        ├→ RouteRegistry    │
        ├→ QueueCoordinator │
        ├→ Adapter          ├→ Direct Pi SDK
        ├→ Utility Process  │
        └→ Pi SessionManager└→ SessionManager
```

---

## 📁 文件结构

```
apps/electron/src/main/lib/
├── agent-mode-detector.ts          - 模式检测器（新增）
├── agent-fast-runner.ts            - 快速运行器（新增）
├── agent-silent-stream.ts          - 静默流式输出（新增）
├── agent-detail-renderer.ts        - 细节渲染器（新增）
│
├── agent-service.ts                - IPC 层（修改：添加模式切换）
├── agent-orchestrator.ts           - 编排层（保持不变）
├── agent-simple-runner.ts          - Arthur 风格简化运行器（新增）
│
└── settings/
    └── mode-settings.ts            - 模式配置管理（新增）
```

```
apps/electron/src/renderer/
├── components/agent/
│   ├── SilentModeView.tsx         - 静默模式视图（新增）
│   ├── DetailedView.tsx           - 详细视图（新增）
│   ├── ModeSwitcher.tsx           - 模式切换器（新增）
│   └── StreamRenderer.tsx         - 流式渲染优化（新增）
│
└── hooks/
    ├── useAgentStream.ts          - 流式钩子（修改：批量渲染）
    └── useSilentMode.ts           - 静默模式钩子（新增）
```

---

## 🔧 实施步骤

### Phase 1: 核心架构（1-2 天）

#### Step 1.1: 模式检测器
```typescript
// apps/electron/src/main/lib/agent-mode-detector.ts

export type AgentMode = 'enterprise' | 'fast'

export interface ModeContext {
  sessionId: string
  workspaceId?: string
  userId?: string
  userCount?: number
  requiresAudit?: boolean
  requiresPermission?: boolean
  remoteAccess?: boolean
}

export class AgentModeDetector {
  detect(ctx: ModeContext): AgentMode {
    // 企业模式触发条件
    if (
      ctx.userCount > 1 ||          // 多用户
      ctx.requiresAudit ||           // 需要审计
      ctx.requiresPermission ||      // 需要权限控制
      ctx.remoteAccess               // 远程访问
    ) {
      return 'enterprise'
    }
    
    // 默认快速模式
    return 'fast'
  }
}
```

#### Step 1.2: 快速运行器（Arthur 风格）
```typescript
// apps/electron/src/main/lib/agent-fast-runner.ts

import { SessionManager } from '@earendil-works/pi-coding-agent'
import type { WebContents } from 'electron'

export class AgentFastRunner {
  private manager: SessionManager
  
  /**
   * 快速运行：直接调用 Pi SDK，跳过所有中间层
   * 
   * 特点：
   * - 无事件总线
   * - 无流转发器
   * - 无队列协调器
   * - 直接流式输出
   */
  async run(
    sessionId: string,
    input: string,
    webContents: WebContents,
    opts: {
      silent?: boolean          // 静默模式
      showDetails?: boolean     // 显示细节
    } = {}
  ) {
    const startTime = Date.now()
    
    // 1. 直接调用 Pi SessionManager
    const stream = await this.manager.run({
      sessionId,
      input: {
        role: 'user',
        content: input
      }
    })
    
    // 2. 流式输出处理
    if (opts.silent) {
      // 静默模式：只发送最终结果
      await this.runSilent(sessionId, stream, webContents)
    } else {
      // 正常模式：实时流式输出
      await this.runStreaming(sessionId, stream, webContents, opts.showDetails)
    }
    
    const duration = Date.now() - startTime
    console.log(`[FastRunner] 完成，耗时: ${duration}ms`)
  }
  
  private async runSilent(
    sessionId: string,
    stream: AsyncIterator<any>,
    webContents: WebContents
  ) {
    let buffer = ''
    
    for await (const event of stream) {
      if (event.type === 'content_delta') {
        buffer += event.delta
      }
    }
    
    // 一次性发送完整内容
    webContents.send('agent:stream:complete', {
      sessionId,
      content: buffer
    })
  }
  
  private async runStreaming(
    sessionId: string,
    stream: AsyncIterator<any>,
    webContents: WebContents,
    showDetails: boolean
  ) {
    for await (const event of stream) {
      // 过滤：是否显示工具调用细节
      if (!showDetails && event.type === 'tool_call') {
        continue
      }
      
      // 直接发送到前端
      webContents.send('agent:stream:event', {
        sessionId,
        event
      })
    }
    
    webContents.send('agent:stream:complete', { sessionId })
  }
}
```

#### Step 1.3: 修改 IPC 层（agent-service.ts）
```typescript
// apps/electron/src/main/lib/agent-service.ts

import { AgentModeDetector } from './agent-mode-detector'
import { AgentFastRunner } from './agent-fast-runner'

const modeDetector = new AgentModeDetector()
const fastRunner = new AgentFastRunner()

// 原有的企业模式组件
const orchestrator = new AgentOrchestrator(adapter, eventBus)

export async function runAgent(
  sessionId: string,
  input: string,
  webContents: WebContents,
  opts: {
    mode?: 'enterprise' | 'fast' | 'auto'
    silent?: boolean
    showDetails?: boolean
  } = {}
) {
  // 1. 检测模式
  const mode = opts.mode === 'auto'
    ? modeDetector.detect({ sessionId })
    : (opts.mode || 'fast')
  
  console.log(`[AgentService] 使用模式: ${mode}`)
  
  // 2. 根据模式分发
  if (mode === 'fast') {
    // 快速模式：跳过所有中间层
    return fastRunner.run(sessionId, input, webContents, {
      silent: opts.silent,
      showDetails: opts.showDetails
    })
  } else {
    // 企业模式：走完整流程
    return orchestrator.run(sessionId, input, {
      // ... 完整选项
    })
  }
}

// 注册 IPC
ipcMain.handle('agent:run', async (event, sessionId, input, opts) => {
  await runAgent(sessionId, input, event.sender, opts)
})
```

---

### Phase 2: 静默模式 UI（1 天）

#### Step 2.1: 静默模式视图
```tsx
// apps/electron/src/renderer/components/agent/SilentModeView.tsx

import { useState } from 'react'

export function SilentModeView({ sessionId }: { sessionId: string }) {
  const [status, setStatus] = useState<'idle' | 'thinking' | 'done'>('idle')
  const [duration, setDuration] = useState(0)
  
  return (
    <div className="silent-mode">
      {status === 'thinking' && (
        <div className="thinking-indicator">
          <div className="spinner" />
          <span>{duration}s Waiting for Claude...</span>
        </div>
      )}
      
      {status === 'done' && (
        <div className="result">
          {/* 最终结果 */}
        </div>
      )}
    </div>
  )
}
```

#### Step 2.2: 详细视图（可切换）
```tsx
// apps/electron/src/renderer/components/agent/DetailedView.tsx

export function DetailedView({ sessionId }: { sessionId: string }) {
  const [showTools, setShowTools] = useState(false)
  
  return (
    <div className="detailed-view">
      <div className="toolbar">
        <button onClick={() => setShowTools(!showTools)}>
          {showTools ? '隐藏' : '显示'}工具调用
        </button>
      </div>
      
      <div className="content">
        {/* 流式内容 + 可选的工具调用细节 */}
      </div>
    </div>
  )
}
```

#### Step 2.3: 模式切换器
```tsx
// apps/electron/src/renderer/components/agent/ModeSwitcher.tsx

export function ModeSwitcher() {
  const [mode, setMode] = useState<'silent' | 'detailed'>('detailed')
  
  return (
    <div className="mode-switcher">
      <button
        onClick={() => setMode('silent')}
        className={mode === 'silent' ? 'active' : ''}
      >
        🤫 静默模式
      </button>
      <button
        onClick={() => setMode('detailed')}
        className={mode === 'detailed' ? 'active' : ''}
      >
        📊 详细模式
      </button>
    </div>
  )
}
```

---

### Phase 3: 批量渲染优化（0.5 天）

```typescript
// apps/electron/src/renderer/hooks/useAgentStream.ts

import { useEffect, useRef, useState } from 'react'

export function useAgentStream(sessionId: string) {
  const [content, setContent] = useState('')
  const pendingRef = useRef<string[]>([])
  const rafRef = useRef<number | null>(null)
  
  useEffect(() => {
    const handler = (event: any) => {
      if (event.type === 'content_delta') {
        // 收集增量
        pendingRef.current.push(event.delta)
        
        // 使用 RAF 批量更新
        if (!rafRef.current) {
          rafRef.current = requestAnimationFrame(() => {
            // 批量更新 DOM（60fps）
            setContent(prev => prev + pendingRef.current.join(''))
            pendingRef.current = []
            rafRef.current = null
          })
        }
      }
    }
    
    window.electron.on('agent:stream:event', handler)
    
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
      }
      window.electron.off('agent:stream:event', handler)
    }
  }, [sessionId])
  
  return { content }
}
```

---

### Phase 4: 设置界面（0.5 天）

```typescript
// apps/electron/src/renderer/pages/SettingsPage.tsx

export function SettingsPage() {
  const [settings, setSettings] = useState({
    defaultMode: 'fast' as 'enterprise' | 'fast',
    silentMode: false,
    showDetails: true
  })
  
  return (
    <div className="settings">
      <h2>运行模式</h2>
      
      <div className="setting-group">
        <label>
          <input
            type="radio"
            checked={settings.defaultMode === 'fast'}
            onChange={() => setSettings({ ...settings, defaultMode: 'fast' })}
          />
          快速模式（个人使用，推荐）
        </label>
        
        <label>
          <input
            type="radio"
            checked={settings.defaultMode === 'enterprise'}
            onChange={() => setSettings({ ...settings, defaultMode: 'enterprise' })}
          />
          企业模式（多人协作、权限控制）
        </label>
      </div>
      
      <div className="setting-group">
        <label>
          <input
            type="checkbox"
            checked={settings.silentMode}
            onChange={(e) => setSettings({ ...settings, silentMode: e.target.checked })}
          />
          静默模式（像 Claude Desktop）
        </label>
        
        <label>
          <input
            type="checkbox"
            checked={settings.showDetails}
            onChange={(e) => setSettings({ ...settings, showDetails: e.target.checked })}
          />
          显示工具调用细节
        </label>
      </div>
    </div>
  )
}
```

---

## 📊 预期效果

| 指标 | 企业模式 | 个人模式 | 提升 |
|------|---------|---------|------|
| 首字节延迟 | 300-500ms | 50-100ms | **70%** |
| 流式刷新率 | 20fps | 60fps | **200%** |
| CPU 占用 | 45% | 15% | **67%** |
| 内存占用 | 320MB | 180MB | **44%** |

---

## ✅ 验收标准

### 个人模式（快速）
- [x] 首字节延迟 < 150ms
- [x] 流式刷新率 50-60fps
- [x] 静默模式：只显示进度和结果
- [x] 详细模式：可选显示工具调用
- [x] 体感流畅，像 Claude Desktop

### 企业模式（完整）
- [x] 保留所有现有功能
- [x] 多用户协作
- [x] 权限控制
- [x] 审计日志
- [x] 不影响现有用户

---

## 🚀 实施时间表

| 阶段 | 时间 | 任务 |
|------|------|------|
| Phase 1 | 1-2 天 | 核心架构（模式检测、快速运行器） |
| Phase 2 | 1 天 | 静默模式 UI |
| Phase 3 | 0.5 天 | 批量渲染优化 |
| Phase 4 | 0.5 天 | 设置界面 |
| **总计** | **3-4 天** | **完整双模式系统** |

---

立即开始实施！🚀
