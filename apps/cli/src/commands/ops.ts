import { register } from '../registry'
import { boolFlag, call, out, pos, strFlag, UsageError } from './app'

/** 定时任务：list / run / on / off / add / delete */
register({
  name: 'cron',
  summary: '定时任务：list / run <id> / on <id> / off <id> / add --name X --time 08:30 --prompt "..." [--days 135] / delete <id>',
  usage: 'cron list|run|on|off|add|delete [id] [--json]',
  async run(ctx) {
    const sub = pos(ctx, 0) || 'list'
    const id = pos(ctx, 1)

    if (sub === 'list') {
      const list = (await call(ctx, 'cron.list')) as unknown as Array<{
        id: string; name: string; active: boolean; scheduleType: string; timeOfDay?: string; intervalMinutes?: number
      }>
      const when = (a: (typeof list)[number]): string =>
        a.scheduleType === 'interval' ? `每 ${a.intervalMinutes} 分钟` : `${a.scheduleType} ${a.timeOfDay ?? ''}`.trim()
      return out(ctx, list, () =>
        list.map((a) => `${a.id.slice(0, 8)}  ${a.active ? '启用' : '停用'}  ${when(a).padEnd(16)}  ${a.name}`).join('\n') || '还没有定时任务',
      )
    }

    if (sub === 'add') {
      const name = strFlag(ctx.args.flags, 'name')
      const time = strFlag(ctx.args.flags, 'time')
      const prompt = strFlag(ctx.args.flags, 'prompt')
      if (!name) throw new UsageError('缺少 --name 任务名')
      if (!time) throw new UsageError('缺少 --time，格式像 08:30')
      if (!prompt) throw new UsageError('缺少 --prompt，到点要做什么')
      const days = strFlag(ctx.args.flags, 'days')
      const r = await call(ctx, 'cron.add', { name, time, prompt, ...(days ? { days } : {}) })
      return out(ctx, r, () => `已创建「${String(r.name)}」，每天 ${String(r.timeOfDay)}`)
    }

    if (!id) throw new UsageError('缺少定时任务 ID（可以写前几位或名字）')

    if (sub === 'run') {
      const r = await call(ctx, 'cron.run', { id })
      return out(ctx, r, () => `已开始运行「${String(r.name)}」`)
    }
    if (sub === 'on' || sub === 'off') {
      const r = await call(ctx, 'cron.enable', { id, active: sub === 'on' })
      return out(ctx, r, () => (sub === 'on' ? '已启用' : '已停用'))
    }
    if (sub === 'delete') {
      const r = await call(ctx, 'cron.delete', { id })
      return out(ctx, r, () => `已删除「${String(r.name)}」`)
    }
    throw new UsageError(`不认识的子命令：${sub}`)
  },
})

/** Todo：list / add / done / undo */
register({
  name: 'todo',
  summary: 'Todo：list [--all] / add "标题" / done <id> / undo <id>',
  usage: 'todo list|add|done|undo [...] [--all] [--json]',
  async run(ctx) {
    const sub = pos(ctx, 0) || 'list'
    if (sub === 'list') {
      const list = (await call(ctx, 'todo.list', { all: boolFlag(ctx.args.flags, 'all') })) as unknown as Array<{
        id: string; title: string; status: string; dueAt?: number
      }>
      return out(ctx, list, () =>
        list.map((t) => `${t.id.slice(0, 8)}  ${t.status === 'completed' ? '[x]' : '[ ]'}  ${t.title}${t.dueAt ? `  （截止 ${new Date(t.dueAt).toLocaleString('zh-CN', { hour12: false })}）` : ''}`).join('\n') || '没有待办',
      )
    }
    if (sub === 'add') {
      const title = ctx.args.positionals.slice(1).join(' ').trim()
      if (!title) throw new UsageError('缺少 Todo 标题')
      const dueAt = strFlag(ctx.args.flags, 'at')
      const body: Record<string, unknown> = { title }
      if (dueAt) {
        const ms = Date.parse(dueAt)
        if (Number.isFinite(ms)) body.dueAt = ms
      }
      const r = await call(ctx, 'todo.add', body)
      return out(ctx, r, () => `已添加 ${String(r.id).slice(0, 8)}`)
    }
    if (sub === 'done' || sub === 'undo') {
      const id = pos(ctx, 1)
      if (!id) throw new UsageError('缺少 Todo ID')
      const r = await call(ctx, 'todo.done', { id, undo: sub === 'undo' })
      return out(ctx, r, () => `${sub === 'done' ? '已完成' : '已改回未完成'}：${String(r.title)}`)
    }
    throw new UsageError(`不认识的子命令：${sub}`)
  },
})

/** 项目（工作区）与运行状态 */
register({
  name: 'project',
  summary: '项目列表：id / 名称 / 路径 / 是否当前',
  usage: 'project list [--json]',
  async run(ctx) {
    const list = (await call(ctx, 'project.list')) as unknown as Array<{ id: string; name: string; path?: string; current?: boolean }>
    return out(ctx, list, () =>
      list.map((w) => `${w.current ? '*' : ' '} ${w.id.slice(0, 8)}  ${w.name}${w.path ? `  ${w.path}` : ''}`).join('\n') || '还没有项目',
    )
  },
})

register({
  name: 'status',
  summary: 'Roy 运行状态：当前渠道 / 模型 / 工作区 / 任务数 / 在跑的会话',
  usage: 'status [--json]',
  async run(ctx) {
    const s = (await call(ctx, 'status')) as unknown as {
      channel?: { name: string } | null; model?: string | null; workspace?: string | null
      automations: number; workflows: number; openTodos: number
      runningSessions: Array<{ id: string; title: string }>
    }
    return out(ctx, s, () =>
      [
        `渠道:   ${s.channel?.name ?? '（未配置）'}`,
        `模型:   ${s.model ?? '（未选）'}`,
        `工作区: ${s.workspace ?? '（未选）'}`,
        `定时任务 ${s.automations} 个 · 工作流 ${s.workflows} 个 · 待办 ${s.openTodos} 条`,
        s.runningSessions.length ? `正在跑: ${s.runningSessions.map((x) => x.title).join('、')}` : '当前没有在跑的任务',
      ].join('\n'),
    )
  },
})
