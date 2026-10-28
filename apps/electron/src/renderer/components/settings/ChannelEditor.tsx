/**
 * ChannelEditor - 供应商编辑面板（照 Arthur 的 settings/Models.tsx Editor 复刻）
 *
 * 在列表里原地展开：名字 → 接口类型（三选一 + 自动检测）→ 发送思考强度 → 系统代理
 * → Base URL（实际请求预览、补 /v1）→ API Key → 用哪些模型（显示名 / 实际模型 / 1M /
 * 窗口大小 / 思考等级）→ 手动添加 → 从接口拉取列表。
 *
 * 数据仍是 Roy 的 Channel / ChannelModel，已有配置不会丢；订阅登录类渠道不走这里。
 */

import * as React from 'react'
import { Check, Eye, EyeOff, Loader2, PlugZap, RefreshCw, Trash2, Wand2, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  CHANNEL_API_HINTS,
  CHANNEL_API_LABELS,
  CHANNEL_API_PATHS,
  PROVIDER_DEFAULT_URLS,
  PROVIDER_LABELS,
  inferChannelApi,
  defaultNewChannelSetup,
} from '@roy/shared'
import type { Channel, ChannelApi, ChannelModel, ProviderType } from '@roy/shared'
import {
  resolveAnthropicMessagesUrl,
  resolveOpenAIChatCompletionsUrl,
  resolveOpenAIResponsesUrl,
} from '@roy/core'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

/** 编辑中的草稿（apiKey 为明文） */
export interface ChannelDraft {
  /** 已保存渠道的 id；新建时为空 */
  id?: string
  name: string
  provider: ProviderType
  baseUrl: string
  apiKey: string
  api?: ChannelApi
  reasoning: boolean
  proxy: boolean
  enabled: boolean
  models: ChannelModel[]
}

export function draftFromChannel(channel: Channel): ChannelDraft {
  return {
    id: channel.id,
    name: channel.name,
    provider: channel.provider,
    baseUrl: channel.baseUrl,
    apiKey: '',
    api: channel.api,
    reasoning: channel.reasoning !== false,
    proxy: channel.proxy !== false,
    enabled: channel.enabled,
    models: channel.models.map((model) => ({ ...model })),
  }
}

export function draftForProvider(provider: ProviderType, presetModels: ChannelModel[] = []): ChannelDraft {
  const setup = providerHasApiChoice(provider)
    ? defaultNewChannelSetup(provider, PROVIDER_DEFAULT_URLS[provider])
    : undefined
  return {
    name: PROVIDER_LABELS[provider].replace(/[（(].*[)）]/, '').trim() || PROVIDER_LABELS[provider],
    provider,
    baseUrl: setup?.baseUrl ?? PROVIDER_DEFAULT_URLS[provider],
    apiKey: '',
    // 除 Claude 外默认 Chat Completions；用户仍可在表单里改
    api: setup?.api,
    reasoning: true,
    proxy: false,
    enabled: true,
    models: presetModels.map((model) => ({ ...model })),
  }
}

/** Google 走自己的原生协议，三种接口格式对它不适用 */
export function providerHasApiChoice(provider: ProviderType): boolean {
  return provider !== 'google'
}

const isCustomProvider = (provider: ProviderType): boolean => provider === 'custom' || provider === 'anthropic-compatible'

/** 和 Arthur 一样的三段说明（Roy 的协议名对应 Arthur 的三种） */
const API_ORDER: ChannelApi[] = ['chat-completions', 'responses', 'anthropic-messages']

/** 每个模型可单独指定的思考等级；空 = 自动（跟随输入框） */
const THINK_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '自动' },
  { value: 'off', label: '关闭' },
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
  { value: 'xhigh', label: '极高' },
  { value: 'max', label: '最高' },
]

