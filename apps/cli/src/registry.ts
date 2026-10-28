import type { ParsedArgs } from './args'

export interface Ctx {
  args: ParsedArgs
  pathOpts: { configDir?: string; dev?: boolean }
  json: boolean
}

export interface Command {
  name: string
  summary: string
  usage: string
  run: (ctx: Ctx) => Promise<number> | number
}

const registry = new Map<string, Command>()

export function register(cmd: Command): void {
  registry.set(cmd.name, cmd)
}

export function getCommand(name: string): Command | undefined {
  return registry.get(name)
}

export function allCommands(): Command[] {
  return [...registry.values()]
}
