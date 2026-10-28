# Roy 融合实施路线图

## ✅ Phase 0: 核心优化（已完成）

### 完成项
- [x] 修复进程隔离问题（.env: ROY_AGENT_RUNTIME=in-process）
- [x] 修复队列重试问题（agent-queue-coordinator.ts: 最多 5 次重试）
- [x] 修复停止机制（agent-force-stop.ts: 5 秒超时强制停止）
- [x] 修复环境变量问题（注释掉 ANTHROPIC_* 删除代码）
- [x] **升级 Pi 内核到 1.2.0** ✅

### 验证
```bash
cd "C:/Users/Administrator/Downloads/Roy-main 原本/Roy-main"
bun run dev
```

---

## 🎯 Phase 1: 自动化视频生成工作流（核心需求）

### 目标
实现类似扣子（Coze）的工作流画布，用于每天自动生成和发布视频。

### 1.1 工作流画布系统（2 周）

#### 核心功能
```typescript
apps/electron/src/main/lib/workflow/
├── workflow-canvas.ts          - 可视化画布
├── workflow-node.ts            - 节点系统
├── workflow-edge.ts            - 连线系统
├── workflow-executor.ts        - 执行引擎
├── workflow-scheduler.ts       - 定时调度
└── workflow-storage.ts         - 持久化存储

节点类型：
- Input Node          - 输入节点（接收参数）
- Skill Node          - 技能节点（调用 Skill）
- Condition Node      - 条件节点（if/else）
- Loop Node           - 循环节点
- Output Node         - 输出节点（生成文件）
- Schedule Node       - 定时节点（每天执行）
```

#### 画布 UI
```typescript
apps/electron/src/renderer/components/workflow-canvas/
├── Canvas.tsx               - 画布主组件
├── Node.tsx                 - 节点组件
├── Edge.tsx                 - 连线组件
├── NodeLibrary.tsx          - 节点库（拖拽）
├── PropertyPanel.tsx        - 属性面板
└── ExecutionLog.tsx         - 执行日志

使用库：
- @xyflow/react             - 流程图库（已在 Arthur 中使用）
- 参考扣子的 UI 设计
```

### 1.2 视频生成 Skill 集成

#### 从 Arthur 移植视频相关技能
```bash
# Arthur 中的视频技能位置
D:/ai-projects/aixiangmu/Arthur/skills/

需要移植的技能：
- ai-video-studio           - 多素材快切解说视频
- faceless-explainer        - 无面讲解视频
- general-video             - 自定义视频
- hyperframes               - 视频框架
- hyperframes-animation     - 动画系统
- media-use                 - 媒体处理
```

#### 移植到 Roy
```typescript
apps/electron/src/main/lib/skills/video/
├── ai-video-studio/        - 从 Arthur 移植
├── faceless-explainer/     - 从 Arthur 移植
├── video-generator.ts      - 统一生成器
└── video-publisher.ts      - 发布器（发布到平台）

集成点：
- 在工作流中作为 Skill Node
- 输入：主题、风格、素材
- 输出：生成的视频文件
```

### 1.3 自动化调度系统

#### 定时任务
```typescript
apps/electron/src/main/lib/scheduler/
├── cron-scheduler.ts       - Cron 调度器
├── task-queue.ts           - 任务队列
└── execution-history.ts    - 执行历史

功能：
✅ 每天定时执行工作流
✅ 重试机制
✅ 执行日志
✅ 失败通知
```

#### 示例工作流：每日视频生成
```
[定时触发：每天 8:00]
    ↓
[输入节点：读取今日热点]
    ↓
[Skill 节点：生成视频脚本]
    ↓
[Skill 节点：ai-video-studio 生成视频]
    ↓
[输出节点：保存视频文件]
    ↓
[Skill 节点：发布到平台]
```

---

## 👥 Phase 2: 团队协作融合（2 周）

### 2.1 分析现状

#### Arthur 的团队系统
```javascript
// D:/ai-projects/aixiangmu/Arthur/electron/team.js

特点：
✅ 成员定义（角色、模型、技能、MCP）
✅ 经理派发任务
✅ 并行执行
✅ 依赖管理
✅ 结果汇总
```

#### EvoFlow 的智能体员工
```bash
# 需要找到 EvoFlow 源码位置分析
D:/ruanjian/EvoFlow/binaries/evoflow-gateway/

待分析：
- 智能体员工定义
- 工作流集成方式
- 与 Arthur 的差异
```

### 2.2 融合设计
```typescript
apps/electron/src/main/lib/team/
├── team-manager.ts          - 团队管理（融合 Arthur + EvoFlow）
├── team-member.ts           - 成员定义
├── team-executor.ts         - 执行引擎
├── team-coordinator.ts      - 协调器
├── team-roster.ts           - 成员花名册
└── team-workflow.ts         - 工作流集成

核心接口：
interface TeamMember {
  id: string
  name: string
  role: string                // 角色描述
  model: string               // 使用的模型
  skills: string[]            // 常用技能
  mcp: string[]               // MCP 服务
  expert?: string             // 专家人设
  avatar?: string             // 头像
  
  // EvoFlow 特性
  autonomy?: 'low' | 'medium' | 'high'  // 自主程度
  specialization?: string[]   // 专业领域
}

interface Team {
  manager: string             // 经理使用的模型
  members: TeamMember[]       // 团队成员
  workflow?: string           // 关联的工作流
}
```

---

## 📚 Phase 3: 技能生态完整移植（3 周）

### 3.1 WorkBuddy 完整移植

#### 不使用导入器，直接内置
```typescript
apps/electron/src/main/lib/skills/workbuddy/
├── skills/                  - 完整技能库（直接复制）
├── experts/                 - 专家人设库
├── connectors/              - 连接器库
├── marketplace/             - 市场数据
└── loader.ts                - 加载器

实施方式：
1. 从 ~/.workbuddy/ 复制所有技能
2. 内置到 Roy 资源目录
3. 不依赖 WorkBuddy 安装
4. 首次运行时自动加载
```

