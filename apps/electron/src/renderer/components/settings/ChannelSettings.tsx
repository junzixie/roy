/**
 * ChannelSettings - 模型配置页（照 Arthur 的 settings/Models.tsx 复刻）
 *
 * - 模型配置：供应商列表（拖把手排序、启用开关、点开原地编辑），右上角「添加供应商」按分组选
 * - 默认模型和看图：新会话默认模型、哪些模型能看图（点眼睛切换）、视觉助手
 * - 测速：每个供应商直连 / 走系统代理各测一次，明显更快就给按钮切过去
 * - 上下文压缩（Roy 原有）
 *
 * 订阅登录类（ChatGPT / Copilot / xAI）和智谱团队版的凭据结构特殊，仍用原来的完整表单。
 */

import * as React from 'react'
import { useAtom, useSetAtom } from 'jotai'
import { Check, CircleStop, Eye, Gauge, GripVertical, Loader2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { PROVIDER_LABELS, VOLCENGINE_CODING_PLAN_MODELS } from '@roy/shared'
import type { Channel, ChannelModel, ProviderType } from '@roy/shared'
import type { VisionRelaySettings as VisionRelayValue } from '@/types/settings'
import { getChannelLogo, getModelLogo, getProviderLogo } from '@/lib/model-logo'
import { agentChannelIdAtom, agentModelIdAtom } from '@/atoms/agent-atoms'
import { channelsAtom } from '@/atoms/chat-atoms'
import { settingsTabAtom } from '@/atoms/settings-tab'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { SettingsSection } from './primitives'
import { ChannelForm } from './ChannelForm'
import { ChannelEditor, draftForProvider, draftFromChannel, type ChannelDraft } from './ChannelEditor'
import { CompactionSettings } from './CompactionSettings'

/** 凭据结构特殊、仍走原完整表单的供应商 */
const LEGACY_FORM_PROVIDERS: ReadonlySet<ProviderType> = new Set<ProviderType>([
  'openai-codex',
  'github-copilot',
  'xai',
  'zhipu-coding-team',
])

const SUBSCRIPTION_PROVIDERS: ReadonlySet<ProviderType> = new Set<ProviderType>(['openai-codex', 'github-copilot', 'xai'])

/** Roy 官方渠道（主进程 builtin-channels.ts 里 id 以 builtin- 开头）：不用填 Key，按点数计费 */
const isBuiltinChannel = (channel: Channel): boolean => channel.id.startsWith('builtin-')

/** 「添加供应商」菜单的分组（和 Arthur 一样按 国内 / 国外 / 订阅 / 自定义 分） */
const PROVIDER_GROUPS: { group: string; providers: ProviderType[] }[] = [
  {
    group: '国内',
    providers: ['deepseek', 'qwen', 'qwen-token-plan', 'doubao-api', 'doubao', 'ark-coding-plan', 'kimi-api', 'kimi-coding', 'zhipu', 'zhipu-coding', 'zhipu-coding-team', 'minimax', 'xiaomi', 'xiaomi-token-plan'],
  },
  { group: '国外', providers: ['anthropic', 'openai', 'openai-responses', 'google', 'opencode-go-openai'] },
  { group: '订阅登录（不用 Key）', providers: ['openai-codex', 'github-copilot', 'xai'] },
  { group: '自定义（中转站、本地模型）', providers: ['custom', 'anthropic-compatible'] },
]

/**
 * 「GLM-4V 识图」预设（参照天枢的 zhipu-vision 识图桥）：
 * 智谱 OpenAI 兼容接口 + glm-4v-flash（免费、8K 上下文），关掉思考；
 * 保存后若还没配视觉助手，就自动把它设成视觉助手——主模型看不了图时先交给它看。
 */
const GLM4V_PRESET_ID = 'glm4v-vision'
function glm4vVisionDraft(): ChannelDraft {
  return {
    ...draftForProvider('zhipu'),
    name: 'GLM-4V 识图',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    reasoning: false,
    proxy: false,
    models: [
      { id: 'glm-4v-flash', name: 'GLM-4V Flash（免费识图）', enabled: true, source: 'manual', contextWindow: 8192, vision: true },
      { id: 'glm-4v-plus', name: 'GLM-4V Plus', enabled: false, source: 'manual', contextWindow: 8192, vision: true },
    ],
  }
}

/**
 * 「WorkBuddy2API 本地中转」预设：
 * WorkBuddy2API 把多个 WorkBuddy 账号封成 OpenAI 兼容接口，默认跑在本机 127.0.0.1:8790。
 * 装好并启动 WorkBuddy2API 后，在它的后台拿一把 key 填进来就能用；发给别人也只需装这两个软件。
 */
const WORKBUDDY_PRESET_ID = 'workbuddy2api'
function workbuddy2apiDraft(): ChannelDraft {
  return {
    ...draftForProvider('custom'),
    name: 'WorkBuddy2API',
    baseUrl: 'http://127.0.0.1:8790/v1',
    api: 'chat-completions',
    // 本机回环不走代理，否则系统代理会把 127.0.0.1 也拦下来
    proxy: false,
    models: [
      { id: 'deepseek-v4.1-flash', name: 'DeepSeek V4.1 Flash', enabled: true, source: 'manual', contextWindow: 1000000 },
      { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', enabled: true, source: 'manual', contextWindow: 1000000 },
      { id: 'glm-5.3', name: 'GLM-5.3', enabled: true, source: 'manual', contextWindow: 1000000 },
      { id: 'kimi-k3-1', name: 'Kimi K3', enabled: true, source: 'manual', contextWindow: 1000000 },
      { id: 'hy3', name: 'Hy3（不消耗额度）', enabled: false, source: 'manual', contextWindow: 256000 },
    ],
  }
}

function presetModelsFor(provider: ProviderType): ChannelModel[] {
  if (provider === 'doubao') return VOLCENGINE_CODING_PLAN_MODELS.map((model) => ({ ...model }))
  return []
}

/** 按模型名猜能不能看图（gpt、claude、gemini、vl、4v 这类）；手动标过的以标记为准 */
const VISION_NAME_RE = /(gpt-4o|gpt-4\.1|gpt-5|(^|[^a-z])o[34]([^a-z]|$)|claude|gemini|vision|[-_.]vl([-_.]|$)|qwen-vl|4v|omni|grok-4|kimi-k3|doubao-seed|vision-exp)/i
export function modelCanSee(model: ChannelModel): boolean {
  if (typeof model.vision === 'boolean') return model.vision
  return VISION_NAME_RE.test(model.id)
}

const btnClass = 'inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2.5 text-[12px] text-foreground/80 transition-colors hover:bg-muted disabled:opacity-45'
const btnPrimaryClass = 'inline-flex h-8 items-center gap-1 rounded-md bg-primary px-3 text-[12.5px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-45'
const cardClass = 'overflow-hidden rounded-xl border border-border bg-background/60'

type View = { kind: 'list' } | { kind: 'legacy'; channel: Channel | null; provider?: ProviderType }

export function ChannelSettings(): React.ReactElement {
  const [channels, setChannels] = React.useState<Channel[]>([])
  const [loading, setLoading] = React.useState(true)
  const [view, setView] = React.useState<View>({ kind: 'list' })
  /** 当前展开编辑的渠道 id；'__draft__' 表示新建草稿 */
  const [openId, setOpenId] = React.useState<string | null>(null)
  const [draft, setDraft] = React.useState<ChannelDraft | null>(null)
  /** 当前草稿来自哪个特殊预设（目前只有 GLM-4V 识图） */
  const [draftPreset, setDraftPreset] = React.useState<string | null>(null)
  /** 视觉助手被自动改过时 +1，让「默认模型和看图」重新读设置 */
  const [relayVersion, setRelayVersion] = React.useState(0)
  const [deleteTarget, setDeleteTarget] = React.useState<Channel | null>(null)
  const [agentChannelId, setAgentChannelId] = useAtom(agentChannelIdAtom)
  const [agentModelId, setAgentModelId] = useAtom(agentModelIdAtom)
  const setGlobalChannels = useSetAtom(channelsAtom)
  const setSettingsTab = useSetAtom(settingsTabAtom)

  const loadChannels = React.useCallback(async (): Promise<Channel[]> => {
    try {
      const list = await window.electronAPI.listChannels()
      setChannels(list)
      setGlobalChannels(list)
      return list
    } catch (error) {
      console.error('[模型配置] 加载失败:', error)
      return []
    } finally {
      setLoading(false)
    }
  }, [setGlobalChannels])

  React.useEffect(() => {
    void loadChannels()
  }, [loadChannels])

  const pickProvider = (provider: ProviderType): void => {
    if (LEGACY_FORM_PROVIDERS.has(provider)) {
      setView({ kind: 'legacy', channel: null, provider })
      return
    }
    setDraftPreset(null)
    setDraft(draftForProvider(provider, presetModelsFor(provider)))
    setOpenId('__draft__')
  }

  const pickVisionPreset = (): void => {
    setDraftPreset(GLM4V_PRESET_ID)
    setDraft(glm4vVisionDraft())
    setOpenId('__draft__')
  }

  const pickWorkBuddyPreset = (): void => {
    setDraftPreset(WORKBUDDY_PRESET_ID)
    setDraft(workbuddy2apiDraft())
    setOpenId('__draft__')
  }

  const openChannel = (channel: Channel): void => {
    if (LEGACY_FORM_PROVIDERS.has(channel.provider)) {
      setView({ kind: 'legacy', channel })
      return
    }
    setDraft(null)
    setDraftPreset(null)
    setOpenId((current) => (current === channel.id ? null : channel.id))
  }

  const saveDraft = async (next: ChannelDraft): Promise<Channel | null> => {
    try {
      const payload = {
        name: next.name,
        provider: next.provider,
        baseUrl: next.baseUrl,
        apiKey: next.apiKey,
        models: next.models,
        api: next.api,
        reasoning: next.reasoning,
        proxy: next.proxy,
        enabled: next.enabled,
      }
      const saved = next.id
        ? await window.electronAPI.updateChannel(next.id, payload)
        : await window.electronAPI.createChannel(payload)
      const list = await loadChannels()
      const isVisionPreset = !next.id && draftPreset === GLM4V_PRESET_ID
      // 识图预设：不当聊天默认模型；还没配视觉助手时自动设成它
      if (isVisionPreset) {
        const visionModel = saved.models.find((model) => model.enabled && model.vision === true)
        if (visionModel) {
          const settings = await window.electronAPI.getSettings()
          const relay = settings.visionRelay
          if (!relay?.enabled || !relay.channelId || !relay.modelId) {
            await window.electronAPI.updateSettings({ visionRelay: { enabled: true, channelId: saved.id, modelId: visionModel.id } })
            setRelayVersion((value) => value + 1)
            toast.success('已设为视觉助手：当前模型看不了图时，先交给 GLM-4V 识别')
          } else {
            toast.success('已添加 GLM-4V 识图；要用它，在下面「视觉助手」里选')
          }
        }
      }
      // 还没有默认模型时，把刚保存的第一个模型设成默认
      const firstModel = saved.models.find((model) => model.enabled)
      if (!isVisionPreset && !agentChannelId && firstModel) {
        setAgentChannelId(saved.id)
        setAgentModelId(firstModel.id)
        void window.electronAPI.updateSettings({ agentChannelId: saved.id, agentModelId: firstModel.id })
      }
      setOpenId(null)
      setDraft(null)
      setDraftPreset(null)
      return list.find((channel) => channel.id === saved.id) ?? saved
    } catch (error) {
      console.error('[模型配置] 保存失败:', error)
      toast.error(`保存失败：${error instanceof Error ? error.message : String(error)}`)
      return null
    }
  }

  const autoSaveModels = async (channelId: string, models: ChannelModel[]): Promise<void> => {
    try {
      await window.electronAPI.updateChannel(channelId, { models })
      await loadChannels()
    } catch (error) {
      console.error('[模型配置] 自动保存模型失败:', error)
    }
  }

  const toggleEnabled = async (channel: Channel, enabled: boolean): Promise<void> => {
    try {
      await window.electronAPI.updateChannel(channel.id, { enabled })
      await loadChannels()
    } catch (error) {
      console.error('[模型配置] 切换启用失败:', error)
    }
  }

  const confirmDelete = async (): Promise<void> => {
    if (!deleteTarget) return
    const target = deleteTarget
    try {
      await window.electronAPI.deleteChannel(target.id)
      if (agentChannelId === target.id) {
        setAgentChannelId(null)
        setAgentModelId(null)
        await window.electronAPI.updateSettings({ agentChannelId: undefined, agentModelId: undefined })
      }
      setOpenId(null)
      await loadChannels()
    } catch (error) {
      console.error('[模型配置] 删除失败:', error)
    } finally {
      setDeleteTarget(null)
    }
  }

  // ===== 拖把手排序 =====
  const [order, setOrder] = React.useState<Channel[]>([])
  const [dragId, setDragId] = React.useState<string | null>(null)
  const [armedId, setArmedId] = React.useState<string | null>(null)
  React.useEffect(() => setOrder(channels), [channels])

  const handleDragOver = (overId: string): void => {
    if (!dragId || dragId === overId) return
    setOrder((list) => {
      const from = list.findIndex((item) => item.id === dragId)
      const to = list.findIndex((item) => item.id === overId)
      if (from < 0 || to < 0) return list
      const next = [...list]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved!)
      return next
    })
  }

  const handleDragEnd = async (): Promise<void> => {
    setDragId(null)
    setArmedId(null)
    const ids = order.map((item) => item.id)
    if (ids.join() === channels.map((item) => item.id).join()) return
    try {
      const list = await window.electronAPI.reorderChannels(ids)
      setChannels(list)
      setGlobalChannels(list)
      toast.success('顺序已保存')
    } catch (error) {
      console.error('[模型配置] 保存顺序失败:', error)
      setOrder(channels)
    }
  }

  if (view.kind === 'legacy') {
    return (
      <ChannelForm
        channel={view.channel}
        initialProvider={view.channel ? undefined : view.provider}
        onSaved={async () => {
          setView({ kind: 'list' })
          await loadChannels()
        }}
        onCancel={() => setView({ kind: 'list' })}
      />
    )
  }

  const hasDraft = openId === '__draft__' && draft !== null

  return (
    <div className="space-y-8">
      <SettingsSection
        title="模型配置"
        description="管理 AI 供应商：填 API Key、选要用的模型。国内的直接填 Key；中转站选「自定义」。Key 只存在你电脑上"
        action={<AddMenu onPick={pickProvider} onPickVision={pickVisionPreset} onPickWorkBuddy={pickWorkBuddyPreset} />}
      >
        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">正在加载…</div>
        ) : !order.length && !hasDraft ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-[13px] text-muted-foreground">
            还没有供应商。点右上角「添加供应商」，比如 DeepSeek，填上 Key 就能开始用。
          </div>
        ) : (
          <div className={cardClass}>
            {order.map((channel, index) => {
              const open = openId === channel.id
              const enabledCount = channel.models.filter((model) => model.enabled).length
              const isDefault = channel.id === agentChannelId
              return (
                <div
                  key={channel.id}
                  draggable={armedId === channel.id}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = 'move'
                    setDragId(channel.id)
                  }}
                  onDragOver={(event) => {
                    event.preventDefault()
                    handleDragOver(channel.id)
                  }}
                  onDragEnd={() => void handleDragEnd()}
                  className={cn(index > 0 && 'border-t border-border', dragId === channel.id && 'opacity-60')}
                >
                  <div className={cn('group flex items-center gap-2 py-3 pl-1.5 pr-4 transition-colors', open ? 'bg-muted/60' : 'hover:bg-muted/40')}>
                    <span
                      onMouseDown={() => setArmedId(channel.id)}
                      onMouseUp={() => setArmedId(null)}
                      title="拖动排序"
                      className="grid h-8 w-5 shrink-0 cursor-grab place-items-center rounded text-muted-foreground opacity-40 transition-opacity active:cursor-grabbing group-hover:opacity-100"
                    >
                      <GripVertical size={15} />
                    </span>
                    <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => openChannel(channel)}>
                      <img src={getChannelLogo(channel)} alt="" className="h-8 w-8 shrink-0 rounded" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 truncate text-[14px] font-medium">
                          <span className="truncate">{channel.name}</span>
                          {index === 0 && <span className="shrink-0 rounded bg-muted px-1.5 text-[10.5px] font-normal text-muted-foreground">排第一</span>}
                          {isDefault && <span className="shrink-0 rounded bg-primary/10 px-1.5 text-[10.5px] font-normal text-primary">默认</span>}
                          {channel.proxy && <span className="shrink-0 rounded bg-muted px-1.5 text-[10.5px] font-normal text-muted-foreground">走代理</span>}
                          {SUBSCRIPTION_PROVIDERS.has(channel.provider) && <span className="shrink-0 rounded bg-muted px-1.5 text-[10.5px] font-normal text-muted-foreground">订阅</span>}
                          {isBuiltinChannel(channel) && <span className="shrink-0 rounded bg-amber-500/15 px-1.5 text-[10.5px] font-normal text-amber-700 dark:text-amber-400">官方</span>}
                        </div>
                        <div className="truncate text-[12.5px] text-muted-foreground">
                          {isBuiltinChannel(channel)
                            ? `免配置，按 Roy 点数计费 · ${enabledCount} 个模型可用`
                            : `${PROVIDER_LABELS[channel.provider]} · ${enabledCount ? `${enabledCount} 个模型已启用` : '还没选模型'}`}
                        </div>
                      </div>
                    </button>
                    <Switch checked={channel.enabled} onCheckedChange={(value) => void toggleEnabled(channel, value)} />
                  </div>
                  {open && isBuiltinChannel(channel) && (
                    // 官方渠道只展示能用哪些模型，地址、鉴权、思考强度、模型清单都由 Roy 管理，不给改；用不用只看右边的总开关
                    <div className="space-y-3 border-t border-border px-4 py-3 text-[12.5px] text-muted-foreground">
                      <p>登录 Roy 账号即可使用，不用填 API Key，按实际用量扣 Roy 点数（1 点 = ¥1）。不想用官方额度时关掉右边的开关，改用你自己配置的渠道。</p>
                      <div className="flex flex-wrap gap-1.5">
                        {channel.models.map((model) => (
                          <span key={model.id} className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-background px-2 py-1 text-[12px] text-foreground/80">
                            <img src={getModelLogo(model.id)} alt="" className="h-3.5 w-3.5 rounded-sm" />
                            {model.name}
                          </span>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" className={btnClass} onClick={() => setSettingsTab('points')}>查看点数和使用记录</button>
                        <button type="button" className={btnClass} onClick={() => setSettingsTab('points')}>兑换充值码</button>
                      </div>
                    </div>
                  )}
                  {open && !isBuiltinChannel(channel) && (
                    <div className="border-t border-border">
                      <ChannelEditor
                        key={channel.id}
                        draft={draftFromChannel(channel)}
                        onSave={saveDraft}
                        onAutoSaveModels={(models) => void autoSaveModels(channel.id, models)}
                        onCancel={() => setOpenId(null)}
                        onDelete={() => setDeleteTarget(channel)}
                      />
                    </div>
                  )}
                </div>
              )
            })}
            {hasDraft && draft && (
              <div className={cn(order.length > 0 && 'border-t border-border')}>
                <div className="flex items-center gap-3 bg-muted/60 py-3 pl-8 pr-4">
                  <img src={getProviderLogo(draft.provider)} alt="" className="h-8 w-8 shrink-0 rounded" />
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-medium">{draft.name || PROVIDER_LABELS[draft.provider]}</div>
                    <div className="truncate text-[12.5px] text-muted-foreground">
                      {draftPreset === GLM4V_PRESET_ID
                        ? '识图专用 · 去智谱开放平台 open.bigmodel.cn 拿 API Key，glm-4v-flash 免费'
                        : '新供应商 · 填好后点「保存」'}
                    </div>
                  </div>
                </div>
                <div className="border-t border-border">
                  <ChannelEditor
                    key={`draft-${draftPreset ?? draft.provider}`}
                    draft={draft}
                    onSave={saveDraft}
                    onCancel={() => {
                      setOpenId(null)
                      setDraft(null)
                      setDraftPreset(null)
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </SettingsSection>

      <DefaultsAndVision
        key={relayVersion}
        channels={channels}
        agentChannelId={agentChannelId}
        agentModelId={agentModelId}
        onDefaultChange={(channelId, modelId) => {
          setAgentChannelId(channelId)
          setAgentModelId(modelId)
          void window.electronAPI.updateSettings({ agentChannelId: channelId ?? undefined, agentModelId: modelId ?? undefined })
        }}
        onChannelsChanged={loadChannels}
      />

      <SpeedTest channels={channels} onChannelsChanged={loadChannels} />

      <CompactionSettings />

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除供应商？</AlertDialogTitle>
            <AlertDialogDescription>
              确定删除「{deleteTarget?.name}」？Key 和模型列表会一起删掉，不能恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteTarget(null)}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDelete()}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ===== 添加供应商菜单 =====

function AddMenu({ onPick, onPickVision, onPickWorkBuddy }: { onPick: (provider: ProviderType) => void; onPickVision: () => void; onPickWorkBuddy: () => void }): React.ReactElement {
  const [open, setOpen] = React.useState(false)
  return (
    <div className="relative">
      <button type="button" className={btnPrimaryClass} onClick={() => setOpen((value) => !value)}>
        <Plus size={14} />
        添加供应商
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 z-20 max-h-[420px] w-[300px] overflow-y-auto overscroll-contain rounded-xl border border-border bg-popover p-1 shadow-lg">
            {PROVIDER_GROUPS.map((group) => (
              <div key={group.group}>
                <div className="px-2.5 pb-1 pt-2 text-[11px] text-muted-foreground">{group.group}</div>
                {group.providers.map((provider) => (
                  <button
                    key={provider}
                    type="button"
                    onClick={() => {
                      setOpen(false)
                      onPick(provider)
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] hover:bg-muted"
                  >
                    <img src={getProviderLogo(provider)} alt="" className="h-5 w-5 shrink-0 rounded" />
                    <span className="min-w-0 flex-1 truncate">{PROVIDER_LABELS[provider]}</span>
                  </button>
                ))}
                {group.group.startsWith('自定义') && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false)
                        onPickWorkBuddy()
                      }}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] hover:bg-muted"
                    >
                      <img src={getProviderLogo('custom')} alt="" className="h-5 w-5 shrink-0 rounded" />
                      <span className="min-w-0 flex-1 truncate">WorkBuddy2API（本机）</span>
                      <span className="inline-flex shrink-0 items-center text-[11px] text-muted-foreground">127.0.0.1:8790</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false)
                        onPickVision()
                      }}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] hover:bg-muted"
                    >
                      <img src={getProviderLogo('zhipu')} alt="" className="h-5 w-5 shrink-0 rounded" />
                      <span className="min-w-0 flex-1 truncate">GLM-4V 识图</span>
                      <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] text-muted-foreground"><Eye size={11} />视觉助手</span>
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ===== 默认模型和看图 =====

interface ModelOption {
  key: string
  channelId: string
  channelName: string
  model: ChannelModel
}

function listModelOptions(channels: Channel[]): ModelOption[] {
  const list: ModelOption[] = []
  for (const channel of channels) {
    if (!channel.enabled) continue
    for (const model of channel.models) {
      if (!model.enabled) continue
      list.push({ key: `${channel.id}::${model.id}`, channelId: channel.id, channelName: channel.name, model })
    }
  }
  return list
}

const selectClass = 'h-8 w-72 rounded-md border border-border bg-background px-2 text-[13px] outline-none focus:border-primary'

function DefaultsAndVision({
  channels,
  agentChannelId,
  agentModelId,
  onDefaultChange,
  onChannelsChanged,
}: {
  channels: Channel[]
  agentChannelId: string | null
  agentModelId: string | null
  onDefaultChange: (channelId: string | null, modelId: string | null) => void
  onChannelsChanged: () => Promise<Channel[]>
}): React.ReactElement | null {
  const options = React.useMemo(() => listModelOptions(channels), [channels])
  const [relay, setRelay] = React.useState<VisionRelayValue>({ enabled: false })

  React.useEffect(() => {
    window.electronAPI.getSettings()
      .then((settings) => setRelay(settings.visionRelay ?? { enabled: false }))
      .catch(console.error)
  }, [])

  if (!options.length) return null

  // 「Roy 官方」的模型能不能看图由 Roy 定好了，不放进看图标记网格（只列用户自己配的渠道）
  const markableOptions = options.filter((option) => !option.channelId.startsWith('builtin-'))
  const visionCount = markableOptions.filter((option) => modelCanSee(option.model)).length
  // 没选视觉助手且官方渠道开着时，主进程用官方视觉模型兜底（见 vision-relay-service getEffectiveVisionRelay）
  const officialChannel = channels.find((c) => c.id === 'builtin-roy' && c.enabled)
  const officialVisionName = officialChannel?.models.find((m) => m.id === 'gemini-3.8-flash')?.name
  const visionOptions = options.filter((option) => modelCanSee(option.model) && !SUBSCRIPTION_PROVIDERS.has(channels.find((c) => c.id === option.channelId)?.provider as ProviderType))
  const defaultKey = agentChannelId && agentModelId ? `${agentChannelId}::${agentModelId}` : ''
  const relayKey = relay.enabled && relay.channelId && relay.modelId ? `${relay.channelId}::${relay.modelId}` : ''

  const setVision = async (option: ModelOption, on: boolean): Promise<void> => {
    const channel = channels.find((item) => item.id === option.channelId)
    if (!channel) return
    const models = channel.models.map((model) => (model.id === option.model.id ? { ...model, vision: on } : model))
    try {
      await window.electronAPI.updateChannel(channel.id, { models })
      await onChannelsChanged()
    } catch (error) {
      console.error('[模型配置] 保存看图标记失败:', error)
    }
  }

  const saveRelay = async (key: string): Promise<void> => {
    const next: VisionRelayValue = key
      ? { enabled: true, channelId: key.split('::')[0], modelId: key.split('::').slice(1).join('::') }
      : { ...relay, enabled: false }
    setRelay(next)
    try {
      await window.electronAPI.updateSettings({ visionRelay: next })
    } catch (error) {
      console.error('[模型配置] 保存视觉助手失败:', error)
    }
  }

  return (
    <SettingsSection
      title="默认模型和看图"
      description="亮着眼睛的模型能直接看你发的图片和截图（gpt、claude、gemini 这类会自动认出来）；点一下切换"
    >
      <div className={cardClass}>
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <div className="text-[13.5px] font-medium">新会话默认用</div>
          <select
            className={selectClass}
            value={defaultKey}
            onChange={(event) => {
              const value = event.target.value
              if (!value) return onDefaultChange(null, null)
              const [channelId, ...rest] = value.split('::')
              onDefaultChange(channelId ?? null, rest.join('::') || null)
            }}
          >
            <option value="">未设置（用列表里第一个）</option>
            {options.map((option) => (
              <option key={option.key} value={option.key}>
                {option.channelName} · {option.model.name || option.model.id}
              </option>
            ))}
          </select>
        </div>

        {markableOptions.length > 0 && <div className="border-t border-border px-4 py-3">
          <div className="mb-1 flex items-center gap-2">
            <Eye size={14} className="text-foreground/70" />
            <span className="text-[13.5px] font-medium">能看图的模型</span>
            <span className="rounded bg-muted px-1.5 text-[11px] text-muted-foreground">{visionCount} / {markableOptions.length}</span>
          </div>
          <div className="mb-3 text-[12px] leading-5 text-muted-foreground">
            你自己配置的渠道里，点了变亮的才能直接看你发的图片和截图（Roy 官方的模型已经标好，不用管）。gpt、claude、gemini 这类会自动认出来；认错了点一下关掉，能看图却没认出来的点一下打开。
          </div>
          <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
            {markableOptions.map((option) => {
              const on = modelCanSee(option.model)
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => void setVision(option, !on)}
                  title={on ? '点一下：关掉「能看图」' : '点一下：标记为能看图'}
                  className={cn(
                    'flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors',
                    on ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/50',
                  )}
                >
                  <Eye size={15} className={cn('shrink-0', on ? 'text-primary' : 'text-muted-foreground')} />
                  <span className="min-w-0 flex-1">
                    <span className={cn('block truncate text-[12.5px]', on ? 'font-medium text-foreground' : 'text-foreground/75')}>{option.model.name || option.model.id}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {option.channelName} · {on ? '能看图' : '不能看图'}{typeof option.model.vision !== 'boolean' ? '（自动认）' : ''}
                    </span>
                  </span>
                  {on ? (
                    <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                      <Check size={10} strokeWidth={3} />
                    </span>
                  ) : (
                    <span className="h-4 w-4 shrink-0 rounded-full border border-border" />
                  )}
                </button>
              )
            })}
          </div>
        </div>}

        <div className="flex items-center justify-between gap-4 border-t border-border px-4 py-3">
          <div className="min-w-0">
            <div className="text-[13.5px] font-medium">视觉助手</div>
            <div className="mt-0.5 text-[12px] leading-5 text-muted-foreground">
              {visionOptions.length
                ? '当前模型看不了图时，你发的图片、AI 的截图都先交给这个模型看，再把描述转给当前模型。在这里选了就优先用你选的'
                : '还没有标记任何能看图的模型——上面点一个变成「能看图」，这里才有可选项'}
            </div>
          </div>
          <select className={selectClass} value={relayKey} onChange={(event) => void saveRelay(event.target.value)}>
            <option value="">{officialVisionName ? `默认：Roy 官方 · ${officialVisionName}` : '不用视觉助手'}</option>
            {visionOptions.map((option) => (
              <option key={option.key} value={option.key}>
                {option.channelName} · {option.model.name || option.model.id}
              </option>
            ))}
          </select>
        </div>
      </div>
    </SettingsSection>
  )
}

