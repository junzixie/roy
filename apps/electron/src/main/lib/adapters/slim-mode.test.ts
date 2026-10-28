import { describe, expect, test } from 'bun:test'
import { isSlimTool, slimPrompt, compactSkillDescription } from './slim-mode'
import { readFileSync } from 'node:fs'
describe('原生模式（原精简模式）', () => {
 test('核心工具保留，扩展工具不暴露', () => {
  for (const n of ['read','write','edit','bash','grep','find','ls','AskUserQuestion','ExitPlanMode','CompactContext']) expect(isSlimTool(n)).toBe(true)
  for (const n of ['BrowserClick','TerminalExecute','mcp__planning__list_todos','roy_workspace_configure_mcp_server','Unknown']) expect(isSlimTool(n)).toBe(false)
 })
 test('缩短技能说明但不改变短说明', () => { expect(compactSkillDescription('读文档')).toBe('读文档'); expect(compactSkillDescription('字'.repeat(500)).length).toBeLessThan(130) })
 test('保留工作区和计划边界，不携带专业长规则', () => {
  const s=slimPrompt('# Original\n## 可见终端\n'+ '长规则'.repeat(3000)+'\n## 工作区与 Context\nPROJECT_ROOT\n## 计划模式\n只看不改\n## Pi 受管浏览器\nBROWSER_RULES')
  expect(s).toContain('PROJECT_ROOT');expect(s).toContain('只看不改');expect(s).not.toContain('BROWSER_RULES');expect(s.length).toBeLessThan(2000)
 })
 test('原生模式就是工作模式 native，运行方式另选', () => {
  const modes=readFileSync(new URL('../../../renderer/lib/agent-modes.ts',import.meta.url),'utf8')
  expect(modes).toContain("s.agentMode === 'slim' ? 'native' : 'standard'")
  const adapter=readFileSync(new URL('./mode-switching-adapter.ts',import.meta.url),'utf8');expect(adapter).toContain("slimMode: workMode === 'native'");expect(adapter).toContain("return s.agentMode === 'slim' ? 'native' : 'standard'")
  const pi=readFileSync(new URL('./pi-agent-adapter.ts',import.meta.url),'utf8');expect(pi).toContain('!input.slimMode || isSlimTool(tool.name)')
 })
})
