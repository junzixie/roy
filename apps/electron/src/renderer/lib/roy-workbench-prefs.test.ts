import { describe, expect, test } from 'bun:test'
import { parseCreateTaskIntent, stripWakeWord, utteranceContainsWakeWord } from './roy-workbench-prefs'

describe('语音工具台意图解析', () => {
  test.each(['你好', '你今天怎么样', '杭州今天天气怎么样'])('普通交谈不创建任务：%s', (text) => {
    expect(parseCreateTaskIntent(text)).toBeNull()
  })
  test('未指定名字保持空名称、不抛错', () => {
    expect(parseCreateTaskIntent('我想创建一个项目')).toEqual({ name: '', raw: '我想创建一个项目' })
  })
  test('支持显式名称和后半句目标', () => {
    expect(parseCreateTaskIntent('新建任务，做一个电商小程序')?.name).toBe('电商小程序')
    expect(parseCreateTaskIntent('创建一个项目名为天气助手')?.name).toBe('天气助手')
    expect(parseCreateTaskIntent('create a task named demo')?.name).toBe('demo')
  })
  test('罗伊及同音词保留唤醒语义', () => {
    expect(utteranceContainsWakeWord('洛伊你好', '罗伊')).toBe(true)
    expect(stripWakeWord('罗伊，你今天怎么样', '罗伊')).toBe('你今天怎么样')
  })
})