// ===== 测速 =====

type PathSpeed = { ok: true; ms: number } | { ok: false; ms: number; message: string; errorType?: string } | 'run'

const tierClass = (ms: number): string => (ms > 8000 ? 'text-destructive' : ms > 3000 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400')

/** 测速结果的短标签：优先用主进程归好的错误类型（403 不等于 Key 错，可能是中转分组不开放这个接口） */
const ERROR_SHORT: Record<string, string> = {
  auth: 'Key 不对', permission: '没有权限', quota: '余额不足', not_found: '地址或模型不对',
  rate_limit: '被限流', bad_request: '请求被拒', server: '服务端出错', network: '连不上', timeout: '超时',
}
function shortError(message: string, errorType?: string): string {
  if (errorType && ERROR_SHORT[errorType]) return ERROR_SHORT[errorType]!
  if (/connection|fetch failed|ECONNREFUSED|ENOTFOUND|network/i.test(message)) return '连不上'
  if (/timeout|aborted|超时/i.test(message)) return '超时'
  if (/\b401\b|api key|invalid.*key|鉴权|认证/i.test(message)) return 'Key 不对'
  if (/\b403\b|permission|not allow/i.test(message)) return '没有权限'
  return message.slice(0, 14) || '失败'
}

function SpeedTest({ channels, onChannelsChanged }: { channels: Channel[]; onChannelsChanged: () => Promise<Channel[]> }): React.ReactElement | null {
  // Roy 官方渠道不参与测速：测速会发真实请求、扣点数，地址也由 Roy 管理
  const targets = channels.filter((channel) => channel.enabled && !isBuiltinChannel(channel))
  const [res, setRes] = React.useState<Record<string, PathSpeed>>({})
  const [off, setOff] = React.useState<Set<string>>(new Set())
  const [prog, setProg] = React.useState<{ done: number; total: number } | null>(null)
  const stop = React.useRef(false)

  if (!targets.length) return null

  const probe = async (channelId: string, useProxy: boolean): Promise<void> => {
    const key = `${channelId}|${useProxy ? 'proxy' : 'direct'}`
    setRes((previous) => ({ ...previous, [key]: 'run' }))
    const started = Date.now()
    try {
      const result = await window.electronAPI.testChannelPath({ channelId, useProxy })
      const ms = Date.now() - started
      setRes((previous) => ({ ...previous, [key]: result.success ? { ok: true, ms } : { ok: false, ms, message: result.message, errorType: result.errorType } }))
    } catch (error) {
      setRes((previous) => ({ ...previous, [key]: { ok: false, ms: Date.now() - started, message: error instanceof Error ? error.message : String(error) } }))
    }
  }

  const one = async (channelId: string): Promise<void> => {
    await probe(channelId, false)
    if (!stop.current) await probe(channelId, true)
  }

  const picked = targets.filter((channel) => !off.has(channel.id))
  const all = !off.size
  const running = prog !== null

  const runPicked = async (): Promise<void> => {
    stop.current = false
    setProg({ done: 0, total: picked.length })
    for (const [index, channel] of picked.entries()) {
      if (stop.current) break
      await one(channel.id)
      setProg({ done: index + 1, total: picked.length })
    }
    setProg(null)
    if (stop.current) toast('已停止，没测的保持原样')
  }

  // 两条路都测出来了、差得明显（快 30% 以上且至少 0.8 秒），而现在用的是慢的那条：建议换
  const advice = (channel: Channel): 'direct' | 'proxy' | null => {
    const d = res[`${channel.id}|direct`]
    const x = res[`${channel.id}|proxy`]
    const ok = (r?: PathSpeed): r is { ok: true; ms: number } => !!r && r !== 'run' && r.ok
    const failed = (r?: PathSpeed): boolean => !!r && r !== 'run' && !r.ok
    let better: 'direct' | 'proxy' | null = null
    if (ok(d) && failed(x)) better = 'direct'
    else if (ok(x) && failed(d)) better = 'proxy'
    else if (ok(d) && ok(x)) {
      if (d.ms < x.ms * 0.7 && x.ms - d.ms > 800) better = 'direct'
      else if (x.ms < d.ms * 0.7 && d.ms - x.ms > 800) better = 'proxy'
    }
    if (!better || (better === 'proxy') === (channel.proxy === true)) return null
    return better
  }

  const applyAdvice = async (channel: Channel, better: 'direct' | 'proxy'): Promise<void> => {
    try {
      await window.electronAPI.updateChannel(channel.id, { proxy: better === 'proxy' })
      await onChannelsChanged()
      toast.success(`「${channel.name}」改成${better === 'proxy' ? '走系统代理' : '直连'}了`)
    } catch (error) {
      console.error('[测速] 切换线路失败:', error)
    }
  }

  const cell = (r?: PathSpeed): React.ReactNode => {
    if (!r) return <span className="text-muted-foreground">—</span>
    if (r === 'run') return <Loader2 size={12} className="inline animate-spin text-muted-foreground" />
    if (!r.ok) return <span className="cursor-help whitespace-nowrap text-destructive" title={r.message}>✗ {shortError(r.message, r.errorType)}</span>
    return <b className={cn('whitespace-nowrap', tierClass(r.ms))}>{(r.ms / 1000).toFixed(1)} 秒</b>
  }

  return (
    <SettingsSection
      title="测速"
      description="每个供应商直连、走系统代理各发一次很短的请求，看多久有回应。慢在网络还是供应商本身，一眼看出来"
      action={running ? (
        <button type="button" className={btnClass} onClick={() => { stop.current = true }}>
          <CircleStop size={13} />
          停止（{prog.done}/{prog.total}）
        </button>
      ) : (
        <button type="button" className={btnPrimaryClass} disabled={!picked.length} onClick={() => void runPicked()}>
          <Gauge size={13} />
          {all ? '全部测一遍' : `测选中的 ${picked.length} 个`}
        </button>
      )}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
        <span>回应时间：</span>
        <span className="text-emerald-600 dark:text-emerald-400">● 3 秒内 很快</span>
        <span className="text-amber-600 dark:text-amber-400">● 3–8 秒 一般</span>
        <span className="text-destructive">● 8 秒以上 慢</span>
      </div>
      <div className={cardClass}>
        <div className="flex items-center gap-3 border-b border-border px-4 py-2 text-[11.5px] text-muted-foreground">
          <input
            type="checkbox"
            className="accent-[hsl(var(--primary))]"
            checked={all}
            disabled={running}
            onChange={() => setOff(all ? new Set(targets.map((channel) => channel.id)) : new Set())}
            title="全选 / 全不选"
          />
          <div className="flex-1">供应商</div>
          <div className="w-24 text-right">直连</div>
          <div className="w-24 text-right">走系统代理</div>
          <div className="w-8" />
        </div>
        {prog && (
          <div className="h-0.5 bg-muted">
            <div className="h-full bg-primary transition-[width] duration-300" style={{ width: `${(prog.done / Math.max(1, prog.total)) * 100}%` }} />
          </div>
        )}
        {targets.map((channel, index) => {
          const better = advice(channel)
          const busy = res[`${channel.id}|direct`] === 'run' || res[`${channel.id}|proxy`] === 'run'
          return (
            <div key={channel.id} className={cn('flex items-center gap-3 px-4 py-2.5 text-[12.5px]', index > 0 && 'border-t border-border', off.has(channel.id) && 'opacity-50')}>
              <input
                type="checkbox"
                className="accent-[hsl(var(--primary))]"
                checked={!off.has(channel.id)}
                disabled={running}
                onChange={() => setOff((previous) => {
                  const next = new Set(previous)
                  if (next.has(channel.id)) next.delete(channel.id)
                  else next.add(channel.id)
                  return next
                })}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{channel.name}</div>
                <div className="flex items-center gap-2 truncate text-[11.5px] text-muted-foreground">
                  {PROVIDER_LABELS[channel.provider]} · 现在{channel.proxy ? '走代理' : '直连'}
                  {better && (
                    <button
                      type="button"
                      className="rounded-md bg-primary/10 px-1.5 py-px text-[11px] text-primary hover:underline"
                      onClick={() => void applyAdvice(channel, better)}
                    >
                      {better === 'proxy' ? '走代理更快，切过去' : '直连更快，切过去'}
                    </button>
                  )}
                </div>
              </div>
              <div className="w-24 shrink-0 text-right">{cell(res[`${channel.id}|direct`])}</div>
              <div className="w-24 shrink-0 text-right">{cell(res[`${channel.id}|proxy`])}</div>
              <button
                type="button"
                className="w-8 shrink-0 rounded-md py-0.5 text-[12px] text-foreground/70 hover:bg-muted disabled:opacity-40"
                disabled={running || busy}
                onClick={() => {
                  stop.current = false
                  void one(channel.id)
                }}
              >
                测
              </button>
            </div>
          )
        })}
      </div>
    </SettingsSection>
  )
}
