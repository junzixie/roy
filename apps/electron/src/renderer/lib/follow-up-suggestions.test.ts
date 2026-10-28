import { describe, expect, test } from 'bun:test'
import { parseFollowUpSuggestions, stripFollowUpSuggestions } from './follow-up-suggestions'

describe('追问建议', () => {
  test('完整标记：显示时藏掉，解析出按钮', () => {
    const t = '已经改好了。\n\n<!--suggest:帮我打包|看看效果|删掉旧包-->'
    expect(stripFollowUpSuggestions(t)).toBe('已经改好了。')
    expect(parseFollowUpSuggestions(t)).toEqual(['帮我打包', '看看效果', '删掉旧包'])
  })
  test('流式中的半截标记也藏掉', () => {
    expect(stripFollowUpSuggestions('好的\n<!--sugg')).toBe('好的')
    expect(stripFollowUpSuggestions('好的\n<!--suggest:帮我')).toBe('好的')
    expect(parseFollowUpSuggestions('好的\n<!--suggest:帮我')).toEqual([])
  })
  test('普通 HTML 注释不受影响', () => {
    expect(stripFollowUpSuggestions('a <!-- note --> b')).toBe('a <!-- note --> b')
  })
  test('最多 3 条，去重', () => {
    expect(parseFollowUpSuggestions('<!--suggest:a|b|a|c|d-->')).toEqual(['a', 'b', 'c'])
  })
})
