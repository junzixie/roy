import { test, expect } from 'bun:test'
import { WorkflowExecutor, resolveWorkflowValue, type Workflow } from '../engine/executor'
import { parseFeed, executeLightNode } from '../light-nodes'
const node=(id:string,type='mock',inputs:any={})=>({id,type,data:{name:id,inputs,outputs:{}},position:{x:0,y:0}})
const flow=(nodes:any[],edges:any[]=[]):Workflow=>({id:'test',name:'test',nodes,edges,variables:{}})
test('structured reference preserves objects and rejects missing/prototype keys',()=>{
 expect(resolveWorkflowValue('{{x}}',{x:[1,2]})).toEqual([1,2])
 expect(()=>resolveWorkflowValue('{{missing}}',{})).toThrow()
 expect(()=>resolveWorkflowValue('{{x.__proto__}}',{x:{}})).toThrow()
})
test('validates cycle, duplicate IDs and missing edges',()=>{
 const e=new WorkflowExecutor();e.registerNode('mock',{execute:async()=>({})})
 expect(()=>e.validate(flow([]))).toThrow()
 expect(()=>e.validate(flow([node('a'),node('a')]))).toThrow()
 expect(()=>e.validate(flow([node('a')],[{id:'e',source:'x',target:'a'}]))).toThrow()
 expect(()=>e.validate(flow([node('a')],[{id:'e',source:'a',target:'a'}]))).toThrow()
})
test('passes structured results without overriding explicit downstream prompt',async()=>{
 const e=new WorkflowExecutor();e.registerNode('mock',{execute:async inputs=>inputs})
 const result=await e.execute(flow([node('a','mock',{items:[1,2],prompt:'old'}),node('b','mock',{items:'{{nodes.a.items}}',prompt:'new'})],[{id:'ab',source:'a',target:'b'}]))
 expect(result.get('b')).toEqual({items:[1,2],prompt:'new'})
})
test('condition false skips ordinary downstream edges',async()=>{
 const e=new WorkflowExecutor();e.registerNode('condition',{execute:async()=>({result:false})});e.registerNode('mock',{execute:async()=>{throw Error('must not run')}})
 const result=await e.execute(flow([node('a','condition'),node('b')],[{id:'ab',source:'a',target:'b'}]))
 expect(result.has('b')).toBe(false)
})
test('duplicate execution blocked, cancellation clears active state',async()=>{
 const e=new WorkflowExecutor();e.registerNode('mock',{execute:async()=>new Promise(()=>{})})
 const f=flow([node('a')]);const pending=e.execute(f)
 await expect(e.execute(f)).rejects.toThrow('正在运行')
 e.cancel(f.id);await expect(pending).rejects.toThrow()
 e.registerNode('mock',{execute:async()=>({ok:true})});expect((await e.execute(f)).get('a').ok).toBe(true)
})
test('node timeout terminates run',async()=>{
 const e=new WorkflowExecutor();e.registerNode('mock',{execute:async()=>new Promise(()=>{})})
 await expect(e.execute(flow([node('a','mock',{timeoutMs:1000})]))).rejects.toThrow('超时')
})
test('RSS deduplicates links and rejects entity documents',()=>{
 const item='<item><title>新闻</title><link>https://news.invalid/one</link></item>'
 expect(parseFeed('<rss><channel>'+item+item+'</channel></rss>',0)).toHaveLength(1)
 expect(()=>parseFeed('<!DOCTYPE rss><rss/>')).toThrow()
 expect(()=>parseFeed('<html/>')).toThrow()
})
test('condition uses rules, never evals legacy input',async()=>{
 expect((await executeLightNode('condition',{value:[1],operator:'notEmpty'})).result).toBe(true)
 await expect(executeLightNode('condition',{condition:'process.exit()'})).rejects.toThrow()
})
test('file node rejects traversal before touching disk',async()=>{
 await expect(executeLightNode('file',{filename:'../bad.md',content:'x'})).rejects.toThrow()
})

test('global limit queues a third workflow and queued cancellation releases cleanly',async()=>{
 const e=new WorkflowExecutor(); let running=0, peak=0
 e.registerNode('mock',{execute:async()=>{running++;peak=Math.max(peak,running);await new Promise(r=>setTimeout(r,40));running--;return {ok:true}}})
 const f=(id:string)=>({...flow([node('a')]),id})
 const a=e.execute(f('a')),b=e.execute(f('b')),c=e.execute(f('c'))
 e.cancel('c');await expect(c).rejects.toThrow()
 await Promise.all([a,b]);await e.execute(f('d'));expect(peak).toBe(2)
})
test('Atom chooses alternate article and resolves relative links',()=>{
 const xml='<feed><entry><title>news</title><link rel="self" href="https://example.org/feed"/><link rel="alternate" href="/article"/></entry></feed>'
 expect(parseFeed(xml,0,20,'https://example.org/feed')[0]?.link).toBe('https://example.org/article')
 expect(parseFeed(xml,24,20,'https://example.org/feed',false)).toHaveLength(0)
 expect(parseFeed(xml,24,20,'https://example.org/feed',true)).toHaveLength(1)
})
test('dedup distinguishes local duplicates from limit and history',async()=>{
 const result=await executeLightNode('transform',{items:[{link:'a'},{link:'a'},{link:'b'}],limit:1})
 expect(result.skippedBefore).toBe(0);expect(result.skippedDuplicate).toBe(1);expect(result.skippedLimit).toBe(1)
})
test('noncritical notification warning still settles successful outputs',async()=>{
 let committed=false;const e=new WorkflowExecutor(async(_,success)=>{committed=success})
 e.registerNode('mock',{execute:async()=>({warning:'notification unavailable'})})
 await e.execute(flow([node('a')]));expect(committed).toBe(true)
})
