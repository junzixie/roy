/**
 * 简单回合降档：判断与档位计算（与协议无关）。
 *
 * 动机来自实测：Roy 的 2002 次请求里 `output < 200` 占 42.1%，大量是「继续」「好」
 * 「改一下」这类不需要深度推理的回合，却按用户选的档位在跑。这套逻辑原本只存在于
 * DeepSeek 优化模式，标准模式和其他渠道完全没享受到。
 *
 * 这里只负责「判断 + 算出该用哪一档」，不写任何 provider 字段。落字段仍由各 provider
 * 自己的注入器完成（`output_config.effort` / `reasoning_effort` / `reasoning.effort`），
 * 避免这里长成第二套协议实现。
 *
 * 只降不升：`off` / `minimal` / `low` 保持不动，`xhigh` / `max` 是用户明确要的最强档
 * 也不动——用户选了 max 却被悄悄降档，属于违背意图。
 */

type ProviderPayload = Record<string, unknown>

/** 判断「简单回合」用的参数。默认值面向标准模式，DeepSeek 路径传入自己的口径。 */
export interface SimpleTurnOptions {
  /** 用户文字长度上限（字符） */
  maxChars?: number
  /** 命中即视为需要认真推理，不降档 */
  complexHint?: RegExp
}

/**
 * 标准模式的判定口径。
 *
 * 比 DeepSeek 路径多几个词（实现 / 修复 / 迁移 / 测试）：这些任务一旦降档，模型容易
 * 只改表面不改根因，返工成本远高于省下的那点思考 token。
 */
const DEFAULT_MAX_CHARS = 40
const DEFAULT_COMPLEX_HINT = /(为什么|原因|分析|设计|架构|方案|重构|排查|调试|debug|bug|报错|错误|优化|性能|证明|推导|算法|比较|评估|review|审查|计划|规划|实现|修复|迁移|测试)/i

/**
 * 默认降档表（面向 OpenAI 系列：真实存在 medium 档）。
 *
 * DeepSeek 不能共用这张表：它的档位集合是 `off / low / high / xhigh / max`，没有
 * `medium`；拿 `medium` 当中转会被 normalize 折回 `high`，等于没降（这个 bug 在
 * DeepSeek 路径上已经踩过一次）。因此 DeepSeek 自己传 `high → low`。
 */
export const DEFAULT_SIMPLE_TURN_DOWNGRADE: Record<string, string> = {
  high: 'medium',
  xhigh: 'high',
}

/**
 * DeepSeek 专用降档表。
 *
 * 只能落到真实存在的档位。`high → low` 是一次降两档，看起来激进，但 DeepSeek 的
 * low 实际上就是「普通思考」，短指令用它完全够用，而 high 会真的展开长推理。
 * `xhigh` / `max` 不动：那是用户明确要的最强档。
 */
export const DEEPSEEK_SIMPLE_TURN_DOWNGRADE: Record<string, string> = {
  high: 'low',
  medium: 'low',
}

function isProviderPayload(payload: unknown): payload is ProviderPayload {
  return typeof payload === 'object' && payload !== null && !Array.isArray(payload)
}

/**
 * 本次请求是不是「简单回合」。
 *
 * 三个条件同时成立才算：
 * 1. 最后一条消息是 user 自己打的文字（不是工具结果）——工具循环中途一律不降档，
 *    那说明模型正在干活，降档会拖长整条任务；
 * 2. 文字足够短；
 * 3. 不含需要深入推理的词。
 *
 * 只看最后一段文字：Roy 每条 user 消息前面会拼实时环境信息，那些不是用户意图。
 */
export function isSimpleTurn(payload: unknown, options: SimpleTurnOptions = {}): boolean {
  if (!isProviderPayload(payload) || !Array.isArray(payload.messages)) return false
  const messages = payload.messages as Array<{ role?: unknown; content?: unknown }>
  const last = messages[messages.length - 1]
  if (!last || last.role !== 'user') return false

  let text = ''
  if (typeof last.content === 'string') {
    text = last.content
  } else if (Array.isArray(last.content)) {
    for (const block of last.content as Array<{ type?: unknown; text?: unknown }>) {
      // 工具结果说明在工具循环里，不是新的一轮用户输入
      if (block?.type === 'tool_result') return false
      if (block?.type === 'text' && typeof block.text === 'string') text = block.text
    }
  }

  const userText = text.split(/\n{2,}/).pop()?.trim() ?? ''
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS
  if (!userText || userText.length > maxChars) return false
  const hint = options.complexHint ?? DEFAULT_COMPLEX_HINT
  // 正则可能带 /g，复用 lastIndex 会漏匹配，这里统一重置
  hint.lastIndex = 0
  return !hint.test(userText)
}

/**
 * 算出本轮实际要用的档位。
 *
 * 返回 `undefined` 表示「不干预」——调用方据此跳过注入，保持 payload 不变。
 */
export function resolveSimpleTurnLevel(
  currentLevel: string | undefined,
  payload: unknown,
  options: SimpleTurnOptions & { downgradeMap?: Record<string, string> } = {},
): string | undefined {
  if (!currentLevel) return undefined
  if (!isSimpleTurn(payload, options)) return undefined
  const map = options.downgradeMap ?? DEFAULT_SIMPLE_TURN_DOWNGRADE
  return map[currentLevel]
}
