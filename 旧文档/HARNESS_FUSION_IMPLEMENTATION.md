# Harness 优点移植 - 调整后方案

## 🎯 核心任务（今天完成）

### 1. WorkBuddy 资源内置化
**不使用加载器，直接复制到项目内**

```bash
apps/electron/resources/workbuddy/
├── skills/           - 18 个技能（从 ~/.workbuddy/skills 复制）
├── experts/          - 专家人设（从 marketplaces 提取）
├── connectors/       - MCP 连接器
└── index.ts          - 资源注册器
```

**实施步骤：**
1. 创建 `resources/workbuddy` 目录结构
2. 复制 ~/.workbuddy 的所有内容
3. 创建统一的资源管理器
4. 集成到 Pi 的技能系统

---

### 2. 系统提示词增强
**Roy 已有 system-prompt-manager.ts，补充 Arthur 的做事标准**

```typescript
// apps/electron/src/main/lib/system-prompts/arthur-work-style.ts

export const ARTHUR_WORK_STYLE = {
  做事: [
    "能撤销、可验证的事直接做（改文件、建草稿、查资料、跑测试），不要反复确认。",
    "需求有几种理解、而且会影响结果时，先把理解列出来；影响不大就选一个合理的默认。",
    "删除、发出去、付款、上线、改安全设置这类撤不回的事，先停下来问，一次问清。",
    "「完成」指用户要的结果到手，不是做完当前这一步：改了代码就跑一遍，改了界面就截图看。"
  ],
  
  写代码: [
    "先读后写：动手前读要改的代码、调用方、测试和配置，列出改动要波及的每一处。",
    "只写需要的：能不写就不写；项目里已有的、标准库有的、已装依赖有的优先用。",
    "像做手术一样改：每一行改动都对应用户的要求，不顺手改旁边的代码、注释和格式。",
    "不能省：信任边界上的校验、防止丢数据的错误处理、安全。"
  ],
  
  汇报: [
    "先说结论，再说验证了什么、没验证什么、还有什么风险。",
    "失败就说失败并给出关键报错；推断出来的标明是推断；绝不编造数据。",
    "句子完整、前后连贯，专业程度不打折；少用比喻，直接说事实和推理。",
    "日常回复简短直接，标题最多用四级（####）；一屏放不下的长内容写成文件。"
  ]
}
```

**集成到现有系统：**
```typescript
// 在 system-prompt-manager.ts 中添加内置提示词
export const BUILTIN_ARTHUR_STYLE: SystemPrompt = {
  id: 'arthur-work-style',
  name: 'Arthur 做事标准',
  content: buildArthurStylePrompt(),
  isBuiltin: true,
  createdAt: Date.now(),
  updatedAt: Date.now()
}
```

---

### 3. 人设系统 = WorkBuddy 专家
**从 WorkBuddy 专家提取人设**

```typescript
// apps/electron/src/main/lib/personas/persona-manager.ts

export interface Persona {
  id: string
  name: string
  role: string           // 专家角色
  description: string    // 简短描述
  prompt: string         // 完整提示词
  source: 'builtin' | 'workbuddy'
  marketplace?: string   // 来自哪个市场
}

// 从 WorkBuddy 专家转换为人设
function expertToPersona(expert: WorkBuddyExpert): Persona {
  return {
    id: expert.id,
    name: expert.name,
    role: expert.role,
    description: extractDescription(expert.prompt),
    prompt: expert.prompt,
    source: 'workbuddy',
    marketplace: expert.marketplace
  }
}

// 内置人设（从 Arthur）
export const BUILTIN_PERSONAS: Persona[] = [
  {
    id: 'office-assistant',
    name: '办公助手',
    role: '高级行政/业务助理',
    description: '写材料、做表格、整理会议纪要、回邮件',
    prompt: ARTHUR_OFFICE_ASSISTANT_PROMPT,
    source: 'builtin'
  },
  {
    id: 'coding-partner',
    name: '编程搭档',
    role: '资深全栈工程师',
    description: '先读代码再动手、改得小、跑过验证再说做完',
    prompt: ARTHUR_CODING_PARTNER_PROMPT,
    source: 'builtin'
  }
]
```

