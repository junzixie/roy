import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { DefaultResourceLoader, SettingsManager, createReadToolDefinition, loadSkills } from '@earendil-works/pi-coding-agent'
import { buildSystemPrompt } from '../../../../node_modules/@earendil-works/pi-coding-agent/dist/core/system-prompt.js'
import { createRoyUseSkillTool, buildRoyCapabilityPrompt, buildSkillTurnReminder, normalizeSkillRequestName } from './roy-capability-tools'
import { createRoyManagedResourceLoaderOptions } from './pi-resource-loader-overrides'
import { isSlimTool } from './slim-mode'
import { collectSuccessfulSkillReadActivations } from '@roy/shared'

const root = resolve(process.env.ROY_TEST_TMP ?? '_tmp/roy-capability-tests')
const skillsRoot = join(root, 'skills')
const file = join(skillsRoot, 'regression-skill', 'SKILL.md')
beforeAll(() => {
  mkdirSync(join(skillsRoot, 'regression-skill'), { recursive: true })
  writeFileSync(file, '---\nname: regression-skill\ndescription: 专门用于回归测试的技能。\n---\n\nREGRESSION_SKILL_BODY\n')
})
afterAll(() => rmSync(join(skillsRoot, 'regression-skill'), { recursive: true, force: true }))

async function loader() {
  const value = new DefaultResourceLoader({ cwd: root, agentDir: root, settingsManager: SettingsManager.inMemory({}), ...createRoyManagedResourceLoaderOptions(), additionalSkillPaths: [skillsRoot] })
  await value.reload()
  return value
}
const run = (tool: any, params: unknown) => tool.execute('test', params, new AbortController().signal, undefined, {})

