/**
 * 预算压缩工具：只在完整对话轮次处切分
 *
 * 对齐天书的实现：确保工具调用与结果配对完整，动态回退保证不截断到工具调用中间。
 */

import type { OaiMessage } from '../types/oai-types'

/** 判断消息是否是工具调用或工具结果 */
function hasToolActivity(message: OaiMessage): boolean {
  if (!message) return false
  if (message.role === 'assistant' && message.tool_calls && message.tool_calls.length > 0) return true
  if (message.role === 'tool') return true
  return false
}

/**
 * 计算压缩切分点，只允许完整对话轮次进入归档摘要。
 *
 * 规则：
 * 1. 优先在 recentBudget 范围内保留尽可能多的完整消息
 * 2. 如果某条消息有工具调用，必须确保所有工具结果也在保留范围内
 * 3. 动态回退：如果切分点落在工具调用中间，向前回退到上一个完整轮次
 *
 * @param messages 消息历史
 * @param recentBudget 保留最近消息的 token 预算（可选）
 * @returns 切分点索引（该索引之前的消息进入摘要，之后的保留）
 */
export function budgetCompactionSplit(messages: OaiMessage[], recentBudget?: number): number {
  // 默认保留最后 4 条消息
  let split = Math.max(0, messages.length - 4)

  // 如果指定了预算，尝试在预算内保留更多消息
  if (recentBudget !== undefined && recentBudget > 0) {
    let tokens = estimateTokens(messages.slice(split))

    // 向前扩展，尽可能多保留
    while (split > 0) {
      const nextTokens = estimateTokens([messages[split - 1]!])
      if (tokens + nextTokens > recentBudget) break
      tokens += nextTokens
      split--
    }
  }

  // 确保不在工具调用中间切分：如果切分点是 tool 消息，向前回退
  while (split > 0 && messages[split]?.role === 'tool') {
    split--
  }

  // 动态回退：确保工具调用与结果配对完整
  if (recentBudget !== undefined && split < messages.length) {
    // 检查切分点之后是否有未配对的工具活动
    let tokens = estimateTokens(messages.slice(split))

    if (tokens > recentBudget) {
      // 超出预算，需要回退到完整轮次
      // 找到最近的完整轮次边界
      for (let i = split; i < messages.length; i++) {
        const msg = messages[i]
        if (!msg) continue

        // 如果是 assistant 消息且有工具调用
        if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
          // 检查所有工具调用是否都有对应的结果
          const toolCallIds = new Set(msg.tool_calls.map(call => call.id))
          const toolResults = messages.slice(i + 1).filter(m => m.role === 'tool')
          const resultIds = new Set(toolResults.map(m => m.tool_call_id))

          // 如果工具调用数量和结果数量不匹配，或 ID 不匹配
          if (toolCallIds.size !== msg.tool_calls.length ||
              msg.tool_calls.length !== toolResults.length ||
              !Array.from(toolCallIds).every(id => resultIds.has(id))) {
            // 工具调用不完整，回退
            break
          }

          // 找到完整轮次的结束位置
          let endIdx = i + 1
          while (endIdx < messages.length && messages[endIdx]?.role === 'tool') {
            endIdx++
          }

          // 更新切分点和预算
          tokens -= estimateTokens(messages.slice(split, endIdx))
          split = endIdx

          if (tokens <= recentBudget) break
        }
      }
    }
  }

  return split
}

/**
 * 简单的 token 估算（临时实现，后续可替换为实际的 token 计数）
 */
function estimateTokens(messages: OaiMessage[]): number {
  let chars = 0
  for (const msg of messages) {
    if (!msg) continue

    if (typeof msg.content === 'string') {
      chars += msg.content.length
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string') {
          chars += part.text.length
        }
      }
    }

    if (msg.role === 'assistant' && msg.tool_calls) {
      chars += JSON.stringify(msg.tool_calls).length
    }
  }

  // 粗略估算：平均 4 个字符 = 1 个 token
  return Math.ceil(chars / 4)
}
