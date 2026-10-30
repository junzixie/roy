/**
 * Pi Runtime 用户 MCP 工具桥接层
 *
 * Claude runtime 继续使用 Claude Agent SDK 原生 mcpServers；Pi SDK 当前没有等价
 * mcpServers 参数，因此 Roy 在主进程连接用户配置的 MCP server，并把 MCP tools
 * 映射成 Pi customTools。
 */

import { createHash } from 'node:crypto'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { StreamableHTTPClientTransport, StreamableHTTPError } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { ToolDefinition } from '@earendil-works/pi-coding-agent'
import type { AgentToolResult } from '@earendil-works/pi-agent-core'
import type { TextContent, ImageContent } from '@earendil-works/pi-ai'
import type { TSchema } from 'typebox'
import { Type } from 'typebox'
import { createManagedProxyFetch, type ManagedProxyFetch } from '../proxy-fetch'
import { sanitizeToolResultImageContent } from '../image-content-validation'

const DEFAULT_MCP_REQUEST_TIMEOUT_MS = 60_000
const DEFAULT_MCP_STARTUP_TIMEOUT_MS = 30_000
const OPTIONAL_MCP_BOOTSTRAP_TIMEOUT_MS = 500
/**
 * required MCP 连接失败后的冷却窗口。冷却期内按可选服务器处理（本回合最多等
 * bootstrap 窗口，后台继续重连），避免失效服务器让每轮 Agent 请求都阻塞完整的
 * 握手超时（默认 30s connect + 60s listTools）。
 */
const REQUIRED_MCP_FAILURE_COOLDOWN_MS = 2 * 60_000
/** 失败冷却表的防御性上限；超出时淘汰最旧记录，避免配置频繁变更导致无限增长。 */
const REQUIRED_MCP_FAILURE_CACHE_LIMIT = 64
const HTTP_SESSION_REJECTION_PATTERN = /missing session id|no valid session id provided|mcp-session-id header is required/i
const transportProxyFetches = new WeakMap<Transport, ManagedProxyFetch>()

/** required MCP 最近一次工具发现失败的时间（key: serverName + 配置摘要）。 */
const requiredMcpFailureTimestamps = new Map<string, number>()

function markRequiredMcpFailure(key: string): void {
  if (requiredMcpFailureTimestamps.size >= REQUIRED_MCP_FAILURE_CACHE_LIMIT) {
    const oldestKey = requiredMcpFailureTimestamps.keys().next().value
    if (oldestKey !== undefined) requiredMcpFailureTimestamps.delete(oldestKey)
  }
  requiredMcpFailureTimestamps.set(key, Date.now())
}

interface PiMcpServerConfig {
  type?: unknown
  command?: unknown
  args?: unknown
  env?: unknown
  url?: unknown
  headers?: unknown
  startup_timeout_sec?: unknown
  timeout?: unknown
  proxyUrl?: unknown
  required?: unknown
  /** 'on-demand'：平时不连接，经入口工具或 @ 点名时才连接，空闲后自动断开 */
  loadMode?: unknown
}

/** 按需 MCP 空闲多久后断开（毫秒）。 */
const ON_DEMAND_IDLE_CLOSE_MS = 5 * 60_000
/** 空闲检查间隔。 */
const ON_DEMAND_IDLE_SWEEP_MS = 60_000
/** 入口工具名。 */
export const ON_DEMAND_GATEWAY_TOOL_NAME = 'mcp_on_demand'

function isOnDemand(config: PiMcpServerConfig): boolean {
  return config.loadMode === 'on-demand'
}

type PiMcpServers = Record<string, Record<string, unknown>>

type McpToolInfo = Awaited<ReturnType<Client['listTools']>>['tools'][number]

type McpCallToolResult = Awaited<ReturnType<Client['callTool']>>

interface McpConnection {
  client: Client
  transport: Transport
  close: () => Promise<void>
  proxyFetch?: ManagedProxyFetch
  tools?: McpToolInfo[]
  toolsPromise?: Promise<McpToolInfo[]>
}

interface McpConnectionEntry {
  promise: Promise<McpConnection>
  activeLeases: number
  stale: boolean
  closed: boolean
}

interface McpConnectionLease {
  key: string
  entry: McpConnectionEntry
  connection: McpConnection
}

interface McpToolBinding {
  serverName: string
  originalToolName: string
  tool: McpToolInfo
  manager: PiMcpClientManager
  managerConfig: PiMcpServerConfig
}

