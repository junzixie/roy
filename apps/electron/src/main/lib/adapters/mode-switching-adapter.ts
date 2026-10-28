/**
 * 按「Agent 运行模式」分流的适配器
 *
 * - 快速模式（fast）：和 Arthur 一样在主进程里直接跑 Pi 内核（PiAgentAdapter）。
 *   不用每轮 fork 一个 utility 进程、重新加载内核、走一遍 RPC，首字明显更快，流式也更顺。
 * - 企业模式（enterprise）：Roy 原有的 per-session utility 进程隔离（PiUtilityAdapter），
 *   内核崩了不拖垮主窗口，适合多人协作、长任务。
 *
 * 每次 query 开始时读一次设置，所以在设置里切换后下一条消息就生效；
 * 正在跑的会话继续用它开始时的那个适配器，abort / 排队消息 / 切权限都路由回去。
 *
 * 环境变量 ROY_AGENT_RUNTIME=in-process / utility 仍可强制指定（调试用）。
 *
 * 「运行方式」（快速 / 隔离）和「工作模式」（原生 / 标准 / DeepSeek 优化）是两件事：
 * 前者只决定内核跑在哪个进程，后者决定 AI 怎么干活。旧版的「精简模式」并入工作模式里的原生模式。
 */

import type {
  AgentProviderAdapter,
  SDKMessage,
  SDKUserMessageInput,
  AgentThinkingLevel,
  SendQueuedMessageOptions,
} from '@roy/shared'
import type { PiAgentQueryOptions } from './pi-agent-adapter'
import { PiAgentAdapter } from './pi-agent-adapter'
import { PiUtilityAdapter } from './pi-utility-adapter'
import { getSettings } from '../settings-service'
import { hasProFeature } from '../roy-account'

export type AgentRunMode = 'fast' | 'enterprise'
export type AgentWorkMode = 'native' | 'standard' | 'deepseek'

/** 当前生效的运行方式（环境变量优先，其次设置，默认快速） */
export function resolveAgentRunMode(): AgentRunMode {
  const forced = process.env.ROY_AGENT_RUNTIME
  if (forced === 'in-process' || forced === 'off') return 'fast'
  if (forced === 'utility') return 'enterprise'
  try {
    return getSettings().agentMode === 'enterprise' ? 'enterprise' : 'fast'
  } catch {
    return 'fast'
  }
}

/** 当前工作模式（旧版 agentMode = 'slim' 视为原生模式） */
export function resolveAgentWorkMode(): AgentWorkMode {
  try {
    const s = getSettings()
    if (s.workMode === 'native' || s.workMode === 'standard' || s.workMode === 'deepseek') return s.workMode
    return s.agentMode === 'slim' ? 'native' : 'standard'
  } catch {
    return 'standard'
  }
}

/**
 * DeepSeek 优化模式 - 会员专享功能
 *
 * - 所有模型都可以使用此优化模式（不限于 DeepSeek 模型）
 * - 针对 DeepSeek 模型有奇效
 * - 普通用户使用标准模式
 */
export function isProFeatureUnlocked(): boolean {
  return hasProFeature('deepseek-mode')
}

export class ModeSwitchingAdapter implements AgentProviderAdapter {
  private readonly fast = new PiAgentAdapter(true)
  private readonly enterprise = new PiUtilityAdapter()
  /** sessionId → 正在服务它的适配器（可能同时有恢复中的旧迭代器，所以记计数） */
  private readonly owners = new Map<string, { adapter: AgentProviderAdapter; count: number }>()

  private pick(): AgentProviderAdapter {
    return resolveAgentRunMode() === 'enterprise'
      ? (this.enterprise as unknown as AgentProviderAdapter)
      : this.fast
  }

  private ownerOf(sessionId: string): AgentProviderAdapter | undefined {
    return this.owners.get(sessionId)?.adapter
  }

  async *query(input: PiAgentQueryOptions): AsyncIterable<SDKMessage> {
    const runMode = resolveAgentRunMode()
    const adapter = runMode === 'enterprise' ? this.enterprise as unknown as AgentProviderAdapter : this.fast
    const workMode = input.assistantMode ? 'standard' : resolveAgentWorkMode()
    input = {
      ...input,
      slimMode: workMode === 'native',
      deepseekOptimized: workMode === 'deepseek' && isProFeatureUnlocked(),
    }
    const owner = this.owners.get(input.sessionId)
    if (owner && owner.adapter === adapter) owner.count += 1
    else this.owners.set(input.sessionId, { adapter, count: 1 })
    console.log(`[Agent 运行模式] ${adapter === this.fast ? '快速模式（主进程直连内核）' : '企业模式（独立进程隔离）'} sessionId=${input.sessionId}`)
    try {
      yield* (adapter.query(input) as AsyncIterable<SDKMessage>)
    } finally {
      const current = this.owners.get(input.sessionId)
      if (current && current.adapter === adapter) {
        current.count -= 1
        if (current.count <= 0) this.owners.delete(input.sessionId)
      }
    }
  }

  abort(sessionId: string): void {
    const owner = this.ownerOf(sessionId)
    if (owner) {
      owner.abort(sessionId)
      return
    }
    // 没登记到（比如已经结束）：两边都发一次，都是幂等的
    this.fast.abort(sessionId)
    ;(this.enterprise as unknown as AgentProviderAdapter).abort(sessionId)
  }

  async interruptQuery(sessionId: string): Promise<void> {
    const owner = this.ownerOf(sessionId)
    if (owner?.interruptQuery) await owner.interruptQuery(sessionId)
  }

  async sendQueuedMessage(sessionId: string, message: SDKUserMessageInput, options?: SendQueuedMessageOptions): Promise<void> {
    const owner = this.ownerOf(sessionId)
    if (!owner?.sendQueuedMessage) throw new Error('当前会话没有正在运行的 Agent')
    await owner.sendQueuedMessage(sessionId, message, options)
  }

  async cancelQueuedMessage(sessionId: string, messageUuid: string): Promise<void> {
    const owner = this.ownerOf(sessionId)
    if (owner?.cancelQueuedMessage) await owner.cancelQueuedMessage(sessionId, messageUuid)
  }

  async setThinkingLevel(sessionId: string, level: AgentThinkingLevel): Promise<void> {
    await this.ownerOf(sessionId)?.setThinkingLevel?.(sessionId, level)
  }

  async setPermissionMode(sessionId: string, mode: string): Promise<void> {
    const owner = this.ownerOf(sessionId)
    if (owner?.setPermissionMode) await owner.setPermissionMode(sessionId, mode)
  }

  dispose(): void {
    this.fast.dispose()
    ;(this.enterprise as unknown as AgentProviderAdapter).dispose()
    this.owners.clear()
  }
}
