/**
 * Active View Atom - 主内容区视图状态
 *
 * 控制 MainArea 显示的内容：
 * - conversations: 对话视图（Chat/Agent 模式内容）
 * - planning: 任务、日程与定时任务统一视图
 * - agent-skills: 技能（Skills/MCP）全屏管理视图
 * - vault: Chat 模式下独立显示的笔记视图
 * - ai-assistant: AI 工具台 / Roy 工作台（球体+多外观+语音）
 * - workflow: 工作流画布
 * - market: 技能市场（内置与第三方技能目录）
 */

import { atom } from 'jotai'

export type ActiveView = 'conversations' | 'planning' | 'agent-skills' | 'vault' | 'ai-assistant' | 'workflow' | 'market' | 'partners' | 'mobile-remote' | 'usage'
export type AgentSkillsCapabilityTab = 'skills' | 'mcp' | 'partners' | 'memory'

/** 当前活跃视图（不持久化，每次启动默认显示对话） */
export const activeViewAtom = atom<ActiveView>('conversations')

/** Agent 技能视图当前子页，用于外部入口直达 MCP 管理 */
export const agentSkillsTabAtom = atom<AgentSkillsCapabilityTab>('skills')
/** 外部入口要求技能中心打开指定 Skill 详情。 */
export const pendingAgentSkillSlugAtom = atom<string | null>(null)
/** 市场页当前分类：全部 / 内置 / 第三方 */
export type MarketSourceFilter = 'all' | 'builtin' | 'thirdparty'
export const marketSourceFilterAtom = atom<MarketSourceFilter>('all')
