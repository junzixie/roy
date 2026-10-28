import { describe, expect, test } from 'bun:test'
import { findLiveBlockIndex } from './live-block'

const thinking = { type: 'thinking', thinking: '想一下' }
const tool = { type: 'tool_use', name: 'Bash', id: 't1' }
const text = { type: 'text', text: '说明' }

describe('一轮回复里还在输出的块', () => {
  test('运行中只有最后一个块算正在输出，前面的思考已经结束', () => {
    const blocks = [thinking, tool, text, thinking, tool, thinking]
    expect(findLiveBlockIndex(blocks, true)).toBe(5)
  })

  test('最后一个块是工具调用时，所有思考都已结束', () => {
    const blocks = [thinking, tool, thinking, tool]
    const live = findLiveBlockIndex(blocks, true)
    expect(blocks.filter((_, i) => i === live && blocks[i] === thinking)).toHaveLength(0)
  })

  test('整轮结束或还没有内容时，没有正在输出的块', () => {
    expect(findLiveBlockIndex([thinking, tool], false)).toBe(-1)
    expect(findLiveBlockIndex([thinking], undefined)).toBe(-1)
    expect(findLiveBlockIndex([], true)).toBe(-1)
  })
})
