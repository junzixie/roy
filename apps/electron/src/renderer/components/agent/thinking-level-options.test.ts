import { expect, test } from 'bun:test'
import { supportedThinkingIndexes, recommendedThinkingIndex, selectThinkingLevel } from './thinking-level-options'
test('只有轻度和高：中度禁用，不偷偷转轻度', () => {
 expect(selectThinkingLevel(1,['low','high'])).toBeUndefined()
 expect(supportedThinkingIndexes(['low','high'])).toEqual([0,2])
 expect(selectThinkingLevel(2,['low','high'])).toBe('high')
})
test('推荐值不回退到最贵档', () => {
 expect(recommendedThinkingIndex(['low','high'])).toBe(0)
 expect(recommendedThinkingIndex(['low','medium','high'])).toBe(1)
})
test('能力列表为空不擅自开放全部档位', () => {
 expect(supportedThinkingIndexes([])).toEqual([])
 expect(recommendedThinkingIndex([])).toBe(-1)
 expect(selectThinkingLevel(0,[])).toBeUndefined()
})
