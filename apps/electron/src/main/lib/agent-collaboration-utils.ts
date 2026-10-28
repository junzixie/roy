/**
 * Agent 协作会话纯工具函数
 *
 * 不依赖 Electron 和磁盘服务，便于单元测试。
 */

import {
  ROY_DEFAULT_PERMISSION_MODE,
  type AgentDelegationRole,
  type AgentDelegationStatus,
  type AgentSessionMeta,
  type RoyPermissionMode,
} from '@roy/shared'

const PERMISSION_RANK: Record<RoyPermissionMode, number> = {
  plan: 0,
  ask: 1,
  auto: 2,
  bypassPermissions: 3,
}

export const MAX_RUNNING_DELEGATIONS_PER_PARENT = 50
/** 未显式指定时，父会话等待子会话完成的时长。 */
export const DEFAULT_DELEGATION_WAIT_SECONDS = 60 * 60
/** 显式指定 timeoutSeconds 时允许的最大等待时长。 */
export const MAX_DELEGATION_WAIT_SECONDS = 2 * 60 * 60

/**
 * 为具有副作用的工具调用提供进程内幂等保护。
 *
 * Pi runtime 在流恢复或上游重放时可能再次执行同一个 toolCallId；以父会话和
 * toolCallId 作为键可复用第一次的结果，避免重复创建子会话。缓存有界，防止长
 * 会话中的工具调用 ID 无限累积。
 */
export function createToolCallIdempotencyCache<T>(maxEntries = 512): {
  getOrCreate: (parentSessionId: string, toolCallId: string | undefined, create: () => T) => T
} {
  const entries = new Map<string, T>()

  return {
    getOrCreate(parentSessionId, toolCallId, create) {
      const normalizedCallId = toolCallId?.trim()
      // 缺少稳定调用 ID 时无法安全去重，保持原有执行语义。
      if (!normalizedCallId) return create()

      const key = `${parentSessionId}:${normalizedCallId}`
      if (entries.has(key)) return entries.get(key)!

      const result = create()
      entries.set(key, result)
      while (entries.size > maxEntries) {
        const oldestKey = entries.keys().next().value
        if (!oldestKey) break
        entries.delete(oldestKey)
      }
      return result
    },
  }
}

export interface RecoveredDelegationState {
  delegationId: string
  parentSessionId: string
  childSessionId: string
  title: string
  role: AgentDelegationRole
  goal: string
  permissionMode: RoyPermissionMode
  status: AgentDelegationStatus
  startedAt: number
  completedAt?: number
}

export function resolveDelegationPermissionMode(
  _parentMode: RoyPermissionMode | undefined,
  _requestedMode: RoyPermissionMode | undefined,
): RoyPermissionMode {
  // Pi 子会话目前固定直接执行。
  return 'bypassPermissions'
}

export function buildRecoveredDelegationState(input: {
  parentSessionId: string
  delegationId: string
  session: AgentSessionMeta
  fallbackPermissionMode?: RoyPermissionMode
}): RecoveredDelegationState {
  const persistedStatus = input.session.delegationStatus
  // 从持久化记录恢复但不在 live Map 中，说明当前进程并没有这个委派在跑。
  // 若磁盘里还残留 running（例如应用重启/崩溃后），应视为 interrupted，
  // 否则 continue_delegation 会把它误判为“仍在运行”而拒绝恢复。
  const status = persistedStatus === 'running'
    ? 'interrupted'
    : (persistedStatus ?? 'interrupted')
  return {
    delegationId: input.delegationId,
    parentSessionId: input.parentSessionId,
    childSessionId: input.session.id,
    title: input.session.title,
    role: input.session.delegationRole ?? 'custom',
    goal: input.session.delegationGoal ?? '',
    permissionMode: input.session.permissionMode ?? input.fallbackPermissionMode ?? ROY_DEFAULT_PERMISSION_MODE,
    status,
    startedAt: input.session.createdAt,
    completedAt: persistedStatus ? input.session.updatedAt : undefined,
  }
}

export function buildDelegationPrompt(input: {
  parentSessionId: string
  delegationId: string
  role: AgentDelegationRole
  task: string
  expectedOutput?: string
}): string {
  const expectedOutput = input.expectedOutput?.trim()
  return `你是 Roy 协作子 Agent。你由父 Agent 会话 ${input.parentSessionId} 委派创建，委派 ID 为 ${input.delegationId}。

## 工作边界

- 只处理下面的子任务，不要扩展到父任务的其他部分。
- 不要创建新的协作子会话。
- 如需修改文件，保持改动最小，并在最终回复说明文件路径和验证结果。
- 如果信息不足，直接列出缺口，不要编造。

## 子任务角色

${input.role}

## 子任务

${input.task.trim()}

## 输出要求

${expectedOutput || '最终回复请包含：关键发现、已执行操作、验证结果、剩余风险或建议。'}`
}

export function buildDelegationTaskWithSharedContext(input: {
  sharedContext?: string
  task: string
}): string {
  const sharedContext = input.sharedContext?.trim()
  const task = input.task.trim()
  if (!sharedContext) return task

  return `共享背景：
${sharedContext}

子任务：
${task}`
}


// ===== 协作结果自动送达文本 =====

const AUTO_DELIVERY_SUMMARY_LIMIT = 6_000

function clip(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit)}\n…（已截断，完整内容用 get_delegation_results 读取）` : text
}

const STATUS_LABEL: Partial<Record<AgentDelegationStatus, string>> = { completed: '已完成', failed: '失败' }

export function buildDelegationDeliveryText(records: Array<{ delegationId: string; title: string; status: AgentDelegationStatus; resultSummary?: string; error?: string }>): { text: string; displayText: string } {
  const lines = records.map((record) => {
    const body = record.status === 'failed'
      ? `失败原因：${record.error ?? '未知'}`
      : clip(record.resultSummary ?? '（没有可摘要的文本，请用 get_delegation_results 或打开子会话查看）', AUTO_DELIVERY_SUMMARY_LIMIT)
    return `### ${record.title}（${STATUS_LABEL[record.status] ?? record.status}）\ndelegationId: ${record.delegationId}\n${body}`
  })
  const text = [
    '<collaboration_results>',
    `你之前委派的 ${records.length} 个协作子任务已经结束，结果如下。请据此继续原来的工作；不要重复委派同样的任务。需要完整内容时调用 mcp__collaboration__get_delegation_results。`,
    '',
    ...lines,
    '</collaboration_results>',
  ].join('\n')
  const displayText = `【协作结果送达】${records.map((r) => `${r.title}（${STATUS_LABEL[r.status] ?? r.status}）`).join('、')}`
  return { text, displayText }
}

