import type { AgentSession, ToolDefinition } from '@earendil-works/pi-coding-agent'
/** Per-run limits; never replay completed operations or cache side-effect results. */
export function shellTimeoutSeconds(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.min(value, 600) : 60
}
export function withShellDeadline(tool: ToolDefinition): ToolDefinition {
  if (!/^(bash|powershell)$/i.test(tool.name)) return tool
  return { ...tool, description: tool.description + '\n默认超时60秒，显式timeout最多600秒。长驻服务必须后台启动并短时检查，不能前台等待服务退出。',
    async execute(id, params, signal, update, ctx) {
      const args = params as Record<string, unknown>
      return tool.execute(id, { ...args, timeout: shellTimeoutSeconds(args.timeout) }, signal, update, ctx)
    },
  } as ToolDefinition
}
export class ResponseBudget {
  turns = 0
  tools = 0
  summarizing = false
  summaryNotice = ''
  private began = Date.now()
  private pausedAt = 0
  private pausedMs = 0
  /** Continuous by default. Finite limits are opt-in, not a hidden task pause. */
  constructor(readonly maxTurns = Infinity, readonly maxTools = Infinity, readonly maxMs = Infinity) {}
  pause(): void { if (!this.pausedAt) this.pausedAt = Date.now() }
  resume(): void { if (this.pausedAt) { this.pausedMs += Date.now() - this.pausedAt; this.pausedAt = 0 } }
  get elapsedMs(): number { return (this.pausedAt || Date.now()) - this.began - this.pausedMs }
  get timeReached(): boolean { return this.elapsedMs >= this.maxMs }
  get reachedReason(): string {
    const reasons: string[] = []
    if (this.turns >= this.maxTurns) reasons.push(`模型请求轮数达到 ${this.maxTurns} 轮`)
    if (this.tools >= this.maxTools) reasons.push(`工具调用达到 ${this.maxTools} 次`)
    if (this.timeReached) reasons.push(`阶段耗时达到 ${Math.round(this.maxMs / 1000)} 秒（不含审批等待）`)
    return reasons.join('；')
  }
  beginSummary(): void {
    if (this.summarizing) return
    this.summaryNotice = `阶段暂停：${this.reachedReason || '执行预算已到'}。本阶段已请求模型 ${this.turns} 轮、调用工具 ${this.tools} 次。这不是任务完成；以下汇报已有结果和未完成项，可说“继续”接着处理。`
    this.summarizing = true
  }
  reset(): void { this.summaryNotice = ''; this.turns = 0; this.tools = 0; this.summarizing = false; this.began = Date.now(); this.pausedMs = 0; this.pausedAt = 0 }
  get reached(): boolean { return this.turns >= this.maxTurns || this.tools >= this.maxTools || this.timeReached }
}
/** Reserve a final text-only turn before the hard runtime guard. Permission hooks remain intact. */
export function installResponseBudget(session: AgentSession, budget: ResponseBudget): void {
  const before = session.agent.beforeToolCall
  session.agent.beforeToolCall = async (ctx, signal) => {
    if (budget.summarizing || budget.tools >= budget.maxTools || budget.timeReached) return { block: true, reason: `本阶段执行预算已到（${budget.reachedReason}），请根据已有结果回复；未执行此操作。`, terminate: false }
    const result = await before?.(ctx, signal)
    if (!result?.block) budget.tools++
    return result
  }
  const prepare = session.agent.prepareRequest
  session.agent.prepareRequest = async (ctx, signal) => {
    const prior = await prepare?.(ctx, signal)
    const next = prior?.context ?? ctx.context
    if (!budget.reached) { budget.turns++; return prior || undefined }
    budget.beginSummary()
    return { ...prior, context: { ...next, tools: [], messages: [...next.messages, {
      role: 'system' as const,
      content: budget.summaryNotice + '现在停止调用工具，直接简短汇报已有结果、未完成或阻塞项。不得编造轮数或停止原因，不得声称全部完成；已完成操作不重跑。不要再做补充检查。',
      toolsRemoved: (next.tools ?? []).map(t => ({ name: t.name })),
      timestamp: Date.now(),
    }] } }
  }
  const finish = session.agent.finishTurn
  session.agent.finishTurn = async (ctx, signal) => {
    if (budget.summarizing) return { action: 'end' as const }
    return (await finish?.(ctx, signal)) || undefined
  }
}

/** Execute only after permission approval. Signal aborts the actual operation; never auto-replay. */
export function withToolDeadline(tool: ToolDefinition, ms = 120_000): ToolDefinition {
  if (/^(bash|powershell|AskUserQuestion|EnterPlanMode|ExitPlanMode|InstallWindowsShell|TerminalExecute)$/i.test(tool.name)) return tool
  return { ...tool, async execute(id, params, signal, update, ctx) {
    const aborter = new AbortController()
    const forward = (): void => aborter.abort(signal?.reason)
    if (signal?.aborted) forward()
    else signal?.addEventListener('abort', forward, { once: true })
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        tool.execute(id, params, aborter.signal, update, ctx),
        new Promise<never>((_, reject) => { timer = setTimeout(() => {
          aborter.abort(new Error('工具执行超时'))
          reject(new Error('工具执行超过120秒，已请求取消；部分外部服务可能仍在收尾，先核对状态，不要自动重试或声称撤销。'))
        }, ms) }),
      ])
    } finally { if (timer) clearTimeout(timer); signal?.removeEventListener('abort', forward) }
  } } as ToolDefinition
}
