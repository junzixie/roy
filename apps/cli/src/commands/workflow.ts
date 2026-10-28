import { register } from '../registry'
import { boolFlag, call, errorLine, EXIT_ERROR, EXIT_OK, fmtTime, out, pos, strFlag, UsageError } from './app'

/** 工作流：list / show / runs / run / stop / delete */
register({
  name: 'workflow',
  summary: '工作流：list / show <id> / run <id> [--wait] [--input JSON] / stop <id> / delete <id>',
  usage: 'workflow list|show|run|stop|delete [id] [--wait] [--input JSON] [--json]',
  async run(ctx) {
    const sub = pos(ctx, 0) || 'list'
    if (sub === 'list') {
      const list = (await call(ctx, 'workflow.list')) as unknown as Array<{ id: string; name: string; nodeCount?: number; description?: string }>
      return out(ctx, list, () =>
        list.map((w) => `${w.id.slice(0, 8)}  ${(w.name || '(未命名)').padEnd(20)} ${w.nodeCount ?? 0} 步${w.description ? `  ${w.description}` : ''}`).join('\n') || '还没有工作流',
      )
    }
    const id = pos(ctx, 1)
    if (!id) throw new UsageError('缺少工作流 ID（可以写前几位或名字）')

    if (sub === 'show') {
      const w = (await call(ctx, 'workflow.show', { id })) as unknown as {
        id: string; name: string; description?: string; updatedAt?: number
        nodes: Array<{ id: string; type: string; name: string; inputs: string[] }>
        edges: Array<{ from: string; to: string }>
      }
      return out(ctx, w, () => {
        const lines = [`${w.name}${w.description ? ` — ${w.description}` : ''}`, `ID: ${w.id}${w.updatedAt ? `   更新: ${fmtTime(w.updatedAt)}` : ''}`, '', `步骤（${w.nodes.length}）:`]
        w.nodes.forEach((n, i) => {
          lines.push(`  ${i + 1}. ${n.name}  [${n.type}]${n.inputs.length ? `  参数: ${n.inputs.join(', ')}` : ''}`)
        })
        if (w.edges.length) lines.push('', `连线（${w.edges.length}）: ${w.edges.map((e) => `${e.from}→${e.to}`).join(', ')}`)
        return lines.join('\n')
      })
    }

    if (sub === 'run') {
      let inputs: Record<string, unknown> = {}
      const raw = strFlag(ctx.args.flags, 'input')
      if (raw) {
        try {
          inputs = JSON.parse(raw) as Record<string, unknown>
        } catch {
          throw new UsageError('--input 要是 JSON，比如 {"topic":"AI"}')
        }
      }
      const wait = boolFlag(ctx.args.flags, 'wait')
      const r = await call(ctx, 'workflow.run', { id, inputs, wait })
      if (r.ok !== true) {
        errorLine(typeof r.error === 'string' ? r.error : '工作流失败')
        return EXIT_ERROR
      }
      return out(ctx, r, () => (wait ? '工作流跑完了' : '工作流已开始，在 Roy 的工作流页面能看到进度'))
    }

    if (sub === 'stop') {
      await call(ctx, 'workflow.stop', { id })
      return out(ctx, { ok: true }, () => '已停止')
    }

    if (sub === 'delete') {
      const r = await call(ctx, 'workflow.delete', { id })
      return out(ctx, r, () => `已删除「${String(r.name ?? id)}」`)
    }

    throw new UsageError(`不认识的子命令：${sub}`)
  },
})
