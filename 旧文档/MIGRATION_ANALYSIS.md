# Arthur 余额 UI 迁移到 Roy - 技术分析

## 核心差异对比

### 数据结构

**Arthur (balance.js)**
```javascript
{
  scheme: "deepseek" | "moonshot" | "zai" | "openrouter" | "none",
  isAvailable: boolean,
  currency: "CNY" | "USD",
  total: number,        // 剩余总额
  granted: number,      // 赠送额度
  toppedUp: number,     // 充值余额
  used: number,         // 已用
  limit: number,        // 总额度
  error: string
}
```

**Roy (balance-schemes.ts)**
```typescript
interface BalanceView {
  isAvailable?: boolean
  currency?: string
  total?: string        // 字符串格式，已格式化
  granted?: string
  toppedUp?: string
  used?: string
  limit?: string
}

interface BalanceResult {
  supported: boolean
  view?: BalanceView
  message?: string
}
```

### UI 组件对比

**Arthur Usage.tsx (简洁版)**
- 一张横向卡片，5 个区块
- 左侧：余额（大字号 24px）+ 刷新按钮
- 竖线分隔
- 右侧：今天/本月/缓存命中（3 个小卡片，22px）
- 下方：14 天柱状图 + 按模型分布

**Roy UsagePage.tsx (复杂版)**
- 顶部导航：返回按钮 + 刷新按钮
- 余额卡片：包含渠道名
- 数据卡片：分别独立渲染
- 14 天柱状图：独立卡片
- 按模型分布：独立卡片
- 底部说明文字

## 迁移策略

### 1. 保留 Roy 现有数据层
- `balance-schemes.ts` - 已经是从 Arthur 移植的
- `balance-service.ts` - IO 层完整
- `usage-summary.ts` - 用量统计完整

### 2. 改造 UI 层（采用 Arthur 简洁设计）

#### UsagePage.tsx 改造点
1. **简化顶部导航**：移除独立导航栏，只保留标题
2. **合并余额和数据卡**：一张卡片包含全部信息（Arthur 风格）
3. **简化 14 天图表**：移除外层独立卡片，使用 Arthur 的紧凑样式
4. **保持按模型分布**：Roy 已经很简洁

#### SidebarUsageCard.tsx 改造点
1. 保持当前三行布局
2. 增强余额显示：更大字号 + 详细信息（赠送/充值/已用）

### 3. 数字格式化统一

Arthur 使用中文习惯：
- ≥1亿：x.xx 亿
- ≥1万：x.x 万
- ≥1千：x.xK
- 其他：整数

Roy 也使用相同格式，已经对齐。

## 实施计划

### Phase 1: 创建新的余额组件（Arthur 风格）
文件：`apps/electron/src/renderer/components/usage/BalanceCard.tsx`

特点：
- 横向布局
- 左侧余额 + 刷新按钮
- 竖线分隔
- 右侧三个数据卡
- 24px 大字号余额

### Phase 2: 改造 UsagePage.tsx
1. 引入新的 BalanceCard
2. 移除旧的分散卡片
3. 简化图表外层包装

### Phase 3: 增强 SidebarUsageCard.tsx
1. 增大余额字号
2. 添加详细信息（赠送/充值/已用）

### Phase 4: 测试验证
1. 余额查询功能
2. 刷新按钮
3. 响应式布局
4. 暗色模式适配

## 关键代码片段

### Arthur 的余额卡片布局（核心）
```tsx
<div className="mb-6 rounded-xl border border-line bg-s0 px-5 py-4">
  <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
    {/* 左侧：余额 */}
    <div className="min-w-[160px]">
      <div className="text-[12px] text-t3">余额 + 刷新按钮</div>
      <div className="text-[24px] font-medium">¥123.45</div>
      <div className="text-[11px] text-t3">赠送 10 · 充值 113.45</div>
    </div>
    
    {/* 竖线 */}
    <div className="h-12 w-px bg-line" />
    
    {/* 右侧：数据卡片 */}
    {cards.map(...)}
  </div>
</div>
```

### 数字格式化（已在 Roy 实现）
```typescript
function formatTokens(value: number): string {
  if (value >= 1e8) return `${(value / 1e8).toFixed(2)} 亿`
  if (value >= 1e4) return `${(value / 1e4).toFixed(1)} 万`
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`
  return String(Math.round(value))
}
```

## 注意事项

1. **类型安全**：Roy 使用 TypeScript，需要严格类型定义
2. **样式系统**：Roy 使用 Tailwind + 自定义主题变量，需要适配
3. **状态管理**：Roy 使用 Jotai，Arthur 使用 React 内置状态
4. **IPC 通信**：保持 Roy 现有的 IPC 接口不变
5. **错误处理**：保持 Roy 的错误处理机制
6. **国际化**：保持中文界面，与 Arthur 一致

## 样式适配映射

| Arthur 类名 | Roy 等价类名 |
|------------|-------------|
| `bg-s0` | `bg-card` |
| `border-line` | `border-border` |
| `text-t1` | `text-foreground` |
| `text-t2` | `text-foreground/80` |
| `text-t3` | `text-foreground/45` |
| `bg-hov` | `bg-foreground/[0.06]` |
| `text-clay` | `text-foreground/40` (需确认主题色) |

## 迁移检查清单

- [ ] 创建 BalanceCard 组件
- [ ] 改造 UsagePage.tsx
- [ ] 增强 SidebarUsageCard.tsx
- [ ] 测试余额查询（DeepSeek/Moonshot/智谱/OpenRouter）
- [ ] 测试刷新按钮
- [ ] 测试错误状态（不支持/查询失败）
- [ ] 验证暗色模式
- [ ] 验证响应式布局
- [ ] 对比截图：Arthur vs 新 Roy
- [ ] 性能测试：缓存机制
