/**
 * 命令行工具 roy 的本机接口（参照 Arthur 的 arthur 命令）
 *
 * Roy 运行时在 127.0.0.1 上开一个随机端口，只接受带令牌的请求；
 * 端口和令牌写在 <配置目录>/cli-bridge.json（只有当前 Windows 用户能读）。
 * roy 命令读这个文件来连 Roy，所以 Roy 没开时会提示「请先打开 Roy」。
 *
 * 能做的：定时任务（列表 / 立即运行 / 启用停用）、Todo（列表 / 新建 / 完成）、
 * 工作流（列表 / 运行 / 停止）、发一句话让 Roy 干活（新建会话后台跑，可等结果）。
 * 不开放：改文件路径、权限覆盖、任意工具定义。
 */

import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { chmodSync, rmSync, writeFileSync, readdirSync, renameSync, unlinkSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getConfigDir } from './config-paths'

const MAX_BODY = 64 * 1024

let server: Server | null = null
let token = ''

const infoPath = (): string => join(getConfigDir(), 'cli-bridge.json')

type Handler = (body: Record<string, unknown>) => Promise<unknown> | unknown

function str(v: unknown): string { return typeof v === 'string' ? v : '' }

function lastAssistantText(sessionId: string, getMessages: (id: string) => unknown[]): string {
  const msgs = getMessages(sessionId) as Array<{ type?: string; parent_tool_use_id?: string | null; message?: { content?: unknown } }>
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i]!
    if (m.type !== 'assistant' || m.parent_tool_use_id) continue
    const content = m.message?.content
    const text = Array.isArray(content)
      ? content.filter((b: { type?: string }) => b?.type === 'text').map((b: { text?: string }) => b.text ?? '').join('')
      : typeof content === 'string' ? content : ''
    if (text.trim()) return text.replace(/<!--suggest:[\s\S]*?-->/g, '').trim()
  }
  return ''
}

