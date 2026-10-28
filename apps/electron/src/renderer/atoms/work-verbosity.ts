/**
 * 干活时显示多少（照 Arthur 的「静默 / 清单 / 细节」）
 *
 * - 静默：一轮只看问题和答案，中间过程收成一行「执行过程」，跑的时候这一行显示正在做什么
 * - 细节：照 Claude / FeiBo，每一步单独一行默认折叠；思考收成一行，计划卡片排在对话里打勾
 * - 完整：每一步都展开，思考全文和命令输出都看得到
 */
import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'

export type WorkVerbosity = 'quiet' | 'list' | 'detail'

export const workVerbosityAtom = atomWithStorage<WorkVerbosity>('roy:work-verbosity', 'quiet')

export const WORK_VERBOSITY_ORDER: WorkVerbosity[] = ['quiet', 'list', 'detail']

export const WORK_VERBOSITY_LABELS: Record<WorkVerbosity, string> = {
  quiet: '静默',
  list: '细节',
  detail: '完整',
}

export const WORK_VERBOSITY_HINTS: Record<WorkVerbosity, string> = {
  quiet: '进展说明和答案保持可见，思考与工具过程折叠，想看再点开',
  list: '每一步单独一行、默认折叠：思考、每条命令各占一行，点开看详情；计划排在对话里打勾',
  detail: '每一步都展开，思考全文和命令输出都看得到',
}

export function nextWorkVerbosity(current: WorkVerbosity): WorkVerbosity {
  const i = WORK_VERBOSITY_ORDER.indexOf(current)
  return WORK_VERBOSITY_ORDER[(i + 1) % WORK_VERBOSITY_ORDER.length]!
}

/** 排队中的会话：sessionId → 前面还有几个、上限多少（主进程 run_queued 事件写入） */
export const agentRunQueueAtom = atom<Map<string, { ahead: number; limit: number }>>(new Map())
