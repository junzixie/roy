# MCP / Skill 市场优质清单

> 更新：2026-10-22（Asia/Shanghai）  
> 主工程：`C:\\Users\\Administrator\\Desktop\\Roy`  
> 清单源：`apps/electron/resources/market/{skills,mcp}.json`（随包装发，离线可用）  
> 原则：**宁少勿滥**；可给别人安装 = 有来源、有授权、无硬编码密钥、用途清晰、不拖垮上下文。  
> 说明：口语里的「Haverincis」按 **Harness**（编排 / 计划 / 验证 / 做技能·MCP）理解。

---

## 1. 对照各大 Agent 的做法（结论摘要）

| 做法 | Claude / Cursor 系常见实践 | Roy 应对 |
|---|---|---|
| 精选要短 | 角色向小目录，不做「全网货架」 | 精选保持 ~30 技能 + 少量 MCP；其余进「全部」 |
| 分层信任 | 官方 / 厂商策展 / 社区 / 索引 分档 | 标 `source`；上架优先 Anthropic 示例、Remotion 官方、Superpowers、Roy 自研、ZCode 已移植包 |
| 安装前审查 | 读 SKILL.md、脚本、网络/凭证、指令投毒 | 内置包已落盘；第三方再导入须人工看 `note` / `needs` |
| 版本钉死 | pin commit / 哈希，更新要复审 | 市场随安装包版本；`skill-integrity` SHA 辅助（未强制拦截） |
| MCP vs Skill | MCP=外部动作；Skill=可复用流程 | 精选 MCP 偏免 Key / 自带 Node；Skill 偏办公·视频·Harness |
| 定期修剪 | 季度下架僵尸、重复、高风险 | 本清单「降权/下架」栏；本轮已做一小步配置调整 |

参考方向（非照搬）：Anthropic Skills 企业审查清单、MCP 最小权限、官方插件市场「名字≠作者」的信任分层。

---

## 2. 推荐上架（给别人装的默认货架）

### 2.1 Harness 基础（必推）

| 标识 | 中文意图 | 为何优质 |
|---|---|---|
| `skill-creator` | 做技能 | 扩展能力入口 |
| `mcp-builder` | 做 MCP | 扩展连接器入口 |
| `brainstorming` | 头脑风暴 | 动手前澄清需求 |
| `writing-plans` | 写实施计划 | 大任务拆步 |
| `executing-plans` | 执行计划 | **本轮升精选** |
| `systematic-debugging` | 系统化调试 | 根因优先 |
| `verification-before-completion` | 完工前验证 | **本轮升精选** |
| `test-driven-development` | 先写测试 | 工程闭环 |
| `webapp-testing` / `find-docs` | 网页测 / 查文档 | 落地与防过时 |

配套 MCP：`filesystem`（项目目录）、`sequential-thinking`、`memory`、`context7`、`github`（需 Token，本轮升精选）。

### 2.2 Remotion 视频（重点货架）

| 标识 | 角色 |
|---|---|
| `remotion-best-practices` | **主入口**（已精选） |
| `remotion-create` | 新建项目（**本轮升精选**） |
| `remotion-render` | 渲染成片（**本轮升精选**） |
| `remotion-captions` | 字幕（保留在全部，按需装） |

接入：市场「技能 → 精选/常用 → 视频制作」或对话 `/` 调用；依赖本机 Node/Chrome 渲染链时看技能说明。

### 2.3 HyperFrames / 动效（视频副线）

精选保留：`hyperframes`、`motion-graphics`、`faceless-explainer`、`product-launch-video`。  
全部保留：`hyperframes-animation`、`hyperframes-cli`、`pr-to-video` 等（体量大，不默认精选过多）。

### 2.4 办公四件套（Roy 自研，优先推）

`roy-docx` / `roy-xlsx` / `roy-pptx` / `roy-pdf` — 随包、路径清晰，适合「给别人装就能用」。

### 2.5 ZCode 系（插件移植，按需）

| 类型 | 标识 | 建议 |
|---|---|---|
| Skill | `jupyter-notebook`、`cloudbase`、`hyper3d-rodin`、`unreal-mcp` | 默认不精选；需要科研/云/3D/UE 再装 |
| MCP | `zcode-jupyter-notebook`、`cloudbase`、`hyper3d-rodin`、`tripo-3d`、`unreal-engine` | 同左；注意账号授权与 UE 插件 |

ZCode 在 UI 另有插件精选排序（`zcode-plugins.ts` FEATURED：pdf/presentations/spreadsheets 等），与 `mcp.json` 精选是两条线，对外说明时分开讲。

### 2.6 设计 / 内容（适量）

