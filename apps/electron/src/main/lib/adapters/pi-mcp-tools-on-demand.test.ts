import { afterEach, describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import {
  buildPiMcpTools,
  closeIdleOnDemandMcpConnections,
  disposePiMcpConnections,
  getConnectedMcpServerNames,
  ON_DEMAND_GATEWAY_TOOL_NAME,
} from './pi-mcp-tools'

const fakeServer = join(import.meta.dir, '__fixtures__', 'fake-mcp-server.mjs')

function serverConfig(loadMode?: 'on-demand'): Record<string, unknown> {
  return {
    type: 'stdio',
    command: process.execPath,
    args: [fakeServer],
    required: true,
    ...(loadMode && { loadMode }),
  }
}

type ExecutableTool = { name: string; execute: (id: string, params: unknown, signal?: AbortSignal) => Promise<{ content: Array<{ type: string; text?: string }> }> }

function text(result: { content: Array<{ type: string; text?: string }> }): string {
  return result.content.map((block) => block.text ?? '').join('\n')
}

afterEach(async () => {
  await disposePiMcpConnections()
})

describe('按需 MCP', () => {
  test('常驻服务器照常连接并暴露全部工具', async () => {
    const tools = await buildPiMcpTools({ fake: serverConfig() }) as unknown as ExecutableTool[]
    const names = tools.map((tool) => tool.name)
    expect(names).toContain('mcp__fake__echo')
    expect(names).not.toContain(ON_DEMAND_GATEWAY_TOOL_NAME)
    expect(getConnectedMcpServerNames()).toEqual(['fake'])
  }, 30_000)

  test('按需服务器平时不连接，只给入口工具', async () => {
    const tools = await buildPiMcpTools({ fake: serverConfig('on-demand') }) as unknown as ExecutableTool[]
    const names = tools.map((tool) => tool.name)
    expect(names).toContain(ON_DEMAND_GATEWAY_TOOL_NAME)
    expect(names).not.toContain('mcp__fake__echo')
    expect(getConnectedMcpServerNames()).toEqual([])
  })

  test('经入口工具调用时才连接，空闲后断开', async () => {
    const tools = await buildPiMcpTools({ fake: serverConfig('on-demand') }) as unknown as ExecutableTool[]
    const gateway = tools.find((tool) => tool.name === ON_DEMAND_GATEWAY_TOOL_NAME)!

    const listed = text(await gateway.execute('1', { server: 'fake', action: 'list_tools' }))
    expect(listed).toContain('"echo"')
    expect(getConnectedMcpServerNames()).toEqual(['fake'])

    const called = text(await gateway.execute('2', { server: 'fake', action: 'call', tool: 'echo', arguments: { text: 'hi' } }))
    expect(called).toContain('echo:hi')

    // 还没到空闲时间：不断开
    expect(await closeIdleOnDemandMcpConnections(Date.now(), 60_000)).toEqual([])
    // 超过空闲时间：断开
    expect(await closeIdleOnDemandMcpConnections(Date.now() + 120_000, 60_000)).toEqual(['fake'])
    expect(getConnectedMcpServerNames()).toEqual([])
  }, 30_000)

  test('@ 点名的按需服务器本轮加载全部工具', async () => {
    const tools = await buildPiMcpTools({ fake: serverConfig('on-demand') }, undefined, { activateServers: ['fake'] }) as unknown as ExecutableTool[]
    const names = tools.map((tool) => tool.name)
    expect(names).toContain('mcp__fake__echo')
    expect(names).not.toContain(ON_DEMAND_GATEWAY_TOOL_NAME)
  }, 30_000)

  test('入口工具对未知服务器给出提示', async () => {
    const tools = await buildPiMcpTools({ fake: serverConfig('on-demand') }) as unknown as ExecutableTool[]
    const gateway = tools.find((tool) => tool.name === ON_DEMAND_GATEWAY_TOOL_NAME)!
    expect(text(await gateway.execute('1', { server: 'nope', action: 'list_tools' }))).toContain('没有名为「nope」')
  })
})
