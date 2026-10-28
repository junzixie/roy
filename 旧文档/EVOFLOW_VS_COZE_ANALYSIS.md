# EvoFlow vs Coze 工作流对比分析

## 🔍 EvoFlow 工作流实现分析

### 1. 核心架构
```python
# 基于 platform_workflow_schema.py

工作流结构：
{
  "name": "工作流名称",
  "description": "描述",
  "goal": "总体目标（支持 {{变量}} 占位符）",
  "steps": [
    {
      "ref": "步骤ID",
      "name": "步骤名称",
      "goal": "步骤目标",
      "assigned_agent": "分配的 Agent",
      "depends_on": ["前置步骤ref"]  // DAG 依赖
    }
  ],
  "parameters": [
    {
      "name": "参数名",
      "label": "显示标签",
      "type": "text",
      "default": "默认值",
      "required": true
    }
  ]
}
```

### 2. 节点类型
```
EvoFlow 的节点 = Agent 步骤（Agent Steps）：
- 每个节点是一个 Agent 执行单元
- 节点通过 depends_on 构成 DAG（有向无环图）
- 节点分配给特定的 Agent（智能体员工）
- 节点有 goal（目标）而不是具体指令
```

### 3. 执行模式
```
工作流类型：
1. workflow.generate  - 自动生成（傻瓜式）
2. workflow.create    - 手工创建
3. workflow.duplicate - 复制现有工作流

执行方式：
- workflow.run        - 运行工作流
- 支持 DAG 并行执行
- 失败可恢复
- 过程可验收
```

### 4. 可视化画布
```javascript
// evopanel/src/components/app-workflow-canvas.js

特点：
- 有画布组件（app-workflow-canvas.js）
- 显示步骤和依赖关系
- 但功能相对简单
```

---

## 📊 EvoFlow vs Coze 对比

### ✅ EvoFlow 类似 Coze 的地方

| 功能 | EvoFlow | Coze | 说明 |
|------|---------|------|------|
| **工作流画布** | ✅ 有 | ✅ 有 | EvoFlow 有但较简单 |
| **DAG 依赖** | ✅ 有 | ✅ 有 | 都支持依赖关系 |
| **变量系统** | ✅ {{变量}} | ✅ {{变量}} | 语法相同 |
| **Agent 分配** | ✅ assigned_agent | ✅ 有 | EvoFlow 更强调 Agent |
| **参数化** | ✅ parameters | ✅ 有 | 都支持 |
| **发布/运行** | ✅ publish/run | ✅ 有 | 都有生命周期 |

### ❌ EvoFlow 不同于 Coze 的地方

| 功能 | EvoFlow | Coze | 差异 |
|------|---------|------|------|
| **节点类型** | ❌ 只有 Agent 步骤 | ✅ 15+ 种节点 | Coze 更丰富 |
| **代码节点** | ❌ 没有 | ✅ JavaScript/Python | Coze 可执行代码 |
| **HTTP 节点** | ❌ 没有 | ✅ 有 | Coze 可直接调 API |
| **条件分支** | ❌ 没有明确支持 | ✅ Condition Node | Coze 更灵活 |
| **循环节点** | ❌ 没有 | ✅ Loop Node | Coze 可遍历 |
| **知识库节点** | ❌ 没有 | ✅ Knowledge Node | Coze 集成知识库 |
| **Webhook 触发** | ❌ 没有 | ✅ 有 | Coze 支持 |
| **Bot 系统** | ⚠️ 有对话但不完整 | ✅ 完整 Bot | Coze 更强 |
| **可视化编辑** | ⚠️ 简单 | ✅ 强大 | Coze UI 更友好 |

---

## 🎯 总结

### EvoFlow 的特点
```
✅ 优点：
1. 强调 Agent Teams（智能体员工）
2. 长任务管理（Plan/Goal 模式）
3. 失败恢复机制
4. 多 Agent 协作
5. 工作空间和代码索引

❌ 局限：
1. 工作流节点类型单一（只有 Agent 步骤）
2. 没有代码/HTTP/条件/循环等通用节点
3. 可视化画布功能较弱
4. 没有完整的 Bot 人格系统
5. 没有知识库集成到工作流
```

