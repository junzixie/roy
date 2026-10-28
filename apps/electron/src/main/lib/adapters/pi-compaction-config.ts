/**
 * Pi 压缩配置优化
 *
 * 根据不同模型和工作模式，动态调整压缩参数
 */

export interface CompactionConfig {
  /** 压缩触发阈值百分比（0-100） */
  thresholdPercent: number
  /** 压缩后保留的最近 token 数 */
  keepRecentTokens: number
  /** 是否启用完整轮次切分 */
  useCompleteTurnSplit: boolean
  /** 是否启用性能监控 */
  enablePerformanceMonitoring: boolean
}

export type WorkMode = 'native' | 'standard' | 'deepseek'

/**
 * 为不同模型和工作模式提供优化的压缩配置
 */
export function getOptimizedCompactionConfig(
  modelId: string,
  workMode: WorkMode,
  contextWindow: number,
): CompactionConfig {
  // DeepSeek 系列模型优化配置
  if (modelId.includes('deepseek') || workMode === 'deepseek') {
    return {
      thresholdPercent: 60, // 60% 就开始压缩，避免模型在大上下文时变慢
      keepRecentTokens: 6000, // 保留 6k，压得更彻底
      useCompleteTurnSplit: true,
      enablePerformanceMonitoring: true,
    }
  }

  // Claude 系列模型
  if (modelId.includes('claude')) {
    return {
      thresholdPercent: 70, // Claude 对长上下文处理更好
      keepRecentTokens: 8000,
      useCompleteTurnSplit: true,
      enablePerformanceMonitoring: true,
    }
  }

  // GPT 系列模型
  if (modelId.includes('gpt')) {
    return {
      thresholdPercent: 75,
      keepRecentTokens: 10000,
      useCompleteTurnSplit: true,
      enablePerformanceMonitoring: true,
    }
  }

  // 小上下文窗口模型（< 50k）
  if (contextWindow < 50000) {
    return {
      thresholdPercent: 50, // 更早压缩
      keepRecentTokens: 3000,
      useCompleteTurnSplit: true,
      enablePerformanceMonitoring: true,
    }
  }

  // 默认配置（保守）
  return {
    thresholdPercent: 70,
    keepRecentTokens: 8000,
    useCompleteTurnSplit: true,
    enablePerformanceMonitoring: true,
  }
}

/**
 * 根据压缩后的残留情况，动态调整下次压缩参数
 */
export function adjustCompactionConfigByResidual(
  currentConfig: CompactionConfig,
  residualTokens: number,
  thresholdTokens: number,
): CompactionConfig {
  const residualRatio = residualTokens / thresholdTokens

  // 如果压缩后残留还很高（> 0.7），说明 keepRecentTokens 太大
  if (residualRatio > 0.7) {
    return {
      ...currentConfig,
      keepRecentTokens: Math.max(3000, Math.floor(currentConfig.keepRecentTokens * 0.8)),
    }
  }

  // 如果压缩后残留很低（< 0.3），可以稍微放宽
  if (residualRatio < 0.3) {
    return {
      ...currentConfig,
      keepRecentTokens: Math.min(12000, Math.floor(currentConfig.keepRecentTokens * 1.1)),
    }
  }

  return currentConfig
}

/**
 * 计算建议的压缩阈值（绝对 token 数）
 */
export function calculateCompactionThreshold(
  contextWindow: number,
  thresholdPercent: number,
): number {
  return Math.floor(contextWindow * (thresholdPercent / 100))
}

/**
 * 判断是否应该提前压缩（预防性压缩）
 */
export function shouldPreemptiveCompress(
  currentTokens: number,
  thresholdTokens: number,
  userInputTokens: number,
): boolean {
  // 如果用户输入很长（> 2000 tokens），且当前已接近阈值（> 85%）
  // 则在处理前先压缩，避免溢出
  if (userInputTokens > 2000 && currentTokens > thresholdTokens * 0.85) {
    return true
  }

  return false
}
