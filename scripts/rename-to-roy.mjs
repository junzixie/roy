// Roy → Roy 全链路改名脚本
// 用法: node scripts/rename-to-roy.mjs [--apply]
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, renameSync } from 'node:fs'
import { join, extname, relative, dirname, basename } from 'node:path'

const ROOT = process.cwd()
const APPLY = process.argv.includes('--apply')

const EXT = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.yml', '.yaml', '.html', '.css', '.md', '.sh', '.plist', '.svg'])
// 只跳过依赖与构建产物；docs/tutorial 保持原样以免改动上游文档
const SKIP_DIR = new Set(['node_modules', 'out', 'dist', '.git', '.cache', 'docs', 'tutorial', 'release-notes'])

// 必须原样保留的片段（服务端 UA 校验 / 上游归属 / 已存在的 DB schema）
const GUARDS = [
  'api.proma.cool',
  'proma.cool',
  'github.com/proma-ai',
  'github.com/ErlichLiu',
  'proma_entity_id',
  'promaEntityId',
  'promaIdentity',
]

// UA 相关文件整文件跳过：服务端（Coding Plan 等）按 Roy UA 校验，改了就 403
const UA_FILES = new Set([
  'packages/core/src/providers/user-agent.ts',
  'apps/electron/src/main/lib/browser-identity.ts',
])

function walk(dir, out = [], dirs = new Set()) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIR.has(name)) continue
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) {
      dirs.add(p)
      walk(p, out, dirs)
    } else out.push(p)
  }
  return { files: out, dirs }
}

const { files, dirs } = walk(ROOT)

// 逐条规则；顺序有讲究：先长模式，再单词，最后兜底
const RULES = [
  [/@roy\//g, '@roy/'],
  [/\bPROMA_/g, 'ROY_'],
  [/roy-file/g, 'roy-file'],
  [/roy-logos/g, 'roy-logos'],
  [/roy-coach/g, 'roy-coach'],
  [/roy-thinking/g, 'roy-thinking'],
  [/\.roy-dev\b/g, '.roy-dev'],
  [/\.roy\b/g, '.roy'],
  [/com\.roy\./g, 'com.roy.'],
  [/Roy/g, 'Roy'],
  [/roy/g, 'roy'],
]

function protect(line) {
  let out = line
  const slots = []
  for (const g of GUARDS) {
    if (!out.includes(g)) continue
    out = out.split(g).join(`\u0000${slots.length}\u0000`)
    slots.push(g)
  }
  return { out, slots }
}

function restore(line, slots) {
  return line.replace(/\u0000(\d+)\u0000/g, (_, i) => slots[Number(i)])
}

let changedFiles = 0
const stats = new Map()

for (const file of files) {
  const rel = relative(ROOT, file).replace(/\\/g, '/')
  if (UA_FILES.has(rel)) continue
  // 只处理文本文件；二进制（exe/png/node）不碰
  if (!EXT.has(extname(file))) continue
  // lockfile 由 bun install 重新生成
  if (basename(file) === 'bun.lock') continue

  let src
  try { src = readFileSync(file, 'utf8') } catch { continue }
  if (!/roy/i.test(src)) continue

  const lines = src.split('\n')
  let hits = 0
  const next = lines.map((line) => {
    const { out, slots } = protect(line)
    let cur = out
    for (const [re, to] of RULES) cur = cur.replace(re, to)
    const back = restore(cur, slots)
    if (back !== line) hits++
    return back
  })

  if (hits === 0) continue
  changedFiles++
  stats.set(rel, hits)
  if (APPLY) writeFileSync(file, next.join('\n'))
}

// 路径改名：所有名字含 roy 的文件与目录（深优先，先改子后改父）
const renameTargets = []
for (const f of files) if (/roy/i.test(basename(f))) renameTargets.push(f)
for (const d of dirs) if (/roy/i.test(basename(d))) renameTargets.push(d)
renameTargets.sort((a, b) => b.split(/[\\/]/).length - a.split(/[\\/]/).length || b.length - a.length)

const planned = []
for (const p of renameTargets) {
  const target = join(dirname(p), basename(p).replace(/Roy/g, 'Roy').replace(/roy/g, 'roy'))
  planned.push([relative(ROOT, p).replace(/\\/g, '/'), relative(ROOT, target).replace(/\\/g, '/')])
}

console.log(`模式: ${APPLY ? 'APPLY' : 'DRY-RUN'}`)
console.log(`将修改文件数: ${changedFiles}`)
const top = [...stats.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)
console.log('改动最多的文件:')
for (const [f, n] of top) console.log(`  ${n.toString().padStart(4)}  ${f}`)

console.log(`待改名路径 (${planned.length}):`)
for (const [from, to] of planned) console.log(`  ${from}\n    -> ${to}`)

if (APPLY) {
  let done = 0
  for (const [from, to] of planned) {
    const a = join(ROOT, from)
    const b = join(ROOT, to)
    if (!existsSync(a)) continue
    if (existsSync(b)) { console.log(`目标已存在，跳过: ${to}`); continue }
    renameSync(a, b)
    done++
  }
  console.log(`renamed: ${done}`)
}
