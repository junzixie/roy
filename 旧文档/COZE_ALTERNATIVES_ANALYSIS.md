# GitHub 上的 Coze 开源替代品分析

## 🎯 你的需求
- ✅ Coze 的精简版（基础功能都有）
- ✅ 支持视频生成工作流
- ✅ 调用 Claude 3.5 等模型
- ✅ 自动化任务
- ✅ 不占太多空间/内存
- ❌ 不需要完整复刻 Coze（太大）

---

## 🏆 推荐的开源替代品

### 1. **Flowise** ⭐⭐⭐⭐⭐ 最推荐

**GitHub**: https://github.com/FlowiseAI/Flowise  
**Stars**: 55.5k  
**体积**: ~100MB  
**技术栈**: Node.js + React + React Flow

#### 为什么最适合你？

✅ **完美匹配你的需求**：
```
✅ 可视化工作流画布（和 Coze 一样）
✅ 拖拽式节点编辑
✅ 支持 Claude 3.5、GPT-4 等所有主流模型
✅ 400+ 集成（包括视频生成、API 调用）
✅ 轻量级（不像 Coze 那么重）
✅ 开箱即用的自动化
✅ 完整的 Bot 系统
✅ 支持定时任务
✅ 可以嵌入到 Roy 中
```

#### 节点类型（和 Coze 类似）
```typescript
基础节点：
✅ LLM 节点（Claude/GPT/Gemini...）
✅ HTTP 请求节点
✅ 条件分支节点
✅ 循环节点
✅ 变量节点
✅ 代码执行节点（JavaScript/Python）

高级节点：
✅ 知识库节点（RAG）
✅ 工具调用节点
✅ Agent 节点
✅ Webhook 节点
✅ 定时触发节点
```

#### 架构
```
flowise/
├── packages/
│   ├── components/         - 所有节点组件
│   ├── server/            - 后端 API
│   └── ui/                - React Flow 画布
├── dist/                  - 构建产物（~100MB）
└── docker/                - Docker 部署
```

#### 集成到 Roy 的方案
```typescript
方案 A：嵌入模式（推荐）
- 把 Flowise 的核心引擎嵌入到 Roy
- 只用它的画布和执行引擎
- 去掉独立的 UI 和服务器
- 体积压缩到 ~30MB

方案 B：子进程模式
- Flowise 作为独立进程运行
- Roy 通过 API 调用
- 完全解耦，互不影响
```

---

### 2. **n8n** ⭐⭐⭐⭐

**GitHub**: https://github.com/n8n-io/n8n  
**Stars**: 208k（最流行）  
**体积**: ~200MB  
**技术栈**: Node.js + Vue.js

#### 优点
```
✅ 最流行（208k stars）
✅ 400+ 集成
✅ 强大的自动化能力
✅ 支持所有主流 AI 模型
✅ 完整的工作流引擎
✅ 支持定时任务
```

#### 缺点
```
❌ 体积较大（~200MB）
❌ 使用 Vue.js（Roy 用 React）
❌ 集成难度比 Flowise 高
```

---

### 3. **MoneyPrinterTurbo** ⭐⭐⭐⭐ 视频生成专用

**GitHub**: https://github.com/harry0703/MoneyPrinterTurbo  
**Stars**: 133k  
**体积**: ~50MB  
**技术栈**: Python + React

#### 特点
```
✅ 专门用于 AI 视频生成
✅ 一键生成高清短视频
✅ 支持热点追踪
✅ 自动化工作流
✅ 轻量级
```

#### 缺点
```
❌ 功能单一（只做视频）
❌ 不是通用工作流平台
❌ 使用 Python（Roy 用 Node.js）
```

**适合场景**：如果你只需要视频生成，这个最轻量！

---

### 4. **Nanobot** ⭐⭐⭐ 超轻量

**GitHub**: https://github.com/HKUDS/nanobot  
**Stars**: 49.2k  
**体积**: ~10MB（超轻量）  
**技术栈**: Python

#### 特点
```
✅ 超轻量（~10MB）
✅ 支持 WebUI
✅ 支持工具调用
✅ 多 Agent 工作流
✅ 支持 MCP
```

#### 缺点
```
❌ 功能较简单
❌ 画布功能弱
❌ 使用 Python
```

---

## 🎯 最终推荐

### 方案一：集成 Flowise ⭐⭐⭐⭐⭐ 强烈推荐

**实施方式**：
```typescript
1. 安装 Flowise 核心包
   npm install flowise-components flowise-server

2. 嵌入到 Roy
   apps/electron/src/main/lib/flowise/
   ├── engine.ts          - Flowise 执行引擎
   ├── nodes.ts           - 节点定义
   └── canvas.tsx         - React Flow 画布

3. 去掉不需要的部分
   ❌ Flowise 的独立服务器
   ❌ Flowise 的认证系统
   ✅ 只保留核心引擎和画布

4. 结果
   - 体积：~30MB（压缩后）
   - 功能：Coze 80% 的功能
   - 性能：轻量级
```

