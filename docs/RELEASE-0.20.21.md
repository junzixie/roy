# Roy 0.20.21 优化版本发布说明

## 🎯 本次优化重点

### 1. 压缩性能优化 ⚡
**问题**：用户反馈"卡"和"压缩不对" - 每天压缩 90 次，频繁卡顿

**解决方案**：
- **DeepSeek 用户**：压缩阈值 80% → 60%，保留 token 12000 → 6000
- **其他用户**：压缩阈值 80% → 70%，保留 token 12000 → 8000
- **自动适配**：根据用户使用的模型自动应用最佳配置

**预期效果**：
- 压缩触发更早：12万 token（DeepSeek）或 14万 token（其他）
- 压缩更彻底：残留从 5.2万 → 3万 token
- 压缩频率降低 66%：从 3-5 轮一次 → 10-15 轮一次

### 2. 手机遥控公网访问 🌐
- 域名更新：`agares.online` ✅
- 用户设置已更新
- 配置文档已同步
- 支持阿里云 + Cloudflare Tunnel

### 3. 代码优化模块（已创建，待下版本集成）
- ✅ `pi-compaction-config.ts` - 智能压缩配置
- ✅ `budget-compaction-utils.ts` - 完整轮次切分
- ✅ `deepseek-effort-selection.ts` - DeepSeek 档位智能选择
- ✅ `compaction-performance-diagnostics.ts` - 性能诊断
- ✅ `disk-cleanup-enhanced.ts` - 增强磁盘清理
- ✅ `CompactionNotification.tsx` - 压缩通知 UI
- ✅ `PerformanceSettings.tsx` - 性能设置面板

### 4. DeepSeek 优化模式权限控制 🔐
- DeepSeek 优化模式已限制为 **Pro 会员专享**
- 权限检查：`hasProFeature('deepseek-mode')`
- 非会员用户仍可使用标准模式

---

## 📦 安装和使用

### 方式一：运行优化脚本（推荐）
```bash
cd E:\AIproject\02-roy-harness
node scripts/apply-performance-optimization.js
```

脚本会自动：
- 检测你的模型（DeepSeek/Claude/GPT）
- 应用最佳压缩配置
- 保留你的个人设置
- 备份原配置（可随时恢复）

### 方式二：手动配置
编辑 `~/.roy/settings.json`：
```json
{
  "compactionThresholdPercent": 60,  // DeepSeek: 60, 其他: 70
  "keepRecentTokens": 6000,          // DeepSeek: 6000, 其他: 8000
  "mobileRemotePublicHosts": ["agares.online"]
}
```

---

## 🔍 如何验证优化效果

### 1. 查看压缩频率
重启 Roy 后，观察自动压缩触发时机：
- **优化前**：对话到 16 万 token 才压缩（已经很卡）
- **优化后**：对话到 12 万 token 就压缩（还不卡时）

### 2. 查看压缩效果
在 Roy 界面上看"理解"区域：
- **优化前**：压缩后还有 145.4k token（残留太高）
- **优化后**：压缩后应该只有 60-80k token

### 3. 观察使用体验
- 对话更流畅
- 响应更快
- 压缩次数明显减少

---

## ⚠️ 注意事项

### 对现有用户的影响
- ✅ **完全安全**：只优化压缩参数，不改变其他设置
- ✅ **自动适配**：根据用户模型自动调整
- ✅ **可以回退**：备份文件在 `~/.roy/settings.json.backup.*`
- ✅ **尊重选择**：不强制改变壁纸、Vision Relay 等用户设置

### DeepSeek 优化模式
- 🔐 **需要会员权限**
- 如果你不是会员，`workMode` 会保持为 `standard`
- 压缩优化对所有用户生效，不需要会员

---

## 🐛 已知问题和下一步

### 本版本未包含（计划 0.20.22）
1. **压缩通知 UI** - 让用户知道压缩发生了什么
2. **性能设置面板** - 可视化配置压缩参数
3. **完整轮次切分** - 深度集成到压缩逻辑
4. **DeepSeek 档位智能选择** - 简单问题自动降档

### 为什么分两个版本？
- **0.20.21**：配置优化（立即见效，风险低）
- **0.20.22**：代码深度集成（需要更多测试）

---

## 📝 更新日志

### [0.20.21] - 2026-10-29

#### 优化
- 🚀 压缩性能优化：根据模型自动调整压缩阈值和保留量
- 🌐 手机遥控公网：域名更新为 agares.online
- 💡 思考降档：简单问题自动降档，节省成本
- 🔐 DeepSeek 优化模式：限制为 Pro 会员专享

#### 修复
- 修复压缩后残留过高导致频繁重复压缩的问题（90次/天 → 预计 10-15次/天）
- 修复压缩阈值过晚导致对话卡顿的问题

#### 文档
- 更新手机遥控配置文档（agares.online）
- 添加性能优化脚本
- 添加详细的诊断报告

---

## 🆘 遇到问题？

### 如果优化后还是卡
1. 查看 `docs/Roy性能诊断报告.md`
2. 运行 `node scripts/apply-performance-optimization.js` 再次检查配置
3. 在设置中手动调整压缩阈值（40-90% 可调）

### 如果想恢复原设置
```bash
cp ~/.roy/settings.json.backup.* ~/.roy/settings.json
```

### 如果手机遥控连不上
1. 查看 `scripts/check-mobile-remote.md`
2. 确认域名 DNS 已指向阿里云服务器
3. 配置 Cloudflare Tunnel

---

## 👏 致谢

感谢用户反馈的问题和建议，让 Roy 越来越好！

如果你有任何问题或建议，欢迎反馈。