/** 供应商提示（取自 Arthur 的 PROVIDER_TYPES.hint） */
export const PROVIDER_HINTS: Partial<Record<ProviderType, string>> = {
  'doubao-api': '模型 ID 可以填方舟控制台里的模型名或推理接入点 ID（ep-…）',
  zhipu: '识图推荐 glm-4v-flash（免费）。Key 去 open.bigmodel.cn 注册后在「API Keys」里创建，形如 xxxx.yyyy',
  custom: '中转站一般选 Chat Completions；确认支持 /responses 再换成 Responses。拿不准就填好 Key 后点「自动检测」',
  'anthropic-compatible': '填中转站给的地址，再点「自动检测」，会自动换成能用的接口格式',
  'opencode-go-openai': 'Key 在 opencode.ai 的 Console 里申请',
}

/** 实际请求地址预览：与运行时 normalizePiBaseUrl 的拼接规则一致 */
function previewEndpoint(baseUrl: string, provider: ProviderType, api: ChannelApi | undefined): string {
  const trimmed = baseUrl.trim()
  if (!trimmed) return ''
  try {
    if (provider === 'google') return `${trimmed.replace(/\/+$/, '')}/v1beta/models/{model}:generateContent`
    const effective = api ?? inferChannelApi(provider)
    if (effective === 'anthropic-messages') return resolveAnthropicMessagesUrl(trimmed, provider)
    if (effective === 'responses') return resolveOpenAIResponsesUrl(trimmed, provider)
    return resolveOpenAIChatCompletionsUrl(trimmed, provider)
  } catch {
    return ''
  }
}

/**
 * 自定义中转站：接口格式和 Roy 的 provider 绑定在一起
 * （anthropic-compatible 要填完整 /v1/messages 地址，custom 填 /v1 根地址）。
 * 换接口格式时把 provider 和地址一起换过去，用户不用懂这层区别。
 */
function adaptCustom(draft: ChannelDraft, api: ChannelApi, rootHint?: string): Pick<ChannelDraft, 'provider' | 'baseUrl' | 'api'> {
  if (!isCustomProvider(draft.provider)) return { provider: draft.provider, baseUrl: rootHint ?? draft.baseUrl, api }
  const raw = (rootHint ?? draft.baseUrl).trim().replace(/\/+$/, '')
  const root = raw
    .replace(/\/v1\/messages$/, '')
    .replace(/\/messages$/, '')
    .replace(/\/chat\/completions$/, '')
    .replace(/\/responses$/, '')
    .replace(/\/v1$/, '')
  if (api === 'anthropic-messages') {
    return { provider: 'anthropic-compatible', baseUrl: root ? `${root}/v1/messages` : '', api }
  }
  const v1 = /\/v\d[\w.-]*$/.test(root) ? root : root ? `${root}/v1` : ''
  return { provider: 'custom', baseUrl: v1, api }
}

const fieldClass = 'h-8 w-full rounded-md border border-border bg-background px-2.5 text-[13px] outline-none transition-colors focus:border-primary'
const btnClass = 'inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2.5 text-[12px] text-foreground/80 transition-colors hover:bg-muted disabled:opacity-45'
const btnPrimaryClass = 'inline-flex h-7 items-center gap-1 rounded-md bg-primary px-3 text-[12px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-45'

function Label({ children }: { children: React.ReactNode }): React.ReactElement {
  return <div className="mb-1 text-[12.5px] font-medium text-foreground/80">{children}</div>
}

interface ChannelEditorProps {
  draft: ChannelDraft
  /** 保存（新建或更新），返回落库后的渠道 */
  onSave: (draft: ChannelDraft) => Promise<Channel | null>
  /** 已保存渠道：表格里的改动（显示名 / 1M / 思考等级）改完自动存 */
  onAutoSaveModels?: (models: ChannelModel[]) => void
  onCancel: () => void
  onDelete?: () => void
}

