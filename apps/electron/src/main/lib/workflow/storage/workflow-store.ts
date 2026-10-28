/**
 * 工作流存储 - 管理工作流的增删改查
 */

import { readFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { writeJsonFileAtomic } from '../../safe-file'
import type { Workflow } from '../engine/executor'

export class WorkflowStore {
  private storePath: string

  constructor(projectDir: string) {
    this.storePath = join(projectDir, 'workflows.json')
    this.ensureFile()
  }

  private ensureFile() {
    const dir = dirname(this.storePath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    if (!existsSync(this.storePath)) {
      writeJsonFileAtomic(this.storePath, [], true)
    }
  }

  /**
   * 获取所有工作流，最近修改的排在前面
   */
  getAll(): Workflow[] {
    try {
      const content = readFileSync(this.storePath, 'utf-8')
      const list = JSON.parse(content) as Workflow[]
      return [...list].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    } catch (error) {
      console.error('[WorkflowStore] 读取失败:', error)
      return []
    }
  }

  /**
   * 根据 ID 获取工作流
   */
  getById(id: string): Workflow | null {
    const workflows = this.readRaw()
    return workflows.find(workflow => workflow.id === id) || null
  }

  /**
   * 保存工作流
   */
  save(workflow: Workflow): void {
    const workflows = this.readRaw()
    const index = workflows.findIndex(item => item.id === workflow.id)
    const stored: Workflow = { ...workflow, updatedAt: Date.now() }

    if (index >= 0) {
      workflows[index] = stored
    } else {
      workflows.push(stored)
    }

    writeJsonFileAtomic(this.storePath, workflows)
  }

  /**
   * 删除工作流
   */
  delete(id: string): boolean {
    const workflows = this.readRaw()
    const filtered = workflows.filter(workflow => workflow.id !== id)

    if (filtered.length === workflows.length) {
      return false
    }

    writeJsonFileAtomic(this.storePath, filtered)
    return true
  }

  /**
   * 搜索工作流
   */
  search(query: string): Workflow[] {
    const lowerQuery = query.toLowerCase()

    return this.getAll().filter(workflow =>
      workflow.name.toLowerCase().includes(lowerQuery) ||
      workflow.description?.toLowerCase().includes(lowerQuery)
    )
  }

  /** 按磁盘顺序读取，不排序；写入时用它可以保持原有次序。 */
  private readRaw(): Workflow[] {
    try {
      const content = readFileSync(this.storePath, 'utf-8')
      const parsed = JSON.parse(content) as unknown
      return Array.isArray(parsed) ? parsed as Workflow[] : []
    } catch (error) {
      console.error('[WorkflowStore] 读取失败:', error)
      return []
    }
  }
}
