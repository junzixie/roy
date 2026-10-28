# 02-roy-harness（Roy 唯一主工程）

> 更新：2026-10-22（Asia/Shanghai）

## 唯一主路径

```text
E:\AIproject\02-roy-harness
```

此后 **只在此目录** 开发、构建、验收。原 `C:\Users\Administrator\Desktop\Roy` 已迁走；桌面仅保留指引与快捷方式。

## 本目录是什么

完整 Roy monorepo（原 Desktop\Roy）+ harness 文档/镜像/安装包：

| 路径 | 说明 |
|---|---|
| apps/ packages/ patches/ | 主代码 |
| docs/ | 产品文档 + harness 审查/验收/市场清单 |
| release/ | NSIS 安装包与构建日志（如 Roy-0.19.88-setup.exe） |
| mirror/ | 精选源码镜像（历史对照） |
| scripts/harness/ | harness 侧脚本 |
| 审查报告.md 改造进度.md | harness 进度 |

## 依赖安装（未随迁 node_modules）

体积过大，迁移时排除了各层 node_modules。在本目录执行：

```bat
cd /d E:\AIproject\02-roy-harness
bun install
```

打包环境（VS Build Tools + Spectre）在 `D:\ai-projects\yilai\vs\`（见该处 README-Spectre.md），不要挪进本仓。

## 常用命令

```bat
bun install
bun run test          # 全量测试（带 --isolate，不要直接 bun test）
bun scripts/smoke-formal-check.mjs
bun run dist:win
```

## 有意不迁入

- D:\ai-projects\yilai\ ：共享工具链
- E:\AIproject\01-jarvis-os 等其它编号项目
- Arthur / Jarvis 无关工程

## 从 D 盘归档的分析残件

见 release\_archive-from-D\ （非正式源码）。