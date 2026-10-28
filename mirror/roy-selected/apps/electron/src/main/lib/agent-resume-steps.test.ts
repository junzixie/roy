import { describe, expect, test } from 'bun:test'
import { brokenSteps, buildResumeStepsNote, eventsFromSdkMessages, finishedSteps } from './agent-resume-steps'

describe('agent-resume-steps', () => {
  test('finished 与 broken', () => {
    const events = [
      { type: 'tool.start', payload: { callId: '1', tool: 'Bash', args: { command: 'ls' } } },
      { type: 'tool.end', payload: { callId: '1', ok: true, summary: 'ok' } },
      { type: 'tool.start', payload: { callId: '2', tool: 'Write', args: { path: 'a.ts' } } },
    ]
    expect(finishedSteps(events)).toHaveLength(1)
    expect(brokenSteps(events)[0]?.state).toBe('half')
    const note = buildResumeStepsNote(events)
    expect(note).toContain('已完成')
    expect(note).toContain('未完成')
  })

  test('从 SDK content 抽取', () => {
    const msgs = [{
      content: [
        { type: 'tool_use', id: 't1', name: 'Read', input: { path: 'x' } },
        { type: 'tool_result', tool_use_id: 't1', content: 'hi' },
      ],
    }]
    const ev = eventsFromSdkMessages(msgs)
    expect(finishedSteps(ev)).toHaveLength(1)
  })
})