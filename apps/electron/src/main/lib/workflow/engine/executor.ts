/** Roy 轻量工作流：不依赖外部 Workflow；每次运行隔离状态。 */
import { EventEmitter } from 'events'
import { randomUUID } from 'node:crypto'
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
  /** 最近一次保存时间（毫秒时间戳），用于列表排序与「最近修改」展示 */
  updatedAt?: number
}


export interface NodeRuntime { signal: AbortSignal; runId: string; workflowId: string; variables: Record<string, any> }
export interface NodeExecutor { execute(inputs: Record<string, any>, runtime?: NodeRuntime): Promise<any> }
export class WorkflowExecutor extends EventEmitter {
  constructor(private readonly settle?: (runId: string, success: boolean) => Promise<void>) { super() }
  private runningCount = 0
  private waiters: Array<() => void> = []
  private async acquire(signal: AbortSignal): Promise<() => void> {
    if (this.runningCount >= 2) await new Promise<void>((resolve, reject) => {
      const wake = () => { signal.removeEventListener('abort', abort); resolve() }
      const abort = () => { this.waiters = this.waiters.filter(w => w !== wake); reject(signal.reason) }
      this.waiters.push(wake)
      signal.addEventListener('abort', abort, { once: true })
      if (signal.aborted) abort()
    })
    else this.runningCount++
    return () => { const next = this.waiters.shift(); if (next) next(); else this.runningCount-- }
  }
  private nodeRegistry = new Map<string, NodeExecutor>()
  private active = new Map<string, AbortController>()
  registerNode(type: string, executor: NodeExecutor) { this.nodeRegistry.set(type, executor) }
  cancel(workflowId: string) { this.active.get(workflowId)?.abort(new Error('用户停止工作流')) }
  validate(workflow: Workflow) {
    if (!workflow?.id || !workflow.name?.trim() || !Array.isArray(workflow.nodes) || !workflow.nodes.length) throw new Error('请填写名称并添加节点')
    if (workflow.nodes.length > 100) throw new Error('单个工作流最多 100 个节点')
    const ids = new Set(workflow.nodes.map(n => n.id))
    if (ids.size !== workflow.nodes.length) throw new Error('节点 ID 重复')
    for (const n of workflow.nodes) if (!this.nodeRegistry.has(n.type)) throw new Error(`不支持的旧节点 ${n.type}，请替换为轻量节点`)
    for (const e of workflow.edges) if (!ids.has(e.source) || !ids.has(e.target)) throw new Error('连线引用了不存在的节点')
    const order: string[] = []; const pending = new Set(ids)
    while (pending.size) {
      const ready = [...pending].filter(id => workflow.edges.filter(e => e.target === id).every(e => !pending.has(e.source)))
      if (!ready.length) throw new Error('工作流存在循环连线')
      ready.forEach(id => { pending.delete(id); order.push(id) })
    }
    return order
  }
  async execute(workflow: Workflow, inputs: Record<string, any> = {}): Promise<Map<string, any>> {
    const order = this.validate(workflow)
    if (this.active.has(workflow.id)) throw new Error('此工作流正在运行，请等待完成或停止')
    const controller = new AbortController(); this.active.set(workflow.id, controller)
    const runId = randomUUID(); const results = new Map<string, any>(); const skipped = new Set<string>()
    const variables = { ...workflow.variables, ...inputs }
    const emit = (name: string, data: any) => this.emit(name, { runId, workflowId: workflow.id, ...data })
    emit('run:start', { startedAt: Date.now() })
    let release: (() => void) | undefined
    try {
      release = await this.acquire(controller.signal)
      controller.signal.throwIfAborted()
      for (const id of order) {
        controller.signal.throwIfAborted()
        const node = workflow.nodes.find(n => n.id === id)!
        const incoming = workflow.edges.filter(e => e.target === id)
        const enabled = incoming.filter(e => !skipped.has(e.source) && !(workflow.nodes.find(n => n.id === e.source)?.type === 'condition' && !e.sourceHandle && results.get(e.source)?.result === false) && !(['true','false'].includes(e.sourceHandle || '') && results.get(e.source)?.result !== (e.sourceHandle === 'true')))
        if (incoming.length && !enabled.length) { skipped.add(id); emit('node:skip', { nodeId: id }); continue }
        emit('node:start', { nodeId: id })
        const inherited: Record<string, any> = {}
        for (const e of enabled) {
          const out = results.get(e.source)
          if (e.sourceHandle && e.targetHandle) inherited[e.targetHandle] = out?.[e.sourceHandle]
          else if (out && typeof out === 'object') Object.assign(inherited, out)
        }
        const values = { ...variables, nodes: Object.fromEntries(results), upstream: inherited }
        const args = resolveWorkflowValue({ ...inherited, ...node.data.inputs }, values)
        const local = new AbortController()
        const abort = () => local.abort(controller.signal.reason)
        controller.signal.addEventListener('abort', abort, { once: true })
        const ms = Math.min(600000, Math.max(1000, Number(node.data.inputs?.timeoutMs) || 180000))
        const timer = setTimeout(() => local.abort(new Error(`节点超时（${ms / 1000} 秒）`)), ms)
        let onAbort: () => void = () => {}
        try {
          const interrupted = new Promise<never>((_, reject) => { onAbort = () => reject(local.signal.reason || new Error('已停止')); local.signal.addEventListener('abort', onAbort, { once: true }) })
          const output = await Promise.race([this.nodeRegistry.get(node.type)!.execute(args, { signal: local.signal, runId, workflowId: workflow.id, variables }), interrupted])
          local.signal.throwIfAborted(); results.set(id, output); emit('node:complete', { nodeId: id, output })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          emit('node:error', { nodeId: id, error: message })
          // 停止 / 超时按原样抛；其余带上是哪一步出的错，用户才知道该改哪个节点
          if (local.signal.aborted || controller.signal.aborted) throw error
          throw new Error(`「${node.data.name || id}」${message}`, { cause: error })
        }
        finally { clearTimeout(timer); local.signal.removeEventListener('abort', onAbort); controller.signal.removeEventListener('abort', abort) }
      }
      await this.settle?.(runId, true)
      emit('run:complete', { status: 'success', endedAt: Date.now() }); return results
    } catch (error) {
      await this.settle?.(runId, false)
      emit('run:complete', { status: controller.signal.aborted ? 'stopped' : 'error', error: error instanceof Error ? error.message : String(error), endedAt: Date.now() }); throw error
    } finally { release?.(); this.active.delete(workflow.id) }
  }
}
export function resolveWorkflowValue(value: any, scope: Record<string, any>): any {
  const get = (key: string) => {
    const parts = key.trim().split('.')
    if (parts.some(p => ['__proto__','constructor','prototype'].includes(p))) throw new Error('非法变量路径')
    let out: any = scope
    for (const part of parts) { if (out == null || !Object.hasOwn(out, part)) throw new Error(`变量不存在：${key}`); out = out[part] }
    return out
  }
  if (typeof value === 'string') {
    const exact = value.match(/^\{\{([^{}]+)\}\}$/)
    if (exact) return get(exact[1]!)
    return value.replace(/\{\{([^{}]+)\}\}/g, (_, key) => { const v = get(key); return typeof v === 'string' ? v : JSON.stringify(v) })
  }
  if (Array.isArray(value)) return value.map(v => resolveWorkflowValue(v, scope))
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k, resolveWorkflowValue(v, scope)]))
  return value
}