async function buildRoutes(): Promise<Record<string, Handler>> {
  const automation = await import('./automation-manager')
  const scheduler = await import('./automation-scheduler')
  const planning = await import('./planning-manager')
  const sessions = await import('./agent-session-manager')
  const workspaces = await import('./agent-workspace-manager')
  const agent = await import('./agent-service')
  const settingsMod = await import('./settings-service')
  const models = await import('./bridge-model-utils')
  const mainWin = await import('./main-window-store')
  const wf = await import('./workflow/index')
  const { WorkflowStore } = await import('./workflow/storage/workflow-store')
  const { getWorkflowDataRoot } = await import('./workflow/data-root')
  const wfStore = new WorkflowStore(getWorkflowDataRoot())

  const findAutomation = (id: string) => {
    const list = automation.listAutomations()
    return list.find((a) => a.id === id) ?? list.find((a) => a.id.startsWith(id)) ?? list.find((a) => a.name === id)
  }
  const findWorkflow = (id: string) => {
    const list = wfStore.getAll()
    return list.find((w) => w.id === id) ?? list.find((w) => w.id.startsWith(id)) ?? list.find((w) => (w as { name?: string }).name === id)
  }

  return {
    ping: () => ({ ok: true, app: 'Roy' }),

    'cron.list': () => automation.listAutomations().map((a) => ({ id: a.id, name: a.name, active: a.active, scheduleType: a.scheduleType, timeOfDay: a.timeOfDay, intervalMinutes: a.intervalMinutes })),
    'cron.run': async (b) => {
      const a = findAutomation(str(b.id)); if (!a) throw new Error('找不到这个定时任务')
      void scheduler.runAutomationNow(a.id)
      return { ok: true, id: a.id, name: a.name }
    },
    'cron.enable': (b) => {
      const a = findAutomation(str(b.id)); if (!a) throw new Error('找不到这个定时任务')
      const r = automation.updateAutomation({ id: a.id, active: b.active === true })
      return { ok: !!r, id: a.id, active: r?.active }
    },
    'cron.add': (b) => {
      const name = str(b.name).trim(); if (!name) throw new Error('任务名不能为空')
      const prompt = str(b.prompt).trim(); if (!prompt) throw new Error('提示词不能为空')
      const time = str(b.time).trim()
      if (!/^\d{1,2}:\d{2}$/.test(time)) throw new Error('时间格式要像 08:30')
      const settings = settingsMod.getSettings()
      const channel = models.listSwitchableChannels().find((c) => c.id === settings.agentChannelId) ?? models.listSwitchableChannels()[0]
      if (!channel) throw new Error('Roy 里还没配置可用的模型')
      // --days：daily / weekdays / weekends / 135 这类数字（0=周日）。不传就是每天。
      const days = str(b.days).trim()
      const weekdays = /^[0-6]+$/.test(days) ? [...new Set(days.split('').map(Number))].sort() : undefined
      const created = automation.createAutomation({
        name,
        prompt,
        scheduleType: weekdays ? 'weekly' : 'daily',
        intervalMinutes: 0,
        timeOfDay: time.padStart(5, '0'),
        ...(weekdays && weekdays.length === 1 ? { dayOfWeek: weekdays[0]! } : {}),
        ...(weekdays && weekdays.length > 1 ? { activeWeekdays: weekdays } : {}),
        channelId: channel.id,
        modelId: settings.agentModelId,
        workspaceId: settings.agentWorkspaceId,
      })
      return { ok: true, id: created.id, name: created.name, scheduleType: created.scheduleType, timeOfDay: created.timeOfDay }
    },
    'cron.delete': (b) => {
      const a = findAutomation(str(b.id)); if (!a) throw new Error('找不到这个定时任务')
      return { ok: automation.deleteAutomation(a.id), id: a.id, name: a.name }
    },

    'todo.list': (b) => planning.listTodos({ status: b.all === true ? undefined : 'open', limit: 100 }).map((t) => ({ id: t.id, title: t.title, status: t.status, priority: t.priority, dueAt: t.dueAt })),    'todo.add': (b) => {
      const title = str(b.title).trim(); if (!title || title.length > 500) throw new Error('Todo 标题为空或太长')
      const dueAt = typeof b.dueAt === 'number' && Number.isFinite(b.dueAt) ? b.dueAt : undefined
      const t = planning.createTodo({ title, dueAt }); return { ok: true, id: t.id, title: t.title }
    },
    'todo.done': (b) => {
      const id = str(b.id)
      const t = planning.listTodos({ limit: 500 }).find((x) => x.id === id || x.id.startsWith(id)); if (!t) throw new Error('找不到这个 Todo')
      planning.updateTodo({ id: t.id, status: b.undo === true ? 'open' : 'completed' }); return { ok: true, id: t.id, title: t.title }
    },

    'workflow.list': () => wfStore.getAll().map((w) => ({ id: w.id, name: (w as { name?: string }).name ?? '', description: w.description, nodeCount: w.nodes?.length ?? 0, updatedAt: w.updatedAt })),
    'workflow.show': (b) => {
      const w = findWorkflow(str(b.id)); if (!w) throw new Error('找不到这个工作流')
      return {
        id: w.id,
        name: w.name,
        description: w.description,
        updatedAt: w.updatedAt,
        nodes: (w.nodes ?? []).map((n) => ({ id: n.id, type: n.type, name: n.data?.name ?? n.type, inputs: Object.keys(n.data?.inputs ?? {}) })),
        edges: (w.edges ?? []).map((e) => ({ from: e.source, to: e.target })),
      }
    },
    'workflow.delete': (b) => {
      const w = findWorkflow(str(b.id)); if (!w) throw new Error('找不到这个工作流')
      return { ok: wfStore.delete(w.id), id: w.id, name: w.name }
    },
    'workflow.run': async (b) => {
      const w = findWorkflow(str(b.id)); if (!w) throw new Error('找不到这个工作流')
      const inputs = b.inputs && typeof b.inputs === 'object' && !Array.isArray(b.inputs) ? b.inputs as Record<string, unknown> : {}
      if (b.wait === true) {
        try { const results = await wf.workflowExecutor.execute(w, inputs as Record<string, never>); return { ok: true, id: w.id, results: Object.fromEntries(results) } }
        catch (e) { return { ok: false, id: w.id, error: e instanceof Error ? e.message : String(e) } }
      }
      void wf.workflowExecutor.execute(w, inputs as Record<string, never>).catch(() => undefined)
      return { ok: true, id: w.id, started: true }
    },
    'workflow.stop': (b) => { const w = findWorkflow(str(b.id)); if (!w) throw new Error('找不到这个工作流'); wf.workflowExecutor.cancel(w.id); return { ok: true } },

    'sessions.list': () => sessions.listAgentSessions().slice(0, 30).map((s) => ({ id: s.id, title: s.title, updatedAt: s.updatedAt, busy: agent.isAgentSessionBusy(s.id) })),

    ask: async (b) => {
      const text = str(b.text).trim(); if (!text || text.length > 32_000) throw new Error('要说的话为空或太长')
      const window = mainWin.getMainWindow(); if (!window || window.isDestroyed()) throw new Error('Roy 主窗口还没准备好')
      const settings = settingsMod.getSettings()
      const channel = models.listSwitchableChannels().find((c) => c.id === settings.agentChannelId) ?? models.listSwitchableChannels()[0]
      if (!channel) throw new Error('Roy 里还没配置可用的模型')
      const model = models.getEnabledModels(channel).find((m) => m.id === settings.agentModelId) ?? models.getEnabledModels(channel)[0]
      if (!model) throw new Error('这个渠道没有启用的模型')
      let sessionId = str(b.session)
      if (sessionId) {
        const meta = sessions.getAgentSessionMeta(sessionId) ?? sessions.listAgentSessions().find((s) => s.id.startsWith(sessionId))
        if (!meta) throw new Error('找不到这个会话'); sessionId = meta.id
        if (agent.isAgentSessionBusy(sessionId)) throw new Error('这个会话还在跑，等它结束或先停止')
      } else {
        const ws = (settings.agentWorkspaceId ? workspaces.getAgentWorkspace(settings.agentWorkspaceId) : undefined) ?? workspaces.ensureDefaultWorkspace()
        sessionId = sessions.createAgentSession(text.slice(0, 40), channel.id, ws.id, model.id).id
      }
      const meta = sessions.getAgentSessionMeta(sessionId)!
      const run = agent.runAgent({ sessionId, userMessage: text, userMessageUuid: randomUUID(), channelId: channel.id, modelId: model.id, workspaceId: meta.workspaceId, permissionModeOverride: meta.permissionMode ?? 'bypassPermissions' }, window.webContents)
      if (b.wait !== true) { void run.catch(() => undefined); return { ok: true, sessionId, started: true } }
      try { await run } catch (e) { return { ok: false, sessionId, error: e instanceof Error ? e.message : String(e) } }
      return { ok: true, sessionId, reply: lastAssistantText(sessionId, sessions.getAgentSessionSDKMessages) }
    },
    stop: (b) => { const id = str(b.session); if (!sessions.getAgentSessionMeta(id)) throw new Error('找不到这个会话'); agent.stopAgent(id); return { ok: true } },

    'project.list': () => workspaces.listAgentWorkspaces().map((w) => ({
      id: w.id,
      name: w.name,
      path: (w as { path?: string }).path,
      current: w.id === settingsMod.getSettings().agentWorkspaceId,
    })),

    status: () => {
      const settings = settingsMod.getSettings()
      const channel = models.listSwitchableChannels().find((c) => c.id === settings.agentChannelId)
      const active = sessions.listAgentSessions().filter((s) => agent.isAgentSessionBusy(s.id))
      return {
        ok: true,
        app: 'Roy',
        channel: channel ? { id: channel.id, name: channel.name } : null,
        model: settings.agentModelId ?? null,
        workspace: settings.agentWorkspaceId ?? null,
        automations: automation.listAutomations().length,
        workflows: wfStore.getAll().length,
        openTodos: planning.listTodos({ status: 'open', limit: 500 }).length,
        runningSessions: active.map((s) => ({ id: s.id, title: s.title })),
      }
    },
  }
}