**优点**：
```
✅ 现成的工作流引擎（不用从零写）
✅ 400+ 节点（包括视频、API、LLM）
✅ 成熟稳定（55.5k stars）
✅ 轻量级（压缩后 ~30MB）
✅ 技术栈匹配（Node.js + React）
✅ 活跃维护
✅ 文档完善
```

**实施时间**：
```
Week 1: 集成 Flowise 核心引擎
Week 2: 定制画布 UI（符合 Roy 风格）
Week 3: 添加视频生成节点
Week 4: 测试和优化
```

---

### 方案二：MoneyPrinterTurbo + 简单工作流

**适合场景**：你只需要视频生成，不需要通用工作流

**实施方式**：
```typescript
1. 集成 MoneyPrinterTurbo 的视频生成核心
2. 自己实现简单的 6 节点工作流
   - 定时触发
   - HTTP 请求
   - LLM 调用
   - 视频生成（MoneyPrinterTurbo）
   - 发布
   - 通知
3. 使用 Arthur 的 workflows.js 作为基础
```

**优点**：
```
✅ 超轻量（~20MB）
✅ 视频生成专业
✅ 实施快（2 周）
```

**缺点**：
```
❌ 扩展性差（只能做视频）
❌ 没有通用工作流能力
```

---

## 🚀 我的最终建议

### **集成 Flowise！** ⭐⭐⭐⭐⭐

理由：
1. ✅ **完美匹配你的需求**：Coze 的精简版
2. ✅ **功能完整但不臃肿**：压缩后 ~30MB
3. ✅ **现成可用**：不用从零写工作流引擎
4. ✅ **技术栈匹配**：Node.js + React + React Flow
5. ✅ **扩展性强**：400+ 节点，支持所有 LLM
6. ✅ **社区活跃**：55.5k stars，持续更新
7. ✅ **实施快速**：3-4 周就能用上

### 实施步骤

#### Week 1: 集成核心引擎
```bash
1. 安装 Flowise 依赖
2. 提取核心引擎代码
3. 嵌入到 Roy
```

#### Week 2: 定制 UI
```bash
1. 修改画布样式（符合 Roy）
2. 去掉不需要的功能
3. 集成到 Roy 的界面
```

#### Week 3: 添加视频功能
```bash
1. 从 Arthur 移植 ai-video-studio
2. 创建视频生成节点
3. 创建抖音发布节点
```

#### Week 4: 测试优化
```bash
1. 端到端测试
2. 性能优化
3. 定时任务测试
```

---

## 📊 对比总结

| 项目 | Stars | 体积 | 功能 | 集成难度 | 推荐度 |
|------|-------|------|------|---------|--------|
| **Flowise** | 55.5k | ~30MB | ⭐⭐⭐⭐⭐ | 低 | ⭐⭐⭐⭐⭐ |
| n8n | 208k | ~200MB | ⭐⭐⭐⭐⭐ | 中 | ⭐⭐⭐ |
| MoneyPrinterTurbo | 133k | ~50MB | ⭐⭐⭐ | 中 | ⭐⭐⭐⭐ |
| Nanobot | 49.2k | ~10MB | ⭐⭐ | 高 | ⭐⭐ |
| 从零实现 | - | ~5MB | ⭐ | 高 | ⭐ |

---

## 🎬 你的视频生成工作流（基于 Flowise）

```typescript
[定时触发节点] 
  schedule: "0 8 * * *"  // 每天 8:00
  ↓
[HTTP 请求节点]
  url: "https://api.example.com/ai-news/today"
  method: GET
  ↓
[LLM 节点]
  model: "claude-opus-5-5"
  prompt: "根据新闻生成视频脚本"
  ↓
[视频生成节点] (ai-video-studio)
  script: {{上一步输出}}
  style: "科技新闻"
  ↓
[发布节点] (抖音)
  video: {{上一步输出}}
  title: "今日 AI 资讯"
  ↓
[通知节点]
  type: "email"
  message: "视频已发布"
```

---

## 🤔 需要你确认

**问题 1**：你同意集成 Flowise 吗？
- 选项 A：✅ 同意，集成 Flowise（推荐）
- 选项 B：只做简单的视频生成工作流（不集成 Flowise）
- 选项 C：看看其他方案

**问题 2**：如果集成 Flowise，你希望：
- 选项 A：完全嵌入（~30MB，完全控制）
- 选项 B：子进程模式（~100MB，解耦）

---

**请告诉我你的选择，我立即开始实施！** 🚀

我强烈推荐：**选项 A（集成 Flowise）+ 完全嵌入模式**
