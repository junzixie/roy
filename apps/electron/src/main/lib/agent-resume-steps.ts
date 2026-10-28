/**
 * Resume 半完成步骤启发式（对照 Feibo agent-core/resume.ts）
 *
 * 从 SDK / 工具事件状消息里提取已完成与未完成工具调用，生成可注入 recovery 的短备注。
 * 纯函数、无副作用；解析失败时返回空，不抛错。
 */

export interface ResumeToolStep {
  tool: string
  args: string
  state?: 'waiting' | 'half' | 'unfinished'
  summary?: string
}

const ARGS_MAX = 120
const HALF_DONE = /^(Bash|bash|Write|write|Edit|edit|run_command|Shell|shell)$/i

function clipArgs(value: unknown): string {
  let s: string
  try { s = typeof value === 'string' ? value : JSON.stringify(value) ?? '' } catch { s = String(value) }
  s = s.replace(/\s+/g, ' ').trim()
  return s.length > ARGS_MAX ? `${s.slice(0, ARGS_MAX)}…` : s
}

/** 宽松消息形态：兼容 SDK tool 块与自定义事件 */
export type ResumeEventLike = {
  type?: string
  name?: string
  tool?: string
  callId?: string
  id?: string
  ok?: boolean
  summary?: string
  input?: unknown
  args?: unknown
  payload?: Record<string, unknown>
  content?: Array<{ type?: string; name?: string; id?: string; input?: unknown }>
}

function toolStart(e: ResumeEventLike): { callId: string; tool: string; args: string } | null {
  const p = e.payload ?? {}
  if (e.type === 'tool.start' && (p.callId || e.callId)) {
    return {
      callId: String(p.callId ?? e.callId),
      tool: String(p.tool ?? e.tool ?? e.name ?? ''),
      args: clipArgs(p.args ?? e.args ?? e.input),
    }
  }
  if (e.type === 'tool_use' || e.type === 'tool-call') {
    const id = String(e.callId ?? e.id ?? e.name ?? '')
    if (!id) return null
    return { callId: id, tool: String(e.name ?? e.tool ?? ''), args: clipArgs(e.input ?? e.args) }
  }
  if (Array.isArray(e.content)) {
    // 由上层拆开 content；这里忽略
  }
  return null
}

function toolEndOk(e: ResumeEventLike): { callId: string; ok: boolean; summary: string } | null {
  const p = e.payload ?? {}
  if (e.type === 'tool.end' && (p.callId || e.callId)) {
    return {
      callId: String(p.callId ?? e.callId),
      ok: p.ok !== false && e.ok !== false,
      summary: String(p.summary ?? e.summary ?? '').slice(0, 200),
    }
  }
  if (e.type === 'tool_result' && (e.callId || e.id)) {
    return {
      callId: String(e.callId ?? e.id),
      ok: e.ok !== false,
      summary: String(e.summary ?? '').slice(0, 200),
    }
  }
  return null
}

export function finishedSteps(events: ResumeEventLike[]): ResumeToolStep[] {
  const started = new Map<string, { tool: string; args: string }>()
  const done: ResumeToolStep[] = []
  for (const e of events) {
    const s = toolStart(e)
    if (s) { started.set(s.callId, { tool: s.tool, args: s.args }); continue }
    const end = toolEndOk(e)
    if (end?.ok) {
      const prev = started.get(end.callId)
      if (prev && prev.tool && prev.tool !== 'update_plan' && prev.tool !== 'TodoWrite') {
        done.push({ ...prev, summary: end.summary })
      }
      started.delete(end.callId)
    } else if (end) {
      started.delete(end.callId)
    }
  }
  return done
}

export function brokenSteps(events: ResumeEventLike[]): ResumeToolStep[] {
  const started = new Map<string, { tool: string; args: string }>()
  const waiting = new Set<string>()
  for (const e of events) {
    const s = toolStart(e)
    if (s) { started.set(s.callId, { tool: s.tool, args: s.args }); continue }
    const end = toolEndOk(e)
    if (end) { started.delete(end.callId); continue }
    if (e.type === 'approval.request') {
      const last = [...started.keys()].pop()
      if (last) waiting.add(last)
    } else if (e.type === 'approval.result' && (e.payload?.allow || e.ok)) {
      waiting.clear()
    }
  }
  return [...started.entries()]
    .filter(([, s]) => s.tool && s.tool !== 'update_plan' && s.tool !== 'TodoWrite')
    .map(([id, s]) => ({
      ...s,
      state: waiting.has(id) ? 'waiting' as const : HALF_DONE.test(s.tool) ? 'half' as const : 'unfinished' as const,
    }))
}

/** 生成注入 recovery prompt 的短备注；无信息时返回空串 */
export function buildResumeStepsNote(events: ResumeEventLike[]): string {
  try {
    const done = finishedSteps(events)
    const broken = brokenSteps(events)
    if (!done.length && !broken.length) return ''
    const lines: string[] = ['（系统提示）中断前工具步骤摘要：']
    if (done.length) {
      lines.push('已完成：')
      for (const s of done.slice(-8)) lines.push(`- [done] ${s.tool} ${s.args}${s.summary ? ` → ${s.summary}` : ''}`)
    }
    if (broken.length) {
      lines.push('未完成/半完成：')
      for (const s of broken.slice(0, 8)) lines.push(`- [${s.state}] ${s.tool} ${s.args}`)
      lines.push('请先确认上述未完成步骤是否需要继续或撤销，再回应用户最新请求。')
    }
    return lines.join('\n')
  } catch {
    return ''
  }
}

/** 从 SDK 消息列表尽力抽出事件（失败返回 []） */
export function eventsFromSdkMessages(messages: unknown): ResumeEventLike[] {
  if (!Array.isArray(messages)) return []
  const out: ResumeEventLike[] = []
  for (const raw of messages) {
    if (!raw || typeof raw !== 'object') continue
    const m = raw as Record<string, unknown>
    const content = m.content
    if (Array.isArray(content)) {
      for (const block of content) {
        if (!block || typeof block !== 'object') continue
        const b = block as Record<string, unknown>
        if (b.type === 'tool_use' || b.type === 'tool-call') {
          out.push({
            type: 'tool_use',
            name: typeof b.name === 'string' ? b.name : undefined,
            id: typeof b.id === 'string' ? b.id : undefined,
            input: b.input,
          })
        } else if (b.type === 'tool_result') {
          out.push({
            type: 'tool_result',
            id: typeof b.tool_use_id === 'string' ? b.tool_use_id : typeof b.id === 'string' ? b.id : undefined,
            ok: b.is_error !== true,
            summary: typeof b.content === 'string' ? b.content.slice(0, 200) : undefined,
          })
        }
      }
    }
    if (typeof m.type === 'string' && (m.type.startsWith('tool') || m.type.startsWith('approval'))) {
      out.push(m as ResumeEventLike)
    }
  }
  return out
}