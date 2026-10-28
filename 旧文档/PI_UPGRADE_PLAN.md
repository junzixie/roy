# Pi 内核升级计划：0.85.1 → 1.2.0

## 当前版本
```json
"@earendil-works/pi-agent-core": "0.85.1",
"@earendil-works/pi-ai": "0.85.1",
"@earendil-works/pi-coding-agent": "0.85.1",
"@earendil-works/pi-server": "0.85.1",
"@earendil-works/pi-tui": "0.85.1"
```

## 目标版本
```json
"@earendil-works/pi-ai": "1.2.0",
"@earendil-works/pi-coding-agent": "1.2.0",
"@earendil-works/pi-mcp": "1.2.0"
```

## 升级步骤

### 1. 修改 apps/electron/package.json
需要替换的包：
- `@earendil-works/pi-agent-core` → 删除（1.2.0 已合并）
- `@earendil-works/pi-ai` → 升级到 1.2.0
- `@earendil-works/pi-coding-agent` → 升级到 1.2.0
- `@earendil-works/pi-server` → 删除（不再需要）
- `@earendil-works/pi-tui` → 删除（不再需要）
- 新增 `@earendil-works/pi-mcp: "1.2.0"`

### 2. 处理 patches
根目录 package.json 中有：
```json
"patchedDependencies": {
  "@earendil-works/pi-ai@0.85.1": "patches/@earendil-works%2Fpi-ai@0.85.1.patch",
  "node-pty@1.1.0": "patches/node-pty@1.1.0.patch"
}
```

需要：
- 删除 `@earendil-works/pi-ai@0.85.1` patch
- 检查是否需要为 1.2.0 创建新 patch

### 3. 代码适配
可能需要适配的地方：
- `apps/electron/src/main/lib/agent-runtime.ts`
- `apps/electron/src/utility/agent-runtime.ts`
- 所有使用 Pi API 的地方

### 4. 测试计划
- [ ] 基本会话创建
- [ ] 工具调用
- [ ] MCP 集成
- [ ] 队列功能
- [ ] 停止功能

## 风险评估

**高风险：**
- API 变更导致编译失败
- 行为变更导致功能异常

**缓解措施：**
- 先在分支测试
- 保留 0.85.1 版本作为回退

## 执行命令

```bash
# 1. 删除现有依赖
rm -rf node_modules
rm -rf apps/electron/node_modules
rm bun.lockb

# 2. 安装新版本
bun install

# 3. 构建测试
bun run build

# 4. 运行测试
bun run dev
```