function stableStringify(value: unknown): string {
  if (value === undefined) return 'null'
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const obj = value as Record<string, unknown>
  return `{${Object.keys(obj).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`).join(',')}}`
}

function configHash(config: unknown): string {
  return createHash('sha256').update(stableStringify(config)).digest('hex').slice(0, 16)
}

function normalizeToolSegment(segment: string): string {
  const normalized = segment.replace(/[^A-Za-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '')
  if (!normalized) return 'unnamed'
  return /^[A-Za-z_]/.test(normalized) ? normalized : `_${normalized}`
}

function mcpToolName(serverName: string, toolName: string): string {
  return `mcp__${normalizeToolSegment(serverName)}__${normalizeToolSegment(toolName)}`
}

function getHeaders(config: PiMcpServerConfig): Record<string, string> | undefined {
  if (!config.headers || typeof config.headers !== 'object') return undefined
  const headers: Record<string, string> = {}
  for (const [key, value] of Object.entries(config.headers as Record<string, unknown>)) {
    if (typeof value === 'string') headers[key] = value
  }
  return Object.keys(headers).length > 0 ? headers : undefined
}

function getTimeoutMs(config: PiMcpServerConfig): number {
  const timeoutSec = typeof config.startup_timeout_sec === 'number'
    ? config.startup_timeout_sec
    : typeof config.timeout === 'number'
      ? config.timeout
      : undefined
  if (!timeoutSec || !Number.isFinite(timeoutSec) || timeoutSec <= 0) return DEFAULT_MCP_STARTUP_TIMEOUT_MS
  return timeoutSec * 1000
}

function getProxyFetch(config: PiMcpServerConfig): ManagedProxyFetch | undefined {
  return typeof config.proxyUrl === 'string' && config.proxyUrl.trim()
    ? createManagedProxyFetch(config.proxyUrl)
    : undefined
}

function createTransport(name: string, config: PiMcpServerConfig): Transport | undefined {
  const type = config.type
  if (type === 'stdio') {
    if (typeof config.command !== 'string' || !config.command.trim()) {
      console.warn(`[Pi MCP] MCP 服务器 ${name} 缺少 command，已跳过`)
      return undefined
    }
    const env = typeof config.env === 'object' && config.env
      ? Object.fromEntries(Object.entries(config.env as Record<string, unknown>).filter(([, value]) => typeof value === 'string')) as Record<string, string>
      : undefined
    return new StdioClientTransport({
      command: config.command,
      args: Array.isArray(config.args) ? config.args.filter((arg): arg is string => typeof arg === 'string') : undefined,
      env,
      stderr: 'inherit',
    })
  }

  if (type === 'http') {
    if (typeof config.url !== 'string' || !config.url.trim()) {
      console.warn(`[Pi MCP] MCP 服务器 ${name} 缺少 url，已跳过`)
      return undefined
    }
    const headers = getHeaders(config)
    const proxyFetch = getProxyFetch(config)
    const transport = new StreamableHTTPClientTransport(new URL(config.url), {
      requestInit: headers ? { headers } : undefined,
      fetch: proxyFetch?.fetch,
    })
    if (proxyFetch) transportProxyFetches.set(transport, proxyFetch)
    return transport
  }

  if (type === 'sse') {
    if (typeof config.url !== 'string' || !config.url.trim()) {
      console.warn(`[Pi MCP] MCP 服务器 ${name} 缺少 url，已跳过`)
      return undefined
    }
    const headers = getHeaders(config)
    const proxyFetch = getProxyFetch(config)
    const transport = new SSEClientTransport(new URL(config.url), {
      requestInit: headers ? { headers } : undefined,
      fetch: proxyFetch?.fetch,
      eventSourceInit: headers || proxyFetch
        ? ({
          fetch: (input: RequestInfo | URL, init?: RequestInit) => {
            const mergedHeaders = new Headers(init?.headers)
            for (const [key, value] of Object.entries(headers ?? {})) mergedHeaders.set(key, value)
            return (proxyFetch?.fetch ?? fetch)(input, { ...init, headers: mergedHeaders })
          },
        } as any)
        : undefined,
    })
    if (proxyFetch) transportProxyFetches.set(transport, proxyFetch)
    return transport
  }

  console.warn(`[Pi MCP] MCP 服务器 ${name} 使用暂不支持的类型 ${String(type)}，已跳过`)
  return undefined
}

function isObjectSchema(schema: unknown): schema is Record<string, unknown> {
  return !!schema && typeof schema === 'object' && !Array.isArray(schema)
}

function toTypeBoxSchema(schema: unknown): TSchema {
  if (!isObjectSchema(schema)) return Type.Object({})
  if (schema.type !== 'object') return Type.Object({})
  return Type.Unsafe(schema)
}

function stringifyForTool(content: unknown): string {
  if (typeof content === 'string') return content
  try {
    return JSON.stringify(content, null, 2)
  } catch {
    return String(content)
  }
}

function convertMcpResult(result: McpCallToolResult): AgentToolResult<unknown> {
  const content: Array<TextContent | ImageContent> = []

  if ('content' in result && Array.isArray(result.content)) {
    for (const block of result.content) {
      if (block.type === 'text') {
        content.push({ type: 'text', text: block.text })
      } else if (block.type === 'image') {
        content.push({ type: 'image', data: block.data, mimeType: block.mimeType })
      } else {
        content.push({ type: 'text', text: stringifyForTool(block) })
      }
    }
  } else if ('toolResult' in result) {
    content.push({ type: 'text', text: stringifyForTool(result.toolResult) })
  }

  if ('structuredContent' in result && result.structuredContent !== undefined) {
    content.push({ type: 'text', text: `structuredContent:\n${stringifyForTool(result.structuredContent)}` })
  }

  if (content.length === 0) {
    content.push({ type: 'text', text: stringifyForTool(result) })
  }

  if ('isError' in result && result.isError) {
    content.unshift({ type: 'text', text: 'MCP tool returned isError=true.' })
  }

  return {
    content: sanitizeToolResultImageContent(content),
    details: result,
  } as AgentToolResult<unknown>
}

/**
 * Optional MCP 服务首次连接在后台继续；首轮消息最多为它等待短暂的 bootstrap 窗口。
 * 连接完成后，manager 会缓存 tools，后续回合直接复用，不会重复冷启动 stdio 进程。
 */
async function listOptionalMcpTools(
  manager: PiMcpClientManager,
  serverName: string,
  config: PiMcpServerConfig,
): Promise<McpToolInfo[] | undefined> {
  const toolsPromise = manager.listTools(serverName, config)
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      toolsPromise,
      new Promise<undefined>((resolve) => {
        timeout = setTimeout(() => resolve(undefined), OPTIONAL_MCP_BOOTSTRAP_TIMEOUT_MS)
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

/**
 * Required MCP 需要等待真实握手结果，保证刚连接/刚变更配置的服务器在本回合即可用。
 * 但一旦最近一次工具发现失败过，冷却期内回落到 optional 竞态（后台继续重连），
 * 避免断网、失效凭据或异常服务器反复阻塞后续每一轮消息。冷却期内的后台重连一旦
 * 成功，立即退出冷却并恢复 required 语义。
 */
async function listRequiredMcpTools(
  manager: PiMcpClientManager,
  serverName: string,
  config: PiMcpServerConfig,
): Promise<McpToolInfo[] | undefined> {
  const failureKey = `${serverName}:${configHash(config)}`
  const failedAt = requiredMcpFailureTimestamps.get(failureKey)
  if (failedAt !== undefined && Date.now() - failedAt < REQUIRED_MCP_FAILURE_COOLDOWN_MS) {
    const tools = await listOptionalMcpTools(manager, serverName, config)
    if (tools) requiredMcpFailureTimestamps.delete(failureKey)
    return tools
  }
  try {
    const tools = await manager.listTools(serverName, config)
    requiredMcpFailureTimestamps.delete(failureKey)
    return tools
  } catch (error) {
    markRequiredMcpFailure(failureKey)
    console.warn(
      `[Pi MCP] required MCP 服务器 ${serverName} 连接失败，${REQUIRED_MCP_FAILURE_COOLDOWN_MS / 1000}s 冷却期内将按可选服务器处理`,
      error,
    )
    throw error
  }
}

class PiMcpClientManager {
  private readonly connections = new Map<string, McpConnectionEntry>()
  private lifecycleGeneration = 0
  /** 按需连接最近一次使用时间（key 同 connections）。 */
  private readonly onDemandLastUsed = new Map<string, { serverName: string; at: number }>()
  private idleTimer: ReturnType<typeof setInterval> | undefined

  /** 记一次按需连接的使用，并确保空闲检查在跑。 */
  private touchOnDemand(key: string, serverName: string): void {
    this.onDemandLastUsed.set(key, { serverName, at: Date.now() })
    if (!this.idleTimer) {
      this.idleTimer = setInterval(() => { void this.closeIdleOnDemand() }, ON_DEMAND_IDLE_SWEEP_MS)
      this.idleTimer.unref?.()
    }
  }

  /** 断开空闲超过 ON_DEMAND_IDLE_CLOSE_MS 的按需连接；正在调用中的不动。 */
  async closeIdleOnDemand(now = Date.now(), idleMs = ON_DEMAND_IDLE_CLOSE_MS): Promise<string[]> {
    const closed: string[] = []
    for (const [key, { serverName, at }] of [...this.onDemandLastUsed]) {
      const entry = this.connections.get(key)
      if (!entry) {
        this.onDemandLastUsed.delete(key)
        continue
      }
      if (now - at < idleMs || entry.activeLeases > 0) continue
      this.onDemandLastUsed.delete(key)
      entry.stale = true
      this.connections.delete(key)
      try {
        const conn = await entry.promise
        await conn.close()
      } catch {
        // 连接本身失败或已关闭，忽略
      }
      closed.push(serverName)
      console.log(`[Pi MCP] 按需 MCP 服务器 ${serverName} 已空闲 ${Math.round(idleMs / 60_000)} 分钟，已断开`)
    }
    if (this.onDemandLastUsed.size === 0 && this.idleTimer) {
      clearInterval(this.idleTimer)
      this.idleTimer = undefined
    }
    return closed
  }

  /** 当前保持着的连接名（测试与状态展示用）。 */
  connectedServerNames(): string[] {
    return [...this.connections.keys()].map((key) => key.slice(0, key.lastIndexOf(':')))
  }

  /**
   * 关闭所有活跃的 MCP 连接，释放 stdio 子进程和网络资源。
   * 应在 app quit 或 agent session 结束时调用。
   */
  async dispose(): Promise<void> {
    this.lifecycleGeneration += 1
    const entries = [...this.connections.values()]
    this.connections.clear()
    this.onDemandLastUsed.clear()
    if (this.idleTimer) {
      clearInterval(this.idleTimer)
      this.idleTimer = undefined
    }
    requiredMcpFailureTimestamps.clear()
    await Promise.allSettled(
      entries.map(async (entry) => {
        try {
          const conn = await entry.promise
          await conn.close()
        } catch {
          // 连接本身就失败了，忽略
        }
      }),
    )
  }

  async listTools(serverName: string, config: PiMcpServerConfig): Promise<McpToolInfo[]> {
    return this.executeWithSessionRecovery(serverName, config, undefined, async (connection) => {
      if (connection.tools) return connection.tools
      if (!connection.toolsPromise) {
        connection.toolsPromise = connection.client.listTools(undefined, { timeout: DEFAULT_MCP_REQUEST_TIMEOUT_MS })
          .then((result) => {
            connection.tools = result.tools
            return result.tools
          })
          .catch((error) => {
            connection.toolsPromise = undefined
            throw error
          })
      }
      return connection.toolsPromise
    })
  }

  async callTool(serverName: string, config: PiMcpServerConfig, toolName: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<McpCallToolResult> {
    return this.executeWithSessionRecovery(serverName, config, signal, (connection) =>
      connection.client.callTool(
        { name: toolName, arguments: args },
        undefined,
        { signal, timeout: DEFAULT_MCP_REQUEST_TIMEOUT_MS, resetTimeoutOnProgress: true },
      ))
  }

  private async executeWithSessionRecovery<T>(
    serverName: string,
    config: PiMcpServerConfig,
    signal: AbortSignal | undefined,
    operation: (connection: McpConnection) => Promise<T>,
  ): Promise<T> {
    const lifecycleGeneration = this.lifecycleGeneration
    const lease = await this.acquireConnection(serverName, config)
    let leaseReleased = false
    try {
      try {
        return await operation(lease.connection)
      } catch (error) {
        if (!this.isRejectedHttpSession(error, lease.connection)) {
          throw error
        }

        this.markConnectionStale(lease)
        await this.releaseConnection(lease)
        leaseReleased = true
        if (signal?.aborted || this.lifecycleGeneration !== lifecycleGeneration) throw error

        console.info(`[Pi MCP] MCP 服务器 ${serverName} Session 已失效，正在重新握手`)

        const replacement = await this.acquireConnection(serverName, config)
        try {
          try {
            return await operation(replacement.connection)
          } catch (retryError) {
            if (this.isRejectedHttpSession(retryError, replacement.connection)) {
              this.markConnectionStale(replacement)
            }
            throw retryError
          }
        } finally {
          await this.releaseConnection(replacement)
        }
      }
    } finally {
      if (!leaseReleased) {
        await this.releaseConnection(lease)
      }
    }
  }

  private isRejectedHttpSession(error: unknown, connection: McpConnection): boolean {
    if (!(connection.transport instanceof StreamableHTTPClientTransport)) return false
    if (connection.transport.sessionId === undefined) return false
    if (!(error instanceof StreamableHTTPError)) return false
    if (error.code === 404) return true
    return error.code === 400 && HTTP_SESSION_REJECTION_PATTERN.test(error.message)
  }

  private async acquireConnection(serverName: string, config: PiMcpServerConfig): Promise<McpConnectionLease> {
    const key = `${serverName}:${configHash(config)}`
    if (isOnDemand(config)) this.touchOnDemand(key, serverName)
    let entry = this.connections.get(key)

    if (!entry) {
      let createdEntry!: McpConnectionEntry
      const promise = this.createConnection(serverName, config, () => {
        createdEntry.stale = true
        createdEntry.closed = true
        if (this.connections.get(key) === createdEntry) {
          this.connections.delete(key)
        }
      }).catch((error) => {
        createdEntry.stale = true
        if (this.connections.get(key) === createdEntry) {
          this.connections.delete(key)
        }
        throw error
      })
      createdEntry = {
        promise,
        activeLeases: 0,
        stale: false,
        closed: false,
      }
      entry = createdEntry
      this.connections.set(key, entry)
    }

    entry.activeLeases += 1
    try {
      return {
        key,
        entry,
        connection: await entry.promise,
      }
    } catch (error) {
      entry.activeLeases -= 1
      throw error
    }
  }

  private markConnectionStale(lease: McpConnectionLease): void {
    lease.entry.stale = true
    if (this.connections.get(lease.key) === lease.entry) {
      this.connections.delete(lease.key)
    }
  }

  private async releaseConnection(lease: McpConnectionLease): Promise<void> {
    lease.entry.activeLeases -= 1
    // 按需连接的空闲时间从最后一次调用结束算起
    const usage = this.onDemandLastUsed.get(lease.key)
    if (usage) usage.at = Date.now()
    if (!lease.entry.stale || lease.entry.closed || lease.entry.activeLeases > 0) return
    try {
      await lease.connection.close()
    } catch {
      // Session 已由服务端终止，关闭旧 transport 失败不影响重新握手。
    }
  }

  private async createConnection(
    serverName: string,
    config: PiMcpServerConfig,
    onClose: () => void,
  ): Promise<McpConnection> {
    const transport = createTransport(serverName, config)
    if (!transport) throw new Error(`无法创建 MCP transport: ${serverName}`)
    const proxyFetch = transportProxyFetches.get(transport)

    const client = new Client({ name: 'roy-pi-agent-mcp-bridge', version: '0.1.0' }, { capabilities: {} })
    try {
      await client.connect(transport, { timeout: getTimeoutMs(config) })
    } catch (error) {
      try { await transport.close() } catch { /* connection setup already failed */ }
      await proxyFetch?.close()
      throw error
    }

    let closing = false

    const previousOnError = transport.onerror
    transport.onerror = (error) => {
      previousOnError?.(error)
      if (!closing) {
        console.warn(`[Pi MCP] MCP 服务器 ${serverName} transport error:`, error)
      }
    }
    const previousOnClose = transport.onclose
    transport.onclose = () => {
      closing = true
      previousOnClose?.()
      onClose()
    }

    return {
      client,
      transport,
      close: async () => {
        closing = true
        try {
          await transport.close()
        } finally {
          await proxyFetch?.close()
        }
      },
    }
  }
}

const manager = new PiMcpClientManager()

function createPiMcpToolDefinition(binding: McpToolBinding): ToolDefinition {
  const toolName = mcpToolName(binding.serverName, binding.originalToolName)
  const description = binding.tool.description || `Call MCP tool ${binding.originalToolName} from server ${binding.serverName}`

  return {
    name: toolName,
    label: toolName,
    description,
    promptSnippet: `${toolName}: ${description}`,
    parameters: toTypeBoxSchema(binding.tool.inputSchema),
    async execute(_toolCallId, params, signal) {
      const args = isObjectSchema(params) ? params as Record<string, unknown> : {}
      const result = await binding.manager.callTool(binding.serverName, binding.managerConfig, binding.originalToolName, args, signal)
      return convertMcpResult(result)
    },
  } as ToolDefinition
}

function textResult(text: string): AgentToolResult<unknown> {
  return { content: [{ type: 'text', text }], details: {} } as AgentToolResult<unknown>
}

/**
 * 按需 MCP 的入口工具：模型只看到这一个工具和服务器名单，
 * 需要时先 list_tools（这时才连接），再 call。连接空闲 5 分钟后自动断开。
 */
function createOnDemandGatewayTool(servers: PiMcpServers): ToolDefinition {
  const names = Object.keys(servers)
  const description = [
    `按需连接的 MCP 服务器入口。可用服务器：${names.join('、')}。`,
    '这些服务器平时不连接，调用本工具时才连接，空闲 5 分钟后自动断开。',
    '用法：先 action="list_tools" 查看该服务器的工具和参数，再 action="call" 传 tool 和 arguments 调用。',
  ].join('')
  return {
    name: ON_DEMAND_GATEWAY_TOOL_NAME,
    label: '按需 MCP',
    description,
    promptSnippet: `${ON_DEMAND_GATEWAY_TOOL_NAME}: ${description}`,
    parameters: Type.Object({
      server: Type.String({ description: `服务器名：${names.join(' | ')}` }),
      action: Type.Union([Type.Literal('list_tools'), Type.Literal('call')]),
      tool: Type.Optional(Type.String({ description: 'action=call 时要调用的工具名（list_tools 返回的 name）' })),
      arguments: Type.Optional(Type.Record(Type.String(), Type.Any(), { description: 'action=call 时传给工具的参数' })),
    }),
    async execute(_toolCallId, params, signal) {
      const p = (isObjectSchema(params) ? params : {}) as { server?: unknown; action?: unknown; tool?: unknown; arguments?: unknown }
      const serverName = typeof p.server === 'string' ? p.server : ''
      const config = servers[serverName] as PiMcpServerConfig | undefined
      if (!config) return textResult(`没有名为「${serverName}」的按需 MCP 服务器。可用：${names.join('、')}`)

      if (p.action === 'list_tools') {
        const mcpTools = await manager.listTools(serverName, config)
        const summary = mcpTools.map((tool) => ({ name: tool.name, description: tool.description ?? '', inputSchema: tool.inputSchema }))
        return textResult(JSON.stringify({ server: serverName, connected: true, tools: summary }))
      }

      if (p.action === 'call') {
        if (typeof p.tool !== 'string' || !p.tool) return textResult('action=call 需要 tool（先用 list_tools 查看可用工具名）')
        const args = isObjectSchema(p.arguments) ? p.arguments as Record<string, unknown> : {}
        const result = await manager.callTool(serverName, config, p.tool, args, signal)
        return convertMcpResult(result)
      }

      return textResult('action 只能是 list_tools 或 call')
    },
  } as ToolDefinition
}

/** 断开空闲的按需 MCP 连接（测试用；运行时由定时器自动执行）。 */
export async function closeIdleOnDemandMcpConnections(now?: number, idleMs?: number): Promise<string[]> {
  return manager.closeIdleOnDemand(now, idleMs)
}

/** 当前保持着的 MCP 连接名（测试用）。 */
export function getConnectedMcpServerNames(): string[] {
  return manager.connectedServerNames()
}

/**
 * 将 Roy 已构建的 MCP server 配置转换为 Pi customTools。
 *
 * 注意：本函数仅供 Pi runtime 使用；Claude runtime 仍直接把 mcpServers 交给
 * Claude Agent SDK，不经过这里。
 */
export async function buildPiMcpTools(
  mcpServers: PiMcpServers,
  proxyUrl?: string,
  options: { activateServers?: string[] } = {},
): Promise<ToolDefinition[]> {
  const tools: ToolDefinition[] = []
  const proxiedServers = proxyUrl
    ? Object.fromEntries(Object.entries(mcpServers).map(([name, config]) => {
      const type = (config as PiMcpServerConfig).type
      return [name, {
        ...config,
        ...(type === 'http' || type === 'sse' ? { proxyUrl } : {}),
      }]
    })) as PiMcpServers
    : mcpServers
  const seenToolNames = new Set<string>()
  const discovery: Array<{ server: string; status: string; tools: number; stage: string }> = []
  const activate = new Set(options.activateServers ?? [])

  const supported = Object.entries(proxiedServers).filter(([, rawConfig]) => {
    const type = (rawConfig as PiMcpServerConfig).type
    return type === 'stdio' || type === 'http' || type === 'sse'
  })
  // 按需服务器：被 @ 点名时本轮照常加载全部工具；否则只经入口工具访问
  const entries = supported.filter(([name, rawConfig]) => !isOnDemand(rawConfig as PiMcpServerConfig) || activate.has(name))
  const deferred = supported.filter(([name, rawConfig]) => isOnDemand(rawConfig as PiMcpServerConfig) && !activate.has(name))
  for (const [name] of deferred) {
    discovery.push({ server: name, status: 'on_demand', tools: 0, stage: 'deferred' })
  }

  // 并行连接所有 MCP 服务器，避免串行等待导致启动慢

  const results = await Promise.allSettled(
    entries.map(async ([serverName, rawConfig]) => {
      const config = rawConfig as PiMcpServerConfig
      const mcpTools = config.required === false
        ? await listOptionalMcpTools(manager, serverName, config)
        : await listRequiredMcpTools(manager, serverName, config)
      if (!mcpTools) {
        console.info(`[Pi MCP] 可选 MCP 服务器 ${serverName} 尚在后台启动，本回合跳过`)
        return { serverName, config, mcpTools: [] }
      }
      return { serverName, config, mcpTools }
    }),
  )

  for (const [index, result] of results.entries()) {
    const server = entries[index]![0]
    if (result.status === 'rejected') {
      discovery.push({ server, status: 'unavailable', tools: 0, stage: 'connect_or_list_tools' })
      console.warn(`[Pi MCP] ${server} 连接或列出工具失败；请检查连接设置（敏感错误详情不展示）`)
      continue
    }
    const { serverName, config, mcpTools } = result.value
    discovery.push({ server: serverName, status: mcpTools.length ? 'ready' : 'no_tools_or_starting', tools: mcpTools.length, stage: 'discovery' })
    for (const tool of mcpTools) {
      const piToolName = mcpToolName(serverName, tool.name)
      if (seenToolNames.has(piToolName)) {
        console.warn(`[Pi MCP] 工具名冲突 ${piToolName}，已跳过 ${serverName}/${tool.name}`)
        continue
      }
      seenToolNames.add(piToolName)
      tools.push(createPiMcpToolDefinition({
        serverName,
        originalToolName: tool.name,
        tool,
        manager,
        managerConfig: config,
      }))
    }
  }

  if (tools.length > 0) {
    console.log(`[Pi MCP] 已桥接 ${tools.length} 个用户 MCP 工具到 Pi customTools`)
  }

  if (deferred.length > 0) {
    tools.push(createOnDemandGatewayTool(Object.fromEntries(deferred) as PiMcpServers))
    console.log(`[Pi MCP] 按需 MCP 服务器 ${deferred.map(([name]) => name).join(', ')} 本轮未连接，经 ${ON_DEMAND_GATEWAY_TOOL_NAME} 入口访问`)
  }

  if (supported.length > 0) {
    tools.push({
      name: 'mcp_connection_status',
      label: 'MCP 连接状态',
      description: `查看本轮 MCP 工具发现结果（不是实时重连）：ready 才表示本轮可调用；on_demand 表示按需服务器，需经 ${ON_DEMAND_GATEWAY_TOOL_NAME} 调用。失败或无工具不能声称已连接。不返回凭据。`,
      parameters: Type.Object({}),
      async execute() {
        return { content: [{ type: 'text', text: JSON.stringify({ scope: 'current_turn_discovery', servers: discovery }) }], details: {} }
      },
    } as ToolDefinition)
  }
  return tools
}

/**
 * 关闭所有 MCP 连接。应在 app quit 时调用以清理 stdio 子进程。
 */
export async function disposePiMcpConnections(): Promise<void> {
  await manager.dispose()
}
