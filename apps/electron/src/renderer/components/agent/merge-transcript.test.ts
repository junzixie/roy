import { expect, test } from 'bun:test'
import type { SDKMessage } from '@roy/shared'
import { mergeTranscript } from './merge-transcript'
import { groupIntoTurns } from '@roy/session-core'
const key = (m: SDKMessage) => String((m as Record<string, unknown>).uuid)
const user = (uuid: string, at: number) => ({ type: 'user', uuid, _createdAt: at, message: { content: [{ type: 'text', text: uuid }] } }) as SDKMessage
const reply = (uuid: string, at: number) => ({ type: 'assistant', uuid, _royLiveRunStartedAt: at, message: { model: 'm', content: [{ type: 'text', text: uuid }] } }) as SDKMessage
const ids = (messages: SDKMessage[]) => messages.map(key)
test('停止后立即继续：未落盘旧回复留在新问题前', () => {
 expect(ids(mergeTranscript([user('u1', 1), user('u2', 3)], [reply('a1', 1)], key))).toEqual(['u1','a1','u2'])
})
test('插话：共享用户消息作为边界，不把前面的回复尾插', () => {
 const u = user('u2', 3)
 expect(ids(mergeTranscript([user('u1',1), u], [reply('a1',1),u,reply('a2',3)],key))).toEqual(['u1','a1','u2','a2'])
})
test('切换会话再回来：落盘快照与实时相同 UUID 不重复', () => {
 const base=[user('u1',1),reply('a1',1),user('u2',3),reply('a2',3)]
 expect(ids(mergeTranscript(base,[reply('a1',1),reply('a2',3)],key))).toEqual(ids(base))
})
test('result 终态后新的助手段落不会重新合并', () => {
 const result={type:'result',subtype:'success',uuid:'r'} as SDKMessage
 const groups=groupIntoTurns([reply('a1',1),result,reply('a2',3)])
 expect(groups.filter(g=>g.type==='assistant-turn')).toHaveLength(2)
})

// 旧记录把提问落盘时间取成 Date.now()，比轮次起点晚几毫秒。此时提问自己会命中
// “_createdAt > runStart” 的边界判断，实时回复就被插到提问上方。
test('提问落盘时间晚于轮次起点时，回复仍排在提问之后', () => {
 const runStart = 1000
 const asking = user('u1', runStart + 12)
 const streaming = { ...reply('a1', runStart), _createdAt: runStart } as SDKMessage
 expect(ids(mergeTranscript([asking], [streaming], key))).toEqual(['u1', 'a1'])
})

// 边界判断本身仍要生效：后续那一轮的真实提问不能把上一轮未落盘的回复甩到前面。
test('本轮回复不得越过下一轮提问', () => {
 const runStart = 1000
 const nextAsk = user('u2', runStart + 5000)
 const streaming = { ...reply('a1', runStart), _createdAt: runStart } as SDKMessage
 expect(ids(mergeTranscript([user('u1', runStart), nextAsk], [streaming], key))).toEqual(['u1', 'a1', 'u2'])
})

// 回归：建索引后插入点必须跟着后续 splice 一起位移。
test('连续插入多条未落盘消息时保持落盘顺序', () => {
 const persisted = [user('u1', 1), user('u2', 2), user('u3', 3)]
 const live = [reply('a1', 1), reply('a2', 1), reply('a3', 1)]
 expect(ids(mergeTranscript(persisted, live, key))).toEqual(['u1', 'a1', 'a2', 'a3', 'u2', 'u3'])
})
