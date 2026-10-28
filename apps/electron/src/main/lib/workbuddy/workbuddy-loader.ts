/**
 * WorkBuddy 加载器
 *
 * 从 ~/.workbuddy 加载技能、专家、连接器
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

export interface WorkBuddySkill {
  id: string
  name: string
  path: string
  description: string
  markdown: string
  size: number
  mtime: number
}

export interface WorkBuddyExpert {
  id: string
  name: string
  role: string
  prompt: string
  marketplace: string
}

export interface WorkBuddyConnector {
  id: string
  name: string
  mcpConfig: any
  path: string
}

export class WorkBuddyLoader {
  private workbuddyPath: string

  constructor(customPath?: string) {
    this.workbuddyPath = customPath || join(homedir(), '.workbuddy')
  }

  /**
   * 检查 WorkBuddy 目录是否存在
   */
  isAvailable(): boolean {
    return existsSync(this.workbuddyPath)
  }

  /**
   * 加载所有技能
   */
  loadSkills(): WorkBuddySkill[] {
    const skillsDir = join(this.workbuddyPath, 'skills')
    if (!existsSync(skillsDir)) {
      console.log('[WorkBuddy] skills 目录不存在')
      return []
    }

    const skills: WorkBuddySkill[] = []

    try {
      const entries = readdirSync(skillsDir, { withFileTypes: true })

      for (const entry of entries) {
        if (!entry.isDirectory()) continue

        const skillPath = join(skillsDir, entry.name)
        const skillMdPath = join(skillPath, 'SKILL.md')

        if (existsSync(skillMdPath)) {
          try {
            const markdown = readFileSync(skillMdPath, 'utf-8')
            const stat = statSync(skillMdPath)

            // 提取描述（第一段）
            const lines = markdown.split('\n')
            let description = ''
            for (const line of lines) {
              if (line.trim() && !line.startsWith('#')) {
                description = line.trim()
                break
              }
            }

            skills.push({
              id: entry.name,
              name: entry.name,
              path: skillPath,
              description: description || '无描述',
              markdown,
              size: stat.size,
              mtime: stat.mtimeMs
            })
          } catch (error) {
            console.error(`[WorkBuddy] 加载技能 ${entry.name} 失败:`, error)
          }
        }
      }

      console.log(`[WorkBuddy] 加载了 ${skills.length} 个技能`)
      return skills.sort((a, b) => b.mtime - a.mtime) // 按修改时间排序
    } catch (error) {
      console.error('[WorkBuddy] 加载技能失败:', error)
      return []
    }
  }

  /**
   * 加载所有专家（Agent 人设）
   */
  loadExperts(): WorkBuddyExpert[] {
    const pluginsDir = join(this.workbuddyPath, 'plugins', 'marketplaces')
    if (!existsSync(pluginsDir)) {
      console.log('[WorkBuddy] plugins/marketplaces 目录不存在')
      return []
    }

    const experts: WorkBuddyExpert[] = []

    try {
      // 遍历所有市场
      const marketplaces = readdirSync(pluginsDir, { withFileTypes: true })

      for (const marketplace of marketplaces) {
        if (!marketplace.isDirectory()) continue

        const pluginsPath = join(pluginsDir, marketplace.name, 'plugins')
        if (!existsSync(pluginsPath)) continue

        // 遍历所有插件
        const plugins = readdirSync(pluginsPath, { withFileTypes: true })

        for (const plugin of plugins) {
          if (!plugin.isDirectory()) continue

          const agentsDir = join(pluginsPath, plugin.name, 'agents')
          if (!existsSync(agentsDir)) continue

          // 读取所有 .md 文件（专家人设）
          const agentFiles = readdirSync(agentsDir)
            .filter(f => f.endsWith('.md'))

          for (const agentFile of agentFiles) {
            try {
              const agentPath = join(agentsDir, agentFile)
              const markdown = readFileSync(agentPath, 'utf-8')

              // 提取标题作为角色
              const titleMatch = markdown.match(/^#\s+(.+)$/m)
              const role = titleMatch?.[1] ?? agentFile.replace(/\.md$/, '')

              experts.push({
                id: `${marketplace.name}/${plugin.name}/${agentFile.replace('.md', '')}`,
                name: agentFile.replace('.md', ''),
                role,
                prompt: markdown,
                marketplace: marketplace.name
              })
            } catch (error) {
              console.error(`[WorkBuddy] 加载专家 ${agentFile} 失败:`, error)
            }
          }
        }
      }

      console.log(`[WorkBuddy] 加载了 ${experts.length} 个专家`)
      return experts
    } catch (error) {
      console.error('[WorkBuddy] 加载专家失败:', error)
      return []
    }
  }

  /**
   * 加载所有连接器（MCP 配置）
   */
  loadConnectors(): WorkBuddyConnector[] {
    const connectorsDir = join(this.workbuddyPath, 'connectors-marketplace', 'connectors')
    if (!existsSync(connectorsDir)) {
      console.log('[WorkBuddy] connectors-marketplace 目录不存在')
      return []
    }

    const connectors: WorkBuddyConnector[] = []

    try {
      const entries = readdirSync(connectorsDir, { withFileTypes: true })

      for (const entry of entries) {
        if (!entry.isDirectory()) continue

        const connectorPath = join(connectorsDir, entry.name)
        const mcpConfigPath = join(connectorPath, 'mcp.json')

        if (existsSync(mcpConfigPath)) {
          try {
            const mcpConfig = JSON.parse(readFileSync(mcpConfigPath, 'utf-8'))

            connectors.push({
              id: entry.name,
              name: entry.name,
              mcpConfig,
              path: connectorPath
            })
          } catch (error) {
            console.error(`[WorkBuddy] 加载连接器 ${entry.name} 失败:`, error)
          }
        }
      }

      console.log(`[WorkBuddy] 加载了 ${connectors.length} 个连接器`)
      return connectors
    } catch (error) {
      console.error('[WorkBuddy] 加载连接器失败:', error)
      return []
    }
  }

  /**
   * 获取 WorkBuddy 路径
   */
  getPath(): string {
    return this.workbuddyPath
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      available: this.isAvailable(),
      path: this.workbuddyPath,
      skillCount: this.loadSkills().length,
      expertCount: this.loadExperts().length,
      connectorCount: this.loadConnectors().length
    }
  }
}
