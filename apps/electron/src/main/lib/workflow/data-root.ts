
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { resolveAgentWorkspacesRoot } from '../config-paths'
import { writeJsonFileAtomic } from '../safe-file'

let root: string | undefined
/** 保留旧目录；复制校验完成才写迁移标记，失败阻止使用半迁移的数据。 */
export function getWorkflowDataRoot(): string {
  if (root) return root
  const target = join(resolveAgentWorkspacesRoot(), '.roy-workflow')
  const marker = join(target, '.migration-v1.json')
  mkdirSync(target, { recursive: true })
  if (!existsSync(marker)) {
    const { app } = require('electron')
    const old = app.getPath('userData')
    const copyMissing = (from: string, to: string): void => {
      for (const entry of readdirSync(from, { withFileTypes: true })) {
        if (entry.isSymbolicLink()) continue
        const src = join(from, entry.name), dst = join(to, entry.name)
        if (entry.isDirectory()) {
          mkdirSync(dst, { recursive: true }); copyMissing(src, dst)
        } else if (entry.isFile() && !existsSync(dst)) {
          cpSync(src, dst, { force: false, errorOnExist: true })
          if (!readFileSync(src).equals(readFileSync(dst))) throw new Error('工作流迁移校验失败')
        }
      }
    }
    const oldDefinitions = join(old, 'workflows.json')
    const newDefinitions = join(target, 'workflows.json')
    if (existsSync(oldDefinitions) && !existsSync(newDefinitions)) {
      const data = JSON.parse(readFileSync(oldDefinitions, 'utf8'))
      if (!Array.isArray(data)) throw new Error('旧工作流数据格式不正确，已保留原文件')
      writeJsonFileAtomic(newDefinitions, data)
    }
    for (const name of ['workflow-runs', 'workflow-output']) {
      const src = join(old, name), dst = join(target, name)
      if (existsSync(src)) { mkdirSync(dst, { recursive: true }); copyMissing(src, dst) }
    }
    writeJsonFileAtomic(marker, { completedAt: Date.now() })
  }
  root = target
  return target
}