保留精选：`frontend-design`、`ui-ux-pro-max`、`canvas-design`、`humanizer-zh`、宝玉 **封面/信息图/小红书**（`baoyu-cover-image` / `baoyu-infographic` / `baoyu-xhs-images`）。

### 2.7 MCP 精选（当前）

推荐默认真精选：`playwright`、`chrome-devtools`、`context7`、`sequential-thinking`、`memory`、`filesystem`、`github`。  
需 Key 的搜索/抓取（`tavily`、`firecrawl`）、协作（飞书/钉钉/Notion）、地图等：**常用即可，不进默认精选**。

---

## 3. 降权 / 建议下架或移出精选

### 3.1 本轮已降权（精选 → 全部）

| 标识 | 原因 |
|---|---|
| `baoyu-translate` | 场景窄，精选过挤 |
| `baoyu-markdown-to-html` | 公众号排版长尾 |
| `baoyu-url-to-markdown` | 与浏览/Context7 能力重叠 |
| `baoyu-article-illustrator` | 与封面/信息图重复度高 |
| MCP `antv-chart` | 依赖外网渲染，不适合默认真精选 |
| MCP `bing-cn` | 与搜索类重叠；降到常用 |

### 3.2 建议继续观察（暂留全部，不精选）

- **Claude Skills 合集**一批（`kb≈1` 的薄技能）：`changelog-generator`、`focused-fix`、`weekly-review` 等——可作启发，**不宜对外部用户当「官方精品」**。  
- **K-Dense 科研**大包：受众窄；分类已纠正到「数据与科研」。  
- **3D / UE / Tripo**：强依赖本机或账号，安装说明必须完整，否则体验差。  
- 分类曾错放（计划/验证进「设计创作」「其他」）——**本轮已改回「写代码」**。

### 3.3 明确不建议对外安装包默认带的

- 任何含硬编码 Token / 宽文件系统 / 不明远程 URL 的第三方 skill（当前内置包已规避；**用户自装**仍要人工审）。  
- 未 pin 版本的「npx @latest」远程 MCP（MarketPicks 静态项仍有 npx 路径——仅开发机/已装 Node；正式随包项走 `${ROY_NODE}`）。

---

## 4. 接入方式（别人怎么装）

| 路径 | 怎么做 | 适用 |
|---|---|---|
| **A. 随包装发** | 装 Roy → 市场 → 精选/常用/全部 → 安装到当前项目 | 默认；离线清单 |
| **B. 对话调用** | 装好后对话输入 `/` 选技能 | 日常 |
| **C. Roy 市场 API** | `getRoyMarket` / `installSkill`（slug `roy:<slug>`） | 自动化/脚本 |
| **D. MCP 占位符** | `${ROY_NODE}` `${ROY_MCP}` `${WORKSPACE}` `${ROY_DATA}` | 换机不用改绝对路径 |
| **E. ZCode 插件页** | 连接器/插件市场里的 ZCode 分组 | Jupyter/CloudBase/3D |
| **F. 外部导入** | 仅高级用户；须过完整性/人工审查 | 不默认开放给小白 |

给分发方的一句话：**装 Roy → 打开市场精选 → 勾选办公四件套 + Harness 一组 +（若做视频）Remotion 三个**。

---

## 5. 本轮已安全改动的市场配置（一小步）

1. `skills.json`（`resources/market` + `dist/resources/market` 同步）  
   - 升精选：`executing-plans`、`verification-before-completion`、`remotion-create`、`remotion-render`  
   - 降精选：4 个宝玉长尾（见上）  
   - **精选数量仍为 31**（单测 `roy-market.test.ts` 约束）  
   - 纠正分类：Harness / Remotion 相关、科研、`hyperframes`→视频制作、`mcp-builder`→写代码 等  
2. `mcp.json`：升精选 `filesystem`、`github`；降精选 `antv-chart`、`bing-cn`（精选 MCP 仍 7 个）  
3. `MarketPicks.tsx`：常用页新增 **视频制作** 分组；扩展 Roy 组补计划执行与完工验证  

未做（避免大爆炸）：删条目、改授权文件、动 ZCode 二进制包、改精选总数。

---

## 6. 后续修剪建议（未执行）

- 把「Claude Skills 合集」`kb≈1` 的条目移到 `experimental` 分组或单独 JSON，默认 UI 折叠。  
- MarketPicks 精选硬编码名单与 `skills.json` featured 对齐（现有两套入口，易漂移）。  
- 对 Remotion/HyperFrames 大体积技能在卡片上标「体积」与「需渲染环境」。  
- 给对外安装包提供「最小货架」开关（仅办公+Harness+Remotion 入口）。

---

*本清单供 02-roy-harness 与产品对外说明共用；改市场配置以主工程 `resources/market` 为准。*
