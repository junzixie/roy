import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export interface PathOpts {
  configDir?: string
  dev?: boolean
}

/** 与主进程 config-paths.ts 保持一致：支持多用户目录，否则回落到 ~/.roy */
export function resolveConfigDir(opts: PathOpts = {}): string {
  if (opts.configDir) return opts.configDir
  const useDev = opts.dev || process.env.ROY_DEV === '1'
  const base = useDev ? '.roy-dev' : '.roy'
  try {
    const usersRoot = join(homedir(), `${base}-users`)
    const current = readFileSync(join(usersRoot, 'current.txt'), 'utf8').trim()
    const { users } = JSON.parse(readFileSync(join(usersRoot, 'users.json'), 'utf8')) as {
      users: Array<{ username: string; primary?: boolean }>
    }
    const u = users.find((x) => x.username === current)
    if (u && !u.primary && /^[a-z0-9][a-z0-9_-]{0,31}$/i.test(u.username)) {
      return join(usersRoot, 'users', u.username)
    }
  } catch {
    /* 单用户模式或还没建过多用户目录 */
  }
  return join(homedir(), base)
}

export function getSessionsIndexPath(opts: PathOpts = {}): string {
  return join(resolveConfigDir(opts), 'agent-sessions.json')
}

export function getSessionsDir(opts: PathOpts = {}): string {
  return join(resolveConfigDir(opts), 'agent-sessions')
}

export function getSessionMessagesPath(id: string, opts: PathOpts = {}): string {
  return join(getSessionsDir(opts), `${id}.jsonl`)
}
