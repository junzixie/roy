/**
 * 让 Agent 能查看和运行 Roy 工作流（移植自 Arthur 的 workflow_list / workflow_run）。
 *
 * - workflow_list：列出已保存的工作流（名称、说明、节点、可传入的变量）。
 * - workflow_run：按 id 或名称运行一个工作流；运行会产生真实副作用（发消息、写文件、调接口），
 *   因此在适配层包上权限审批，结果和运行记录与界面上手动运行完全一致。
 * - workflow_history：查看最近的运行记录。
 */

import type { ToolDefinition } from '@earendil-works/pi-coding-agent'
import { Type } from 'typebox'
import { getWorkflowDataRoot } from '../workflow/data-root'
import { workflowExecutor } from '../workflow'
import { WorkflowStore } from '../workflow/storage/workflow-store'
import type { Workflow } from '../workflow/engine/executor'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const text = (t: string, details: Record<string, unknown> = {}) => ({ content: [{ type: 'text' as const, text: t }], details })

function store(): WorkflowStore {
  return new WorkflowStore(getWorkflowDataRoot())
}

export function findWorkflow(list: readonly Workflow[], ref: string): Workflow | undefined {
  const key = ref.trim()
  return list.find(w => w.id === key)
    ?? list.find(w => w.name === key)
    ?? list.find(w => w.name.toLowerCase() === key.toLowerCase())
}

function summarize(w: Workflow): string {
  const vars = Object.keys(w.variables ?? {})
  const nodes = (w.nodes ?? []).map(n => (n as { type?: string }).type ?? '节点')
  return `- ${w.name}（id: ${w.id}）${w.description ? `：${w.description}` : ''}\n  节点：${nodes.join(' → ') || '无'}${vars.length ? `\n  可传变量：${vars.join('、')}` : ''}`
}

/** 只读工具，不需要审批 */
export function createRoyWorkflowReadTools(): ToolDefinition[] {
  return [
    {
      name: 'workflow_list',
      label: '查看工作流',
      description: '列出用户在 Roy「工作流」里保存的自动化流程（名称、说明、节点、可传入的变量）。用户提到「跑一下某个工作流 / 流程」或问有哪些工作流时先调用。',
      parameters: Type.Object({}),
      async execute() {
        const list = store().getAll()
        return text(list.length ? `共 ${list.length} 个工作流：\n${list.map(summarize).join('\n')}` : '还没有保存任何工作流。可以让用户在左侧「工作流」里新建。', { count: list.length })
      },
    },
    {
      name: 'workflow_history',
      label: '工作流运行记录',
      description: '查看工作流最近的运行记录（状态、开始结束时间、出错步骤）。workflow 可选，填 id 或名称只看这一个。',
      parameters: Type.Object({ workflow: Type.Optional(Type.String({ description: '工作流 id 或名称' })) }),
      async execute(_id: string, params: { workflow?: string }) {
        const file = join(getWorkflowDataRoot(), 'workflow-runs', 'history.json')
        let history: Array<Record<string, unknown>> = []
        try { if (existsSync(file)) history = JSON.parse(readFileSync(file, 'utf8')) } catch { /* 记录损坏时按空处理 */ }
        let target: Workflow | undefined
        if (params.workflow) {
          target = findWorkflow(store().getAll(), params.workflow)
          if (!target) throw new Error(`没有找到工作流「${params.workflow}」`)
        }
        const rows = history.filter(r => !target || r.workflowId === target.id).slice(0, 10)
        if (!rows.length) return text('还没有运行记录。')
        const fmt = (t: unknown) => typeof t === 'number' ? new Date(t).toLocaleString('zh-CN') : '-'
        return text(rows.map(r => {
          const steps = Array.isArray(r.steps) ? r.steps as Array<Record<string, unknown>> : []
          const failed = steps.filter(s => s.status === 'error').map(s => `${s.nodeId}：${s.error ?? '出错'}`)
          return `- ${r.workflowId} · ${r.status} · ${fmt(r.startedAt)} → ${fmt(r.endedAt)}${r.error ? ` · ${r.error}` : ''}${failed.length ? `\n  出错步骤：${failed.join('；')}` : ''}`
        }).join('\n'), { count: rows.length })
      },
    },
  ] as unknown as ToolDefinition[]
}

/** 会产生副作用的运行工具，由调用方包上权限审批 */
export function createRoyWorkflowRunTool(): ToolDefinition {
  return {
    name: 'workflow_run',
    label: '运行工作流',
    description: '运行用户保存的一个 Roy 工作流，等它跑完返回每个节点的结果。workflow 填 workflow_list 里的 id 或名称；inputs 是要覆盖的变量。只在用户明确要求运行时调用；工作流可能发消息、写文件或调用外部接口。',
    parameters: Type.Object({
      workflow: Type.String({ description: '工作流 id 或名称' }),
      inputs: Type.Optional(Type.Record(Type.String(), Type.Any(), { description: '覆盖工作流变量，例如 {"topic":"AI 新闻"}' })),
    }),
    async execute(_id: string, params: { workflow: string; inputs?: Record<string, unknown> }, signal?: AbortSignal) {
      const w = findWorkflow(store().getAll(), params.workflow)
      if (!w) throw new Error(`没有找到工作流「${params.workflow}」，先用 workflow_list 查看名称`)
      const onAbort = () => workflowExecutor.cancel(w.id)
      signal?.addEventListener('abort', onAbort, { once: true })
      try {
        const results = await workflowExecutor.execute(w, params.inputs ?? {})
        const entries = [...results.entries()].map(([node, value]) => {
          const s = typeof value === 'string' ? value : JSON.stringify(value)
          return `- ${node}：${(s ?? '').slice(0, 800)}`
        })
        return text(`工作流「${w.name}」已运行完成。\n${entries.join('\n')}`, { workflowId: w.id })
      } finally {
        signal?.removeEventListener('abort', onAbort)
      }
    },
  } as unknown as ToolDefinition
}
