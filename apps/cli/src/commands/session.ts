import { readFileSync } from 'node:fs'
import { register } from '../registry'
import { emitJson, emitText, errorLine, info, EXIT_ERROR, EXIT_OK, fmtTime, pos } from './app'
import { resolveSession } from '../sessions'

interface Turn {
  uuid: string
  role: string
  text: string
  toolCount: number
}

/** 从 jsonl 里抽 turn：user / assistant 各算一个，工具调用计数 */
function readTurns(filePath: string): Turn[] {
  const raw = readFileSync(filePath, 'utf-8')
  const turns: Turn[] = []
  for (const line of raw.split('\n')) {
    const s = line.trim()
    if (!s) continue
    let m: Record<string, unknown>
    try {
      m = JSON.parse(s) as Record<string, unknown>
    } catch {
      continue
    }
    const type = m.type
    if (type !== 'user' && type !== 'assistant') continue
    const body = m.message as { content?: unknown } | undefined
    const content = body?.content
    let text = ''
    let toolCount = 0
    if (typeof content === 'string') text = content
    else if (Array.isArray(content)) {
      for (const b of content as Array<Record<string, unknown>>) {
        if (b.type === 'text' && typeof b.text === 'string') text += b.text
        if (b.type === 'tool_use') toolCount++
      }
    }
    if (!text.trim() && toolCount === 0) continue
    turns.push({ uuid: typeof m.uuid === 'string' ? m.uuid : '', role: type, text, toolCount })
  }
  return turns
}

const estTokens = (s: string): number => Math.ceil(s.length / 3.2)

register({
  name: 'info',
  summary: '会话体量/结构概览：turn 数、角色分布、估算 tokens、字节数',
  usage: 'session info <id|path> [--json]',
  async run(ctx) {
    const target = pos(ctx, 0)
    if (!target) {
      errorLine('缺少会话 ID 或文件路径')
      return 2
    }
    const found = resolveSession(target, ctx.pathOpts)
    if (!found) {
      errorLine(`找不到会话：${target}`)
      return EXIT_ERROR
    }
    const turns = readTurns(found.filePath)
    const user = turns.filter((t) => t.role === 'user').length
    const assistant = turns.filter((t) => t.role === 'assistant').length
    const tools = turns.reduce((n, t) => n + t.toolCount, 0)
    const chars = turns.reduce((n, t) => n + t.text.length, 0)
    const data = {
      id: found.id,
      title: found.meta?.title ?? '',
      updatedAt: found.meta?.updatedAt,
      bytes: found.bytes,
      turns: turns.length,
      userTurns: user,
      assistantTurns: assistant,
      toolCalls: tools,
      approxTokens: estTokens(turns.map((t) => t.text).join('')),
    }
    if (ctx.json) {
      emitJson(data)
      return EXIT_OK
    }
    emitText(
      [
        `会话 ${found.id}`,
        `标题   ${data.title || '(无标题)'}`,
        `更新   ${fmtTime(data.updatedAt)}`,
        `体量   ${(data.bytes / 1024).toFixed(1)} KB`,
        `轮次   ${data.turns}（你 ${user} / Roy ${assistant}）`,
        `工具   ${tools} 次调用`,
        `估算   ${data.approxTokens} tokens`,
      ].join('\n'),
    )
    return EXIT_OK
  },
})

register({
  name: 'outline',
  summary: 'turn 级地图：每 turn 一行（角色 / 预览 / 工具概览 / 估算 tokens）',
  usage: 'session outline <id|path> [--offset K] [--limit N] [--json]',
  async run(ctx) {
    const target = pos(ctx, 0)
    if (!target) {
      errorLine('缺少会话 ID 或文件路径')
      return 2
    }
    const found = resolveSession(target, ctx.pathOpts)
    if (!found) {
      errorLine(`找不到会话：${target}`)
      return EXIT_ERROR
    }
    const all = readTurns(found.filePath)
    const offset = Number(ctx.args.flags.offset ?? 0) || 0
    const limit = Number(ctx.args.flags.limit ?? 60) || 60
    const slice = all.slice(offset, offset + limit)
    if (ctx.json) {
      emitJson(slice.map((t, i) => ({ index: offset + i, role: t.role, preview: t.text.slice(0, 120), toolCalls: t.toolCount, approxTokens: estTokens(t.text) })))
      return EXIT_OK
    }
    info(`共 ${all.length} 个 turn，显示 ${offset + 1}–${Math.min(offset + limit, all.length)}`)
    for (const [i, t] of slice.entries()) {
      const preview = t.text.replace(/\s+/g, ' ').slice(0, 80) || '(无文字)'
      const tools = t.toolCount ? ` [${t.toolCount} 工具]` : ''
      emitText(`${String(offset + i).padStart(3)}  ${t.role === 'user' ? '你 ' : 'Roy'}  ${preview}${tools}`)
    }
    return EXIT_OK
  },
})

