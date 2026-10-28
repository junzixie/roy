/**
 * Cua Driver 接入（https://github.com/trycua/cua，MIT 协议）。
 *
 * 电脑控制的执行引擎：装了 Cua Driver 就用它，没装就用 Roy 自带的 PowerShell 小助手。
 * Cua 的优势是「不抢前台」：读窗口控件、往指定窗口发消息、只截那一个窗口，
 * 每一步都能读回结果核对；它的状态（窗口快照编号）挂在一条连接上，所以这里常驻一条
 * `cua-driver mcp` 的 stdio 连接，按需启动，出错自动重连，退出时关闭。
 *
 * 隐私：每次启动都带上关闭遥测的环境变量；Roy 安装时也会执行 `telemetry disable`。
 * 不安装 Cua 的识图扩展（AGPL），也不注册开机自启的计划任务。
 */
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { CUA_DRIVER_PINNED_VERSION } from './cua-tool-defs'

const execFileAsync = promisify(execFile)

const EXE = 'cua-driver.exe'
const NO_TELEMETRY_ENV = { CUA_DRIVER_RS_TELEMETRY_ENABLED: '0', CUA_TELEMETRY_ENABLED: '0' }

function localAppData(): string {
  return process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local')
}

/** Cua 官方安装位置（Proma 等其他软件也认这里，装一次大家共用） */
export function cuaStandardBinDir(): string {
  return join(localAppData(), 'Programs', 'Cua', 'cua-driver', 'bin')
}

/** 按 Cua 官方安装器的查找顺序找 cua-driver.exe；只在 Windows 上启用 */
export function findCuaDriver(env: { platform?: string; path?: string; exists?: (p: string) => boolean } = {}): string | null {
  const platform = env.platform ?? process.platform
  if (platform !== 'win32') return null
  const exists = env.exists ?? ((p: string) => { try { return statSync(p).isFile() } catch { return false } })
  const candidates = [
    join(cuaStandardBinDir(), EXE),
    join(localAppData(), 'Programs', 'trycua', 'cua-driver-rs', 'bin', EXE),
    ...(env.path ?? process.env.PATH ?? '').split(delimiter).filter(Boolean).map((dir) => join(dir.replace(/^"|"$/g, ''), EXE)),
  ]
  return candidates.find((candidate) => exists(candidate)) ?? null
}

// ===== 常驻连接 =====

type McpClient = import('@modelcontextprotocol/sdk/client/index.js').Client
let client: McpClient | null = null
let connecting: Promise<McpClient> | null = null
let connectedExe: string | null = null

async function connect(exe: string): Promise<McpClient> {
  const [{ Client }, { StdioClientTransport }] = await Promise.all([
    import('@modelcontextprotocol/sdk/client/index.js'),
    import('@modelcontextprotocol/sdk/client/stdio.js'),
  ])
  const transport = new StdioClientTransport({
    command: exe,
    args: ['mcp'],
    env: { ...(process.env as Record<string, string>), ...NO_TELEMETRY_ENV },
    stderr: 'pipe',
  })
  transport.stderr?.on('data', (chunk: Buffer) => {
    const line = chunk.toString().trim()
    if (line) console.warn('[Cua Driver]', line.slice(0, 500))
  })
  const next = new Client({ name: 'roy', version: '1.0.0' })
  transport.onclose = () => {
    if (client === next) { client = null; connectedExe = null }
  }
  await next.connect(transport)
  console.log(`[Cua Driver] 已连接：${exe}`)
  return next
}

async function getClient(): Promise<McpClient> {
  const exe = findCuaDriver()
  if (!exe) throw new Error('没有找到 Cua Driver')
  if (client && connectedExe === exe) return client
  if (client) await disposeCuaDriver()
  connecting ??= connect(exe).then((c) => { client = c; connectedExe = exe; return c }).finally(() => { connecting = null })
  return connecting
}

export interface CuaCallResult {
  content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>
  structuredContent?: Record<string, unknown>
  isError?: boolean
}

/** 调一个 Cua 工具；连接断了自动重连一次 */
export async function callCuaTool(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<CuaCallResult> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const c = await getClient()
    try {
      const r = await c.callTool({ name, arguments: args }, undefined, { signal, timeout: 60_000 })
      return r as unknown as CuaCallResult
    } catch (error) {
      if (signal?.aborted) throw error
      const message = error instanceof Error ? error.message : String(error)
      // 进程退出 / 管道断开：丢掉连接再试一次
      if (attempt === 0 && /closed|EPIPE|not connected|ECONNRESET|terminated/i.test(message)) {
        await disposeCuaDriver()
        continue
      }
      throw error
    }
  }
  throw new Error('Cua Driver 连接失败')
}

export async function disposeCuaDriver(): Promise<void> {
  const c = client
  client = null
  connectedExe = null
  if (c) await c.close().catch(() => undefined)
}

// ===== 状态与安装 =====

export interface CuaDriverStatus {
  supported: boolean
  installed: boolean
  path: string | null
  version: string | null
  pinnedVersion: string
}

