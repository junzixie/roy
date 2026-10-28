import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Ctx } from '../registry'
import { resolveConfigDir } from '../paths'
import { boolFlag, strFlag } from '../args'
import { emitJson, emitText, errorLine, EXIT_ERROR, EXIT_OK, UsageError } from '../output'
import {
  enqueueInbox,
  isBridgeAlive,
  launchRoyApp,
  readBridgeInfo,
  waitForBridge,
} from '../inbox'

/** 调用 Roy 主进程本地接口；Roy 没开时写入 inbox 并尝试拉起 */
export async function call(ctx: Ctx, name: string, body: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const file = join(resolveConfigDir(ctx.pathOpts), 'cli-bridge.json')
  const bridgeUp = existsSync(file) && isBridgeAlive(ctx.pathOpts)

  if (!bridgeUp) {
    const job = enqueueInbox(name, body, ctx.pathOpts)
    const launch = launchRoyApp()
    const wait = body.wait === true

    if (!launch.launched) {
      return {
        ok: true,
        queued: true,
        jobId: job.id,
        launched: false,
        error: launch.error,
        hint: '任务已写入 inbox；请手动打开 Roy，启动后会自动执行。',
      }
    }

    if (!wait) {
      return {
        ok: true,
        queued: true,
        jobId: job.id,
        launched: true,
        app: launch.path,
      }
    }

    // --wait：等桥起来后再直连执行（inbox 里那条可能已被主进程先消化，再发一次也可）
    const info = await waitForBridge(ctx.pathOpts, 90_000)
    let res: Response
    try {
      res = await fetch(`http://127.0.0.1:${info.port}/${name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${info.token}` },
        body: JSON.stringify(body),
      })
    } catch {
      throw new Error('Roy 已拉起但接口仍连不上，请稍后重试')
    }
    const data = (await res.json()) as Record<string, unknown>
    if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : `HTTP ${res.status}`)
    return data
  }

  const { port, token } = readBridgeInfo(ctx.pathOpts) ?? JSON.parse(readFileSync(file, 'utf8')) as { port: number; token: string }
  let res: Response
  try {
    res = await fetch(`http://127.0.0.1:${port}/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    })
  } catch {
    // 桥文件在但进程已死 → 回退 inbox
    const job = enqueueInbox(name, body, ctx.pathOpts)
    const launch = launchRoyApp()
    throw new Error(
      launch.launched
        ? `连不上 Roy，已重新拉起并把任务写入 inbox（${job.id}）`
        : `连不上 Roy：${launch.error ?? '未知'}；任务已写入 inbox（${job.id}）`,
    )
  }
  const data = (await res.json()) as Record<string, unknown>
  if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : `HTTP ${res.status}`)
  return data
}

export const fmtTime = (ms?: number): string =>
  ms ? new Date(ms).toLocaleString('zh-CN', { hour12: false }) : ''

export const pos = (ctx: Ctx, i: number): string => ctx.args.positionals[i] ?? ''

export function out(ctx: Ctx, data: unknown, text: () => string): number {
  if (ctx.json) emitJson(data)
  else emitText(text())
  return EXIT_OK
}

export { errorLine, emitJson, emitText, info, EXIT_ERROR, EXIT_OK, UsageError } from '../output'
export { boolFlag, strFlag } from '../args'
