# Coze 一比一复刻到 Roy 实施计划

## 🎯 目标
在 Roy 中完整复刻 Coze（扣子）的所有功能，实现自动化视频生成工作流。

## 📋 Coze 核心功能清单

### 1. 工作流画布 (Workflow Canvas)
```
核心功能：
✅ 可视化节点编辑器
✅ 拖拽式节点连接
✅ 实时预览和调试
✅ 变量传递和数据流
✅ 错误处理和重试
✅ 条件分支和循环
✅ 并行执行
```

### 2. 节点类型 (Node Types)
```
基础节点：
├── 开始节点 (Start)          - 工作流入口
├── 结束节点 (End)            - 工作流出口
├── 代码节点 (Code)           - 执行 JavaScript/Python
├── HTTP 请求节点 (HTTP)       - 调用 API
├── 数据库节点 (Database)      - 查询数据库
├── LLM 节点 (LLM)            - 调用大模型
├── 插件节点 (Plugin)         - 调用插件/技能
├── 条件节点 (Condition)       - if/else 分支
├── 循环节点 (Loop)           - 遍历数组
├── 变量节点 (Variable)        - 设置/获取变量
├── 延时节点 (Delay)          - 等待
└── 消息节点 (Message)        - 发送通知

高级节点：
├── 知识库节点 (Knowledge)     - 查询知识库
├── 工作流节点 (Subflow)       - 调用子工作流
├── 定时触发 (Schedule)        - 定时执行
└── Webhook 触发 (Webhook)    - HTTP 触发
```

### 3. Bot 系统
```
功能：
✅ 多轮对话
✅ 上下文记忆
✅ 人格设定
✅ 开场白配置
✅ 提示词优化
✅ 多模态输入（文本/图片/语音）
```

### 4. 插件/技能系统
```
功能：
✅ 插件市场
✅ 自定义插件
✅ 插件参数配置
✅ 插件版本管理
✅ OAuth 授权
```

### 5. 知识库
```
功能：
✅ 文档上传
✅ 自动分段
✅ 向量化存储
✅ 语义检索
✅ 引用来源
```

### 6. 定时任务
```
功能：
✅ Cron 表达式
✅ 定时触发工作流
✅ 执行历史
✅ 失败重试
✅ 通知提醒
```

### 7. 数据管理
```
功能：
✅ 变量管理
✅ 数据表
✅ 文件存储
✅ 日志查看
✅ 调试工具
```

---

## 🚀 实施计划

### Phase 1: 工作流画布核心（最高优先级）

#### 1.1 画布引擎
```typescript
apps/electron/src/main/lib/workflow/
├── canvas-engine.ts         - 画布核心引擎
├── node-types.ts            - 所有节点类型定义
├── edge-manager.ts          - 连线管理
├── variable-manager.ts      - 变量管理
├── execution-engine.ts      - 执行引擎
└── debug-logger.ts          - 调试日志

使用库：
- @xyflow/react             - React Flow（画布渲染）
- zustand                   - 状态管理
- immer                     - 不可变数据
```

#### 1.2 UI 组件（完全模仿 Coze）
```typescript
apps/electron/src/renderer/components/workflow/
├── Canvas/
│   ├── Canvas.tsx           - 主画布
│   ├── Node.tsx             - 节点组件
│   ├── Edge.tsx             - 连线组件
│   ├── MiniMap.tsx          - 缩略图
│   └── Controls.tsx         - 控制栏
├── NodeLibrary/
│   ├── NodeLibrary.tsx      - 节点库侧边栏
│   ├── NodeCard.tsx         - 节点卡片
│   └── NodeSearch.tsx       - 节点搜索
├── PropertyPanel/
│   ├── PropertyPanel.tsx    - 属性面板
│   ├── NodeConfig.tsx       - 节点配置
│   └── VariableConfig.tsx   - 变量配置
├── ExecutionPanel/
│   ├── ExecutionLog.tsx     - 执行日志
│   ├── DebugInfo.tsx        - 调试信息
│   └── ErrorDisplay.tsx     - 错误显示
└── Toolbar/
    ├── Toolbar.tsx          - 顶部工具栏
    ├── SaveButton.tsx       - 保存按钮
    ├── RunButton.tsx        - 运行按钮
    └── DebugButton.tsx      - 调试按钮

设计风格：
- 完全模仿 Coze 的 UI
- 使用相同的配色方案
- 相同的交互体验
```

