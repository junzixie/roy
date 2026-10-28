/**
 * 工作流
 *
 * 两种形态：
 * - 列表：已保存的工作流卡片，可以运行、编辑、复制、删除；
 * - 画布：新建或编辑单个工作流，所有读写都走主进程的 workflow IPC。
 *
 * 进页先看列表，点卡片或「新建工作流」才进画布。
 */

import React from 'react'
import { ArrowLeft, CalendarClock, Copy, Loader2, Pencil, Play, Plus, Trash2, Workflow as WorkflowIcon } from 'lucide-react'
import { toast } from 'sonner'
import { useSetAtom } from 'jotai'
import { activeViewAtom } from '@/atoms/active-view'
import { automationFormAtom } from '@/atoms/automation-atoms'
import { FlowCanvas } from '../components/workflow/Canvas/FlowCanvas'
import { cn } from '@/lib/utils'

interface WorkflowSummary {
  id: string
  name: string
  description?: string
  updatedAt?: number
  nodes?: Array<{ id: string; type: string }>
  edges?: Array<{ id: string }>
  variables?: Record<string, unknown>
}

interface CardStat {
  nodeCount: number
  edgeCount: number
  nodeTypes: string[]
}

const NODE_TYPE_LABELS: Record<string, string> = {
  rss: 'RSS', transform: '数据整理', file: '成品',
  llm: 'Agent / Skill',
  http: 'HTTP',
  code: '代码',
  notification: '通知',
  condition: '条件',
  variable: '变量',
  schedule: '定时'
}

function statOf(workflow: WorkflowSummary): CardStat {
  const nodes = workflow.nodes ?? []
  const types: string[] = []
  for (const node of nodes) {
    const label = NODE_TYPE_LABELS[node.type] ?? node.type
    if (!types.includes(label)) types.push(label)
  }
  return {
    nodeCount: nodes.length,
    edgeCount: workflow.edges?.length ?? 0,
    nodeTypes: types
  }
}

function formatUpdatedAt(value?: number): string {
  if (!value) return '尚未保存'
  const diff = Date.now() - value
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  if (diff < 2_592_000_000) return `${Math.floor(diff / 86_400_000)} 天前`
  return new Date(value).toLocaleDateString()
}

type PageView = { kind: 'list' } | { kind: 'canvas'; workflowId: string | null }

