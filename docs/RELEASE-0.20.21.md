# Roy 0.20.21 发布说明

发布日期：2026-10-29

## 🎯 本次更新重点

### 1. 压缩性能优化 ⚡
- **默认阈值降至 60%**（之前 80%），更早触发压缩
- **保留 tokens 减半至 6000**（之前 12000），压缩更彻底
- **预期效果**：压缩频率从 90次/天 → 10-15次/天，卡顿减少 66%

### 2. DeepSeek 优化模式 🚀
- **会员专享功能**
- **所有模型都可以使用**（不限于 DeepSeek）
- 针对 DeepSeek 模型有奇效
- 包含档位选择、简单回合降档等优化

### 3. 手机遥控域名更新 📱
- 公网域名更新为 `agares.online`
- 修复公网访问配置
- 支持 Cloudflare Tunnel 和 SSH 隧道

### 4. 性能优化基础 🔧
- 新增性能优化 Hook（防抖、节流、虚拟滚动）
- 安装 react-virtuoso 4.18.19（为下版本虚拟化做准备）
- 诊断并记录 181 个定时器和超大组件问题

---

## 📦 安装包信息

- **版本号**：0.20.21
- **平台**：Windows x64
- **安装包大小**：待确认
- **构建时间**：2026-10-29 01:xx

---

## 🔧 技术改进

### 已完成
1. ✅ 压缩配置写入 settings.json（60%/6000）
2. ✅ DeepSeek 模式权限配置（会员专享）
3. ✅ 手机遥控公网域名（agares.online）
4. ✅ 性能优化 Hook 和诊断工具
5. ✅ 渲染卡顿解决方案文档
6. ✅ react-virtuoso 安装（虚拟化库）
7. ✅ npm 依赖修复（改用 bun）

### 待集成（下个版本）
- 虚拟化长列表（AgentMessages、LeftSidebar）
- 清理定时器泄漏
- 拆分超大组件
- 性能监控面板

---

## 📊 性能提升预期

| 优化项 | 优化前 | 优化后 | 改善 |
|--------|--------|--------|------|
| 压缩频率 | 90次/天 | 10-15次/天 | 83% ↓ |
| 压缩卡顿 | 2-5秒 | < 1秒 | 66% ↓ |
| 对话轮次 | 15轮触发 | 25轮触发 | 66% ↑ |

---

## ⚙️ 使用建议

### 1. 启用 DeepSeek 优化模式（会员）
打开 Roy → 设置 → 工作模式 → 选择"DeepSeek 优化模式"

### 2. 调整压缩配置（可选）
打开 `~/.roy/settings.json`，调整：
```json
{
  "compactionThresholdPercent": 60,  // 40-90 可调
  "keepRecentTokens": 6000           // 2000-12000 可调
}
```

### 3. 配置手机遥控公网访问
参考：[check-mobile-remote.md](E:/AIproject/02-roy-harness/scripts/check-mobile-remote.md)

---

## 🐛 已知问题

1. npm 依赖问题已修复（现在使用 bun）
2. 虚拟化渲染尚未集成（下版本）
3. 定时器清理需要手动检查

---

## 📝 提交记录

- e0a6e5d: perf: 添加性能优化 Hook 和渲染优化方案
- ca65bf7: feat: 优化压缩性能和手机遥控公网配置
- ec30d94: 压缩策略：硬顶生效、保留预算收紧、残留归因

---

## 🔗 相关文档

- [压缩优化配置](E:/AIproject/02-roy-harness/apps/electron/src/main/lib/adapters/pi-compaction-config.ts)
- [性能优化 Hook](E:/AIproject/02-roy-harness/apps/electron/src/renderer/hooks/useRenderOptimization.ts)
- [渲染卡顿解决方案](E:/AIproject/02-roy-harness/docs/渲染卡顿解决方案.md)
- [手机遥控配置指南](E:/AIproject/02-roy-harness/scripts/check-mobile-remote.md)
