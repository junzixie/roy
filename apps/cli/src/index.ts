/**
 * roy — Roy 命令行工具
 *
 * 用 bun 编译成单文件二进制，打进 process.resourcesPath/bin/。
 * 两部分能力：
 * 1. 会话分析（list / info / outline / search / export）：直接读 ~/.roy，不需要 Roy 在运行
 * 2. 在线操作（ask / cron / todo / workflow / project / status）：走 cli-bridge 的本地 HTTP 接口
 */
import { parseArgs, boolFlag, strFlag } from './args'
import { allCommands, getCommand, type Ctx } from './registry'
import { errorLine, info, EXIT_ERROR, EXIT_OK, EXIT_USAGE, UsageError } from './output'

// 注册全部命令
import './commands/basic'
import './commands/workflow'
import './commands/ops'
import './commands/session'

function printHelp(): void {
  info(`roy — Roy 命令行工具`)
  info(`用法: roy <command> [args] [--flags]（ask / cron / todo / workflow / project / status 需要 Roy 在运行）`)
  info('')
  info('命令:')
  for (const c of allCommands()) {
    info(`  ${c.usage.padEnd(78)} ${c.summary}`)
  }
  info('')
  info('全局 flag: --json  --config-dir DIR  --dev')
  info('')
  info('例子: roy ask "整理一下下载文件夹" --wait   roy status   roy workflow show 周报')
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2)
  if (argv.length === 0 || argv[0] === 'help' || argv[0] === '--help' || argv[0] === '-h') {
    printHelp()
    return EXIT_OK
  }

  // session 是二级命名空间：roy session list
  let rest = argv
  let prefix = ''
  if (argv[0] === 'session') {
    rest = argv.slice(1)
    prefix = 'session '
  }
  const cmdName = rest[0]
  if (!cmdName) {
    printHelp()
    return EXIT_USAGE
  }
  const command = getCommand(cmdName)
  if (!command) {
    errorLine(`未知命令: ${cmdName}`)
    printHelp()
    return EXIT_USAGE
  }

  const parsed = parseArgs(rest.slice(1))
  const pathOpts = {
    configDir: strFlag(parsed.flags, 'config-dir'),
    dev: boolFlag(parsed.flags, 'dev'),
  }
  const ctx: Ctx = { args: parsed, pathOpts, json: boolFlag(parsed.flags, 'json') }

  try {
    return await command.run(ctx)
  } catch (err) {
    if (err instanceof UsageError) {
      errorLine(err.message)
      info(`用法: roy ${prefix}${command.usage}`)
      return EXIT_USAGE
    }
    errorLine(err instanceof Error ? err.message : String(err))
    return EXIT_ERROR
  }
}

main().then((code) => process.exit(code))
