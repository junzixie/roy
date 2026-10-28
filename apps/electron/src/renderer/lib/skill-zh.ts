/**
 * 技能的中文展示层
 *
 * 只影响界面显示，不改 SKILL.md 本身——Agent 读的仍然是原文。
 *
 * 取名优先级：技能自带的 `description_zh` / 本来就是中文的 description → 本文件对照表；
 * 标题和分组优先取对照表，查不到时回退到技能自己的 name / group。
 */

/** 界面上的分组顺序，与 Arthur 的划分保持一致，便于两边对照。 */
export const SKILL_GROUPS = [
  '写代码',
  '工程流程',
  '文档办公',
  '设计创作',
  '数据分析',
  '浏览器与自动化',
  '知识与学习',
  'Roy 平台',
  '其他',
] as const

export type SkillGroupName = (typeof SKILL_GROUPS)[number]

interface SkillZhEntry {
  /** 中文标题 */
  title: string
  /** 中文说明 */
  desc: string
  group: SkillGroupName
}

/**
 * 对照表。key 同时支持技能 slug（目录名）和 frontmatter 里的 name——
 * 两者不一定相同，比如 workbuddy 里目录是 skill_2053082401071824896、name 是 minimax-xlsx。
 */
const TABLE: Record<string, SkillZhEntry> = {
  // ===== Roy 自带 =====
  'agent-collaboration': {
    title: '协作子 Agent',
    desc: '需要并行探索多个方向、做对抗性审查，或有多件互不干扰的长任务时，拆成真实可见的子会话来跑。',
    group: 'Roy 平台',
  },
  automation: {
    title: '定时任务',
    desc: '把「定期做一次」「到点自动跑」「有变化告诉我」这类重复或延时的事，建成无人值守的定时任务。',
    group: 'Roy 平台',
  },
  'in-app-browser': {
    title: '内嵌浏览器',
    desc: '打开网页、站内搜索、点按钮、填表、截图，以及预览本地 HTML；登录后需要操作的站点也走它。',
    group: '浏览器与自动化',
  },
  'roy-coach': {
    title: '使用顾问',
    desc: '把你在 Roy 里遇到的摩擦、重复解释和低效流程，转成更顺手的用法或该沉淀下来的知识。',
    group: 'Roy 平台',
  },
  'knowledge-maintenance': {
    title: '知识维护',
    desc: '维护项目地图与长期协作记忆：把稳定偏好、决策和纠错落到 AGENTS.md、memory 或 Skill 里。',
    group: '知识与学习',
  },
  'prompt-clarifier': {
    title: '需求澄清',
    desc: '需求缺目标、范围、约束或验收标准时，先问少数关键问题，再整理成可执行的简报。',
    group: '工程流程',
  },
  'session-cleaner': {
    title: '会话清洗',
    desc: '把会话 JSONL 整理成可读的 Markdown 对话；超长会话支持概览、大纲、搜索和按轮次导出。',
    group: '知识与学习',
  },
  'tool-builder': {
    title: '自定义工具',
    desc: '交互式创建和管理对话模式里的自定义 HTTP 工具，也能调试、修复和删除已有工具。',
    group: 'Roy 平台',
  },

  // ===== 文档办公 =====
  docx: {
    title: 'Word 文档',
    desc: '创建、读取、编辑 Word 文档：目录、页码、批注、修订、查找替换、插图都覆盖。',
    group: '文档办公',
  },
  pdf: {
    title: 'PDF 处理',
    desc: '提取文字和表格、合并拆分、旋转、加水印、填表、加解密、OCR，以及生成新的 PDF。',
    group: '文档办公',
  },
  pptx: {
    title: 'PPT 演示文稿',
    desc: '创建、解析、编辑和分析 PowerPoint：模板、版式、备注、批注，也能合并或拆分。',
    group: '文档办公',
  },
  xlsx: {
    title: 'Excel 表格',
    desc: '创建、读取、编辑和分析表格：公式、格式、图表，以及把杂乱的表格数据整理成规范文件。',
    group: '数据分析',
  },
  'guizang-ppt-skill': {
    title: '网页版幻灯片',
    desc: '生成横向翻页的网页 PPT（单个 HTML），含 WebGL 背景、章节幕封、数据大字报等模板。',
    group: '设计创作',
  },

  // ===== 工程流程 =====
  'executing-plans': {
    title: '按计划执行',
    desc: '拿到写好的实施计划后，分批执行并在检查点停下来复核。',
    group: '工程流程',
  },
  'writing-plans': {
    title: '写实施计划',
    desc: '动手改代码之前，先把多步骤需求写成可执行的计划。',
    group: '工程流程',
  },
  'find-skills': {
    title: '查找技能',
    desc: '当用户问「有没有能做什么的技能」时，帮忙发现并安装合适的技能。',
    group: '工程流程',
  },
  'skill-creator': {
    title: '技能创建',
    desc: '新建、修改、评估和优化技能，也让技能的触发描述更准。',
    group: '工程流程',
  },
  brainstorming: {
    title: '头脑风暴',
    desc: '动手做新功能前，先把想法、需求和设计聊清楚。',
    group: '工程流程',
  },
  'systematic-debugging': {
    title: '系统化排查问题',
    desc: '遇到 bug、测试失败或奇怪行为时，先找根因再改，不靠猜。',
    group: '写代码',
  },
  'test-driven-development': {
    title: '测试驱动开发',
    desc: '写功能或修 bug 之前先写测试，再写实现。',
    group: '写代码',
  },
  'using-git-worktrees': {
    title: 'Git 工作树隔离',
    desc: '开始新功能时建一个独立工作树，不影响当前代码。',
    group: '写代码',
  },
  'verification-before-completion': {
    title: '完成前先验证',
    desc: '说「做完了」之前先跑命令确认结果，用证据说话。',
    group: '工程流程',
  },
  'requesting-code-review': {
    title: '请求代码审查',
    desc: '做完任务或合并前，请人审查改动是否符合要求。',
    group: '工程流程',
  },
  'receiving-code-review': {
    title: '处理审查意见',
    desc: '收到代码审查意见后先核实再改，不盲目照做。',
    group: '工程流程',
  },
  'dispatching-parallel-agents': {
    title: '并行分派子任务',
    desc: '几件互不相关的事同时交给多个子代理去做。',
    group: '工程流程',
  },
  'mcp-builder': {
    title: 'MCP 服务器开发',
    desc: '设计和开发高质量的 MCP 服务器，让 AI 接上外部服务。',
    group: '写代码',
  },
  'webapp-testing': {
    title: '网页应用测试',
    desc: '用 Playwright 打开本地网页应用测试功能、截图、看报错。',
    group: '浏览器与自动化',
  },
  'frontend-design': {
    title: '前端界面设计',
    desc: '做有设计感的生产级网页和界面，避免千篇一律的 AI 风格。',
    group: '设计创作',
  },

  // ===== WorkBuddy 技能 =====
  'browser-repro-local-webapp': {
    title: '本机网页问题复现',
    desc: '在真实浏览器里带登录态复现本地 Web 应用的 404、白屏、报错和渲染异常，并留下取证。',
    group: '浏览器与自动化',
  },
  'cc-switch-provider-permission': {
    title: 'CC Switch 权限模式',
    desc: '给 Claude / Codex / Gemini 等 CLI 的某个站点开启或排查「免审批 / bypassPermissions」。',
    group: '写代码',
  },
  'dev-expert': {
    title: '编程专家',
    desc: '全栈编程助手：API 设计、Bug 诊断、代码生成与审查、重构、测试和性能基准。',
    group: '写代码',
  },
  'dsh-plugin-install': {
    title: 'dsh 插件安装',
    desc: '给本机 DeepSeek Harness 安装、卸载和排查社区插件。',
    group: '写代码',
  },
  'local-vision-ocr': {
    title: '本地 OCR 读图',
    desc: '当前模型看不了图时，用本地 OCR 把图片转成文字继续任务。',
    group: '知识与学习',
  },
  'miniprogram-design-audit': {
    title: '小程序设计走查',
    desc: '对微信小程序做可量化的设计检查：对比度、字号梯度、间距、硬编码色值、触摸目标。',
    group: '设计创作',
  },
  'miniprogram-page-redesign': {
    title: '小程序页面重做',
    desc: '按设计稿批量重做微信小程序的多个页面，提供可重复的映射流程。',
    group: '设计创作',
  },
  'remotion-cjk-vertical-video': {
    title: '中文竖屏短视频',
    desc: '用 Remotion 生成抖音/小红书竖屏视频与封面：中文字体、9:16 安全区、BGM 接入。',
    group: '设计创作',
  },
  'wechat-miniprogram-tabbar-debug': {
    title: '小程序 tabBar 排查',
    desc: '诊断微信小程序自定义 tabBar 不生效、改了 WXSS 界面却不变这类静默失效问题。',
    group: '写代码',
  },
  'windows-desktop-tool-pyw': {
    title: '桌面小工具',
    desc: '把脚本做成带界面的桌面小程序，替掉用户看不懂的 .bat / .cmd。',
    group: '写代码',
  },
  'windows-proxy-port-blocked': {
    title: '代理端口未监听',
    desc: '排查 Windows 上代理客户端「进程活着但端口不监听」导致的 ERR_PROXY_CONNECTION_FAILED。',
    group: '浏览器与自动化',
  },
  'windows-safe-bulk-delete': {
    title: '安全批量删除',
    desc: '在 Windows 上安全删除大型目录，优先走回收站，保留反悔余地。',
    group: '工程流程',
  },
  'minimax-docx': {
    title: 'Word 文档（MiniMax）',
    desc: '创建、读取、编辑 Word 文档，支持目录、页码、批注和修订。',
    group: '文档办公',
  },
  'minimax-xlsx': {
    title: 'Excel 表格（MiniMax）',
    desc: '打开、创建、分析、校验表格文件，涵盖公式、格式与图表。',
    group: '数据分析',
  },
  'playwright-scraper-skill': {
    title: 'Playwright 网页抓取',
    desc: '用 Playwright 做带反爬对抗的网页抓取，适配复杂站点。',
    group: '浏览器与自动化',
  },
  'web-access': {
    title: '联网访问',
    desc: '统一处理所有联网动作：搜索、抓网页、登录后操作和网络交互。',
    group: '浏览器与自动化',
  },
  'markitdown-skill': {
    title: '文档转 Markdown',
    desc: '用微软 MarkItDown 把 PDF、Word、PPT、Excel、图片、音频和网页转成 Markdown。',
    group: '文档办公',
  },
  'grill-me': {
    title: '方案拷问',
    desc: '针对方案或设计持续追问，直到双方理解一致、每个分支都被想清楚。',
    group: '工程流程',
  },
  'a-stock-data': {
    title: 'A 股数据',
    desc: 'A 股全栈数据：行情、研报、资金面、龙虎榜、解禁与行业信号。',
    group: '数据分析',
  },
  'design-ui-designer': {
    title: 'UI 设计师',
    desc: '按设计原则产出界面方案与视觉稿，兼顾层级、间距与一致性。',
    group: '设计创作',
  },
  humanizer: {
    title: '去 AI 味',
    desc: '去掉文本里的 AI 写作痕迹，让表达更像人写的；支持润色与改写。',
    group: '设计创作',
  },
  'canvas-design': {
    title: '海报与视觉设计',
    desc: '按设计理念生成海报、插画等静态视觉作品，输出 PNG 或 PDF。',
    group: '设计创作',
  },
  'brand-guidelines': {
    title: '品牌规范',
    desc: '按品牌的配色与字体规范来做设计和文档。',
    group: '设计创作',
  },
  'doc-coauthoring': {
    title: '协作写文档',
    desc: '按结构化流程一起写提案、技术方案和决策文档。',
    group: '文档办公',
  },
  'internal-comms': {
    title: '内部沟通文案',
    desc: '写周报、项目进展、通知、FAQ 和事故报告等内部文案。',
    group: '文档办公',
  },
}

const CJK = /[\u4e00-\u9fff]/

function hasChinese(text: string | undefined): boolean {
  return Boolean(text && CJK.test(text))
}

function lookup(slug: string, name: string): SkillZhEntry | undefined {
  return TABLE[slug] ?? TABLE[name]
}

export interface LocalizedSkill {
  /** 中文标题 */
  title: string
  /** 中文说明 */
  desc: string
  /** 分组名（中文） */
  group: string
}

/**
 * 把技能元数据转成界面要显示的中文形态。
 *
 * 说明文字优先用技能自带的（很多技能本身已经是中文），标题和分组优先用对照表，
 * 都查不到时才回退到技能自己的 name / group。
 */
export function localizeSkill(skill: {
  slug: string
  name: string
  description?: string
  group?: string
}): LocalizedSkill {
  const entry = lookup(skill.slug, skill.name)
  const ownDesc = skill.description?.trim()

  return {
    title: entry?.title ?? skill.name,
    // 技能自带的说明是中文就直接用，避免对照表和实际内容打架
    desc: hasChinese(ownDesc) ? (ownDesc as string) : entry?.desc ?? ownDesc ?? '暂无说明',
    group: entry?.group ?? (skill.group?.trim() || '其他'),
  }
}