**UI 集成：**
```typescript
// 设置页面添加"人设选择"
apps/electron/src/renderer/components/settings/PersonaSelector.tsx

功能：
- 显示所有可用人设（内置 + WorkBuddy）
- 预览人设提示词
- 选择当前使用的人设
- 保存到会话配置
```

---

### 4. 子 Agent 延迟汇报
**增强 AgentOrchestrator 支持后台子任务**

```typescript
// apps/electron/src/main/lib/agent-subtask.ts

export interface SubTaskConfig {
  title: string
  prompt: string
  background: boolean    // 是否后台运行
  sessionId?: string
}

export class SubTaskManager {
  /**
   * 创建子任务
   */
  async createSubTask(config: SubTaskConfig) {
    const session = await this.sessionManager.create({
      sessionId: config.sessionId || `subtask-${Date.now()}`,
      parent: this.parentSessionId
    })
    
    if (config.background) {
      // 后台运行，不阻塞主任务
      this.runInBackground(session, config.prompt)
    } else {
      // 前台运行，等待完成
      return await this.runAndWait(session, config.prompt)
    }
  }
  
  /**
   * 后台运行
   */
  private async runInBackground(session: AgentSession, prompt: string) {
    // 在后台执行
    const result = await session.agent.run({
      role: 'user',
      content: prompt
    })
    
    // 完成后通知父会话
    await this.notifyParent({
      type: 'subtask_complete',
      sessionId: session.id,
      result
    })
  }
}
```

**工具集成：**
```typescript
// 添加 sub_task 工具
defineTool({
  name: 'sub_task',
  description: '派发子任务，可选择前台等待或后台执行',
  parameters: Type.Object({
    title: Type.String(),
    prompt: Type.String(),
    background: Type.Boolean({ default: false })
  }),
  async execute(id, params) {
    const result = await subTaskManager.createSubTask(params)
    
    if (params.background) {
      return { message: '子任务已在后台启动，完成后会自动汇报' }
    } else {
      return { message: '子任务完成', result }
    }
  }
})
```

---

## 📁 文件结构

```
apps/electron/
├── resources/
│   └── workbuddy/              ⬅️ 新增
│       ├── skills/             - 18 个技能
│       ├── experts/            - 专家人设
│       ├── connectors/         - MCP 连接器
│       └── index.ts
│
└── src/main/lib/
    ├── system-prompts/         ⬅️ 新增
    │   ├── arthur-work-style.ts
    │   └── prompt-builder.ts
    │
    ├── personas/               ⬅️ 新增
    │   ├── persona-manager.ts
    │   ├── builtin-personas.ts
    │   └── persona-ipc.ts
    │
    └── agent-subtask.ts        ⬅️ 新增
```

---

## ✅ 今天的任务清单

- [ ] **Task 1: WorkBuddy 资源复制**（1 小时）
  - [ ] 创建 `resources/workbuddy` 目录
  - [ ] 从 `~/.workbuddy` 复制所有内容
  - [ ] 创建资源索引文件

- [ ] **Task 2: 系统提示词增强**（30 分钟）
  - [ ] 创建 Arthur 做事标准提示词
  - [ ] 集成到 system-prompt-manager
  - [ ] 测试提示词加载

- [ ] **Task 3: 人设系统**（1 小时）
  - [ ] 创建 PersonaManager
  - [ ] 转换 WorkBuddy 专家为人设
  - [ ] 添加内置人设（办公助手、编程搭档）
  - [ ] 创建 UI 组件

- [ ] **Task 4: 子任务系统**（1.5 小时）
  - [ ] 创建 SubTaskManager
  - [ ] 添加 sub_task 工具
  - [ ] 实现后台运行和延迟汇报
  - [ ] 测试子任务功能

---

准备好了！现在开始实施 Task 1！🚀