#### 1.3 节点实现
```typescript
apps/electron/src/main/lib/workflow/nodes/
├── StartNode.ts             - 开始节点
├── EndNode.ts               - 结束节点
├── CodeNode.ts              - 代码节点
├── HttpNode.ts              - HTTP 请求
├── LLMNode.ts               - LLM 调用
├── PluginNode.ts            - 插件调用
├── ConditionNode.ts         - 条件判断
├── LoopNode.ts              - 循环
├── VariableNode.ts          - 变量操作
├── DelayNode.ts             - 延时
├── MessageNode.ts           - 消息发送
├── KnowledgeNode.ts         - 知识库查询
├── SubflowNode.ts           - 子工作流
├── ScheduleNode.ts          - 定时触发
└── WebhookNode.ts           - Webhook 触发

每个节点接口：
interface WorkflowNode {
  id: string
  type: string
  label: string
  inputs: NodeInput[]        // 输入端口
  outputs: NodeOutput[]      // 输出端口
  config: NodeConfig         // 配置参数
  execute: (context: ExecutionContext) => Promise<any>
  validate: () => ValidationResult
}
```

---

### Phase 2: 技能/插件系统

#### 2.1 从 Arthur 移植视频生成技能
```bash
源位置：
D:/ai-projects/aixiangmu/Arthur/skills/ai-video-studio/

目标位置：
apps/electron/resources/skills/video/ai-video-studio/
├── SKILL.md                 - 技能描述
├── index.ts                 - 入口文件
├── generator.ts             - 生成器
├── publisher.ts             - 发布器
└── templates/               - 模板
```

#### 2.2 统一技能接口
```typescript
apps/electron/src/main/lib/skills/
├── skill-interface.ts       - 技能接口定义
├── skill-loader.ts          - 技能加载器
├── skill-executor.ts        - 技能执行器
└── skill-marketplace.ts     - 技能市场

接口定义（兼容 Coze）：
interface Skill {
  id: string
  name: string
  description: string
  version: string
  author: string
  icon: string
  
  // 输入参数定义
  inputs: {
    name: string
    type: 'string' | 'number' | 'boolean' | 'array' | 'object'
    required: boolean
    description: string
    default?: any
  }[]
  
  // 输出参数定义
  outputs: {
    name: string
    type: string
    description: string
  }[]
  
  // 执行函数
  execute: (inputs: any) => Promise<any>
  
  // OAuth 配置（如需要）
  oauth?: {
    authUrl: string
    tokenUrl: string
    scopes: string[]
  }
}
```

---

### Phase 3: Bot 系统

#### 3.1 对话 Bot
```typescript
apps/electron/src/main/lib/bot/
├── bot-engine.ts            - Bot 引擎
├── bot-memory.ts            - 对话记忆
├── bot-personality.ts       - 人格设定
├── bot-prompt.ts            - 提示词管理
└── bot-multimodal.ts        - 多模态处理

Bot 配置（模仿 Coze）：
interface BotConfig {
  name: string
  avatar: string
  description: string
  
  // 人格设定
  personality: {
    role: string             // 角色
    tone: string             // 语气
    background: string       // 背景
  }
  
  // 开场白
  greeting: string
  
  // 提示词
  systemPrompt: string
  
  // 关联工作流
  workflow?: string
  
  // 关联知识库
  knowledgeBases?: string[]
  
  // 可用插件
  plugins?: string[]
}
```

---

### Phase 4: 知识库系统

#### 4.1 文档管理
```typescript
apps/electron/src/main/lib/knowledge/
├── document-manager.ts      - 文档管理
├── chunking.ts              - 文档分段
├── embedding.ts             - 向量化
├── vector-store.ts          - 向量存储
├── retrieval.ts             - 检索引擎
└── citation.ts              - 引用生成

功能实现：
✅ 支持多种格式（PDF/Word/Markdown/TXT）
✅ 智能分段（保持语义完整）
✅ 向量化（使用 OpenAI/本地模型）
✅ 语义检索
✅ 引用来源追踪
```

---

### Phase 5: 定时任务系统

#### 5.1 调度器
```typescript
apps/electron/src/main/lib/scheduler/
├── cron-scheduler.ts        - Cron 调度
├── task-manager.ts          - 任务管理
├── execution-history.ts     - 执行历史
└── notification.ts          - 通知系统

功能：
✅ Cron 表达式支持
✅ 可视化时间选择器
✅ 执行历史记录
✅ 失败自动重试
✅ 邮件/Bot 通知
```

