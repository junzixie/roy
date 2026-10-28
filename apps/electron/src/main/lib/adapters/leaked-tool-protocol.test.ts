import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { ProtocolTextStream, hasLeakedProtocol, stripProtocol, visibleProtocolText, PROTOCOL_NOTICE } from './leaked-tool-protocol'
import { convertPiMessage, convertResultMessage, detectStalledTurn, buildStallNudge, isInternalStallNudge } from './pi-message-adapter'
const raw = '<｜｜DSML｜｜ calls>\n<｜｜DSML｜｜ invoke name="read">\n<｜｜DSML｜｜ parameter name="path" string="true">E:/project/ui-theme.css</｜｜DSML｜｜ parameter>\n</｜｜DSML｜｜ invoke>\n</｜｜DSML｜｜ calls>'
const assistant = (text: string, stopReason = 'stop') => ({ role: 'assistant', content: [{ type: 'text', text }], stopReason } as never)
describe('未解析工具协议中断修复', () => {
  test.each([raw, raw.replaceAll('｜','|'), raw.replaceAll('｜｜','｜'), raw.replaceAll('｜｜',' | | '), '< | | DSML | | parameter name="path">x', '<｜｜DSML｜｜ invoke name="write">unfinished'])('识别竖线及截断变体 %#', text => {
    expect(hasLeakedProtocol(text)).toBe(true)
    expect(detectStalledTurn(assistant(text))).toBe('leaked-tool-markup')
    expect(stripProtocol('正常文字\n'+text)).toBe('正常文字\n')
  })
  test('截断和错误toolUse终态不能冒充成功', () => {
    for (const reason of ['stop','length','toolUse']) {
      expect(detectStalledTurn(assistant(raw,reason))).toBe('leaked-tool-markup')
      expect(convertResultMessage([assistant(raw,reason)],'test')).toMatchObject({subtype:'error_during_execution',terminal_reason:'error'})
    }
  })
  test('用户取消和网络错误不触发协议纠正', () => {
    for (const reason of ['aborted','error']) expect(detectStalledTurn(assistant(raw,reason))).toBeUndefined()
  })
  test('代码块与行内示例不误判', () => {
    for (const text of ['示例：\n```xml\n'+raw+'\n```', '`<｜｜DSML｜｜ calls>` 是协议标记', '~~~xml\n'+raw+'\n~~~']) {
      expect(hasLeakedProtocol(text)).toBe(false)
      expect(visibleProtocolText(text)).toBe(text)
      expect(convertResultMessage([assistant(text)],'s')).toMatchObject({subtype:'success'})
    }
  })
  test('代码示例后真正泄漏仍会检测', () => {
    expect(hasLeakedProtocol('```xml\n'+raw+'\n```\n'+raw)).toBe(true)
  })
  test('全部分块边界均不能泄漏参数和路径', () => {
    const text='我先检查。\n'+raw
    for(let i=0;i<=text.length;i++) {
      const filter=new ProtocolTextStream()
      const visible=filter.push(text.slice(0,i))+filter.push(text.slice(i))
      expect(visible).toBe('我先检查。\n')
      expect(filter.finish()).toBe('我先检查。\n\n'+PROTOCOL_NOTICE)
    }
    const filter=new ProtocolTextStream()
    expect([...text].map(c=>filter.push(c)).join('')).toBe('我先检查。\n')
  })
  test('普通比较符和HTML不丢文字', () => {
    const text='a < b；<div>普通内容</div>'
    const filter=new ProtocolTextStream()
    const streamed=[...text].map(c=>filter.push(c)).join('')
    expect(streamed).toBe(text)
    expect(filter.finish()).toBe(text)
  })
  test('最终显示异常而非把脚本或路径变成可点击链接', () => {
    const m=convertPiMessage(assistant('检查中。\n'+raw),'s') as any
    expect(m.message.content).toEqual([{type:'text',text:'检查中。\n\n'+PROTOCOL_NOTICE}])
    expect(JSON.stringify(m)).not.toContain('ui-theme.css')
    expect(m.message.content.some((b:any)=>b.type==='tool_use')).toBe(false)
  })
  test('有结构化调用不触发重放，真实调用保持不变', () => {
    const m={role:'assistant',stopReason:'toolUse',content:[{type:'text',text:raw},{type:'toolCall',id:'once',name:'read',arguments:{path:'x'}}]} as never
    expect(detectStalledTurn(m)).toBeUndefined()
    expect((convertPiMessage(m,'s') as any).message.content.at(-1)).toMatchObject({type:'tool_use',id:'once',name:'Read'})
  })
  test('内部纠正不当成新用户消息', () => {
    const nudge=buildStallNudge('leaked-tool-markup')
    expect(isInternalStallNudge(nudge)).toBe(true)
    expect(isInternalStallNudge('继续')).toBe(false)
    expect(nudge).toContain('不得重复已经成功的操作')
    expect(convertPiMessage({role:'user',content:nudge} as never,'s')).toBeNull()
  })
  test('实际接入保留一次恢复上限、预算和用户中断优先', () => {
    const src=readFileSync(new URL('./pi-agent-adapter.ts',import.meta.url),'utf8').replace(/\r\n/g,'\n')
    expect(src).toContain('totalStallNudges < 1')
    expect(src).toContain('!responseBudget.summarizing')
    expect(src).toContain('if (!isInternalStallNudge(prompt))')
    expect(src).toContain('const safe = filter.push(delta.delta)')
    expect(src).toContain('if (pendingInterrupt) {\n              pendingStallNudge = undefined')
  })
})

test('实际Agent内核：协议泄漏后一次纠正，正式工具仅执行一次', async () => {
  const { Agent } = await import('@earendil-works/pi-agent-core')
  const { createAssistantMessageEventStream } = await import('@earendil-works/pi-ai')
  const { Type } = await import('typebox')
  const { ResponseBudget, installResponseBudget } = await import('./response-budget')
  let requests=0, executed=0
  const tool={name:'probe',label:'probe',description:'offline',parameters:Type.Object({}),execute:async()=>{executed++;return {content:[{type:'text' as const,text:'checked'}],details:{}}}}
  const agent=new Agent({initialState:{systemPrompt:'test',tools:[tool],model:{api:'openai-completions',provider:'test',id:'test'} as never},streamFn:()=>{
    requests++
    const out=createAssistantMessageEventStream()
    const message={role:'assistant' as const,content:requests===1?[{type:'text' as const,text:raw}]:requests===2?[{type:'toolCall' as const,id:'only-once',name:'probe',arguments:{}}]:[{type:'text' as const,text:'检查完成。'}],api:'openai-completions',provider:'test',model:'test',usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},stopReason:requests===2?'toolUse' as const:'stop' as const,timestamp:Date.now()}
    queueMicrotask(()=>{out.push({type:'start',partial:message});out.push({type:'done',reason:message.stopReason,message});out.end(message)})
    return out
  }})
  const budget=new ResponseBudget(8,16)
  installResponseBudget({agent} as never,budget)
  await agent.prompt('只读检查')
  expect(executed).toBe(0)
  expect(detectStalledTurn(agent.state.messages.at(-1))).toBe('leaked-tool-markup')
  await agent.prompt(buildStallNudge('leaked-tool-markup'))
  expect(requests).toBe(3)
  expect(executed).toBe(1)
  expect(budget.turns).toBe(3)
  expect(convertResultMessage(agent.state.messages,'s')).toMatchObject({subtype:'success'})
})
