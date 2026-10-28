import { getWorkflowDataRoot } from './data-root'
import { ipcMain } from 'electron'
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { workflowExecutor } from './index'
import { lightNodeTypes } from './light-nodes'
import { WorkflowStore } from './storage/workflow-store'
import type { Workflow } from './engine/executor'
import { writeJsonFileAtomic } from '../safe-file'
import { FREE_AUTOMATION_LIMIT, hasProFeature } from '../roy-account'

export function setupWorkflowIPC() {
  const projectDir = getWorkflowDataRoot()
  const store = new WorkflowStore(projectDir)
  const directory = join(projectDir, 'workflow-runs'); mkdirSync(directory,{ recursive:true })
  const recordFile = join(directory,'history.json')
  let history: any[] = []
  try { const data = JSON.parse(readFileSync(recordFile,'utf8')); if (Array.isArray(data)) history = data.slice(0,100).map(r => r.status === 'running' ? { ...r, status:'interrupted', error:'应用退出导致运行中断，不自动重试副作用' } : r) } catch {}
  const persist = () => writeJsonFileAtomic(recordFile,history)
  persist()
  for (const name of ['run:start','node:start','node:complete','node:skip','node:error','run:complete']) {
    workflowExecutor.on(name, (data: any) => {
      if (name === 'run:start') history.unshift({ runId:data.runId,workflowId:data.workflowId,status:'running',startedAt:data.startedAt,steps:[] })
      history = history.slice(0,100)
      const run = history.find(r=>r.runId===data.runId)
      if (!run) return
      if (name === 'run:complete') { Object.assign(run,{ status:data.status,endedAt:data.endedAt,error:data.error }) }
      else if (data.nodeId) {
        let step = run.steps.find((s:any)=>s.nodeId===data.nodeId)
        if (!step) { step={nodeId:data.nodeId};run.steps.push(step) }
        Object.assign(step,{status:name.split(':')[1],error:data.error,file:data.output?.file,sessionId:data.output?.sessionId,warning:data.output?.warning,info:data.output?.filterInfo})
      }
      persist()
    })
  }
  ipcMain.handle('workflow:get-workflows',()=>store.getAll())
  ipcMain.handle('workflow:get-workflow',(_event,id:string)=>store.getById(id))
  ipcMain.handle('workflow:save-workflow',(_event,w:Workflow)=>{
    workflowExecutor.validate(w)
    const isNew = !store.getById(w.id)
    if (isNew && !hasProFeature('unlimited-automation') && store.getAll().length >= FREE_AUTOMATION_LIMIT) {
      throw new Error(`免费版最多 ${FREE_AUTOMATION_LIMIT} 个工作流，激活 Pro 后不限数量（设置 → 账号 → 软件激活）`)
    }
    store.save(w);return {success:true}
  })
  ipcMain.handle('workflow:delete-workflow',(_event,id:string)=>({success:store.delete(id)}))
  ipcMain.handle('workflow:stop-workflow',(_event,id:string)=>{workflowExecutor.cancel(id);return true})
  ipcMain.handle('workflow:history',(_event,id?:string)=>history.filter(r=>!id || r.workflowId===id))
  ipcMain.handle('workflow:get-node-types',()=>lightNodeTypes)
  ipcMain.handle('workflow:execute-workflow',async(event,id:string,inputs:Record<string,any>)=>{
    const w=store.getById(id);if(!w)throw new Error('工作流不存在')
    const listeners = ['node:start','node:complete','node:error'].map(name=>{
      const fn=(data:any)=>{if(data.workflowId===id && !event.sender.isDestroyed())event.sender.send('workflow:'+name.replace(':','-'),data)}
      workflowExecutor.on(name,fn);return {name,fn}
    })
    try {const results=await workflowExecutor.execute(w,inputs);return {success:true,results:Object.fromEntries(results)}}
    catch(error){return {success:false,error:error instanceof Error ? error.message : String(error)}}
    finally{for(const {name,fn} of listeners)workflowExecutor.off(name,fn)}
  })
}