function tokenOk(req: IncomingMessage): boolean {
  const got = Buffer.from(String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, ''))
  const want = Buffer.from(token)
  return got.length === want.length && timingSafeEqual(got, want)
}

function reply(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(data))
}

export async function startCliBridge(): Promise<void> {
  if (server) return
  const routes = await buildRoutes()
  token = randomBytes(24).toString('hex')
  server = createServer((req, res) => {
    // 只接受本机、带令牌、没有浏览器来源的 POST（防网页跨站调用）
    if (req.method !== 'POST' || req.headers.origin || !tokenOk(req)) { reply(res, 403, { error: '拒绝访问' }); return }
    const name = (req.url ?? '').replace(/^\/+/, '').split('?')[0]!
    const handler = routes[name]
    if (!handler) { reply(res, 404, { error: `没有这个命令：${name}` }); return }
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => { size += c.length; if (size > MAX_BODY) { req.destroy(); return } chunks.push(c) })
    req.on('end', () => {
      let body: Record<string, unknown> = {}
      try { const raw = Buffer.concat(chunks).toString('utf8'); if (raw) body = JSON.parse(raw) as Record<string, unknown> } catch { reply(res, 400, { error: '请求格式不对' }); return }
      Promise.resolve().then(() => handler(body)).then((data) => reply(res, 200, data), (e: unknown) => reply(res, 400, { error: e instanceof Error ? e.message : String(e) }))
    })
  })
  server.requestTimeout = 0
  await new Promise<void>((resolve, reject) => {
    server!.once('error', reject)
    server!.listen(0, '127.0.0.1', () => resolve())
  })
  const addr = server.address()
  const port = typeof addr === 'object' && addr ? addr.port : 0
  writeFileSync(infoPath(), JSON.stringify({ port, token, pid: process.pid }), { encoding: 'utf8', mode: 0o600 })
  try { chmodSync(infoPath(), 0o600) } catch { /* Windows 上由用户目录权限保护 */ }
  console.log(`[roy 命令行] 本机接口已就绪（端口 ${port}）`)
  void drainCliInbox().catch((e) => console.error('[roy 命令行] 消化 inbox 失败:', e))
}


