# Phase 2: 视频工作流实施计划

## 🎯 目标

实现自动化视频生成工作流：
```
每日 AI 新闻抓取
    ↓
生成视频脚本
    ↓
调用视频生成技能
    ↓
自动发布到抖音
```

---

## 📋 实施策略调整

### **发现：视频技能的实际来源**

经过检查，Arthur 中的视频技能来源：
1. **WorkBuddy 技能目录** (`~/.workbuddy/skills`)
   - 包含 `remotion-cjk-vertical-video` 等技能
2. **Claude Code 内置技能**
   - `ai-video-studio`, `faceless-explainer`, `hyperframes` 等
   - 通过系统提示词引用

### **调整后的实施方案**

#### **方案 A：集成 Claude Code 技能系统**（推荐）
Roy 已经有 Pi SDK，可以：
1. 在 Flowise 工作流中调用 Pi Agent
2. Pi Agent 通过技能系统调用视频生成技能
3. Flowise 编排整个自动化流程

**优点：**
- 直接利用现有的视频技能
- 不需要重新实现复杂的视频生成逻辑
- 与 Arthur 保持一致

#### **方案 B：从 WorkBuddy 移植技能**
将 `~/.workbuddy/skills` 中的视频技能复制到 Roy：
1. 复制技能目录结构
2. 修改技能加载器
3. 集成到 Flowise

**缺点：**
- 需要大量移植工作
- 可能依赖外部服务（HeyGen API 等）

---

## 🚀 推荐实施路径：方案 A

### **Step 1: 增强 Flowise VideoGenerationNode**

让它能调用 Pi Agent 执行视频技能：

```typescript
class VideoGenerationNode extends BaseNode {
  async execute(inputs: Record<string, any>) {
    const { script, style, format } = inputs
    
    // 调用 Pi Agent 执行视频技能
    const prompt = `使用 ai-video-studio 技能生成视频：
    
脚本内容：
${script}

风格要求：${style}
格式：${format}

请生成视频并返回文件路径。`
    
    const result = await this.callPiAgent(prompt)
    
    return {
      videoPath: result.videoPath,
      duration: result.duration
    }
  }
}
```

### **Step 2: 创建新闻抓取节点**

```typescript
class NewsScraperNode extends BaseNode {
  async execute(inputs: Record<string, any>) {
    const { keywords, sources, count } = inputs
    
    // 调用 Pi Agent 抓取新闻
    const prompt = `搜索最新的 AI 新闻：
    
关键词：${keywords.join(', ')}
来源：${sources.join(', ')}
数量：${count} 条

请整理成结构化数据返回。`
    
    const news = await this.callPiAgent(prompt)
    
    return { news }
  }
}
```

### **Step 3: 创建脚本生成节点**

```typescript
class ScriptGeneratorNode extends BaseNode {
  async execute(inputs: Record<string, any>) {
    const { news, duration, style } = inputs
    
    const prompt = `根据以下新闻生成视频脚本：
    
新闻内容：
${JSON.stringify(news, null, 2)}

时长：${duration} 秒
风格：${style}

请生成适合短视频的脚本，包括：
- 开场白
- 主体内容（分镜）
- 结尾

返回 JSON 格式。`
    
    const script = await this.callPiAgent(prompt)
    
    return { script }
  }
}
```

### **Step 4: 创建抖音发布节点**

```typescript
class DouyinPublishNode extends BaseNode {
  async execute(inputs: Record<string, any>) {
    const { videoPath, title, tags } = inputs
    
    // 调用抖音开放平台 API
    // 或者使用 Pi Agent 的自动化工具
    const result = await this.publishToDouyin({
      video: videoPath,
      title,
      tags
    })
    
    return { 
      published: true,
      url: result.url 
    }
  }
}
```

### **Step 5: 完整工作流**

```json
{
  "name": "每日AI新闻视频",
  "nodes": [
    {
      "id": "1",
      "type": "ScheduleNode",
      "data": {
        "cron": "0 8 * * *",
        "timezone": "Asia/Shanghai"
      }
    },
    {
      "id": "2",
      "type": "NewsScraperNode",
      "data": {
        "keywords": ["AI", "Claude", "GPT", "机器学习"],
        "sources": ["36kr", "虎嗅", "机器之心"],
        "count": 5
      }
    },
    {
      "id": "3",
      "type": "ScriptGeneratorNode",
      "data": {
        "duration": 60,
        "style": "快节奏新闻播报"
      }
    },
    {
      "id": "4",
      "type": "VideoGenerationNode",
      "data": {
        "style": "科技风",
        "format": "竖屏 9:16"
      }
    },
    {
      "id": "5",
      "type": "DouyinPublishNode",
      "data": {
        "autoPublish": true
      }
    }
  ],
  "edges": [
    { "source": "1", "target": "2" },
    { "source": "2", "target": "3" },
    { "source": "3", "target": "4" },
    { "source": "4", "target": "5" }
  ]
}
```

---

## ✅ 实施清单

### **本周任务（2-3 天）**

- [ ] **Day 1: 增强 VideoGenerationNode**
  - [ ] 添加调用 Pi Agent 的能力
  - [ ] 测试视频技能调用
  - [ ] 处理返回结果

- [ ] **Day 2: 创建新闻和脚本节点**
  - [ ] NewsScraperNode 实现
  - [ ] ScriptGeneratorNode 实现
  - [ ] 测试新闻抓取和脚本生成

- [ ] **Day 3: 创建发布节点和完整测试**
  - [ ] DouyinPublishNode 实现
  - [ ] 完整工作流测试
  - [ ] 优化和文档

---

## 🎯 预期效果

完成后，用户可以：

1. **在 Flowise 画布上拖拽节点**
   - 新闻抓取节点
   - 脚本生成节点
   - 视频生成节点
   - 抖音发布节点
   - 定时触发节点

2. **配置自动化任务**
   - 每天早上 8 点自动抓取新闻
   - 生成视频脚本
   - 调用视频技能生成视频
   - 自动发布到抖音

3. **查看执行结果**
   - 工作流执行日志
   - 生成的视频预览
   - 发布状态

---

## 🚀 立即开始

现在开始实施 Day 1 任务！

准备好了吗？
