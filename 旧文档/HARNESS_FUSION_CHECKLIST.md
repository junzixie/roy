# Harness 优点移植清单

## 🎯 目标

将 Arthur、EvoFlow、ZCode、WorkBuddy 的核心优点移植到 Roy。

---

## 📊 各 Harness 核心优点汇总

### **Arthur 的优点**
1. ✅ **极简快速架构**（已完成 - Phase 1 快速模式）
2. 🔄 **WorkBuddy 集成** - 从 `~/.workbuddy` 加载技能/专家/连接器
3. 🤝 **团队协作系统** - `team.js`
4. 📋 **工作流系统** - `workflows.js`
5. 💬 **群聊系统** - `groupchat.js`
6. 🤖 **Bot 集成** - Telegram/飞书/钉钉/微信（`bots.js`）
7. 📝 **简洁的系统提示词** - 做事标准、汇报风格
8. 👤 **人设系统** - 办公助手/编程搭档等预设
9. 📁 **项目系统** - 项目助手、项目记忆

### **EvoFlow 的优点**
1. 🎯 **84+ 公开技能库** - deep-research、canvas-design 等
2. 📊 **工作流画布** - 简单的 DAG 可视化（已有类似的 Flowise）
3. 🎨 **技能质量高** - 深度研究、设计创作等专业技能

### **ZCode 的优点**
1. 🔌 **MCP 集成** - 多个 MCP 服务器
2. 🎨 **UI 设计精美** - 可参考界面设计

### **WorkBuddy 的优点**
1. 📦 **技能市场** - `~/.workbuddy/skills`
2. 👥 **专家系统** - 预设的 Agent 人设
3. 🔌 **连接器系统** - MCP 服务器管理

---

## 🚀 移植优先级（按重要性排序）

### **P0 - 核心基础（本周完成）**

#### 1. WorkBuddy 集成系统
**目标：** Roy 能从 `~/.workbuddy` 加载技能、专家、连接器

**实施：**
```typescript
// apps/electron/src/main/lib/workbuddy-loader.ts

export interface WorkBuddySkill {
  name: string
  path: string
  description: string
  markdown: string
}

export interface WorkBuddyExpert {
  name: string
  role: string
  prompt: string
}

export interface WorkBuddyConnector {
  name: string
  mcpConfig: any
}

export class WorkBuddyLoader {
  private workbuddyPath = path.join(os.homedir(), '.workbuddy')
  
  loadSkills(): WorkBuddySkill[] { /* 扫描 skills/ */ }
  loadExperts(): WorkBuddyExpert[] { /* 扫描 plugins/marketplaces/*/agents/*.md */ }
  loadConnectors(): WorkBuddyConnector[] { /* 扫描 connectors-marketplace/ */ }
}
```

#### 2. 简洁的系统提示词
**目标：** 移植 Arthur 的做事标准和汇报风格

**实施：**
```typescript
// apps/electron/src/main/lib/system-prompts/work-style.ts

export const WORK_STYLE = {
  做事: [
    "能撤销、可验证的事直接做，不要反复确认",
    "删除、发布、付款等撤不回的事先停下来问",
    "「完成」指用户要的结果到手，不是做完当前这一步"
  ],
  写代码: [
    "先读后写：动手前读要改的代码",
    "只写需要的：能不写就不写",
    "像做手术一样改：每一行改动都对应用户的要求"
  ],
  汇报: [
    "先说结论，再说验证了什么",
    "句子完整、前后连贯",
    "日常回复简短直接"
  ]
}
```

#### 3. 人设系统
**目标：** 预设的 Agent 角色（办公助手、编程搭档等）

**实施：**
```typescript
// apps/electron/src/main/lib/personas.ts

export interface Persona {
  id: string
  name: string
  icon: string
  description: string
  prompt: string
}

export const BUILTIN_PERSONAS: Persona[] = [
  {
    id: 'office',
    name: '办公助手',
    icon: 'briefcase',
    description: '写材料、做表格、整理会议纪要',
    prompt: '你的身份：用户的办公助手...'
  },
  {
    id: 'coder',
    name: '编程搭档',
    icon: 'code',
    description: '资深工程师：先读代码再动手',
    prompt: '你的身份：用户的编程搭档...'
  }
]
```

---

### **P1 - 协作增强（下周）**

#### 4. 团队协作系统
从 Arthur 的 `team.js` 移植

#### 5. 项目系统
从 Arthur 的项目助手、项目记忆移植

---

### **P2 - 扩展功能（按需）**

#### 6. EvoFlow 技能库移植
选择性移植高质量技能

#### 7. Bot 集成
Telegram/飞书/钉钉等

#### 8. 群聊系统
多 Agent 对话

---

## 📁 文件结构规划

```
apps/electron/src/main/lib/
├── workbuddy/
│   ├── workbuddy-loader.ts       - WorkBuddy 加载器
│   ├── skill-importer.ts          - 技能导入器
│   ├── expert-manager.ts          - 专家管理器
│   └── connector-manager.ts       - 连接器管理器
│
├── system-prompts/
│   ├── work-style.ts              - 做事标准
│   ├── personas.ts                - 人设系统
│   └── prompt-builder.ts          - 提示词构建器
│
├── team/
│   ├── team-manager.ts            - 团队管理
│   ├── member-config.ts           - 成员配置
│   └── collaboration.ts           - 协作逻辑
│
└── project/
    ├── project-manager.ts         - 项目管理
    ├── project-memory.ts          - 项目记忆
    └── project-assistant.ts       - 项目助手
```

---

## ✅ 立即开始实施

### **今天的任务：P0 核心基础**

1. **WorkBuddy 加载器**（2-3 小时）
   - 扫描 `~/.workbuddy` 目录
   - 加载技能、专家、连接器
   - 集成到 Roy 的技能系统

2. **系统提示词**（1 小时）
   - 移植 Arthur 的做事标准
   - 集成到 Agent 配置

3. **人设系统**（1 小时）
   - 创建人设管理器
   - UI 界面（设置中选择人设）

---

准备好了吗？我现在开始实施！🚀
