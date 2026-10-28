/** 命令行参数解析：位置参数 + `--name value` / `--name=value` / `--flag` */
export interface ParsedArgs {
  positionals: string[]
  flags: Record<string, string | true>
}

export function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = []
  const flags: Record<string, string | true> = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    if (arg.startsWith('--')) {
      const body = arg.slice(2)
      const eq = body.indexOf('=')
      if (eq >= 0) {
        flags[body.slice(0, eq)] = body.slice(eq + 1)
      } else {
        const next = argv[i + 1]
        if (next !== undefined && !next.startsWith('--')) {
          flags[body] = next
          i++
        } else {
          flags[body] = true
        }
      }
    } else {
      positionals.push(arg)
    }
  }
  return { positionals, flags }
}

export function strFlag(flags: Record<string, string | true>, ...names: string[]): string | undefined {
  for (const n of names) {
    const v = flags[n]
    if (typeof v === 'string') return v
  }
  return undefined
}

export function boolFlag(flags: Record<string, string | true>, ...names: string[]): boolean {
  return names.some((n) => flags[n] === true || flags[n] === 'true')
}

export function numFlag(flags: Record<string, string | true>, ...names: string[]): number | undefined {
  const s = strFlag(flags, ...names)
  if (s === undefined) return undefined
  const n = Number(s)
  return Number.isFinite(n) ? n : undefined
}
