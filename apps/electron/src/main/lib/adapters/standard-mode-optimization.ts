/**
 * 标准模式（Standard Mode）优化配置
 *
 * 标准模式是 Roy 的默认工作模式，在原生模式和 DeepSeek 优化模式之间取得平衡。
 * 本模块提供标准模式的优化参数和调优逻辑。
 */

export interface StandardModeConfig {
  /** 是否启用自动压缩优化 */
  enableAutoCompaction: boolean

  /** 压缩阈值：上下文占用到多少百分比时开始压缩（50-95） */
  compactionThresholdPercent: number

  /** 保留最近消息的 token 预算 */
  keepRecentTokens: number

  /** 是否启用智能工具选择（减少不必要的工具调用） */
  enableSmartToolSelection: boolean

  /** 是否启用上下文优先级（重要消息优先保留） */
  enableContextPriority: boolean

  /** 是否启用渐进式思考（简单问题用低档位） */
  enableProgressiveThinking: boolean
}

/**
 * 标准模式默认配置
 */
export const DEFAULT_STANDARD_MODE_CONFIG: StandardModeConfig = {
  enableAutoCompaction: true,
  compactionThresholdPercent: 80,
  keepRecentTokens: 12000,
  enableSmartToolSelection: true,
  enableContextPriority: true,
  enableProgressiveThinking: true,
}

/**
 * 根据项目类型和规模调整标准模式配置
 */
export function adjustStandardModeForProject(
  projectPath: string,
  fileCount: number,
  config: StandardModeConfig = DEFAULT_STANDARD_MODE_CONFIG,
): StandardModeConfig {
  const adjusted = { ...config }

  // 大型项目（文件数 > 1000）：更激进的压缩
  if (fileCount > 1000) {
    adjusted.compactionThresholdPercent = Math.min(75, config.compactionThresholdPercent)
    adjusted.keepRecentTokens = Math.min(10000, config.keepRecentTokens)
  }

  // 小型项目（文件数 < 50）：更宽松的保留
  if (fileCount < 50) {
    adjusted.compactionThresholdPercent = Math.max(85, config.compactionThresholdPercent)
    adjusted.keepRecentTokens = Math.max(15000, config.keepRecentTokens)
  }

  return adjusted
}

/**
 * 智能工具选择：根据用户意图过滤不必要的工具
 */
export function selectRelevantTools(
  userInput: string,
  availableTools: string[],
): string[] {
  const input = userInput.toLowerCase()

  // 纯查询意图：只需要读取工具
  const isQueryOnly = /^(what|how|why|explain|show|list|查看|显示|解释|说明)/.test(input)
  if (isQueryOnly) {
    return availableTools.filter(tool =>
      tool.includes('read') ||
      tool.includes('search') ||
      tool.includes('list') ||
      tool.includes('grep') ||
      tool.includes('glob')
    )
  }

  // 修改意图：需要编辑和写入工具
  const isModifyIntent = /\b(fix|add|remove|delete|update|modify|change|create|修复|添加|删除|更新|修改|创建)\b/.test(input)
  if (isModifyIntent) {
    return availableTools.filter(tool =>
      !tool.includes('screenshot') &&
      !tool.includes('preview') &&
      !tool.includes('browser')
    )
  }

  // 默认：所有工具
  return availableTools
}

/**
 * 上下文优先级：标记重要消息
 */
export interface MessagePriority {
  messageIndex: number
  priority: 'high' | 'medium' | 'low'
  reason: string
}

export function assignMessagePriorities(messages: Array<{ role: string; content: unknown }>): MessagePriority[] {
  const priorities: MessagePriority[] = []

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    if (!msg) continue

    let priority: MessagePriority['priority'] = 'medium'
    let reason = ''

    // 用户的明确指令：高优先级
    if (msg.role === 'user') {
      const content = typeof msg.content === 'string' ? msg.content : ''
      if (content.includes('重要') || content.includes('必须') || content.includes('一定要')) {
        priority = 'high'
        reason = '包含用户强调关键词'
      } else if (content.length < 50) {
        priority = 'low'
        reason = '简短查询'
      }
    }

    // 错误信息：高优先级
    if (msg.role === 'assistant') {
      const content = typeof msg.content === 'string' ? msg.content : ''
      if (content.includes('Error') || content.includes('错误') || content.includes('失败')) {
        priority = 'high'
        reason = '包含错误信息'
      }
    }

    priorities.push({ messageIndex: i, priority, reason })
  }

  return priorities
}

/**
 * 渐进式思考：根据问题复杂度选择思考档位
 */
export function selectThinkingLevel(
  userInput: string,
  conversationLength: number,
): 'off' | 'low' | 'medium' | 'high' {
  const input = userInput.toLowerCase()

  // 斜杠命令：关闭思考
  if (input.startsWith('/')) {
    return 'off'
  }

  // 简单查询：低档位
  if (input.length < 40 && /^(what|show|list|查看|显示)/.test(input)) {
    return 'low'
  }

  // 复杂任务关键词：高档位
  if (/\b(refactor|design|architect|optimize|debug|analyze|重构|设计|架构|优化|调试|分析)\b/.test(input)) {
    return 'high'
  }

  // 长会话：提高档位（上下文多，需要更多推理整合）
  if (conversationLength > 50) {
    return 'medium'
  }

  // 默认：中档位
  return 'medium'
}
