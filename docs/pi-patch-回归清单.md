# Pi patch 回归清单

> 对应 `Desktop\Roy\patches\` 与 root `package.json` patchedDependencies  
> 升级 `@earendil-works/pi-*` 前必跑

## 当前 patch

| Patch 文件 | 意图 | 回归点 |
|---|---|---|
| `patches/@earendil-works%2Fpi-ai@1.2.0.patch` | 扩大 retry 可识别错误：stream terminal event、JSON 后多余字符、peer closed、incomplete chunked、premature close、ECONNRESET、failed to fetch | 模拟中断流 / 代理断开后应自动重试而非直接失败 |
| `patches/@earendil-works%2Fpi-coding-agent@1.2.0.patch` | package exports 增加 `require` 入口 | Electron CJS 打包 `agent-runtime.cjs` 能解析 pi-coding-agent |
| `patches/node-pty@1.1.0.patch` | asar.unpacked 路径不双重替换；darwin spawn-helper 可执行位 | Windows/mac 终端启动；打包后 pty helper 路径正确 |

## 建议回归命令（主工程目录）

```bash
bun test packages/shared/src/utils/pi-compaction.test.ts
bun test apps/electron/src/main/lib/file-checkpoints.test.ts
bun test apps/electron/src/main/lib/agent-permission-service.test.ts
# 有 agent-resume / permission-rules 新测时一并跑
bun run --filter @roy/electron typecheck
```

手动：

1. 故意断开代理一次流式对话 → 应重试或友好错误（对照 retry 设计稿 `docs/plans/2026-07-28-pi-retry-policy-design.md`）  
2. `bun run electron:dev` 开终端 → pty 正常  
3. 打包 smoke：`agent-runtime.cjs` 启动无 MODULE_NOT_FOUND  

## 升级 pi 版本时

1. 删除/重做 patch（`bun patch` 流程）  
2. 重跑本清单  
3. 更新本文件中的版本号  