describe('Roy capability regression', () => {
  test('managed loader preserves explicitly installed skills despite noSkills', async () => {
    const value = await loader()
    expect(value.getSkills().skills.map(s => s.name)).toEqual(['regression-skill'])
    const prompt = buildSystemPrompt({ cwd: root, customPrompt: 'Roy', selectedTools: ['read', 'use_skill'], skills: value.getSkills().skills })
    expect(prompt).toContain('available_skills')
    expect(prompt).toContain('regression-skill')
  })
  test('use_skill calls permission-wrapped reader and returns actual body', async () => {
    const value = await loader()
    const reader = createReadToolDefinition(root)
    let called = false
    const guarded = { ...reader, execute: async (...args: any[]) => { called = true; return (reader.execute as any)(...args) } }
    const tool = createRoyUseSkillTool(() => value, guarded)
    const result = await run(tool, { name: 'regression-skill' })
    expect(called).toBe(true)
    expect(JSON.stringify(result)).toContain('REGRESSION_SKILL_BODY')
  })
  test('unknown skill and path injection are refused', async () => {
    const value = await loader()
    const tool = createRoyUseSkillTool(() => value, createReadToolDefinition(root))
    await expect(run(tool, { name: '../../settings' })).rejects.toThrow('技能未安装')
    await expect(run(tool, { name: 'not-installed' })).rejects.toThrow('技能未安装')
  })
  test('permission denial remains an error, never a successful activation', async () => {
    const value = await loader()
    const tool = createRoyUseSkillTool(() => value, { ...createReadToolDefinition(root), execute: async () => { throw new Error('permission denied') } })
    await expect(run(tool, { name: 'regression-skill' })).rejects.toThrow('permission denied')
  })
  test('slim keeps PowerShell and skill reader but not desktop or MCP', () => {
    for (const n of ['powershell', 'use_skill']) expect(isSlimTool(n)).toBe(true)
    for (const n of ['computer_click', 'mcp_connection_status', 'mcp__filesystem__read_file']) expect(isSlimTool(n)).toBe(false)
  })
  test('capability routing only advertises tools actually available', () => {
    // 免费版：不出现「直接动手」的指令，只给限制说明
    expect(buildRoyCapabilityPrompt(['read'])).not.toContain('不要只给步骤')
    expect(buildRoyCapabilityPrompt(['read'])).toContain('没有完整桌面操控能力')
    const full = buildRoyCapabilityPrompt(['use_skill','screen_capture','computer_windows','computer_screenshot','computer_click','open_file','mcp_connection_status'])
    expect(full).toContain('先 use_skill')
    expect(full).toContain('不要只给步骤')
    expect(full).toContain('mcp_connection_status')
    expect(full).toContain('不抢前台')
    // 触发清单与收窄条件都要在：既要想得起用，也要不乱动鼠标
    expect(full).toContain('微信')
    expect(full).toContain('能用命令行、API、文件读写')
    const cua = buildRoyCapabilityPrompt(['cua_list_windows', 'cua_get_window_state', 'cua_click', 'computer_app_notes'])
    expect(cua).toContain('Cua 引擎')
    expect(cua).toContain('element_token')
    expect(cua).not.toContain('computer_focus')
  })
  test('successful use_skill and lowercase read are attributed; failures are not', () => {
    const messages = (name: string, input: object, failed: boolean): any => [
      { type: 'assistant', message: { content: [{ type: 'tool_use', name, input, id: 'call-1' }] } },
      { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'call-1', content: 'body', is_error: failed }] } },
    ]
    const options = { workspaceSlug: 'test', workspaceSkillsRoot: skillsRoot }
    expect(collectSuccessfulSkillReadActivations(messages('use_skill', { name: 'regression-skill' }, false), options)).toHaveLength(1)
    expect(collectSuccessfulSkillReadActivations(messages('use_skill', { name: 'regression-skill' }, true), options)).toHaveLength(0)
    expect(collectSuccessfulSkillReadActivations(messages('read', { path: file }, false), options)).toHaveLength(1)
  })
  test('curated market has complete installed resources and portable MCP entries', () => {
    const market = resolve(import.meta.dir, '../../../../resources/market')
    const skills = JSON.parse(readFileSync(join(market, 'skills.json'), 'utf8'))
    expect(skills).toHaveLength(5)
    const loaded = loadSkills({ cwd: root, agentDir: root, skillPaths: [join(market, 'skills')], includeDefaults: false })
    expect(loaded.skills).toHaveLength(5)
    expect(loaded.diagnostics.filter(d => d.type === 'error')).toHaveLength(0)
    const mcp = JSON.parse(readFileSync(join(market, 'mcp.json'), 'utf8'))
    expect(mcp).toHaveLength(3)
    for (const entry of mcp) {
      expect(entry.server.command).toBe('${ROY_NODE}')
      expect(readFileSync(entry.server.args[0].replace('${ROY_MCP}', join(market, 'mcp')), 'utf8').length).toBeGreaterThan(100)
    }
  })
  test('use_skill accepts slash / workspace-qualified names and lists choices on miss', async () => {
    const value = await loader()
    const tool = createRoyUseSkillTool(() => value, createReadToolDefinition(root))
    expect(normalizeSkillRequestName('/regression-skill')).toBe('regression-skill')
    expect(normalizeSkillRequestName('roy-workspace-default:regression-skill')).toBe('regression-skill')
    expect(JSON.stringify(await run(tool, { name: 'roy-workspace-default:regression-skill' }))).toContain('REGRESSION_SKILL_BODY')
    expect(JSON.stringify(await run(tool, { name: '/Regression-Skill' }))).toContain('REGRESSION_SKILL_BODY')
    await expect(run(tool, { name: 'nope' })).rejects.toThrow('可用技能：regression-skill')
  })
  test('turn reminder lists skill names, skips hidden skills, stays bounded', () => {
    expect(buildSkillTurnReminder([])).toBe('')
    const r = buildSkillTurnReminder([{ name: 'pdf', description: '处理 PDF', disableModelInvocation: false }, { name: 'hidden', description: 'x', disableModelInvocation: true }])
    expect(r).toContain('use_skill')
    expect(r).toContain('- pdf：处理 PDF')
    expect(r).not.toContain('hidden')
    const many = Array.from({ length: 200 }, (_, i) => ({ name: `skill-${i}`, description: '描述'.repeat(50), disableModelInvocation: false }))
    expect(buildSkillTurnReminder(many).length).toBeLessThan(2200)
  })
})