#### 目录结构
```
apps/electron/resources/workbuddy/
├── skills/                  - 所有技能（~100+）
│   ├── office/             - 办公协同
│   ├── dev-tools/          - 开发工具
│   ├── data-analysis/      - 数据分析
│   ├── design/             - 产品设计
│   ├── marketing/          - 营销增长
│   ├── content/            - 内容创作
│   └── ...
├── experts/                 - 专家人设（~50+）
└── connectors/              - MCP 连接器（~30+）
```

### 3.2 Arthur 技能生态

#### 识别技能来源
```typescript
apps/electron/src/main/lib/skills/arthur/
├── builtin/                 - Arthur 原创技能
├── mapped/                  - 映射的技能（标注来源）
│   ├── from-evoflow/       - 来自 EvoFlow
│   ├── from-workbuddy/     - 来自 WorkBuddy
│   └── from-codex/         - 来自 Codex
└── custom/                  - 用户自定义

元数据标注：
{
  name: "skill-name",
  source: "arthur-builtin" | "evoflow" | "workbuddy" | "custom",
  version: "1.0.0",
  author: "...",
  mappedFrom?: "原始技能名"
}
```

### 3.3 统一技能系统
```typescript
apps/electron/src/main/lib/skills/
├── skill-loader.ts          - 统一加载器
├── skill-registry.ts        - 技能注册表
├── skill-resolver.ts        - 冲突解决
├── skill-metadata.ts        - 元数据管理
├── skill-search.ts          - 技能搜索
└── skill-cache.ts           - 缓存管理

功能：
✅ 多来源技能统一管理
✅ 自动去重（相同名称/功能）
✅ 版本管理
✅ 依赖解析
✅ 快速搜索
✅ 按需加载
```

---

## 🤖 Phase 4: Bot 集成评估（1 周）

### 4.1 评估 Roy 现状
```bash
# 检查 Roy 的 Bot 集成
apps/electron/src/main/lib/bots/

当前已有：
- feishu-bot.ts             - 飞书（需要验证功能完整性）

缺失：
- telegram-bot.ts           - Telegram
- dingtalk-bot.ts          - 钉钉
- wechat-bot.ts            - 微信
```

### 4.2 从 Arthur 移植
```typescript
apps/electron/src/main/lib/bots/
├── bot-manager.ts           - Bot 管理器（从 Arthur）
├── telegram-bot.ts          - Telegram（从 Arthur）
├── dingtalk-bot.ts         - 钉钉（从 Arthur）
├── feishu-bot.ts           - 飞书（优化现有）
├── wechat-bot.ts           - 微信（从 Arthur，可选）
└── bot-commands.ts         - 命令系统

命令系统：
/new 标题        - 开新会话
/list            - 最近会话
/switch 序号     - 切换会话
/project 名字    - 换项目
/stop            - 停止任务
/now             - 当前会话
/y 或 /n         - 批准/拒绝
```

---

## 🏢 Phase 5: 企业功能（低优先级，1 周）

### 可选实施
```typescript
apps/electron/src/main/lib/enterprise/
├── feedback.ts              - 反馈系统（参考 ZCode）
├── analytics.ts             - 使用分析
├── licensing.ts             - 许可证管理
└── multi-tenant.ts          - 多租户（如需要）

根据实际需求决定是否实施
```

---

## 📅 实施时间表

### Week 1-2: 自动化视频生成工作流 🔥
- [ ] 工作流画布系统
- [ ] 节点系统（Input/Skill/Output/Schedule）
- [ ] 从 Arthur 移植视频技能
- [ ] 定时调度系统
- [ ] **目标：实现每日自动生成视频**

### Week 3-4: 团队协作融合
- [ ] 分析 Arthur 和 EvoFlow 团队系统
- [ ] 设计融合方案
- [ ] 实现统一团队管理
- [ ] 集成到工作流

### Week 5-7: 技能生态完整移植
- [ ] WorkBuddy 完整复制和内置
- [ ] Arthur 技能标注来源
- [ ] 统一技能加载系统
- [ ] 技能搜索和管理 UI

### Week 8: Bot 集成
- [ ] 评估 Roy 现状
- [ ] 从 Arthur 移植缺失的 Bot
- [ ] 统一命令系统

### Week 9: 企业功能（可选）
- [ ] 根据需求选择性实施

---

## 🎯 当前重点：自动化视频生成工作流

### 立即开始的任务

#### Task 1: 创建工作流画布基础
```bash
# 创建目录结构
mkdir -p apps/electron/src/main/lib/workflow
mkdir -p apps/electron/src/renderer/components/workflow-canvas

# 从 Arthur 复制相关代码
# Arthur 已有部分画布实现，需要评估和优化
```

#### Task 2: 从 Arthur 移植视频技能
```bash
# 复制视频相关技能
# 位置：D:/ai-projects/aixiangmu/Arthur/skills/
# 目标：apps/electron/src/main/lib/skills/video/
```

#### Task 3: 实现定时调度
```typescript
// 使用 node-cron 或类似库
// 每天 8:00 自动触发工作流
```

---

## 🚀 下一步行动

请确认：
1. **是否立即开始 Phase 1：自动化视频生成工作流？**
2. **Arthur 的画布实现在哪里？具体有什么问题？**
3. **你的视频生成需求的详细流程是什么？**
   - 输入：什么内容（热点、主题、脚本？）
   - 处理：使用哪个 Skill？
   - 输出：视频格式、分辨率？
   - 发布：发布到哪个平台？

确认后我立即开始实施！
