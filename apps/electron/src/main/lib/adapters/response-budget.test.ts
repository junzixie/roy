import { describe, expect, test } from 'bun:test'
import { ResponseBudget, installResponseBudget, shellTimeoutSeconds, withShellDeadline, withToolDeadline } from './response-budget'
import type { AgentSession, ToolDefinition } from '@earendil-works/pi-coding-agent'
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
describe('阶段预算与工具等待保护', () => {
  test('Shell默认60秒且最大600秒，非法值不能禁用超时', () => {
    for (const v of [undefined, 0, -1, NaN, Infinity, '0']) expect(shellTimeoutSeconds(v)).toBe(60)
    expect(shellTimeoutSeconds(25)).toBe(25); expect(shellTimeoutSeconds(9999)).toBe(600)
  })
  test('包装真实调用参数，不重放命令', async () => {
    const calls: unknown[] = []
    const tool = {name:'bash',description:'test',execute:async (_id: string,p: unknown) => { calls.push(p);return {content:[],details:{}} }} as unknown as ToolDefinition
    await withShellDeadline(tool).execute('a', {command:'test'}, undefined, undefined, {} as never)
    expect(calls).toEqual([{command:'test',timeout:60}])
  })
  test('工具无返回时及时取消，且只执行一次', async () => {
    let calls=0;let aborted=false
    const tool = {name:'MCPTest',execute:async (_i: string,_p: unknown,s: AbortSignal) => {calls++;s.addEventListener('abort',()=>{aborted=true});return await new Promise(()=>{})}} as unknown as ToolDefinition
    await expect(withToolDeadline(tool,15).execute('a', {}, undefined, undefined, {} as never)).rejects.toThrow('先核对状态')
    expect(calls).toBe(1);expect(aborted).toBe(true)
  })
  test('用户审批工具不被通用超时包装', () => {
    const tool={name:'AskUserQuestion'} as ToolDefinition
    expect(withToolDeadline(tool)).toBe(tool)
  })
  test('阶段到期后禁用工具并请求已有结果总结，不清空用户插话', async () => {
    let cleared=0
    const agent={clearAllQueues:()=>{cleared++},beforeToolCall:undefined,prepareRequest:undefined,finishTurn:undefined} as unknown as AgentSession['agent']
    const session={agent} as AgentSession;const budget=new ResponseBudget(1,2)
    installResponseBudget(session,budget)
    const ctx={context:{messages:[],tools:[{name:'bash'}]},thinkingLevel:'low'} as never
    expect(await agent.prepareRequest!(ctx)).toBeUndefined()
    const next=await agent.prepareRequest!(ctx)
    expect(next?.context?.tools).toEqual([])
    expect(next?.context?.messages.at(-1)).toMatchObject({role:'system',toolsRemoved:[{name:'bash'}]})
    expect(await agent.beforeToolCall!({} as never)).toMatchObject({block:true,terminate:false})
    expect(await agent.finishTurn!({} as never)).toEqual({action:'end'})
    expect(cleared).toBe(0)
    budget.reset();expect(budget.reached).toBe(false)
  })
  test('审批等待不计入阶段耗时', async () => {
    const b=new ResponseBudget(8,16,35)
    b.pause();await sleep(45);expect(b.timeReached).toBe(false)
    b.resume();await sleep(40);expect(b.timeReached).toBe(true)
  })
})

test('实际Agent内核：阶段总结移除工具声明，停止循环', async () => {
  const { Agent } = await import('@earendil-works/pi-agent-core')
  const { createAssistantMessageEventStream, normalizeContext } = await import('@earendil-works/pi-ai')
  const { Type } = await import('typebox')
  let calls=0,requests=0
  const tool={name:'probe',label:'probe',description:'offline',parameters:Type.Object({}),execute:async()=>{calls++;return{content:[{type:'text' as const,text:'observed'}],details:{}}}}
  const agent=new Agent({initialState:{systemPrompt:'test',tools:[tool],model:{api:'openai-completions',provider:'test',id:'test'} as never},streamFn:(_m,context)=>{
    requests++
    const out=createAssistantMessageEventStream()
    const transcript=normalizeContext(context)
    const system=transcript.messages.filter(m=>m.role==='system')
    const toolNames=system.flatMap(m=>m.toolsAdded??[]).map(t=>t.name)
    if(requests===1) expect(toolNames).toContain('probe')
    else expect(toolNames).not.toContain('probe')
    const message={role:'assistant' as const,content:requests===1?[{type:'toolCall' as const,id:'call-1',name:'probe',arguments:{}}]:[{type:'text' as const,text:'已查到结果，其余尚未执行。'}],api:'openai-completions',provider:'test',model:'test',usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},stopReason:requests===1?'toolUse' as const:'stop' as const,timestamp:Date.now()}
    queueMicrotask(()=>{out.push({type:'start',partial:message});out.push({type:'done',reason:message.stopReason,message});out.end(message)})
    return out
  }})
  installResponseBudget({agent} as unknown as AgentSession,new ResponseBudget(1,2))
  await agent.prompt('只读检查')
  expect(requests).toBe(2);expect(calls).toBe(1)
})

test('第6轮耗时触发不能误报为6轮硬上限', () => {
  const budget=new ResponseBudget(24,60,0)
  budget.turns=6;budget.tools=9;budget.beginSummary()
  expect(budget.summaryNotice).toContain('阶段耗时达到')
  expect(budget.summaryNotice).toContain('模型 6 轮')
  expect(budget.summaryNotice).not.toContain('模型请求轮数达到')
  expect(budget.summaryNotice).toContain('这不是任务完成')
  budget.reset();expect(budget.summaryNotice).toBe('')
})
test('轮数和工具数按真实原因显示，暂停信息固定', () => {
  const budget=new ResponseBudget(8,16)
  budget.turns=8;budget.tools=16;budget.beginSummary()
  expect(budget.summaryNotice).toContain('模型请求轮数达到 8 轮')
  expect(budget.summaryNotice).toContain('工具调用达到 16 次')
  const notice=budget.summaryNotice
  budget.turns++;budget.beginSummary();expect(budget.summaryNotice).toBe(notice)
})


test('默认连续执行越过旧阶段门槛仍保留工具和原有完成决策', async () => {
  const budget=new ResponseBudget()
  budget.turns=100;budget.tools=200
  expect(budget.reached).toBe(false)
  expect(budget.maxMs).toBe(Infinity)
  let approvals=0
  const agent={beforeToolCall:async()=>{approvals++;return {block:true,reason:'未授权'}},prepareRequest:undefined,finishTurn:async()=>({action:'continue'})} as unknown as AgentSession['agent']
  installResponseBudget({agent} as AgentSession,budget)
  expect(await agent.prepareRequest!({context:{messages:[],tools:[{name:'read'}]}} as never)).toBeUndefined()
  expect(await agent.beforeToolCall!({} as never)).toMatchObject({block:true,reason:'未授权'})
  expect(approvals).toBe(1)
  expect(budget.tools).toBe(200)
  expect(await agent.finishTurn!({} as never)).toEqual({action:'continue'})
  expect(budget.summaryNotice).toBe('')
})

test('实际适配器不再给助手或项目注入固定阶段门槛', async () => {
  const {readFileSync}=await import('node:fs')
  const src=readFileSync(new URL('./pi-agent-adapter.ts',import.meta.url),'utf8')
  expect(src).toContain('const responseBudget = new ResponseBudget()')
  expect(src).not.toContain('new ResponseBudget(input.assistantMode')
  expect(src).toContain('createAgentRuntimeGuard(input)')
})
