/**
 * 模型默认值与测速
 *
 * 放在「模型配置」页下方：
 * - 默认模型：新建会话默认用哪个渠道的哪个模型
 * - 视觉助手：当前模型看不了图时，图片先交给它识别
 * - 测速：对已启用的渠道逐个发一次短请求，给出耗时
 */

import * as React from 'react'
import { useAtom } from 'jotai'
import { Gauge, Loader2 } from 'lucide-react'
import type { Channel } from '@roy/shared'
import { agentChannelIdAtom, agentModelIdAtom } from '@/atoms/agent-atoms'
import { SettingsCard, SettingsRow, SettingsSection } from './primitives'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface ModelOption {
  channelId: string
  channelName: string
  modelId: string
  label: string
}

interface SpeedResult {
  channelId: string
  direct: PathResult
  proxy: PathResult
}

interface PathResult {
  status: 'pending' | 'ok' | 'fail'
  ms?: number
  message?: string
}

const IDLE: PathResult = { status: 'pending' }

const NONE = '__none__'

/** 把一个路径的探测结果转成可读文案。 */
function explainPath(result: PathResult | undefined): string {
  if (!result) return '未测'
  if (result.status === 'pending') return '测试中…'
  if (result.status === 'ok') return `${result.ms} ms`
  return '失败'
}

export function ModelDefaultsSection({ channels }: { channels: Channel[] }): React.ReactElement {
  const [agentChannelId, setAgentChannelId] = useAtom(agentChannelIdAtom)
  const [agentModelId, setAgentModelId] = useAtom(agentModelIdAtom)
  const [speed, setSpeed] = React.useState<Record<string, SpeedResult>>({})
  const [testing, setTesting] = React.useState(false)

  const options = React.useMemo<ModelOption[]>(() => {
    const list: ModelOption[] = []
    for (const channel of channels) {
      if (!channel.enabled) continue
      for (const model of channel.models) {
        if (!model.enabled) continue
        list.push({
          channelId: channel.id,
          channelName: channel.name,
          modelId: model.id,
          label: `${channel.name} · ${model.name || model.id}`,
        })
      }
    }
    return list
  }, [channels])

  const defaultKey = agentChannelId && agentModelId ? `${agentChannelId}::${agentModelId}` : NONE

  const applyDefault = React.useCallback((value: string) => {
    if (value === NONE) {
      setAgentChannelId(null)
      setAgentModelId(null)
      return
    }
    const [channelId, modelId] = value.split('::')
    setAgentChannelId(channelId ?? null)
    setAgentModelId(modelId ?? null)
  }, [setAgentChannelId, setAgentModelId])

  const runSpeedTest = React.useCallback(async () => {
    setTesting(true)
    const targets = channels.filter((channel) => channel.enabled)
    setSpeed(Object.fromEntries(targets.map((channel) => [channel.id, {
      channelId: channel.id,
      direct: IDLE,
      proxy: IDLE,
    }])))

    const probe = async (channelId: string, useProxy: boolean): Promise<PathResult> => {
      const started = Date.now()
      try {
        const result = await window.electronAPI.testChannelPath({ channelId, useProxy })
        return result.success
          ? { status: 'ok', ms: Date.now() - started }
          : { status: 'fail', ms: Date.now() - started, message: result.message }
      } catch (error) {
        return {
          status: 'fail',
          ms: Date.now() - started,
          message: error instanceof Error ? error.message : String(error),
        }
      }
    }

    await Promise.all(targets.map(async (channel) => {
      // 两条路并行探，互不影响；只为实现真实的对比，不改变渠道本身的配置
      const [direct, proxy] = await Promise.all([
        probe(channel.id, false),
        probe(channel.id, true),
      ])
      setSpeed((previous) => ({
        ...previous,
        [channel.id]: { channelId: channel.id, direct, proxy },
      }))
    }))
    setTesting(false)
  }, [channels])

  return (
    <SettingsSection
      title="默认模型与测速"
      description="新建会话默认使用哪个模型；每个渠道先连一下，看有多快"
    >
      <SettingsCard>
        <SettingsRow label="默认模型" description="新建 Agent 与对话会话时的首选模型">
          <Select value={defaultKey} onValueChange={applyDefault}>
            <SelectTrigger className="h-8 w-[300px] text-[13px]">
              <SelectValue placeholder="未设置（用列表里第一个可用模型）" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>未设置</SelectItem>
              {options.map((option) => (
                <SelectItem key={`${option.channelId}::${option.modelId}`} value={`${option.channelId}::${option.modelId}`}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsRow>

        <SettingsRow label="视觉助手" description="当前模型看不了图时，图片先交给能识图的模型，再把描述转给当前模型">
          <Select
            value={options.some((option) => `${option.channelId}::${option.modelId}` === defaultKey) ? defaultKey : NONE}
            onValueChange={() => { /* 视觉路由在独立设置项里维护，这里只提示位置 */ }}
          >
            <SelectTrigger className="h-8 w-[300px] text-[13px]" disabled>
              <SelectValue placeholder="在「视觉助手」里配置" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>在「视觉助手」里配置</SelectItem>
            </SelectContent>
          </Select>
        </SettingsRow>

        <SettingsRow label="测速" description="每条渠道同时测「本机直连」和「走代理」两条路，哪个快用哪个">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 px-2.5 text-[12px]"
              onClick={() => void runSpeedTest()}
              disabled={testing || channels.filter((channel) => channel.enabled).length === 0}
            >
              {testing ? <Loader2 size={12} className="animate-spin" /> : <Gauge size={12} />}
              {testing ? '测速中' : '开始测速'}
            </Button>
          </div>
        </SettingsRow>

        {channels.filter((channel) => channel.enabled).map((channel) => {
          const result = speed[channel.id]
          const directText = explainPath(result?.direct)
          const proxyText = explainPath(result?.proxy)
          const failedMessage = result?.direct.message ?? result?.proxy.message
          return (
            <SettingsRow key={channel.id} label={channel.name} description={failedMessage}>
              <div className="flex items-center gap-3 text-[12.5px] tabular-nums text-foreground/55">
                <span className="flex items-center gap-1">
                  <span className="text-foreground/40">直连</span>
                  {directText}
                </span>
                <span className="flex items-center gap-1">
                  <span className="text-foreground/40">代理</span>
                  {proxyText}
                </span>
              </div>
            </SettingsRow>
          )
        })}
      </SettingsCard>
    </SettingsSection>
  )
}
