import type { AgentThinkingLevel } from '@roy/shared'
export const THINKING_ORDER: readonly AgentThinkingLevel[] = ['low', 'medium', 'high', 'xhigh', 'max']
export function supportedThinkingIndexes(levels: readonly AgentThinkingLevel[]): number[] {
  return THINKING_ORDER.map((_, i) => i).filter(i => levels.includes(THINKING_ORDER[i]!))
}
export function recommendedThinkingIndex(levels: readonly AgentThinkingLevel[]): number {
  return levels.includes('medium') ? 1 : (supportedThinkingIndexes(levels)[0] ?? -1)
}
export function selectThinkingLevel(index: number, levels: readonly AgentThinkingLevel[]): AgentThinkingLevel | undefined {
  const value = THINKING_ORDER[index]
  return value && levels.includes(value) ? value : undefined
}