export function WorkflowPage(): React.ReactElement {
  const [workflows, setWorkflows] = React.useState<WorkflowSummary[]>([])
  const [history, setHistory] = React.useState<any[] | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [view, setView] = React.useState<PageView>({ kind: 'list' })
  const setActiveView = useSetAtom(activeViewAtom)
  const setAutomationForm = useSetAtom(automationFormAtom)

  const loadWorkflows = React.useCallback(() => {
    setLoading(true)
    window.electronAPI
      .workflowList()
      .then((list) => setWorkflows((list ?? []) as WorkflowSummary[]))
      .catch((error: unknown) => {
        console.error('[工作流] 读取列表失败:', error)
        toast.error('读取工作流失败')
      })
      .finally(() => setLoading(false))
  }, [])

  React.useEffect(() => {
    loadWorkflows()
  }, [loadWorkflows])

  const handleSave = React.useCallback(async (workflow: unknown) => {
    try {
      await window.electronAPI.workflowSave(workflow)
      loadWorkflows()
    } catch (error) {
      console.error('[工作流] 保存失败:', error)
      toast.error('保存工作流失败')
      throw error
    }
  }, [loadWorkflows])

  const handleRun = React.useCallback(async (workflow: WorkflowSummary) => {
    if (busyId) return
    setBusyId(workflow.id)
    try {
      const result = await window.electronAPI.workflowExecute(workflow.id, {}) as {
        success?: boolean
        error?: string
      }
      if (result?.success) toast.success(`「${workflow.name}」执行成功`)
      else toast.error(`「${workflow.name}」执行失败：${result?.error ?? '未知错误'}`)
      loadWorkflows()
    } catch (error) {
      console.error('[工作流] 执行失败:', error)
      toast.error(`执行失败：${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setBusyId(null)
    }
  }, [busyId, loadWorkflows])

  const handleDuplicate = React.useCallback(async (workflow: WorkflowSummary) => {
    try {
      const source = await window.electronAPI.workflowGet(workflow.id)
      if (!source) {
        toast.error('原工作流已不存在')
        loadWorkflows()
        return
      }
      const copy = {
        ...(source as Record<string, unknown>),
        id: `wf-${Date.now()}`,
        name: `${workflow.name} 副本`,
        updatedAt: undefined
      }
      await window.electronAPI.workflowSave(copy)
      toast.success('已创建副本')
      loadWorkflows()
    } catch (error) {
      console.error('[工作流] 复制失败:', error)
      toast.error('复制工作流失败')
    }
  }, [loadWorkflows])

  const handleDelete = React.useCallback(async (workflow: WorkflowSummary) => {
    if (!window.confirm(`删除工作流「${workflow.name}」？`)) return
    try {
      await window.electronAPI.workflowDelete(workflow.id)
      toast.success(`已删除「${workflow.name}」`)
      loadWorkflows()
    } catch (error) {
      console.error('[工作流] 删除失败:', error)
      toast.error('删除工作流失败')
    }
  }, [loadWorkflows])

  /**
   * 定时运行：定时任务和工作流是两套执行器，所以不直接在这里调度，
   * 而是带一个只含 workflowId 的草稿跳到定时任务表单，由那边决定频率与开关。
   */
  const handleSchedule = React.useCallback((workflow: WorkflowSummary) => {
    setAutomationForm({
      open: true,
      draft: {
        name: workflow.name,
        prompt: '',
        scheduleType: 'daily',
        intervalMinutes: 60,
        timeOfDay: '08:00',
        channelId: '',
        permissionMode: 'bypassPermissions', // 仅兼容旧表单；工作流 Agent 固定 plan 权限
        sessionMode: 'daily',
        active: false,
        workflowId: workflow.id,
      },
    })
    setActiveView('planning')
  }, [setAutomationForm, setActiveView])

  const createNewsTemplate = async () => {
    const id = `news-${Date.now()}`
    const specs = [
      ['news','rss','读取 AI 新闻',{ url:'', hours:'24', limit:'30' }],
      ['clean','transform','新闻去重',{ items:'{{nodes.news.items}}',key:'link',limit:'10',remember:'true' }],
      ['gate','condition','有新闻才继续',{ value:'{{nodes.clean.items}}',operator:'notEmpty' }],
      ['draft','llm','Skill 整理日报',{ items:'{{nodes.clean.items}}',prompt:'根据新闻材料生成中文 AI 日报。每条保留标题、时间、原文链接和简短摘要；区分事实和观点，不编造。输出 Markdown 正文。',skill:'' }],
      ['save','file','保存日报',{ filename:'AI日报.md',content:'{{nodes.draft.response}}' }],
      ['notice','notification','通知查看',{ title:'AI 日报已生成',body:'{{nodes.save.file}}' }],
    ] as const
    const workflow = { id,name:'每日 AI 新闻日报',description:'填写 RSS 地址，可选择 Skill，先手动验证再开启定时。',variables:{},nodes:specs.map(([id,type,name,inputs],i)=>({id,type,data:{name,inputs,outputs:{}},position:{x:100+(i%3)*240,y:i<3?80:240}})),edges:specs.slice(1).map((row,i)=>({id:`e${i}`,source:specs[i]![0],target:row[0]})) }
    try { await window.electronAPI.workflowSave(workflow); loadWorkflows();setView({kind:'canvas',workflowId:id});toast.success('模板已创建，请先填写 RSS 地址') } catch(error) {toast.error(String(error))}
  }

  if (view.kind === 'canvas') {
    return (
      <div className="flex h-full min-h-0 flex-col bg-content-area">
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
          <button
            type="button"
            onClick={() => setView({ kind: 'list' })}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12.5px] text-foreground/65 hover:bg-foreground/[0.06] hover:text-foreground"
          >
            <ArrowLeft size={14} />
            返回列表
          </button>
          <span className="text-[12.5px] text-foreground/40">
            {view.workflowId ? '编辑工作流' : '新建工作流'}
          </span>
        </div>
        <div className="min-h-0 flex-1">
          <FlowCanvas
            key={view.workflowId ?? 'new'}
            workflowId={view.workflowId ?? undefined}
            onSave={handleSave}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-content-area">
      <div className="mx-auto w-full max-w-[920px] px-8 pb-16 pt-8">
        <div className="mb-1 flex items-center gap-3">
          <WorkflowIcon size={20} className="text-foreground/50" />
          <h1 className="flex-1 text-[20px] font-medium text-foreground">工作流</h1>
          <button
            type="button"
            onClick={() => setView({ kind: 'canvas', workflowId: null })}
            className="flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-1.5 text-[13px] text-background hover:opacity-90"
          >
            <Plus size={15} />
            新建工作流
          </button>
        </div>
        <p className="mb-6 text-[13px] leading-6 text-foreground/50">
          Roy 内置轻量工作流 · pi + Skill。首次运行请先填写参数。定时任务仅在 Roy 运行且电脑在线时执行，不自动补跑副作用。
        </p>

        <div className="mb-4 flex flex-wrap gap-2">
          <button className="rounded border border-border px-3 py-2 text-sm" onClick={() => void createNewsTemplate()}>从 AI 新闻日报模板开始</button>
          <button className="rounded border border-border px-3 py-2 text-sm" onClick={() => { void window.electronAPI.workflowHistory().then(setHistory).catch(e=>toast.error(String(e))) }}>刷新运行记录</button>
          {busyId && <button className="rounded border border-red-500 px-3 py-2 text-sm" onClick={() => void window.electronAPI.workflowStop(busyId)}>停止当前工作流</button>}
        </div>
        {history && <div className="mb-5 max-h-80 overflow-auto rounded border border-border p-3 text-xs">
          <div className="mb-2">最近运行（最多保留 100 次；点击刷新查看最新状态）</div>
          {!history.length && <p>暂无记录</p>}
          {history.map(run=><details key={run.runId} className="mb-2 border-b border-border py-2"><summary>{workflows.find(w=>w.id===run.workflowId)?.name || run.workflowId} · {({running:'运行中',success:'成功',error:'失败',stopped:'已停止',interrupted:'已中断'} as Record<string,string>)[run.status] || run.status} · {new Date(run.startedAt).toLocaleString()}</summary><p>{run.error}</p>{run.steps?.map((step:any)=><p className="break-all" key={step.nodeId}>{step.nodeId}：{({start:'运行中',complete:'完成',error:'失败',skip:'跳过'} as Record<string,string>)[step.status] || step.status} {step.error || step.warning || step.file || step.info || ''}</p>)}{run.status==='running' && <button onClick={()=>void window.electronAPI.workflowStop(run.workflowId)}>停止此运行</button>}</details>)}
        </div>}
        {loading ? (
          <div className="flex items-center gap-2 py-10 text-[12.5px] text-foreground/45">
            <Loader2 size={13} className="animate-spin" /> 正在读取…
          </div>
        ) : workflows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border px-6 py-10 text-center">
            <div className="mb-1.5 text-[14px] font-medium text-foreground/75">还没有工作流</div>
            <div className="text-[12.5px] leading-6 text-foreground/45">
              点右上角「新建工作流」画一个：
              <br />
              从左侧节点库拖入 LLM、HTTP、通知等节点，连线后保存即可运行。
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {workflows.map((workflow) => {
              const stat = statOf(workflow)
              const running = busyId === workflow.id

              return (
                <div
                  key={workflow.id}
                  className="group flex h-full flex-col rounded-xl border border-border bg-content-area p-4 transition-shadow hover:shadow-md"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[14.5px] font-medium text-foreground">
                        {workflow.name || workflow.id}
                      </span>
                      {running && <Loader2 size={13} className="shrink-0 animate-spin text-foreground/50" />}
                    </div>
                    <div className="mt-0.5 text-[12.5px] leading-5 text-foreground/45">
                      {stat.nodeCount} 个节点 · {stat.edgeCount} 条连线 · {formatUpdatedAt(workflow.updatedAt)}
                    </div>
                  </div>

                  {stat.nodeTypes.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5 text-[11.5px] text-foreground/50">
                      {stat.nodeTypes.map((label) => (
                        <span key={label} className="rounded-md border border-border px-1.5 py-0.5">
                          {label}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex-1" />

                  <div className="mt-4 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => void handleRun(workflow)}
                      disabled={running}
                      className="flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-1.5 text-[13px] text-background hover:opacity-90 disabled:opacity-50"
                    >
                      <Play size={13} fill="currentColor" />
                      运行
                    </button>
                    <button
                      type="button"
                      onClick={() => setView({ kind: 'canvas', workflowId: workflow.id })}
                      className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] text-foreground/65 hover:bg-foreground/[0.06] hover:text-foreground"
                    >
                      <Pencil size={13} />
                      编辑
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSchedule(workflow)}
                      title="按设定频率自动运行这个工作流"
                      className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] text-foreground/65 hover:bg-foreground/[0.06] hover:text-foreground"
                    >
                      <CalendarClock size={13} />
                      定时运行
                    </button>
                    <div className="flex-1" />
                    <button
                      type="button"
                      title="复制"
                      onClick={() => void handleDuplicate(workflow)}
                      className="grid size-8 place-items-center rounded-lg text-foreground/40 hover:bg-foreground/[0.06] hover:text-foreground"
                    >
                      <Copy size={14} />
                    </button>
                    <button
                      type="button"
                      title="删除"
                      onClick={() => void handleDelete(workflow)}
                      className={cn(
                        'grid size-8 place-items-center rounded-lg text-foreground/40',
                        'hover:bg-foreground/[0.06] hover:text-red-500',
                      )}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
