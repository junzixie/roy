# Roy UI 重构方案

## 📋 重构需求总结

### **侧边栏顺序调整**
```
原顺序 → 新顺序：
1. To-do ✅（保留）
2. Obsidian → Markdown 笔记 ✏️（重命名）
3. 日程 ❌（删除）
4. 工作流 ✅（保留）
5. 定时任务 ✅（保留）
6. 市场 ✅（保留）
7. MCP / Skill ✅（保留）
```

### **设置页面重组**

#### **第一大类：基础设置**
```
📦 基础设置
├── 通用设置
├── 外观设置
├── 语音输入
└── 模型配置
    └── 通用助手（新增，类似 Arthur）
```

#### **第二大类：AI 配置**
```
🤖 AI 配置
├── 人设提示词（新增）
├── 记忆（项目记忆从这里管理）
├── 技能和 MCP
└── 自动化
```

#### **第三大类：系统设置**
```
⚙️ 系统设置
├── 数据、账号、关于（合并）
├── 快捷键管理
├── 远程连接
├── 数据迁移
└── 磁盘管理
```

**删除的设置：**
- ❌ 员工和团队
- ❌ 代理设置
- ❌ 项目记忆（移到"记忆"下）

---

## 📁 需要修改的文件

### 1. 侧边栏（LeftSidebar.tsx）
```typescript
// 导航菜单项
const NAV_ITEMS = [
  { id: 'todo', label: 'To-do', icon: ListTodo },
  { id: 'vault', label: 'Markdown 笔记', icon: BookOpen },  // 重命名
  { id: 'workflows', label: '工作流', icon: GitBranch },
  { id: 'automations', label: '定时任务', icon: Clock },
  { id: 'marketplace', label: '市场', icon: Store },
  { id: 'mcp-skills', label: 'MCP / Skill', icon: Blocks },
]
// 删除 'calendar' (日程)
```

### 2. 设置面板（SettingsPanel.tsx）
```typescript
// 重组设置标签页
const SETTINGS_GROUPS = {
  基础设置: [
    { id: 'general', label: '通用设置', icon: Settings },
    { id: 'appearance', label: '外观设置', icon: Palette },
    { id: 'voice-input', label: '语音输入', icon: Mic },
    { id: 'channels', label: '模型配置', icon: Radio },
    { id: 'assistant', label: '通用助手', icon: Bot },  // 新增
  ],
  
  'AI 配置': [
    { id: 'personas', label: '人设提示词', icon: User },  // 新增
    { id: 'memory', label: '记忆', icon: Brain },  // 新增
    { id: 'prompts', label: '提示词管理', icon: BookOpen },
    { id: 'skills-mcp', label: '技能和 MCP', icon: Blocks },
    { id: 'automation', label: '自动化', icon: Workflow },
  ],
  
  系统设置: [
    { id: 'data-account', label: '数据、账号、关于', icon: Database },  // 合并
    { id: 'shortcuts', label: '快捷键管理', icon: Keyboard },
    { id: 'bots', label: '远程连接', icon: Bot },
    { id: 'migration', label: '数据迁移', icon: HardDriveDownload },
    { id: 'storage', label: '磁盘管理', icon: HardDrive },
  ]
}
```

---

## 🚀 实施步骤

### Step 1: 修改侧边栏
- ✅ 重命名 "Obsidian" → "Markdown 笔记"
- ✅ 删除 "日程" 菜单项
- ✅ 调整顺序

### Step 2: 创建新的设置组件
- 📝 `PersonaSettings.tsx` - 人设提示词管理
- 📝 `MemorySettings.tsx` - 记忆管理（包含项目记忆）
- 📝 `AssistantSettings.tsx` - 通用助手配置
- 📝 `DataAccountSettings.tsx` - 数据、账号、关于（合并）

### Step 3: 重组设置面板
- 📝 修改 `SettingsPanel.tsx`
- ✅ 按三大类分组
- ✅ 调整顺序
- ❌ 删除员工和团队相关

---

## 📝 详细实施代码

准备好了吗？我现在开始实施！