export async function getCuaDriverStatus(): Promise<CuaDriverStatus> {
  const path = findCuaDriver()
  let version: string | null = null
  if (path) {
    try {
      const { stdout } = await execFileAsync(path, ['--version'], { timeout: 8000, windowsHide: true, env: { ...process.env, ...NO_TELEMETRY_ENV } })
      version = stdout.trim().replace(/^cua-driver\s*/i, '') || null
    } catch { /* 能找到文件但跑不起来时版本留空 */ }
  }
  return { supported: process.platform === 'win32', installed: !!path, path, version, pinnedVersion: CUA_DRIVER_PINNED_VERSION }
}

/** 从 SHA256SUMS 里取某个文件的哈希 */
export function expectedSha256(sums: string, fileName: string): string | null {
  for (const line of sums.split(/\r?\n/)) {
    const m = /^([0-9a-f]{64})\s+\*?(.+)$/i.exec(line.trim())
    if (m && m[2]!.trim() === fileName) return m[1]!.toLowerCase()
  }
  return null
}

async function download(url: string): Promise<Buffer> {
  const { net } = await import('electron')
  const res = await net.fetch(url)
  if (!res.ok) throw new Error(`下载失败（HTTP ${res.status}）：${url}`)
  return Buffer.from(await res.arrayBuffer())
}

async function verifySigner(files: string[]): Promise<void> {
  // 只接受 Cua AI, Inc. 的有效 Authenticode 签名（和官方安装器同一条规则）
  const list = files.map((f) => `'${f.replace(/'/g, "''")}'`).join(',')
  const script = `@(${list}) | ForEach-Object { $s = Get-AuthenticodeSignature -LiteralPath $_; "$($s.Status)|$($s.SignerCertificate.Subject)" }`
  const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { timeout: 60_000, windowsHide: true })
  const rows = stdout.trim().split(/\r?\n/)
  if (rows.length !== files.length || rows.some((row) => !/^Valid\|.*CN="?Cua AI, Inc\.?"?/.test(row.trim()))) {
    throw new Error(`签名校验没通过：${rows.join('；')}`)
  }
}

/**
 * 安装 Cua Driver：下载官方发布包 → 核对 SHA256 → 核对数字签名 → 解压到官方安装位置 → 关闭遥测。
 * 不注册开机自启、不改 PATH、不装扩展；Roy 每次按需启动它。
 */
export async function installCuaDriver(onProgress: (message: string) => void = () => {}): Promise<CuaDriverStatus> {
  if (process.platform !== 'win32') throw new Error('Cua Driver 目前只在 Windows 上接入')
  const version = CUA_DRIVER_PINNED_VERSION
  const arch = process.arch === 'arm64' ? 'windows-arm64' : 'windows-x86_64'
  const zipName = `cua-driver-rs-${version}-${arch}.zip`
  const base = `https://github.com/trycua/cua/releases/download/cua-driver-rs-v${version}`
  onProgress('下载校验文件…')
  const sums = (await download(`${base}/SHA256SUMS`)).toString('utf8')
  const expected = expectedSha256(sums, zipName)
  if (!expected) throw new Error(`发布包里没有 ${zipName} 的校验值，停止安装`)
  onProgress(`下载 Cua Driver ${version}（约 36 MB）…`)
  const zip = await download(`${base}/${zipName}`)
  const actual = createHash('sha256').update(zip).digest('hex')
  if (actual !== expected) throw new Error('下载的文件校验不一致，可能被篡改或下载不完整，已停止安装')

  onProgress('解压…')
  const { default: AdmZip } = await import('adm-zip')
  const staging = join(localAppData(), 'Programs', 'Cua', 'cua-driver', `staging-${Date.now()}`)
  rmSync(staging, { recursive: true, force: true })
  mkdirSync(staging, { recursive: true })
  const archive = new AdmZip(zip)
  const exes: string[] = []
  for (const entry of archive.getEntries()) {
    if (entry.isDirectory) continue
    const name = entry.entryName.split('/').pop()!
    if (!name || name.includes('..')) continue
    const target = join(staging, name)
    writeFileSync(target, entry.getData())
    if (name.toLowerCase().endsWith('.exe')) exes.push(target)
  }
  if (!exes.some((f) => f.toLowerCase().endsWith(EXE))) throw new Error('发布包里没有 cua-driver.exe')

  onProgress('核对数字签名…')
  try {
    await verifySigner(exes)
  } catch (error) {
    rmSync(staging, { recursive: true, force: true })
    throw error
  }

  onProgress('安装…')
  await disposeCuaDriver()
  const bin = cuaStandardBinDir()
  mkdirSync(dirname(bin), { recursive: true })
  if (existsSync(bin)) rmSync(bin, { recursive: true, force: true })
  const { renameSync } = await import('node:fs')
  renameSync(staging, bin)
  writeFileSync(join(bin, 'INSTALLED_BY_ROY.txt'), `Installed by Roy ${new Date().toISOString()}\nversion ${version}\nsha256 ${actual}\n`)

  // 持久关闭遥测（Roy 启动时也会带环境变量关闭，这里是双保险）
  try {
    await execFileAsync(join(bin, EXE), ['telemetry', 'disable'], { timeout: 15_000, windowsHide: true, env: { ...process.env, ...NO_TELEMETRY_ENV } })
  } catch (error) {
    console.warn('[Cua Driver] 关闭遥测失败（已用环境变量关闭）:', error)
  }
  onProgress('完成')
  return getCuaDriverStatus()
}

/** 测试用：读取文件哈希 */
export function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}