### 与 Coze 的差距
```
Coze 的优势：
1. ✅ 节点类型丰富（15+ 种）
2. ✅ 可视化编辑器强大
3. ✅ Bot 系统完整（人格、记忆、开场白）
4. ✅ 知识库深度集成
5. ✅ 插件市场完善
6. ✅ 多模态支持
7. ✅ 定时任务友好
8. ✅ 数据表管理

EvoFlow 不是 Coze 的复刻！
- EvoFlow 是面向长任务的 Agent Runtime
- Coze 是全能的 AI Bot 开发平台
```

---

## 🚀 我们的实施策略

### 融合 EvoFlow 和 Coze 的优点

```typescript
我们的目标：
├── 从 Coze 学习
│   ✅ 完整的节点类型（15+）
│   ✅ 强大的可视化画布
│   ✅ Bot 系统
│   ✅ 知识库
│   └── 插件市场
│
├── 从 EvoFlow 学习
│   ✅ Agent Teams（智能体员工）
│   ✅ 长任务管理（Plan/Goal）
│   ✅ 失败恢复机制
│   └── 工作空间
│
└── 从 Arthur 学习
    ✅ 工作流系统（已有基础）
    ✅ 团队协作
    └── 视频生成技能
```

---

## 📋 实施计划修订

### Phase 1: 工作流画布（学习 Coze）
```typescript
实现 Coze 的完整节点系统：
✅ 开始/结束节点
✅ 代码节点（JavaScript/Python）
✅ HTTP 请求节点
✅ LLM 节点
✅ 插件节点
✅ 条件节点
✅ 循环节点
✅ 变量节点
✅ 延时节点
✅ 消息节点

+ 保留 EvoFlow 的 Agent 步骤节点
```

### Phase 2: Agent Teams（学习 EvoFlow）
```typescript
实现 EvoFlow 的智能体员工：
✅ Agent 分配机制
✅ 多 Agent 协作
✅ 长任务管理

+ 融合 Arthur 的 team.js
```

### Phase 3: Bot + 知识库（学习 Coze）
```typescript
实现 Coze 的完整功能：
✅ Bot 人格系统
✅ 对话记忆
✅ 知识库集成
✅ 多模态支持
```

---

## 🎬 你的视频生成用例

### 使用 Coze 风格的工作流
```
[定时触发节点] 每天 8:00
  ↓
[HTTP 请求节点] 获取 AI 新闻
  url: https://api.example.com/ai-news
  method: GET
  output: news_data
  ↓
[LLM 节点] 生成视频脚本
  model: claude-opus-5-5
  prompt: "根据新闻生成脚本: {{news_data}}"
  output: script
  ↓
[插件节点] 生成视频（ai-video-studio）
  inputs:
    script: {{script}}
    style: "科技新闻"
  output: video_file
  ↓
[插件节点] 发布到抖音
  inputs:
    video: {{video_file}}
    title: "今日AI资讯"
  output: result
  ↓
[消息节点] 发送通知
  message: "视频已发布: {{result.url}}"
```

### 也可以使用 EvoFlow 风格（Agent 步骤）
```
[Agent 步骤] assigned_agent: researcher
  goal: 收集今日 AI 新闻并整理
  ↓
[Agent 步骤] assigned_agent: writer
  goal: 根据新闻生成视频脚本
  depends_on: [researcher]
  ↓
[Agent 步骤] assigned_agent: video_producer
  goal: 使用 ai-video-studio 生成视频
  depends_on: [writer]
  ↓
[Agent 步骤] assigned_agent: publisher
  goal: 发布视频到抖音并通知
  depends_on: [video_producer]
```

---

## ✅ 结论

**EvoFlow ≠ Coze**

- **EvoFlow**: 面向长任务的 Agent Runtime，强调 Agent Teams
- **Coze**: 全能 AI Bot 平台，节点类型丰富，可视化强大

**我们的策略：一比一复刻 Coze，并融合 EvoFlow 和 Arthur 的优点**

---

## 🚀 下一步

请确认技术选型：
1. **UI 库**：Shadcn/UI（Roy 当前）还是 Ant Design（Coze 用的）？
2. **向量化**：OpenAI API 还是本地模型？
3. **数据库**：SQLite 还是 IndexedDB？

确认后立即开始实施！🎯
