import { existsSync } from 'node:fs'
import { register } from '../registry'
import { boolFlag, call, errorLine, EXIT_ERROR, EXIT_OK, emitJson, emitText, fmtTime, info, out, pos, strFlag, UsageError } from './app'

/** 让 Roy 干活 */
register({
  name: 'ask',
  summary: '让 Roy 干一件事（新建会话后台跑；--wait 会等结果并打印回复）',
  usage: 'ask "要说的话" [--wait] [--session ID] [--json]',
  async run(ctx) {
    const text = ctx.args.positionals.join(' ').trim()
    if (!text) throw new UsageError('缺少要说的话')
    const wait = boolFlag(ctx.args.flags, 'wait')
    if (wait && !ctx.json) info('Roy 正在干活，完成后打印回复（Ctrl+C 只会停止等待，不会停 Roy 里的任务）。')
    const r = await call(ctx, 'ask', { text, wait, session: strFlag(ctx.args.flags, 'session') })
    if (r.ok !== true) {
      errorLine(typeof r.error === 'string' ? r.error : '请求失败')
      return EXIT_ERROR
    }
    if (r.queued === true) {
      return out(ctx, r, () => (
        r.launched === true
          ? `Roy 当时没开，已写入 inbox 并尝试启动（任务 ${String(r.jobId || '').slice(0, 12)}）。打开后会自动跑。`
          : `Roy 没开：任务已写入 inbox（${String(r.jobId || '').slice(0, 12)}）。${typeof r.hint === 'string' ? r.hint : '请手动打开 Roy。'}`
      ))
    }
    const sessionId = String(r.sessionId ?? '')
    return out(ctx, r, () => (wait ? String(r.reply || '还没有拿到回复。') : `已交给 Roy（会话 ${sessionId.slice(0, 8)}），在 Roy 里看进度。`))
  },
})

register({
  name: 'stop',
  summary: '停止某个会话里正在跑的任务',
  usage: 'stop <会话ID>',
  async run(ctx) {
    const id = pos(ctx, 0)
    if (!id) throw new UsageError('缺少会话 ID')
    await call(ctx, 'stop', { session: id })
    return out(ctx, { ok: true }, () => '已停止')
  },
})

register({
  name: 'sessions',
  summary: '最近的会话（id / 标题 / 是否在忙）',
  usage: 'sessions [--json]',
  async run(ctx) {
    const list = (await call(ctx, 'sessions.list')) as unknown as Array<{ id: string; title: string; updatedAt: number; busy: boolean }>
    return out(ctx, list, () => list.map((s) => `${s.id.slice(0, 8)}  ${s.busy ? '忙碌中' : '      '}  ${fmtTime(s.updatedAt)}  ${s.title}`).join('\n') || '还没有会话')
  },
})

/** 会话列表只读：直接读 ~/.roy，不需要 Roy 在跑 */
register({
  name: 'list',
  summary: '列出会话（id / 标题 / 更新时间）；不连主进程也能看',
  usage: 'session list [--limit N] [--workspace W] [--json]',
  async run(ctx) {
    const { listSessions } = await import('../sessions')
    const limit = Number(strFlag(ctx.args.flags, 'limit') ?? 0)
    const workspace = strFlag(ctx.args.flags, 'workspace')
    let sessions = listSessions(ctx.pathOpts)
    if (workspace) sessions = sessions.filter((s) => s.workspaceId === workspace)
    if (limit > 0) sessions = sessions.slice(0, limit)
    if (ctx.json) {
      emitJson(sessions.map((s) => ({ id: s.id, title: s.title ?? '', updatedAt: s.updatedAt, workspaceId: s.workspaceId, modelId: s.modelId, archived: !!s.archived })))
      return EXIT_OK
    }
    if (sessions.length === 0) {
      info('还没有会话。')
      return EXIT_OK
    }
    for (const s of sessions) {
      const when = s.updatedAt ? new Date(s.updatedAt).toISOString().slice(0, 16).replace('T', ' ') : '—'
      const title = (s.title ?? '').replace(/\s+/g, ' ').slice(0, 50) || '(无标题)'
      emitText(`${s.id}  ${when}  ${title}`)
    }
    return EXIT_OK
  },
})

export { existsSync }