/** 消化 CLI inbox（App 未开时 roy ask 写入的任务） */
async function drainCliInbox(): Promise<void> {
  const dir = join(getConfigDir(), 'cli-inbox')
  if (!existsSync(dir)) return
  const routes = await buildRoutes()
  const files = readdirSync(dir).filter((f) => f.endsWith('.json') && !f.endsWith('.doing.json')).sort()
  for (const name of files) {
    const src = join(dir, name)
    const doing = join(dir, name.replace(/\.json$/i, '.doing.json'))
    try {
      renameSync(src, doing)
    } catch {
      continue
    }
    try {
      const job = JSON.parse(readFileSync(doing, 'utf8')) as { op?: string; body?: Record<string, unknown>; id?: string }
      const op = String(job.op || '')
      const handler = routes[op]
      if (!handler) {
        console.warn('[roy 命令行] inbox 未知命令:', op, job.id)
      } else {
        console.log('[roy 命令行] 执行 inbox 任务:', op, job.id)
        await handler(job.body && typeof job.body === 'object' ? job.body : {})
      }
      try { unlinkSync(doing) } catch { /* ignore */ }
    } catch (error) {
      console.error('[roy 命令行] inbox 任务失败:', name, error)
      // 留下 .doing.json 便于排查；不自动重试，避免死循环
    }
  }
}

export function stopCliBridge(): void {
  server?.close()
  server = null
  try { rmSync(infoPath(), { force: true }) } catch { /* ignore */ }
}
