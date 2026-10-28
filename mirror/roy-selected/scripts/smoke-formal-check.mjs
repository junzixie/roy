#!/usr/bin/env bun
/**
 * Roy 正式版前置冒烟（不打包安装包）：检查关键文件、意图解析、CLI 模块可加载。
 * 用法：bun scripts/smoke-formal-check.mjs
 * 退出码 0 = 通过；非 0 = 失败。
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dir, '..')
const fail = []
const ok = (m) => console.log('✔', m)
const bad = (m) => { console.error('✘', m); fail.push(m) }

const mustFiles = [
  'apps/electron/src/main/lib/cli-path.ts',
  'apps/electron/src/main/lib/cli-bridge.ts',
  'apps/cli/src/inbox.ts',
  'apps/cli/src/commands/app.ts',
  'apps/electron/src/renderer/pages/AiAssistantPage.tsx',
  'apps/electron/src/renderer/lib/ai-assistant-intent.ts',
  'apps/electron/resources/bin/roy.exe',
]

for (const rel of mustFiles) {
  const p = join(root, rel)
  if (existsSync(p)) ok('存在 ' + rel)
  else bad('缺失 ' + rel)
}

const bridge = await Bun.file(join(root, 'apps/electron/src/main/lib/cli-bridge.ts')).text()
if (bridge.includes('drainCliInbox')) ok('cli-bridge 含 drainCliInbox')
else bad('cli-bridge 缺少 drainCliInbox')

const page = await Bun.file(join(root, 'apps/electron/src/renderer/pages/AiAssistantPage.tsx')).text()
if (page.includes('AgentView') && page.includes('embedded')) ok('AI 助理嵌入 AgentView')
else bad('AI 助理未嵌入 AgentView')

const attr = await Bun.file(join(root, 'apps/electron/src/main/lib/agent-git-attribution.ts')).text()
if (!attr.includes('proma.cool') && !attr.includes('proma-ai/Proma')) ok('Git 署名链接已去 Proma 域名')
else bad('Git 署名仍含 Proma 用户可见链接')

const intent = await import(join(root, 'apps/electron/src/renderer/lib/ai-assistant-intent.ts'))
const samples = [
  ['开一个叫测试的项目', 'create_project', '测试'],
  ['打开项目发票助手', 'open_project', '发票助手'],
  ['我想做一个发票小工具', 'create_project', '发票小工具'],
]
for (const [text, type, name] of samples) {
  const r = intent.parseAiAssistantIntent(text)
  if (r.type === type && r.name === name) ok('意图: ' + text)
  else bad('意图失败: ' + text + ' => ' + JSON.stringify(r))
}

try {
  await import(join(root, 'apps/cli/src/inbox.ts'))
  ok('CLI inbox 模块可加载')
} catch (e) {
  bad('CLI inbox 加载失败: ' + e)
}

console.log('')
if (fail.length) {
  console.error('冒烟失败 ' + fail.length + ' 项')
  process.exit(1)
}
console.log('冒烟通过（未覆盖：安装包构建、干净机 PATH、真模型对话）')
