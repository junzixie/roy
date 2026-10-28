import { bundledWorkbuddyRoot } from '../bundled-market-resources'
/**
 * WorkBuddy 资源管理器
 *
 * 加载内置的 WorkBuddy 技能、专家、连接器
 */

import { join } from 'node:path'
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { app } from 'electron'

const workbuddyRoot = bundledWorkbuddyRoot

export interface WorkBuddySkill {
  id: string
  name: string
  path: string
  description: string
  markdown?: string
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
}

/**
 * 获取所有内置技能
 */
export function getBuiltinSkills(): WorkBuddySkill[] {
  const skillsDir = join(workbuddyRoot(), 'skills')

  if (!existsSync(skillsDir)) {
    console.warn('[WorkBuddy] 技能目录不存在')
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

          // 提取描述
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
            markdown
          })
        } catch (error) {
          console.error(`[WorkBuddy] 加载技能失败: ${entry.name}`, error)
        }
      }
    }

    console.log(`[WorkBuddy] 加载了 ${skills.length} 个内置技能`)
    return skills
  } catch (error) {
    console.error('[WorkBuddy] 扫描技能目录失败', error)
    return []
  }
}

/**
 * 获取所有专家人设
 */
export function getBuiltinExperts(): WorkBuddyExpert[] {
  const pluginsDir = join(workbuddyRoot(), 'plugins', 'marketplaces')

  if (!existsSync(pluginsDir)) {
    console.warn('[WorkBuddy] 专家目录不存在')
    return []
  }

  const experts: WorkBuddyExpert[] = []

  try {
    const marketplaces = readdirSync(pluginsDir, { withFileTypes: true })

    for (const marketplace of marketplaces) {
      if (!marketplace.isDirectory()) continue

      const pluginsPath = join(pluginsDir, marketplace.name, 'plugins')
      if (!existsSync(pluginsPath)) continue

      const plugins = readdirSync(pluginsPath, { withFileTypes: true })

      for (const plugin of plugins) {
        if (!plugin.isDirectory()) continue

        const agentsDir = join(pluginsPath, plugin.name, 'agents')
        if (!existsSync(agentsDir)) continue

        const agentFiles = readdirSync(agentsDir).filter(f => f.endsWith('.md'))

        for (const agentFile of agentFiles) {
          try {
            const agentPath = join(agentsDir, agentFile)
            const markdown = readFileSync(agentPath, 'utf-8')

            // 提取角色名
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
            console.error(`[WorkBuddy] 加载专家失败: ${agentFile}`, error)
          }
        }
      }
    }

    console.log(`[WorkBuddy] 加载了 ${experts.length} 个专家`)
    return experts
  } catch (error) {
    console.error('[WorkBuddy] 扫描专家目录失败', error)
    return []
  }
}

/**
 * 获取所有 MCP 连接器
 */
export function getBuiltinConnectors(): WorkBuddyConnector[] {
  const connectorsDir = join(workbuddyRoot(), 'connectors', 'connectors')

  if (!existsSync(connectorsDir)) {
    console.warn('[WorkBuddy] 连接器目录不存在')
    return []
  }

  const connectors: WorkBuddyConnector[] = []

  try {
    const entries = readdirSync(connectorsDir, { withFileTypes: true })

    for (const entry of entries) {
      if (!entry.isDirectory()) continue

      const mcpPath = join(connectorsDir, entry.name, 'mcp.json')

      if (existsSync(mcpPath)) {
        try {
          const mcpConfig = JSON.parse(readFileSync(mcpPath, 'utf-8'))

          connectors.push({
            id: entry.name,
            name: entry.name,
            mcpConfig
          })
        } catch (error) {
          console.error(`[WorkBuddy] 加载连接器失败: ${entry.name}`, error)
        }
      }
    }

    console.log(`[WorkBuddy] 加载了 ${connectors.length} 个连接器`)
    return connectors
  } catch (error) {
    console.error('[WorkBuddy] 扫描连接器目录失败', error)
    return []
  }
}

/**
 * 获取统计信息
 */
export function getWorkBuddyStats() {
  return {
    skillCount: getBuiltinSkills().length,
    expertCount: getBuiltinExperts().length,
    connectorCount: getBuiltinConnectors().length,
    resourcePath: workbuddyRoot()
  }
}
