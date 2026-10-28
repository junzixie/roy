import { describe, expect, mock, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dir, '..', '..', '..')
mock.module('electron', () => ({ app: { isPackaged: false, getPath: () => ROOT } }))
mock.module('./config-paths', () => ({ getConfigDir: () => join(ROOT, '_test-data'), getAgentWorkspacePath: (s: string) => join(ROOT, '_ws', s) }))

process.env.ROY_MARKET_DIR = join(ROOT, 'dist', 'resources', 'market')
const m = await import('./roy-market')

describe('Roy 内置市场', () => {
  test('清单能读到，技能和 MCP 数量对得上', () => {
    const c = m.getRoyMarketCatalog()
    expect(c.skills.map((s) => s.slug).sort()).toEqual(['roy-code-debug', 'roy-desktop-operation', 'roy-document-writing', 'roy-mcp-check', 'roy-ui-design'])
    expect(c.skills.filter((s) => s.featured).length).toBe(5)
    expect(c.mcp.map((x) => x.id).sort()).toEqual(['filesystem', 'memory', 'sequential-thinking'])
  })
  test('技能目录只认清单里的，路径穿越被拒', () => {
    expect(existsSync(join(m.resolveRoyMarketSkillDir('roy:roy-code-debug').dir, 'SKILL.md'))).toBe(true)
    expect(() => m.resolveRoyMarketSkillDir('roy:../../secret')).toThrow()
    expect(() => m.resolveRoyMarketSkillDir('roy:not-exist')).toThrow()
  })
  test('占位符换成本机路径，并让 Roy 按 Node 运行', () => {
    const memory = m.getRoyMarketCatalog().mcp.find((x) => x.id === 'memory')!
    const e = m.resolveRoyMarketMcpEntry(memory.server, 'demo')
    expect(e.command).toBe(process.execPath)
    expect(e.env?.ELECTRON_RUN_AS_NODE).toBe('1')
    expect(e.args?.[0]).toContain(join('market', 'mcp', 'modelcontextprotocol__server-memory'))
    expect(existsSync(e.args![0]!)).toBe(true)
    const fs = m.resolveRoyMarketMcpEntry(m.getRoyMarketCatalog().mcp.find((x) => x.id === 'filesystem')!.server, 'demo')
    expect(fs.args?.at(-1)).toBe(join(ROOT, '_ws', 'demo'))
  })
  test('所有本地 MCP 的入口文件都在', () => {
    for (const x of m.getRoyMarketCatalog().mcp) {
      if (x.server.type !== 'stdio') continue
      const e = m.resolveRoyMarketMcpEntry(x.server)
      const entry = e.command === process.execPath ? e.args![0]! : e.command!
      expect(existsSync(entry), `${x.id} ${entry}`).toBe(true)
    }
  })
  test('普通配置原样返回', () => {
    const plain = { type: 'stdio' as const, command: 'npx', args: ['-y', 'x'], enabled: true }
    expect(m.resolveRoyMarketMcpEntry(plain)).toBe(plain)
  })
})
