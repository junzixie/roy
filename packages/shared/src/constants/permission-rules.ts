/**
 * 工具分类规则 — Agent 权限系统
 *
 * 内置安全工具白名单、安全 Bash 命令模式、危险命令列表，
 * 以及权限模式下的自动放行/询问判断。
 *
 * 对照 Feibo tools.ts 的 LOOK_ONLY：扩展诊断类只读命令启发式。
 */

/** 始终安全的工具（不询问） */
export const SAFE_TOOLS: readonly string[] = [
  'Read',
  'Glob',
  'Grep',
  'BrowserObserve',
  'BrowserFind',
  'BrowserNavigate',
  'BrowserClick',
  'BrowserAct',
  'BrowserFill',
  'BrowserPress',
  'BrowserHover',
  'BrowserDrag',
  'BrowserScroll',
  'BrowserExtract',
  'BrowserSelectOption',
  'BrowserScreenshot',
  'BrowserListTabs',
  'BrowserNewTab',
  'BrowserSelectTab',
  'BrowserCloseTab',
  'BrowserClose',
  'BrowserPreviewOpen',
  'TodoRead',
  'computer_screenshot',
  'computer_windows',
  'screen_capture',
  'computer_click',
  'computer_move',
  'computer_drag',
  'computer_scroll',
  'computer_type',
  'computer_key',
  'computer_focus',
  'computer_open',
  'open_file',
  'TaskOutput',
]

/** 安全的 Bash 命令模式（只读诊断） */
export const SAFE_BASH_PATTERNS: readonly RegExp[] = [
  /^git\s+(status|log|diff|show|branch|remote|tag)\b/,
  /^ls\b/,
  /^head\b/,
  /^tail\b/,
  /^grep\b/,
  /^rg\b/,
  /^which\b/,
  /^pwd$/,
  /^env$/,
  /^whoami$/,
  /^uname\b/,
  /^tree\b/,
  /^wc\b/,
  /^file\b/,
  /^stat\b/,
  /^du\b/,
  /^df\b/,
  /^node\s+--version$/,
  /^bun\s+--version$/,
  /^npm\s+(list|ls|view|info|outdated)\b/,
  /^bun\s+(pm\s+ls)\b/,
  // Feibo LOOK_ONLY 启发：跨平台诊断（无管道/重定向时由 isSafeBashCommand 放行）
  /^hostname\b/,
  /^uptime\b/,
  /^free\b/,
  /^ps\b/,
  /^top\s+-b\b/,
  /^ipconfig(\s+\/(all|displaydns|\?))?$/i,
  /^systeminfo\b/i,
  /^tasklist\b/i,
  /^nvidia-smi\b/i,
  /^ver$/i,
  /^get-process\b/i,
  /^get-service\b/i,
  /^get-computerinfo\b/i,
  /^get-date\b/i,
  /^get-host\b/i,
  /^get-uptime\b/i,
  /^get-psdrive\b/i,
  /^get-volume\b/i,
  /^get-netadapter\b/i,
  /^get-netipaddress\b/i,
  /^\$psversiontable$/i,
]

/**
 * 更窄的「只读观察」命令：用于文档与未来策略；
 * 当前 isSafeBashCommand 已覆盖同等集合中的安全子集。
 */
export const LOOK_ONLY_BASH_PATTERNS: readonly RegExp[] = [
  /^git\s+(status|log|diff|show|branch|remote|tag)\b/,
  /^ls\b/,
  /^pwd$/,
  /^whoami$/,
  /^uname\b/,
  /^hostname\b/,
  /^uptime\b/,
  /^ipconfig(\s+\/(all|displaydns|\?))?$/i,
  /^systeminfo\b/i,
  /^tasklist\b/i,
  /^ver$/i,
  /^get-process\b/i,
  /^get-date\b/i,
  /^get-host\b/i,
  /^\$psversiontable$/i,
]

/** 危险命令前缀（需特别警惕） */
export const DANGEROUS_COMMANDS: readonly string[] = [
  'rm', 'rmdir',
  'sudo', 'su',
  'chmod', 'chown',
  'mv',
  'dd',
  'kill', 'killall', 'pkill',
  'git push', 'git reset', 'git rebase', 'git checkout',
  'git clean', 'git branch -D', 'git branch -d',
  'npm publish',
  'curl', 'wget',
  'ssh', 'scp',
]

/**
 * 检查 Bash 命令是否包含危险结构
 *
 * 管道、输出重定向、exec 替换等危险模式。
 * MVP 阶段使用简单字符检测，后续可升级为 shell AST 解析。
 */
export function hasDangerousStructure(command: string): boolean {
  if (/[|]/.test(command)) return true
  if (/>{1,2}/.test(command)) return true
  if (/\b-exec\b/.test(command) || /\b-delete\b/.test(command)) return true
  if (/[;&]/.test(command)) return true
  if (/\$\(/.test(command) || /`/.test(command)) return true
  return false
}

/** 判断 Bash 命令是否匹配安全模式 */
export function isSafeBashCommand(command: string): boolean {
  const trimmed = command.trim()
  if (hasDangerousStructure(trimmed)) return false
  return SAFE_BASH_PATTERNS.some((pattern) => pattern.test(trimmed))
}

/**
 * 判断是否为「只读观察」类命令（Feibo LOOK_ONLY 启发）。
 * 含危险结构时一律 false。
 */
export function isLookOnlyBashCommand(command: string): boolean {
  const trimmed = command.trim()
  if (hasDangerousStructure(trimmed)) return false
  return LOOK_ONLY_BASH_PATTERNS.some((pattern) => pattern.test(trimmed))
}

/** 判断命令是否为危险命令 */
export function isDangerousCommand(command: string): boolean {
  const trimmed = command.trim().toLowerCase()
  return DANGEROUS_COMMANDS.some((dc) => trimmed.startsWith(dc.toLowerCase()))
}