---

### Phase 6: 数据管理

#### 6.1 变量系统
```typescript
apps/electron/src/main/lib/data/
├── variable-store.ts        - 变量存储
├── data-table.ts            - 数据表
├── file-storage.ts          - 文件存储
└── log-viewer.ts            - 日志查看

功能：
✅ 全局变量
✅ 工作流变量
✅ 环境变量
✅ 数据表 CRUD
✅ 文件上传下载
```

---

## 🎬 你的用例：每日 AI 视频生成

### 工作流设计
```
[定时触发节点]
  trigger: 每天 8:00
  ↓
[HTTP 请求节点]
  name: 获取今日 AI 新闻
  url: https://api.example.com/ai-news/today
  method: GET
  output: news_data
  ↓
[LLM 节点]
  name: 生成视频脚本
  model: claude-opus-5-5
  prompt: "根据以下新闻生成一个3分钟的视频脚本: {{news_data}}"
  output: script
  ↓
[插件节点]
  name: 生成视频
  plugin: ai-video-studio
  inputs:
    script: {{script}}
    style: "科技新闻"
    duration: 180
    format: "1080p"
  output: video_file
  ↓
[插件节点]
  name: 发布到抖音
  plugin: douyin-publisher
  inputs:
    video: {{video_file}}
    title: "今日 AI 资讯"
    tags: ["AI", "科技", "新闻"]
  output: publish_result
  ↓
[消息节点]
  name: 发送通知
  type: email
  message: "视频已发布: {{publish_result.url}}"
  ↓
[结束节点]
```

---

## 📅 实施时间表

### Week 1-2: 画布核心 🔥
- [ ] 搭建 React Flow 画布
- [ ] 实现基础节点（Start/End/Code/HTTP/LLM/Plugin）
- [ ] 实现连线和数据流
- [ ] 实现执行引擎
- [ ] UI 完全模仿 Coze

### Week 3: 技能集成
- [ ] 从 Arthur 移植 ai-video-studio
- [ ] 实现统一技能接口
- [ ] 实现插件节点
- [ ] 实现抖音发布插件

### Week 4: 定时任务
- [ ] 实现 Cron 调度器
- [ ] 实现定时触发节点
- [ ] 实现执行历史
- [ ] 实现通知系统

### Week 5: 高级节点
- [ ] 实现条件节点
- [ ] 实现循环节点
- [ ] 实现变量节点
- [ ] 实现子工作流节点

### Week 6-7: Bot 系统
- [ ] 实现 Bot 引擎
- [ ] 实现对话记忆
- [ ] 实现人格设定
- [ ] 集成到工作流

### Week 8-9: 知识库
- [ ] 实现文档管理
- [ ] 实现向量化
- [ ] 实现检索引擎
- [ ] 实现知识库节点

### Week 10: 数据管理
- [ ] 实现变量系统
- [ ] 实现数据表
- [ ] 实现文件存储
- [ ] 实现日志查看

---

## 🎨 UI 设计参考

### Coze 的设计元素
```
布局：
├── 左侧：节点库（可折叠）
├── 中间：画布区域
├── 右侧：属性面板（可折叠）
└── 底部：执行日志（可折叠）

顶部工具栏：
├── 保存
├── 运行
├── 调试
├── 发布
├── 设置
└── 帮助

节点样式：
├── 圆角矩形
├── 输入输出端口
├── 图标 + 标题
├── 状态指示器（运行中/成功/失败）
└── hover 高亮

配色方案：
├── 主色：#4A7FFF（蓝色）
├── 成功：#52C41A（绿色）
├── 失败：#FF4D4F（红色）
├── 警告：#FAAD14（黄色）
└── 背景：#F5F5F5（浅灰）
```

---

## 🚀 立即开始

我将按照这个计划开始实施，首先创建画布核心。

需要你确认的最后几个问题：
1. **UI 库选择**：使用 Ant Design（Coze 用的）还是 Shadcn（Roy 当前用的）？
2. **向量化方案**：使用 OpenAI Embeddings 还是本地模型（如 text-embedding-ada-002）？
3. **数据库**：使用 SQLite（本地）还是其他？

确认后我立即开始编码！🎯
