import { test, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { createAgentRuntimeGuard } from './agent-runtime-guards'
import { mapAgentErrorToTypedError } from './agent-error-utils'

test('未配置上限时1000轮仍不主动停止；费用与输出守卫保持独立', () => {
  const guard = createAgentRuntimeGuard({})
  for (let i=0;i<1000;i++) guard.recordMessage({role:'assistant',content:[]} as never)
  expect(guard.shouldStopBeforeNextTurn()).toBe(false)
  expect(guard.getLimitResultOverride()).toBeUndefined()
  expect(guard.applyToolResult({content:[],details:{}})).not.toHaveProperty('terminate')
})
test('显式轮数及费用限制仍保留', () => {
  const guard=createAgentRuntimeGuard({maxTurns:2})
  guard.recordMessage({role:'assistant',content:[]} as never)
  expect(guard.shouldStopBeforeNextTurn()).toBe(false)
  guard.recordMessage({role:'assistant',content:[]} as never)
  expect(guard.getLimitResultOverride()?.subtype).toBe('error_max_turns')
  const cost=createAgentRuntimeGuard({maxBudgetUsd:1})
  cost.recordMessage({role:'assistant',content:[],usage:{cost:{total:1}}} as never)
  expect(cost.getLimitResultOverride()?.subtype).toBe('error_max_budget_usd')
})
test('真实任务入口不再注入10/28轮默认值', () => {
  const src=readFileSync(new URL('./agent-orchestrator.ts',import.meta.url),'utf8')
  expect(src).toMatch(/const maxTurns = appSettings.agentMaxTurns[\s\S]*?\? appSettings.agentMaxTurns\s*: undefined/)
  expect(src).not.toContain('input.assistantMode ? 10 : 28')
})
test('本地超时优先于provider_error映射，不误报服务繁忙', () => {
  for(const text of ['Stream idle timeout：45 秒没有收到模型的新数据','Stream request timeout：达到显式时限']) {
    const error=mapAgentErrorToTypedError('provider_error',text,text)
    expect(error.title).toBe('模型响应等待超时')
    expect(error.code).toBe('network_error')
  }
  expect(mapAgentErrorToTypedError('overloaded','overloaded','overloaded').title).toBe('服务繁忙')
})