register({
  name: 'search',
  summary: '在会话内搜索关键词，返回命中 turn 下标 + 片段',
  usage: 'session search <query> <id|path> [--context N] [--limit N] [--case-sensitive] [--json]',
  async run(ctx) {
    const query = pos(ctx, 0)
    const target = pos(ctx, 1)
    if (!query || !target) {
      errorLine('用法: roy session search <关键词> <会话ID>')
      return 2
    }
    const found = resolveSession(target, ctx.pathOpts)
    if (!found) {
      errorLine(`找不到会话：${target}`)
      return EXIT_ERROR
    }
    const caseSensitive = ctx.args.flags['case-sensitive'] === true
    const limit = Number(ctx.args.flags.limit ?? 20) || 20
    const needle = caseSensitive ? query : query.toLowerCase()
    const hits: Array<{ index: number; role: string; snippet: string }> = []
    for (const [i, t] of readTurns(found.filePath).entries()) {
      const hay = caseSensitive ? t.text : t.text.toLowerCase()
      const at = hay.indexOf(needle)
      if (at < 0) continue
      const start = Math.max(0, at - 40)
      hits.push({ index: i, role: t.role, snippet: t.text.slice(start, start + 160).replace(/\s+/g, ' ') })
      if (hits.length >= limit) break
    }
    if (ctx.json) {
      emitJson(hits)
      return EXIT_OK
    }
    if (!hits.length) {
      info('没找到')
      return EXIT_OK
    }
    for (const h of hits) emitText(`${String(h.index).padStart(3)}  ${h.role === 'user' ? '你 ' : 'Roy'}  ${h.snippet}`)
    return EXIT_OK
  },
})

register({
  name: 'export',
  summary: '把会话或 turn 子集渲染为干净 Markdown',
  usage: 'session export <id|path> [--turns A-B | --head N | --tail N | --out FILE] [--stdout] [--json]',
  async run(ctx) {
    const target = pos(ctx, 0)
    if (!target) {
      errorLine('缺少会话 ID 或文件路径')
      return 2
    }
    const found = resolveSession(target, ctx.pathOpts)
    if (!found) {
      errorLine(`找不到会话：${target}`)
      return EXIT_ERROR
    }
    let turns = readTurns(found.filePath)
    const range = typeof ctx.args.flags.turns === 'string' ? /^(\d+)-(\d+)$/.exec(ctx.args.flags.turns) : null
    if (range) turns = turns.slice(Number(range[1]), Number(range[2]) + 1)
    const head = Number(ctx.args.flags.head ?? 0)
    if (head > 0) turns = turns.slice(0, head)
    const tail = Number(ctx.args.flags.tail ?? 0)
    if (tail > 0) turns = turns.slice(-tail)

    const md = [`# ${found.meta?.title || found.id}`, '', `> 导出时间 ${new Date().toLocaleString('zh-CN', { hour12: false })}`, '']
    for (const t of turns) {
      md.push(`## ${t.role === 'user' ? '你' : 'Roy'}`, '', t.text.trim() || '(无文字)', '')
      if (t.toolCount) md.push(`*（调用 ${t.toolCount} 个工具）*`, '')
    }
    const content = md.join('\n')

    if (ctx.json) {
      emitJson({ id: found.id, markdown: content })
      return EXIT_OK
    }
    const outFile = typeof ctx.args.flags.out === 'string' ? ctx.args.flags.out : ''
    if (outFile) {
      const { writeFileSync, mkdirSync } = await import('node:fs')
      const { dirname } = await import('node:path')
      mkdirSync(dirname(outFile), { recursive: true })
      writeFileSync(outFile, content, 'utf-8')
      info(`已写入 ${outFile}（${turns.length} 个 turn）`)
      return EXIT_OK
    }
    emitText(content)
    return EXIT_OK
  },
})
