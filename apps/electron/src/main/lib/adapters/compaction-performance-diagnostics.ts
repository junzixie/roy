/**
 * 压缩性能诊断工具
 *
 * 诊断上下文压缩过程中的性能问题：
 * - 卡顿原因分析
 * - 锚点提取性能
 * - 正则表达式优化建议
 * - 压缩配置调优
 */

import type { ReasoningCompactionSettings } from './deepseek-reasoning-compaction'
import { DEFAULT_TRUNCATE_CHARS, MIN_TRUNCATE_THRESHOLD, MAX_ANCHORS } from './deepseek-reasoning-compaction'

export interface CompactionPerformanceIssue {
  category: 'truncation' | 'anchors' | 'regex' | 'budget'
  severity: 'low' | 'medium' | 'high' | 'critical'
  description: string
  suggestion: string
  estimatedImpactMs?: number
}

export interface CompactionDiagnosticResult {
  issues: CompactionPerformanceIssue[]
  overallHealth: 'good' | 'warning' | 'poor'
  recommendedSettings: Partial<ReasoningCompactionSettings>
}

/**
 * 诊断压缩性能问题
 */
export function diagnoseCompactionPerformance(
  settings: ReasoningCompactionSettings,
  recentCompactionTimeMs: number,
  messageCount: number,
  averageReasoningLength: number,
): CompactionDiagnosticResult {
  const issues: CompactionPerformanceIssue[] = []

  // 检查截断参数是否合理
  const truncateChars = settings.truncateChars ?? DEFAULT_TRUNCATE_CHARS
  if (truncateChars < 1000) {
    issues.push({
      category: 'truncation',
      severity: 'high',
      description: `截断长度过小（${truncateChars} 字符），会导致频繁触发锚点提取`,
      suggestion: `建议设置为至少 ${DEFAULT_TRUNCATE_CHARS} 字符`,
      estimatedImpactMs: 50 * messageCount,
    })
  }

  if (truncateChars > 10000) {
    issues.push({
      category: 'truncation',
      severity: 'medium',
      description: `截断长度过大（${truncateChars} 字符），压缩效果不明显`,
      suggestion: `建议设置为 ${DEFAULT_TRUNCATE_CHARS}-${MIN_TRUNCATE_THRESHOLD} 字符`,
    })
  }

  // 检查锚点提取性能
  if (settings.injectAnchors !== false && averageReasoningLength > 5000) {
    const estimatedAnchorsPerMessage = Math.min(MAX_ANCHORS, Math.floor(averageReasoningLength / 500))
    const estimatedRegexTimeMs = estimatedAnchorsPerMessage * messageCount * 0.5

    if (estimatedRegexTimeMs > 100) {
      issues.push({
        category: 'anchors',
        severity: 'high',
        description: `推理内容过长（平均 ${averageReasoningLength} 字符），锚点提取耗时`,
        suggestion: '考虑禁用锚点注入（injectAnchors: false）或减少 MAX_ANCHORS',
        estimatedImpactMs: estimatedRegexTimeMs,
      })
    }
  }

  // 检查正则表达式复杂度
  if (settings.enabled !== false && averageReasoningLength > 8000) {
    issues.push({
      category: 'regex',
      severity: 'medium',
      description: '推理内容过长，多个正则表达式匹配可能导致卡顿',
      suggestion: '考虑在截断前先切分成小块，逐块匹配',
      estimatedImpactMs: messageCount * 10,
    })
  }

  // 检查整体压缩时间
  if (recentCompactionTimeMs > 2000) {
    issues.push({
      category: 'budget',
      severity: 'critical',
      description: `最近一次压缩耗时 ${recentCompactionTimeMs}ms，严重影响用户体验`,
      suggestion: '建议：1) 减少 keepRecentTokens；2) 禁用锚点注入；3) 增大压缩阈值',
    })
  } else if (recentCompactionTimeMs > 1000) {
    issues.push({
      category: 'budget',
      severity: 'high',
      description: `压缩耗时 ${recentCompactionTimeMs}ms，可能导致明显延迟`,
      suggestion: '考虑优化压缩配置或减少消息历史长度',
    })
  }

  // 生成推荐设置
  const recommendedSettings: Partial<ReasoningCompactionSettings> = {}

  if (issues.some(i => i.category === 'truncation')) {
    recommendedSettings.truncateChars = DEFAULT_TRUNCATE_CHARS
  }

  if (issues.some(i => i.category === 'anchors' && i.severity === 'high')) {
    recommendedSettings.injectAnchors = false
  }

  // 评估整体健康度
  const criticalCount = issues.filter(i => i.severity === 'critical').length
  const highCount = issues.filter(i => i.severity === 'high').length

  let overallHealth: CompactionDiagnosticResult['overallHealth'] = 'good'
  if (criticalCount > 0) {
    overallHealth = 'poor'
  } else if (highCount > 1) {
    overallHealth = 'warning'
  }

  return {
    issues,
    overallHealth,
    recommendedSettings,
  }
}

/**
 * 测量锚点提取性能
 */
export function measureAnchorExtractionPerformance(
  reasoning: string,
  iterations: number = 100,
): { avgTimeMs: number; minTimeMs: number; maxTimeMs: number } {
  const times: number[] = []

  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    // 模拟锚点提取（简化版）
    const patterns = [
      /(?:已经?排除|排除掉|可以排除|应排除)[了：:]?\s*([^\n。；;]{2,120})/g,
      /(?:不是|并非|不在)\s*([^\n。；;]{2,80}?)\s*(?:的问题|导致|引起|造成)/g,
    ]
    for (const pattern of patterns) {
      pattern.lastIndex = 0
      let match
      while ((match = pattern.exec(reasoning)) !== null) {
        // 模拟处理
        match[1]?.trim()
      }
    }
    times.push(performance.now() - start)
  }

  return {
    avgTimeMs: times.reduce((a, b) => a + b, 0) / times.length,
    minTimeMs: Math.min(...times),
    maxTimeMs: Math.max(...times),
  }
}

/**
 * 压缩卡顿实时监控
 */
export class CompactionPerformanceMonitor {
  private compactionTimes: number[] = []
  private readonly maxSamples = 10

  recordCompaction(timeMs: number): void {
    this.compactionTimes.push(timeMs)
    if (this.compactionTimes.length > this.maxSamples) {
      this.compactionTimes.shift()
    }
  }

  getAverageTime(): number {
    if (this.compactionTimes.length === 0) return 0
    return this.compactionTimes.reduce((a, b) => a + b, 0) / this.compactionTimes.length
  }

  isPerformanceDegrading(): boolean {
    if (this.compactionTimes.length < 3) return false

    // 检查最近 3 次是否都超过 1 秒
    const recent = this.compactionTimes.slice(-3)
    return recent.every(t => t > 1000)
  }

  getSuggestion(): string | null {
    const avg = this.getAverageTime()
    if (avg > 2000) {
      return '压缩严重卡顿，建议：1) 禁用锚点注入；2) 减少保留消息数；3) 增大压缩阈值到 85%'
    }
    if (avg > 1000) {
      return '压缩轻微卡顿，建议：调整 truncateChars 到 1500-2000'
    }
    if (this.isPerformanceDegrading()) {
      return '压缩性能持续下降，可能是推理内容过长导致，建议检查项目规模'
    }
    return null
  }

  reset(): void {
    this.compactionTimes = []
  }
}
