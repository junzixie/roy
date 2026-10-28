# P2 骨架与 TODO（不强行一次做完）

> 更新：2026-10-22  
> Cloud Codex：待补

## 1. Proactive

- 文档基线：`Desktop\Roy\docs\proactive-scheduler-monitor-design.md`（已 Roy 化标题）
- thinking：`roy-thinking/roy-2026-q2-q3-thinking.md`
- TODO：
  - [ ] durable Scheduler 数据模型（TaskRun）
  - [ ] Monitor 事件源（文件/CI/会话）
  - [ ] in-process MCP 暴露 Scheduler/Memory
  - [ ] UI：Proactive Center（与现有 automation/cron 对齐）

## 2. 多 Agent / mailbox

- thinking 路线：mailbox ↔ Todo ↔ 多 Session
- Roy 已有：子会话、探索、collaboration tools、agent-island
- TODO：
  - [ ] mailbox 持久化 schema
  - [ ] Agent 间消息可见性与权限
  - [ ] 与 Todo/日程的双向绑定

## 3. FileClaims（Feibo runtime.claims）

- Feibo：多 run 写文件归属，避免停掉的 run 污染当前 run 文件列表
- Roy：workspace / session 文件视图，未见等价 FileClaims
- TODO：
  - [ ] 定义 claim 记录（runId, path, at）
  - [ ] 写入工具钩子登记
  - [ ] UI 过滤「非本 run」文件

## 4. Prompt / 工具体积治理

- Feibo：`measure.js` 统计 systemPrompt 与 tool schema 字节
- Roy：slim-mode 已做运行时瘦身
- TODO：
  - [ ] 脚本 `scripts/measure-prompt-tools.mjs`（学 measure.js）
  - [ ] CI 可选阈值告警
  - [ ] 能力开关矩阵文档化（与分层地图 L2/L4 对齐）

## 5. Cloud Codex

待补路径后再开专项对照，本文件不预写其模块。