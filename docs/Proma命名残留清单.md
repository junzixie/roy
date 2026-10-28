# Proma 命名残留扫描清单

> 扫描时间：2026-10-22（Asia/Shanghai）  
> 范围：Desktop\Roy，排除 node_modules / dist / out-v5 / bun.lock  
> 命中文件约 47 个

## 图例

- **SAFE**：可改文案/注释/文档标题，不影响协议与后端校验  
- **RISK**：改动可能导致 403、同步 DB 损坏、安装路径失效  
- **KEEP**：刻意保留的上游品牌/URL/仓库名  

## RISK / KEEP（只列清单，本轮不改代码语义）

| 路径 | 残留 | 建议 |
|---|---|---|
| `packages/core/src/providers/user-agent.ts` | `UPSTREAM_UA_PRODUCT = 'Proma'` | **KEEP**：Coding Plan 等上游按 Proma UA 校验，改 Roy 会 403 |
| `apps/electron/src/main/lib/browser-identity.ts` | 同上 | **KEEP** |
| `apps/electron/src/main/lib/planning-manager.ts` | DB 列 `proma_entity_id` / `promaEntityId` / `promaIdentity`（命中最多） | **RISK**：schema 迁移成本高；建议仅新字段用 roy_*，旧列兼容读 |
| `apps/electron/src/main/lib/installer-manifest.ts` | `https://api.proma.cool` | **KEEP** 直至自建 API |
| `apps/electron/src/main/lib/agent-git-attribution.ts` | `proma.cool` / `github.com/proma-ai/Proma` | **KEEP** 或改文档说明「官方站仍为 proma.cool」 |
| `apps/.../AboutSettings.tsx` / `ChannelForm.tsx` / `main.tsx` | releases / download / changelog URL | **KEEP** 或统一配置化 |
| `README.md` / `README.en.md` | proma.cool 商业版链接 | **KEEP**（产品事实） |
| `scripts/rename-to-roy.mjs` | Proma→Roy 工具与 GUARDS | **KEEP** |
| `release-notes/*.md` | 历史版本叙述中的 Proma | **KEEP** 历史忠实 |

## SAFE（本轮已改或建议改）

| 路径 | 建议改名 | 本轮 |
|---|---|---|
| `docs/proactive-scheduler-monitor-design.md` | 标题/产品名 Proma→Roy；保留上游仓库名 `Proma_Proactive` 并加注 | 已改 |
| `docs/linux.md` | 产品名→Roy；安装包文件名/`~/.proma` 标注「历史路径，迁移见文」 | 已改（路径说明保留） |
| `docs/slack-bridge.md` | 产品名→Roy；Bot 默认名可写 Roy（说明可自定义） | 已改 |
| `apps/.../assistant-turn-layout.ts` | 注释 Proma→Roy | 已改 |
| `apps/.../SDKMessageRenderer.tsx` | 注释 Proma→Roy | 已改 |
| `apps/.../usage-summary.ts` | 注释 Roy/Proma→Roy | 已改 |
| `tutorial/*` | 用户教程大量 Proma | **未改**（体量大，建议单独 PR） |
| `docs/plans/*.md` | 偶发 Proma | **未改**（设计史） |

## 后续

1. planning SQLite：出迁移设计再动  
2. tutorial 批量替换脚本（先 dry-run）  
3. UA/API 域名：等自有后端就绪再切  