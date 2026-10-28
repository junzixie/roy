import { describe, expect, test } from 'bun:test'
import { isShortThinking, mergeShortThinking } from './merge-short-thinking'

const think = (thinking: string) => ({ type: 'thinking', thinking })
const tool = (name = 'Bash') => ({ type: 'tool_use', name })
const text = (t: string) => ({ type: 'text', text: t })
const hidden = new Set(['TodoWrite'])

describe('细节模式：短思考并到命令行', () => {
  test('想完的短思考挂到紧跟的命令上，不再单独一行', () => {
    const blocks = [think('先看目录'), tool(), think('再看配置'), tool(), tool()]
    const r = mergeShortThinking(blocks, { liveIndex: -1 })
    expect([...r.skip]).toEqual([0, 2])
    expect(r.leading.get(1)).toBe('先看目录')
    expect(r.leading.get(3)).toBe('再看配置')
    expect(r.leading.has(4)).toBe(false)
  })

  test('长思考照旧单独一行', () => {
    const long = '想'.repeat(400)
    const r = mergeShortThinking([think(long), tool()], { liveIndex: -1 })
    expect(r.skip.size).toBe(0)
    expect(r.leading.size).toBe(0)
  })

  test('还在想的思考不合并', () => {
    const r = mergeShortThinking([think('想到一半'), tool(), think('还在想')], { liveIndex: 2 })
    expect([...r.skip]).toEqual([0])
    expect(r.skip.has(2)).toBe(false)
  })

  test('后面接正文或子代理的思考不合并', () => {
    expect(mergeShortThinking([think('总结一下'), text('答复')], { liveIndex: -1 }).skip.size).toBe(0)
    expect(mergeShortThinking([think('派个子任务'), tool('Agent')], { liveIndex: -1 }).skip.size).toBe(0)
  })

  test('跳过隐藏的任务进度工具，挂到下一条可见命令', () => {
    const r = mergeShortThinking([think('更新计划后跑命令'), tool('TodoWrite'), tool('Bash')], { liveIndex: -1, hiddenToolNames: hidden })
    expect(r.leading.get(2)).toBe('更新计划后跑命令')
    expect(r.skip.has(0)).toBe(true)
  })

  test('连续几段短思考按顺序拼在一起', () => {
    const r = mergeShortThinking([think('一'), think('二'), tool()], { liveIndex: -1 })
    expect(r.leading.get(2)).toBe('一\n\n二')
    expect([...r.skip]).toEqual([0, 1])
  })

  test('空思考不算、也不打断合并', () => {
    expect(isShortThinking('   ')).toBe(false)
    const r = mergeShortThinking([think('看一下'), think(''), tool()], { liveIndex: -1 })
    expect(r.leading.get(2)).toBe('看一下')
  })

  test('超过 4 行的思考不算短', () => {
    expect(isShortThinking('1\n2\n3\n4')).toBe(true)
    expect(isShortThinking('1\n2\n3\n4\n5')).toBe(false)
  })
})
