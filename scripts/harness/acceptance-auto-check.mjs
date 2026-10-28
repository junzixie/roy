import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const harness = join(import.meta.dir, '..')
const root = join(harness, 'mirror', 'roy-selected')
const fail = []
const ok = (m) => console.log('✔', m)
const bad = (m) => { console.error('✘', m); fail.push(m) }

const checks = [
  ['CLI inbox', 'apps/cli/src/inbox.ts'],
  ['cli-bridge', 'apps/electron/src/main/lib/cli-bridge.ts'],
  ['cli-path', 'apps/electron/src/main/lib/cli-path.ts'],
  ['AiAssistantPage', 'apps/electron/src/renderer/pages/AiAssistantPage.tsx'],
  ['intent', 'apps/electron/src/renderer/lib/ai-assistant-intent.ts'],
  ['smoke script', 'scripts/smoke-formal-check.mjs'],
]
for (const [label, rel] of checks) {
  if (existsSync(join(root, rel))) ok('镜像有 ' + label)
  else bad('镜像缺 ' + label)
}

const bridge = readFileSync(join(root, 'apps/electron/src/main/lib/cli-bridge.ts'), 'utf8')
if (bridge.includes('drainCliInbox')) ok('drainCliInbox')
else bad('无 drainCliInbox')

const page = readFileSync(join(root, 'apps/electron/src/renderer/pages/AiAssistantPage.tsx'), 'utf8')
if (page.includes('AgentView') && page.includes('embedded')) ok('助理嵌入 AgentView')
else bad('助理未嵌入')

const attr = readFileSync(join(root, 'apps/electron/src/main/lib/agent-git-attribution.ts'), 'utf8')
if (!attr.includes('proma.cool') && !attr.includes('proma-ai/Proma')) ok('署名无 Proma 链')
else bad('署名仍含 Proma')

console.log('\n【待用户勾选】需真模型 / 装包 / 本机 PATH：')
for (const t of [
  '设置→模型渠道：实机对话',
  '产物默认打开工作台（实机）',
  'PATH 开关后新开终端 roy help',
  'AI 助理快捷条建项目并进入（实机）',
  'Roy 退出后 roy ask → inbox/拉起',
  'dist:win 安装包干净机安装与 PATH',
]) console.log('- [ ]', t)

if (fail.length) { console.error('\n自动项失败', fail.length); process.exit(1) }
console.log('\n自动项全部通过')
