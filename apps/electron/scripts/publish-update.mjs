#!/usr/bin/env bun
/**
 * 把 dist:win 打出来的新版本上传到静默更新源 https://120.26.161.126:9001/win
 * （服务器 120.26.161.126 的 /data/roy-update/win；域名 agares.cn 备案后可改回域名）。
 *
 * 用法（在 apps/electron 目录）：
 *   bun run dist:win
 *   bun scripts/publish-update.mjs            # 上传 out/latest.yml 指向的版本
 *   bun scripts/publish-update.mjs --legacy   # 另外再传一份到旧更新源 zajx.top（给还没迁过来的老版本用，会问密码）
 *
 * 先传安装包和 blockmap，最后才传 latest.yml：客户端只有看到新的 latest.yml 才会开始下载，避免下载到一半的文件。
 * 认证用服务器密钥（默认 ~/.ssh/roy_agares.pem，权限只允许当前用户读；可用 ROY_DEPLOY_KEY 覆盖），不用输密码。
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

const TARGETS = [
  {
    name: '新更新源',
    host: process.env.ROY_DEPLOY_HOST || 'root@120.26.161.126',
    dir: process.env.ROY_DEPLOY_DIR || '/data/roy-update/win',
    key: process.env.ROY_DEPLOY_KEY || join(homedir(), '.ssh', 'roy_agares.pem'),
    publicUrl: process.env.ROY_UPDATE_PUBLIC_URL || 'https://120.26.161.126:9001/win',
  },
]
if (process.argv.includes('--legacy')) {
  TARGETS.push({ name: '旧更新源', host: 'root@47.105.106.221', dir: '/data/roy-update/win', key: '', publicUrl: 'https://www.zajx.top/roy-update/win' })
}

const out = resolve(import.meta.dir ?? '.', '..', 'out')
const latest = join(out, 'latest.yml')
if (!existsSync(latest)) throw new Error(`没找到 ${latest}，先运行 bun run dist:win`)
const yml = readFileSync(latest, 'utf8')
const version = /^version:\s*(.+)$/m.exec(yml)?.[1]?.trim()
const installer = /^path:\s*(.+)$/m.exec(yml)?.[1]?.trim()
if (!version || !installer) throw new Error('latest.yml 里没有 version / path')
const files = [installer, `${installer}.blockmap`].map((f) => join(out, f))
for (const f of files) if (!existsSync(f)) throw new Error(`缺少文件：${f}`)

const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit' })

for (const t of TARGETS) {
  // 有密钥用密钥；没有时 ssh / scp 会在终端里提示输入服务器密码
  const ssh = t.key && existsSync(t.key)
    ? ['-i', t.key, '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes', '-o', 'StrictHostKeyChecking=accept-new']
    : ['-o', 'StrictHostKeyChecking=accept-new']
  console.log(`[发版] Roy ${version} → ${t.name} ${t.host}:${t.dir}`)
  run('ssh', [...ssh, t.host, `mkdir -p '${t.dir}'`])
  run('scp', [...ssh, ...files, `${t.host}:${t.dir}/`])
  run('scp', [...ssh, latest, `${t.host}:${t.dir}/latest.yml`])
  // 新更新源是自签证书（Roy 内置固定），这里只核对内容，不校验证书
  const res = await fetch(`${t.publicUrl}/latest.yml`, { cache: 'no-store', signal: AbortSignal.timeout(15000), tls: { rejectUnauthorized: false } }).catch((e) => ({ ok: false, statusText: String(e) }))
  const served = res.ok ? await res.text() : ''
  if (served.includes(`version: ${version}`)) console.log(`[发版] ${t.name}完成：${t.publicUrl}/latest.yml 已是 ${version}`)
  else console.warn(`[发版] ${t.name}文件已上传，但公网地址还没读到新版本（${res.ok ? '内容不一致' : res.statusText}），请检查域名解析和 Cloudflare`)
}
