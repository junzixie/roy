/**
 * 工作模式（AI 怎么干活）和运行方式（内核跑在哪个进程）是两件事，分开选。
 * 主进程的解析逻辑见 main/lib/adapters/mode-switching-adapter.ts，两边保持一致。
 */

export type AgentWorkMode = 'native' | 'standard' | 'deepseek'
export type AgentRuntimeMode = 'fast' | 'enterprise'

export const WORK_MODE_ORDER: AgentWorkMode[] = ['native', 'standard', 'deepseek']

export const WORK_MODE_UI: Record<AgentWorkMode, { label: string; desc: string; pro?: boolean }> = {
  native: { label: '原生模式', desc: 'Roy 几乎不加东西，只给基础工具和最少的规则，体验模型本来的样子' },
  standard: { label: '标准模式', desc: 'Roy 完整能力：浏览器、MCP、技能、日程都可用' },
  deepseek: { label: 'DeepSeek 优化', desc: '仅限 DeepSeek 模型：简单问答自动降低思考强度，起标题等杂活交给 DeepSeek Flash，更省钱、回复更快', pro: true },
}

export const RUNTIME_MODE_UI: Record<AgentRuntimeMode, { label: string; desc: string }> = {
  fast: { label: '快速', desc: '内核在主程序里跑，回复更快、更省内存（推荐）' },
  enterprise: { label: '隔离', desc: '每个对话单独一个进程，卡住不拖垮窗口，适合很长的任务' },
}

interface ModeSettings { workMode?: string; agentMode?: string }

/** 读工作模式；旧版「精简模式」（agentMode = slim）视为原生模式 */
export function readWorkMode(s: ModeSettings): AgentWorkMode {
  if (s.workMode === 'native' || s.workMode === 'standard' || s.workMode === 'deepseek') return s.workMode
  return s.agentMode === 'slim' ? 'native' : 'standard'
}

export function readRuntimeMode(s: ModeSettings): AgentRuntimeMode {
  return s.agentMode === 'enterprise' ? 'enterprise' : 'fast'
}

/** 选工作模式时顺手把旧的 slim 改回 fast，免得运行方式显示错 */
export function workModePatch(next: AgentWorkMode, s: ModeSettings): { workMode: AgentWorkMode; agentMode?: AgentRuntimeMode } {
  return s.agentMode === 'slim' ? { workMode: next, agentMode: 'fast' } : { workMode: next }
}
