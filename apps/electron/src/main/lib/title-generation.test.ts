import { describe, expect, test } from 'bun:test'
import { createFallbackTitle, sanitizeGeneratedTitle } from './title-generation'

describe('标题清洗', () => {
  test('正常标题保留', () => {
    expect(sanitizeGeneratedTitle('  "修空回复问题"  ')).toBe('修空回复问题')
    expect(sanitizeGeneratedTitle([{ type: 'text', text: '部署更新' }])).toBe('部署更新')
  })

  test('复述 prompt 的残片不当成标题', () => {
    // 真实记录：max_output_tokens 不足时上游把要求原样回显，再被截断成 20 字
    expect(sanitizeGeneratedTitle('我们需要回答用户。任务：根据用户第一条消')).toBeNull()
    expect(sanitizeGeneratedTitle('根据用户的第一条消息，生成一个简短标题')).toBeNull()
    expect(sanitizeGeneratedTitle('只输出标题，不要有任何其他内容')).toBeNull()
  })

  test('过长或跨行的结果丢弃，交给首行兜底', () => {
    expect(sanitizeGeneratedTitle('a'.repeat(40))).toBeNull()
    expect(sanitizeGeneratedTitle('第一行标题\n第二行解释')).toBeNull()
  })

  test('空内容返回 null', () => {
    expect(sanitizeGeneratedTitle('')).toBeNull()
    expect(sanitizeGeneratedTitle('   ')).toBeNull()
    expect(sanitizeGeneratedTitle(undefined)).toBeNull()
    expect(sanitizeGeneratedTitle({})).toBeNull()
  })

  test('兜底标题取首行并去 markdown 前缀', () => {
    expect(createFallbackTitle('## 修一下空回复\n还有细节')).toBe('修一下空回复')
    expect(createFallbackTitle('   ')).toBeNull()
  })
})
