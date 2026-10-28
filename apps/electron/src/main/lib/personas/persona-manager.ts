/**
 * 人设管理器
 *
 * 管理内置人设和 WorkBuddy 专家
 */

import type { WorkBuddyExpert } from '../workbuddy/resource-manager'
import { getBuiltinExperts } from '../workbuddy/resource-manager'

export interface Persona {
  id: string
  name: string
  role: string
  description: string
  prompt: string
  source: 'builtin' | 'workbuddy'
  icon?: string
  marketplace?: string
}

/**
 * 内置人设
 */
export const BUILTIN_PERSONAS: Persona[] = [
  {
    id: 'office-assistant',
    name: '办公助手',
    role: '高级行政/业务助理',
    description: '写材料、做表格、整理会议纪要、回邮件，结论先行、格式规整',
    icon: 'briefcase',
    source: 'builtin',
    prompt: `你的身份：用户的办公助手，像一个靠谱的高级行政 / 业务助理。

写法：结论先行，先给能直接用的结果，再补必要的说明；用户要的是能直接拿去用的东西，不是教程。

格式：汇报、方案、总结用「一、二、三」或编号分层，每条一句话说清；数据多的用表格；公文和正式材料用书面语，不用网络用语和表情。

邮件和消息：按「称呼 → 一句话说目的 → 要点 → 需要对方做什么、什么时候前 → 落款」写，语气礼貌但不啰嗦，给出可以直接复制的版本。

会议纪要：按「会议信息、结论、待办（谁、做什么、截止时间）、遗留问题」整理，待办一定要有负责人和时间，原文没有的写「待定」，不要编。

Excel / Word / PPT：能直接生成文件就生成文件（干活模式下用工具写到工作文件夹），表格给公式和填写说明，PPT 每页一个观点、标题就是结论。

数字、日期、人名、金额要和用户给的材料一致，拿不准的标出来让用户确认，绝不编造数据和出处。

用户只说了个大概时，先按最常见的办公场景做出一版，再列一两个可以调的地方，而不是先问一堆问题。`
  },

  {
    id: 'coding-partner',
    name: '编程搭档',
    role: '资深全栈工程师',
    description: '先读代码再动手、改得小、跑过验证再说做完',
    icon: 'code',
    source: 'builtin',
    prompt: `你的身份：用户的编程搭档，一个资深全栈工程师，做事按下面这条线来。

动手前：先读相关代码，弄清楚现有的写法、命名和依赖，再改；照着周围代码的风格写，不引入没必要的新依赖和抽象。

改动：只改完成任务需要的部分，改得小而准；不顺手重构、不改无关的格式；删代码前确认没人在用。

验证：改完自己跑一遍能跑的检查（编译、类型检查、测试、lint、实际运行），把结果如实说出来；没跑的明说没跑，不要说「应该可以」。

排错：先复现，再从报错和日志找根因，不靠猜；一次只改一个变量，修好后说清楚原因是什么。

代码说明：解释用中文，代码里的标识符、命令、报错原文保持原样；给命令时给能直接复制运行的完整命令（Windows 下优先 PowerShell 写法）。

安全：不提交密钥，不执行删库、强推、改系统设置这类撤不回的操作，除非用户明确要求；用户的数据先备份再动。

汇报：做完用几句话说改了哪些文件、为什么这么改、怎么验证的、还有什么风险或没做完的。`
  }
]

/**
 * 从 WorkBuddy 专家转换为人设
 */
function expertToPersona(expert: WorkBuddyExpert): Persona {
  // 从 prompt 提取描述（第一段非标题文本）
  const lines = expert.prompt.split('\n')
  let description = ''
  for (const line of lines) {
    if (line.trim() && !line.startsWith('#')) {
      description = line.trim()
      break
    }
  }

  return {
    id: expert.id,
    name: expert.name,
    role: expert.role,
    description: description || expert.role,
    prompt: expert.prompt,
    source: 'builtin',
    marketplace: expert.marketplace
  }
}

/**
 * 获取所有可用人设
 */
export function getAllPersonas(): Persona[] {
  // 内置人设
  const personas = [...BUILTIN_PERSONAS]

  // WorkBuddy 专家转为人设
  try {
    const experts = getBuiltinExperts()
    const workbuddyPersonas = experts.map(expertToPersona)
    personas.push(...workbuddyPersonas)
  } catch (error) {
    console.error('[Persona] 加载 WorkBuddy 专家失败', error)
  }

  return personas
}

/**
 * 根据 ID 获取人设
 */
export function getPersonaById(id: string): Persona | null {
  const personas = getAllPersonas()
  return personas.find(p => p.id === id) || null
}

/**
 * 获取内置人设
 */
export function getBuiltinPersonas(): Persona[] {
  return BUILTIN_PERSONAS
}

/**
 * 获取 WorkBuddy 人设
 */
export function getWorkbuddyPersonas(): Persona[] {
  try {
    const experts = getBuiltinExperts()
    return experts.map(expertToPersona)
  } catch (error) {
    console.error('[Persona] 加载 WorkBuddy 人设失败', error)
    return []
  }
}
