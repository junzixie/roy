import { hostname } from 'node:os'
import { randomUUID } from 'node:crypto'
import { AGENT_IPC_CHANNELS, type AgentStreamPayload, type RoyEvent } from '@roy/shared'
import { listAgentSessions, getAgentSessionMeta, getAgentSessionSDKMessages, createAgentSession, updateAgentSessionMeta, searchAgentSessionMessages } from './agent-session-manager'
import { listAgentWorkspaces, ensureDefaultWorkspace, getAgentWorkspace } from './agent-workspace-manager'
import { getSettings } from './settings-service'
import { listSwitchableChannels, getEnabledModels } from './bridge-model-utils'
import { runAgent, stopAgent, isAgentSessionBusy, listActiveAgentSessionSnapshots, reserveAgentSessionStart, agentEventBus, updateAgentPermissionMode } from './agent-service'
import { getMainWindow } from './main-window-store'
import { permissionService } from './agent-permission-service'
import { askUserService } from './agent-ask-user-service'
import { exitPlanService } from './agent-exit-plan-service'
import type { RemoteGateway } from './mobile-remote-server'

interface MobileBlock { type: 'text' | 'thinking' | 'tool'; text: string; name?: string }
export interface MobileMessage { id: string; role: 'user' | 'assistant' | 'system'; blocks: MobileBlock[] }
function valueString(value: unknown): string { return typeof value === 'string' ? value : '' }
const MAX_TEXT = 160_000
function messageView(raw: unknown, index: number): MobileMessage | null {
  if (!raw || typeof raw !== 'object') return null
  const m = raw as Record<string, unknown>
  if (m.type !== 'assistant' && m.type !== 'user') return null
  const body = m.message as { content?: unknown } | undefined
  const content = body?.content
  const blocks: MobileBlock[] = []
  if (typeof content === 'string') blocks.push({ type: 'text', text: content.slice(0, MAX_TEXT) })
  if (Array.isArray(content)) for (const b of content) {
    if (!b || typeof b !== 'object') continue
    if (b.type === 'text' && typeof b.text === 'string') blocks.push({ type: 'text', text: b.text.slice(0, MAX_TEXT) })
    if (b.type === 'thinking' && typeof b.thinking === 'string') blocks.push({ type: 'thinking', text: b.thinking.slice(-20_000) })
    if (b.type === 'tool_use') blocks.push({ type: 'tool', name: valueString(b.name), text: `调用工具：${valueString(b.name)}` })
    if (b.type === 'image') blocks.push({ type: 'text', text: '［图片附件，请在电脑上查看］' })
  }
  if (!blocks.length) return null
  return { id: valueString(m.uuid) || `history-${index}`, role: m.type, blocks }
}
function sessionView(m: ReturnType<typeof listAgentSessions>[number]): unknown {
  return { id: m.id, title: m.title, channelId: m.channelId, modelId: m.modelId, workspaceId: m.workspaceId, updatedAt: m.updatedAt, pinned: !!m.pinned, archived: !!m.archived }
}
export class MobileRemoteGateway implements RemoteGateway {
  private live = new Map<string, Map<string, MobileMessage>>()
  private errors = new Map<string, string>()
  private requestIds = new Map<string, { sessionId: string; at: number }>()
  private starting = new Set<string>()
  private versions = new Map<string, number>()
  private unsubscribe?: () => void
  /**
   * @param notify 有结构变化（新消息、工具、审批、开始 / 结束）时通知手机重新拉一次
   * @param pushText 只是正文多了几个字时，把这几个字直接推给手机，手机原地追加，不重新拉整段对话
   */
  constructor(private readonly notify: () => void, private readonly pushText: (sessionId: string, rowId: string, index: number, text: string) => void = () => {}) {
    this.unsubscribe = agentEventBus.on((id, payload) => {
      this.consume(id, payload)
      this.versions.set(id, (this.versions.get(id) ?? 0) + 1)
      // 纯正文 / 思考增量：只推文字；思考过程手机上默认折叠，不用实时刷
      if (payload.kind === 'sdk_delta' && payload.delta.deltas.every(d => d.type === 'text_delta' || d.type === 'thinking_delta')) {
        for (const d of payload.delta.deltas) {
          if (d.type === 'text_delta' && 'contentIndex' in d) this.pushText(id, payload.delta.uuid, d.contentIndex, d.delta)
        }
        return
      }
      this.notify()
    })
  }
  dispose(): void { this.unsubscribe?.(); this.live.clear(); this.versions.clear(); this.errors.clear(); this.requestIds.clear() }
  private consume(id: string, payload: AgentStreamPayload): void {
    if (payload.kind === 'roy_event') {
      if (payload.event.type === 'run_started' || payload.event.type === 'external_run_started') { this.live.delete(id); this.errors.delete(id) }
      if (payload.event.type === 'run_completed' || payload.event.type === 'run_stopped') this.live.delete(id)
      return
    }
    if (payload.kind === 'sdk_message') {
      const view = messageView(payload.message, 0)
      if (!view) return
      let rows = this.live.get(id)
      if (!rows) { rows = new Map(); this.live.set(id, rows) }
      rows.set(view.id, view)
      if (rows.size > 40) rows.delete(rows.keys().next().value!)
      return
    }
    let rows = this.live.get(id)
    if (!rows) { rows = new Map(); this.live.set(id, rows) }
    const d = payload.delta
    let row = rows.get(d.uuid)
    if (!row) { row = { id: d.uuid, role: 'assistant', blocks: [] }; rows.set(d.uuid, row) }
    for (const item of d.deltas) {
      if (!('contentIndex' in item) || item.contentIndex < 0 || item.contentIndex > 200) continue
      const index = item.contentIndex
      if (item.type === 'text_start') row.blocks[index] = { type: 'text', text: '' }
      if (item.type === 'thinking_start') row.blocks[index] = { type: 'thinking', text: '' }
      if (item.type === 'text_delta' || item.type === 'thinking_delta') {
        const type = item.type === 'text_delta' ? 'text' : 'thinking'
        const b = row.blocks[index] ?? { type, text: '' }
        b.text = (b.text + item.delta).slice(type === 'thinking' ? -20_000 : 0, type === 'thinking' ? undefined : MAX_TEXT)
        row.blocks[index] = b
      }
      if (item.type === 'text_end' || item.type === 'thinking_end') row.blocks[index] = { type: item.type === 'text_end' ? 'text' : 'thinking', text: item.content.slice(0, MAX_TEXT) }
      if (item.type.startsWith('toolcall_')) {
        const call = 'toolCall' in item ? item.toolCall : undefined
        row.blocks[index] = { type: 'tool', name: call?.name ?? '工具', text: `调用工具：${call?.name ?? '工具'}` }
      }
    }
    if (rows.size > 40) rows.delete(rows.keys().next().value!)
  }
  bootstrap(): unknown {
    const settings = getSettings()
    return {
      computer: hostname(),
      channels: listSwitchableChannels().map(c => ({ id: c.id, name: c.name, models: getEnabledModels(c).map(m => ({ id: m.id, name: m.name || m.id })) })),
      workspaces: listAgentWorkspaces().map(w => ({ id: w.id, name: w.name })),
      defaults: { channelId: settings.agentChannelId, modelId: settings.agentModelId, workspaceId: settings.agentWorkspaceId },
    }
  }
  async search(query: string): Promise<unknown> {
    const text = query.trim()
    if (text.length < 1 || text.length > 100) throw new Error('搜索内容为空或太长')
    const result = await searchAgentSessionMessages(text)
    return { results: result.slice(0, 30).map(r => ({ sessionId: r.sessionId, title: r.sessionTitle, snippet: r.snippet.slice(0, 180) })) }
  }
  sessions(): unknown {
    const active = new Set(listActiveAgentSessionSnapshots().map(s => s.sessionId))
    return { sessions: listAgentSessions().filter(s => !s.isDraft).sort((a, b) => b.updatedAt - a.updatedAt).map(s => ({ ...(sessionView(s) as object), active: active.has(s.id) || this.starting.has(s.id) })) }
  }
  conversation(id: string, before?: number): unknown {
    const meta = getAgentSessionMeta(id)
    if (!meta) throw new Error('会话不存在')
    const messages = getAgentSessionSDKMessages(id)
    const end = Math.min(before ?? messages.length, messages.length)
    const start = Math.max(0, end - 60)
    const views = messages.slice(start, end).map((m, n) => messageView(m, start + n)).filter(Boolean)
    return {
      session: sessionView(meta), messages: views, before: start, total: messages.length,
      live: before === undefined ? [...(this.live.get(id)?.values() ?? [])] : [],
      active: isAgentSessionBusy(id) || this.starting.has(id), version: this.versions.get(id) ?? 0,
      error: this.errors.get(id),
      permissions: permissionService.getPendingRequests().filter(r => r.sessionId === id).map(r => ({ requestId: r.requestId, toolName: r.toolName, description: r.description, command: r.command, dangerLevel: r.dangerLevel, allowAlways: r.allowAlways, toolInput: r.toolInput })),
      questions: askUserService.getPendingRequests().filter(r => r.sessionId === id).map(r => ({ requestId: r.requestId, questions: r.questions })),
      plans: exitPlanService.getPendingRequests().filter(r => r.sessionId === id).map(r => ({ requestId: r.requestId, planDocument: r.planDocument })),
    }
  }
  create(input: Record<string, unknown>): unknown {
    const settings = getSettings()
    const channelId = valueString(input.channelId) || settings.agentChannelId
    const channel = listSwitchableChannels().find(c => c.id === channelId) ?? listSwitchableChannels()[0]
    if (!channel) throw new Error('请先在电脑端配置可用模型')
    const modelId = valueString(input.modelId) || settings.agentModelId
    const model = getEnabledModels(channel).find(m => m.id === modelId) ?? getEnabledModels(channel)[0]!
    const workspaceId = valueString(input.workspaceId) || settings.agentWorkspaceId
    const workspace = (workspaceId ? getAgentWorkspace(workspaceId) : undefined) ?? ensureDefaultWorkspace()
    const meta = createAgentSession('手机新会话', channel.id, workspace.id, model.id)
    // 手机新会话和电脑一样，用「设置 → 权限设置」里的默认权限（createAgentSession 已写入）
    return { session: sessionView(meta) }
  }
  send(id: string, input: Record<string, unknown>): unknown {
    const meta = getAgentSessionMeta(id)
    if (!meta) throw new Error('会话不存在')
    const text = valueString(input.text).trim()
    if (!text || text.length > 32_000) throw new Error('消息为空或太长')
    const requestId = valueString(input.requestId)
    if (!/^[A-Za-z0-9_-]{16,100}$/.test(requestId)) throw new Error('消息标识无效')
    const previous = this.requestIds.get(requestId)
    if (previous) {
      if (previous.sessionId !== id) throw new Error('消息标识冲突')
      return { ok: true, duplicate: true }
    }
    for (const [key, entry] of this.requestIds) if (entry.at < Date.now() - 86_400_000) this.requestIds.delete(key)
    if (this.requestIds.size >= 5000) throw new Error('请稍后发送')
    if (this.starting.has(id) || isAgentSessionBusy(id)) throw new Error('当前任务还在运行，请先停止或等待完成')
    const window = getMainWindow()
    if (!window || window.isDestroyed()) throw new Error('电脑端主窗口未就绪')
    const channelId = valueString(input.channelId) || meta.channelId || getSettings().agentChannelId
    const channel = listSwitchableChannels().find(c => c.id === channelId)
    if (!channel) throw new Error('渠道不可用，请在电脑端检查')
    const desiredModel = valueString(input.modelId) || meta.modelId
    const model = getEnabledModels(channel).find(m => m.id === desiredModel) ?? getEnabledModels(channel)[0]!
    // 不接受手机上传的路径、权限覆盖、任意触发源或工具定义。
    this.starting.add(id)
    const release = reserveAgentSessionStart(id)
    this.requestIds.set(requestId, { sessionId: id, at: Date.now() })
    this.errors.delete(id); this.live.delete(id)
    updateAgentSessionMeta(id, { channelId: channel.id, modelId: model.id })
    if (meta.title === '手机新会话') updateAgentSessionMeta(id, { title: text.slice(0, 40) })
    const task = runAgent({ sessionId: id, userMessage: text, userMessageUuid: randomUUID(), channelId: channel.id, modelId: model.id, workspaceId: meta.workspaceId, permissionModeOverride: meta.permissionMode ?? 'bypassPermissions' }, window.webContents)
    void task.catch(() => { this.errors.set(id, '任务运行失败，请查看对话中的错误提示或电脑端日志') }).finally(() => {
      release(); this.starting.delete(id); this.live.delete(id)
      this.versions.set(id, (this.versions.get(id) ?? 0) + 1)
      this.notify()
    })
    return { ok: true }
  }
  stop(id: string): unknown {
    if (!getAgentSessionMeta(id)) throw new Error('会话不存在')
    stopAgent(id); return { ok: true }
  }
  private resolved(id: string, event: RoyEvent): void {
    const payload: AgentStreamPayload = { kind: 'roy_event', event }
    agentEventBus.emit(id, payload)
    // 主进程事件总线已将事件转给桌面流监听器。
  }
  async respond(id: string, input: Record<string, unknown>): Promise<unknown> {
    const requestId = valueString(input.requestId)
    if (input.kind === 'permission') {
      const pending = permissionService.getPendingRequests().find(r => r.requestId === requestId && r.sessionId === id)
      if (!pending || (input.behavior !== 'allow' && input.behavior !== 'deny')) throw new Error('审批已结束或无效')
      permissionService.respondToPermission(requestId, input.behavior, input.alwaysAllow === true && pending.allowAlways !== false)
      this.resolved(id, { type: 'permission_resolved', requestId, behavior: input.behavior })
    } else if (input.kind === 'question') {
      const pending = askUserService.getPendingRequests().find(r => r.requestId === requestId && r.sessionId === id)
      if (!pending || !input.answers || typeof input.answers !== 'object' || Array.isArray(input.answers)) throw new Error('问题已结束或答案无效')
      const answers: Record<string, string> = {}
      for (const q of pending.questions) {
        const value = (input.answers as Record<string, unknown>)[q.question]
        if (typeof value !== 'string' || !value.trim() || value.length > 8000) throw new Error('请回答全部问题')
        answers[q.question] = value
      }
      askUserService.respondToAskUser(requestId, answers)
      this.resolved(id, { type: 'ask_user_resolved', requestId })
    } else if (input.kind === 'plan') {
      const pending = exitPlanService.getPendingRequests().find(r => r.requestId === requestId && r.sessionId === id)
      if (!pending || !['approve_bypass', 'deny', 'feedback'].includes(valueString(input.action))) throw new Error('计划审批已结束或无效')
      const result = exitPlanService.respondToExitPlanMode({ requestId, action: input.action as 'approve_bypass' | 'deny' | 'feedback', feedback: valueString(input.feedback).slice(0, 8000) })
      if (!result) throw new Error('计划审批已失效')
      this.resolved(id, { type: 'exit_plan_mode_resolved', requestId })
      if (result.targetMode) {
        updateAgentSessionMeta(id, { permissionMode: result.targetMode })
        await updateAgentPermissionMode(id, result.targetMode)
        this.resolved(id, { type: 'permission_mode_changed', mode: result.targetMode })
      }
    } else throw new Error('未知审批类型')
    return { ok: true }
  }
}