export function ChannelEditor({ draft: initial, onSave, onAutoSaveModels, onCancel, onDelete }: ChannelEditorProps): React.ReactElement {
  const [d, setD] = React.useState<ChannelDraft>(initial)
  const [keyLoaded, setKeyLoaded] = React.useState(!initial.id)
  const [showKey, setShowKey] = React.useState(false)
  const [remote, setRemote] = React.useState<ChannelModel[] | null>(null)
  const [fetching, setFetching] = React.useState(false)
  const [manual, setManual] = React.useState('')
  const [filter, setFilter] = React.useState('')
  const [detecting, setDetecting] = React.useState(false)
  const [det, setDet] = React.useState<Awaited<ReturnType<typeof window.electronAPI.detectChannelApi>> | null>(null)
  const [saving, setSaving] = React.useState(false)
  /** 每个模型的测试结果 */
  const [tests, setTests] = React.useState<Record<string, TestState>>({})
  const saveTimer = React.useRef<number | null>(null)

  // 已保存渠道：解密出明文 Key 放进输入框（和 Arthur 一样能直接看到、改）
  React.useEffect(() => {
    if (!initial.id) return
    let cancelled = false
    window.electronAPI.decryptApiKey(initial.id)
      .then((key) => { if (!cancelled) setD((x) => ({ ...x, apiKey: key })) })
      .catch(() => { /* 解密失败就留空，用户可重新填 */ })
      .finally(() => { if (!cancelled) setKeyLoaded(true) })
    return () => { cancelled = true }
  }, [initial.id])

  React.useEffect(() => () => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
  }, [])

  const hasApiChoice = providerHasApiChoice(d.provider)
  const api = d.api ?? inferChannelApi(d.provider)
  const endpoint = previewEndpoint(d.baseUrl, d.provider, hasApiChoice ? api : undefined)
  const enabledModels = d.models.filter((model) => model.enabled)
  const hint = PROVIDER_HINTS[d.provider]
  const needsV1 = hasApiChoice
    && api !== 'anthropic-messages'
    && (d.provider === 'custom' || d.provider === 'openai' || d.provider === 'openai-responses')
    && d.baseUrl.trim() !== ''
    && !/\/v\d[\w.-]*\/?$/.test(d.baseUrl.trim())
    && !/\/(chat\/completions|responses)\/?$/.test(d.baseUrl.trim())

  /** 改模型列表：已保存的渠道 600ms 后自动存 */
  const patchModels = (models: ChannelModel[]): void => {
    setD((x) => ({ ...x, models }))
    if (!d.id || !onAutoSaveModels) return
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => onAutoSaveModels(models), 600)
  }

  const setModelMeta = (id: string, patch: Partial<ChannelModel>): void => {
    patchModels(d.models.map((model) => (model.id === id ? { ...model, ...patch } : model)))
  }

  /** 勾选 / 取消一个模型：已有的切 enabled，没有的加进来 */
  const toggleModel = (model: ChannelModel): void => {
    const existing = d.models.find((item) => item.id === model.id)
    if (existing) {
      patchModels(d.models.map((item) => (item.id === model.id ? { ...item, enabled: !item.enabled } : item)))
    } else {
      patchModels([...d.models, { ...model, enabled: true, source: model.source ?? 'fetched' }])
    }
  }

  /** 表格里的「移除」：手动加的直接删，拉取来的只是关掉（下次拉取还在） */
  const removeModel = (id: string): void => {
    const target = d.models.find((model) => model.id === id)
    if (!target) return
    patchModels(target.source === 'manual'
      ? d.models.filter((model) => model.id !== id)
      : d.models.map((model) => (model.id === id ? { ...model, enabled: false } : model)))
  }

  const addManual = (): void => {
    const id = manual.trim()
    if (!id) return
    const existing = d.models.find((model) => model.id === id)
    if (existing) {
      if (!existing.enabled) patchModels(d.models.map((model) => (model.id === id ? { ...model, enabled: true } : model)))
    } else {
      patchModels([...d.models, { id, name: id, enabled: true, source: 'manual' }])
    }
    setManual('')
  }

  const fetchList = async (): Promise<void> => {
    if (!d.baseUrl.trim()) return void toast.error('请先填 Base URL')
    if (!d.apiKey.trim()) return void toast.error('请先填 API Key')
    setFetching(true)
    try {
      const result = await window.electronAPI.fetchModels({ provider: d.provider, baseUrl: d.baseUrl.trim(), apiKey: d.apiKey.trim() })
      if (!result.success) {
        toast.error(`拉取失败：${result.message}`)
      } else {
        setRemote(result.models)
        if (!result.models.length) toast('这个地址返回了空的模型列表，可以手动添加')
      }
    } catch (error) {
      toast.error(`拉取失败：${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setFetching(false)
    }
  }

  const detect = async (): Promise<void> => {
    const model = enabledModels[0]?.id || manual.trim()
    setDetecting(true)
    setDet(null)
    try {
      const result = await window.electronAPI.detectChannelApi({ baseUrl: d.baseUrl, apiKey: d.apiKey, model, useProxy: true })
      setDet(result)
      if (result.best) {
        const best = result.best
        setD((x) => {
          // 内置供应商只换协议不动地址（它们的根地址有特殊规则）；自定义中转站连地址一起换
          if (isCustomProvider(x.provider)) return { ...x, ...adaptCustom(x, best, result.baseUrl) }
          return { ...x, api: best }
        })
        toast.success(`检测完了，已选「${CHANNEL_API_LABELS[best]}」`)
      } else {
        toast.error('三种都没通，看看 Key、地址和模型名对不对')
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message.replace(/^Error invoking remote method[^:]*:\s*(Error:\s*)?/, '') : String(error))
    } finally {
      setDetecting(false)
    }
  }

  /** 测一个模型：用当前选的接口格式真发一句话，看通不通、多快 */
  const testModel = async (modelId: string): Promise<void> => {
    if (!d.baseUrl.trim() || !d.apiKey.trim()) return void toast.error('先填 Base URL 和 API Key')
    setTests((x) => ({ ...x, [modelId]: { state: 'running' } }))
    const started = Date.now()
    try {
      if (hasApiChoice) {
        const result = await window.electronAPI.detectChannelApi({
          baseUrl: d.baseUrl.trim(), apiKey: d.apiKey.trim(), model: modelId, useProxy: true, only: api,
        })
        const one = result.results[api]
        setTests((x) => ({ ...x, [modelId]: one?.ok ? { state: 'ok', ms: one.ms } : { state: 'fail', err: one?.err || '不通' } }))
      } else {
        const result = await window.electronAPI.testChannelDirect({
          provider: d.provider, baseUrl: d.baseUrl.trim(), apiKey: d.apiKey.trim(), modelId,
        })
        setTests((x) => ({ ...x, [modelId]: result.success ? { state: 'ok', ms: Date.now() - started } : { state: 'fail', err: result.message || '不通' } }))
      }
    } catch (error) {
      const err = error instanceof Error ? error.message.replace(/^Error invoking remote method[^:]*:\s*(Error:\s*)?/, '') : String(error)
      setTests((x) => ({ ...x, [modelId]: { state: 'fail', err } }))
    }
  }

  const testAll = async (): Promise<void> => {
    if (!enabledModels.length) return void toast('先加几个模型再测')
    await Promise.all(enabledModels.map((model) => testModel(model.id)))
  }

  const save = async (): Promise<void> => {
    if (!d.name.trim()) return void toast.error('填个名字')
    if (!d.baseUrl.trim()) return void toast.error('填 Base URL')
    if (!d.apiKey.trim()) return void toast.error('填 API Key')
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    setSaving(true)
    try {
      const saved = await onSave({ ...d, name: d.name.trim(), baseUrl: d.baseUrl.trim(), apiKey: d.apiKey.trim(), api: hasApiChoice ? api : undefined })
      if (saved) toast.success('已保存')
    } finally {
      setSaving(false)
    }
  }

  const shown = (remote ?? []).filter((model) => !filter || model.id.toLowerCase().includes(filter.toLowerCase()))
  const isOn = (id: string): boolean => d.models.some((model) => model.id === id && model.enabled)

  return (
    <div className="space-y-4 px-4 pb-4 pt-3">
      {hint && <div className="rounded-lg bg-primary/10 px-3 py-2 text-[12.5px] leading-5 text-primary">{hint}</div>}

      <div>
        <Label>名字</Label>
        <input className={fieldClass} value={d.name} onChange={(event) => setD({ ...d, name: event.target.value })} />
      </div>

      {hasApiChoice && (
        <div>
          <div className="mb-1 flex items-center gap-2">
            <Label>接口类型（请求打到哪个路径）</Label>
            <div className="flex-1" />
            <button
              type="button"
              className={btnClass}
              disabled={detecting || !d.baseUrl.trim() || !d.apiKey.trim()}
              title="拿选中的第一个模型把三种格式各试一句，自动选能用、效果最好的"
              onClick={() => void detect()}
            >
              {detecting ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
              {detecting ? '正在挨个试…' : '自动检测'}
            </button>
          </div>
          <div className="mb-2 text-[12px] leading-5 text-muted-foreground">
            不知道选哪个就点「自动检测」：填好 Base URL、Key，再选一个模型，Roy 会把三种格式都试一下，替你选能用、效果最好的。
          </div>
          <div className="grid grid-cols-3 gap-2">
            {API_ORDER.map((item) => {
              const on = api === item
              const r = det?.results[item]
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => setD((x) => ({ ...x, ...adaptCustom(x, item) }))}
                  className={cn(
                    'rounded-lg border px-3 py-2 text-left transition-colors',
                    on ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/60',
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <span className={cn('text-[12.5px] font-medium', on ? 'text-primary' : 'text-foreground')}>{CHANNEL_API_LABELS[item]}</span>
                    {det?.best === item && <span className="rounded bg-primary px-1 text-[10.5px] text-primary-foreground">推荐</span>}
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">{CHANNEL_API_PATHS[item]}</div>
                  {r && (
                    <div className={cn('mt-1 truncate text-[11px]', r.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive')} title={r.err}>
                      {r.ok ? `✓ 能用 · ${(r.ms / 1000).toFixed(1)} 秒` : `✗ ${r.err || '不通'}`}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
          <div className="mt-1.5 text-[12px] leading-5 text-muted-foreground">{CHANNEL_API_HINTS[api]}</div>
        </div>
      )}

      <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2.5">
        <div>
          <div className="text-[13px] font-medium">发送思考强度</div>
          <div className="mt-0.5 text-[12px] text-muted-foreground">输入框里选的思考强度会发给模型。中转站或模型报错不认识这个参数时关掉</div>
        </div>
        <Switch checked={d.reasoning} onCheckedChange={(value) => setD({ ...d, reasoning: value })} />
      </div>

      <div className="rounded-lg border border-border px-3 py-2.5 text-sm text-muted-foreground">
        网络自动跟随全局设置（默认使用系统代理），无需为每个模型单独勾选。高级网络设置中的手动代理仍会生效。
      </div>

      <div>
        <Label>Base URL</Label>
        <input
          className={cn(fieldClass, 'font-mono')}
          value={d.baseUrl}
          onChange={(event) => setD({ ...d, baseUrl: event.target.value })}
          placeholder={d.provider === 'anthropic-compatible' ? 'https://…/v1/messages' : 'https://…/v1'}
        />
        {endpoint && (
          <div className="mt-1.5 flex flex-wrap items-center gap-2 font-mono text-[11.5px] text-muted-foreground">
            实际请求：<span className="break-all text-foreground">{endpoint}</span>
          </div>
        )}
        {needsV1 && (
          <div className="mt-1.5 flex items-center gap-2 rounded-lg bg-muted px-2.5 py-1.5 text-[12px] text-foreground/75">
            <span className="flex-1">大多数中转站的 Base URL 要以 /v1 结尾，实际请求才会是 /v1{api === 'responses' ? '/responses' : '/chat/completions'}。</span>
            <button
              type="button"
              className="shrink-0 rounded-md border border-border bg-background px-2 py-0.5 text-foreground hover:bg-muted"
              onClick={() => setD({ ...d, baseUrl: `${d.baseUrl.trim().replace(/\/+$/, '')}/v1` })}
            >
              补上 /v1
            </button>
          </div>
        )}
      </div>

      <div>
        <Label>API Key</Label>
        <div className="relative">
          <input
            className={cn(fieldClass, 'pr-9 font-mono')}
            type={showKey ? 'text' : 'password'}
            value={d.apiKey}
            disabled={!keyLoaded}
            placeholder={keyLoaded ? 'sk-…' : '正在读取…'}
            onChange={(event) => setD({ ...d, apiKey: event.target.value })}
          />
          <button
            type="button"
            className="absolute right-1.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:text-foreground"
            onClick={() => setShowKey((value) => !value)}
            title={showKey ? '隐藏' : '显示'}
          >
            {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </div>

      <div>
        <div className="mb-1 flex items-center gap-2">
          <Label>用哪些模型</Label>
          <div className="flex-1" />
          <button
            type="button"
            className={btnClass}
            onClick={() => void testAll()}
            disabled={!enabledModels.length || Object.values(tests).some((t) => t.state === 'running')}
            title="用当前的接口格式给每个模型发一句话，看通不通、多快"
          >
            <PlugZap size={13} />
            全部测试
          </button>
          <button type="button" className={btnClass} onClick={() => void fetchList()} disabled={fetching}>
            {fetching ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            从接口拉取模型列表
          </button>
        </div>
        {/* 每个模型一行：菜单显示名 / 实际模型 / 上下文窗口 / 思考等级都能单独设 */}
        <div className="rounded-lg border border-border">
          <div className="grid grid-cols-[1fr_1fr_52px_96px_86px_72px_28px] items-center gap-2 border-b border-border px-2 py-1.5 text-[11px] text-muted-foreground">
            <span>菜单显示名</span><span>实际请求模型</span><span>1M</span><span>窗口大小</span><span>思考等级</span><span>测试</span><span />
          </div>
          <div className="max-h-64 overflow-y-auto p-1">
            {enabledModels.map((model) => {
              const customName = model.name && model.name !== model.id ? model.name : ''
              return (
                <div key={model.id} className="grid grid-cols-[1fr_1fr_52px_96px_86px_72px_28px] items-center gap-2 rounded-md px-1 py-1 hover:bg-muted/50">
                  <input
                    className="h-7 w-full rounded-md border border-border bg-background px-2 text-[12px] outline-none focus:border-primary"
                    value={customName}
                    placeholder={model.id}
                    onChange={(event) => setModelMeta(model.id, { name: event.target.value || model.id })}
                  />
                  <span className="truncate font-mono text-[12px] text-foreground/70" title={model.id}>{model.id}</span>
                  <label className="flex items-center gap-1.5 text-[11.5px] text-foreground/70" title="这个模型支持 100 万上下文：勾上后占用和压缩都按 1M 算，不会那么快触发压缩">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 accent-[hsl(var(--primary))]"
                      checked={(model.contextWindow ?? 0) >= 800_000}
                      onChange={(event) => setModelMeta(model.id, { contextWindow: event.target.checked ? 1_000_000 : undefined })}
                    />
                    1M
                  </label>
                  <input
                    type="number"
                    className="h-7 w-full rounded-md border border-border bg-background px-2 text-[12px] tabular-nums outline-none focus:border-primary"
                    value={model.contextWindow ?? ''}
                    placeholder="自动"
                    onChange={(event) => setModelMeta(model.id, { contextWindow: event.target.value ? Number(event.target.value) : undefined })}
                  />
                  <select
                    className="h-7 w-full rounded-md border border-border bg-background px-1.5 text-[12px] outline-none focus:border-primary"
                    value={model.thinkingLevel ?? ''}
                    onChange={(event) => setModelMeta(model.id, { thinkingLevel: event.target.value || undefined })}
                  >
                    {THINK_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                  <TestCell state={tests[model.id]} onTest={() => void testModel(model.id)} />
                  <button
                    type="button"
                    onClick={() => removeModel(model.id)}
                    className="grid h-7 w-7 place-items-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    title="移除"
                  >
                    <X size={13} />
                  </button>
                </div>
              )
            })}
            {!enabledModels.length && (
              <div className="px-2 py-3 text-center text-[12px] text-muted-foreground">还没加模型。上面拉取列表，或在下面手动输入。</div>
            )}
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <input
            className={cn(fieldClass, 'w-64 font-mono')}
            value={manual}
            onChange={(event) => setManual(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) addManual()
            }}
            placeholder="手动输入模型 ID，回车添加"
          />
          <button type="button" className={btnClass} onClick={addManual}>添加</button>
        </div>
        {remote && (
          <div className="mt-2 rounded-lg border border-border">
            <input
              className="h-8 w-full border-b border-border bg-transparent px-3 text-[12.5px] outline-none"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder={`搜索（共 ${remote.length} 个）`}
            />
            <div className="max-h-56 overflow-y-auto p-1">
              {shown.map((model) => {
                const on = isOn(model.id)
                return (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => toggleModel(model)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left font-mono text-[12px] hover:bg-muted/60"
                  >
                    <span className={cn('grid h-4 w-4 shrink-0 place-items-center rounded border', on ? 'border-primary bg-primary text-primary-foreground' : 'border-border')}>
                      {on && <Check size={11} />}
                    </span>
                    <span className="truncate">{model.id}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2">
        {onDelete && (
          <button type="button" className={cn(btnClass, 'mr-auto hover:text-destructive')} onClick={onDelete}>
            <Trash2 size={13} />
            删除这个供应商
          </button>
        )}
        <button type="button" className={btnClass} onClick={onCancel}>取消</button>
        <button type="button" className={btnPrimaryClass} onClick={() => void save()} disabled={saving || !keyLoaded}>
          {saving && <Loader2 size={13} className="animate-spin" />}
          保存
        </button>
      </div>
    </div>
  )
}

type TestState = { state: 'running' } | { state: 'ok'; ms: number } | { state: 'fail'; err: string }

/** 模型行里的「测试」格：没测过显示按钮，测完显示耗时或失败原因（悬停看全文），点一下重测 */
function TestCell({ state, onTest }: { state?: TestState; onTest: () => void }): React.ReactElement {
  if (state?.state === 'running') {
    return (
      <span className="flex h-7 items-center gap-1 text-[11.5px] text-muted-foreground">
        <Loader2 size={12} className="animate-spin" />
        测试中
      </span>
    )
  }
  return (
    <button
      type="button"
      onClick={onTest}
      title={state?.state === 'fail' ? `${state.err}\n点一下重测` : state?.state === 'ok' ? '点一下重测' : '发一句话测试这个模型'}
      className={cn(
        'h-7 truncate rounded-md border px-1.5 text-[11.5px] tabular-nums transition-colors',
        !state && 'border-border text-foreground/75 hover:bg-muted',
        state?.state === 'ok' && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
        state?.state === 'fail' && 'border-destructive/30 bg-destructive/10 text-destructive',
      )}
    >
      {!state ? '测试' : state.state === 'ok' ? `✓ ${(state.ms / 1000).toFixed(1)}s` : '✗ 不通'}
    </button>
  )
}
