# open-claude-ui 对照报告（→ Roy 自有 harness / Cloud 式交互）

> 审查时间：2026-10-22（Asia/Shanghai）  
> 参考工程：`C:\Users\Administrator\Downloads\open-claude-ui-main\open-claude-ui-main`  
> 主战场：`C:\Users\Administrator\Desktop\Roy`  
> 语境变更：**Cloud Codex 不再强制**；目标是类似 Cloud / 本 bot 的顺手交互（含静默），以及「Open Cloud」式打开文件夹 / 查看生成物文档；**彻底脱离 Proma 品牌依赖，做成 Roy 自有属性 harness**。

---

## 1. open-claude-ui 是什么（只读结论）

| 项 | 结论 |
|---|---|
| 形态 | **不是完整桌面 App**，而是 Claude Design System（CDS）的 clean-room 组件库 + 交互物理学 + 长篇工程手册 |
| 技术 | React 18 + Tailwind + Framer Motion；Electron 仅作桌面宿主示例依赖 |
| 入口 | `src/index.ts` 聚合导出 `code-examples/*`；手册在 `docs/`（含 Desktop 2.0 专篇 09） |
| 许可 | MIT；强调零专有字体/音效二进制 |

**结构速览**

```text
open-claude-ui-main/
  AGENTS.md / CLAUDE.md
  code-examples/            # 30 个可移植模块
  docs/01–09…               # CDS 手册 + Desktop 2.0 分析
  docs/claude-components-storybook.html
  assets/
```

---

## 2. 与「Open / 项目文档 / 静默 / 云端式」相关的模块

### 2.1 「Open」产物入口（最像 Open Cloud）

| 模块 | 路径 | 要点 |
|---|---|---|
| 消息内 Artifact 卡 | `code-examples/ChatMessageBubbles.tsx` | ArtifactPreview + **Open Artifact** → onOpenArtifact |
| 双栏拆分 | `ArtifactsSplitPaneResizer.tsx` | 左≥380 / 右≥420；iframe 指针防护；双击 50/50 |
| 预览沙箱 | `EpitaxyIframeBridge.tsx` | 禁 allow-same-origin + userActivation；ant MIME **不宜照搬名** |
| 流式 Diff | `StreamingDiffViewer.tsx` | 生成物旁路阅读 |

映射：CDS = Artifact 卡 → Open → 右侧工作台。Roy 已有 Preview / showItemInFolder / openPath，缺**会话流内统一「打开此产物」入口与自有命名**。

### 2.2 项目 / 协作拓扑

| 模块 | 路径 | 要点 |
|---|---|---|
| Cowork 画布 | `CoworkAgentCanvas.tsx` | 多 Agent 状态机；Shared Artifacts Pool |
| 会话 DnD | `DraggableSessionList.tsx` | pinnedOrder、4px 死区 |
| Desktop 2.0 | `docs/09-*.md` | Origin：This Computer / Cloud / SSH / Slack；Default 作用域；Popout 新窗 |

### 2.3 静默 / 后台

| 来源 | 要点 | Roy 启示 |
|---|---|---|
| 09 §9.3.2 后台 Computer Use | 后台 CU 弹系统菜单曾抢全局快捷键 | 静默 = 不抢 OS 焦点、不吞快捷键 |
| ThinkingAccordion | 思考中强制展开 | 可看不挡 |
| McpToolDecisionCard | pending→running→success/error | 对齐 PermissionBanner UX |
| useClaudeScrollPinning | 150ms 冷却 | 流式不抢滚动 |
| useRateLimitBackoff | 原位 Retry | 静默可恢复失败 |

### 2.4 会话 / 桌面壳

Composer IME 与 @提及；ClaudeDesktopHeader / createClaudeMainWindow；四档 spring。

---

## 3. 对照 Roy

### 3.1 已具备

PreviewPanel；openPath / showItemInFolder；fileBrowserAutoReveal；PermissionBanner；thinking；agent-island；orchestrator + agent-runtime + FastHarness。

### 3.2 可吸收（P0）

1. 统一「打开产物」契约（自有名：打开工作台 / 在文件夹中显示 / 打开项目文档）  
2. 静默焦点纪律（computer-control / automation / headless）  
3. 继续脱 Proma 用户可见文案  
4. 滚动钉住 150ms（若缺）  

### 3.2 可吸收（P1）

产物池轻量版；工具卡三态 UX；双栏死区；Popout；Composer IME 回归。

### 3.3 不建议照搬

Clay 整包换肤；vnd.ant.* MIME；WebContentsView 大改壳；Cowork 商标；整库依赖；像素级 Claude。

---

## 4. 来源关系

| 来源 | 调整 |
|---|---|
| Feibo | harness 运行时，不变 |
| Proma | 品牌脱离；不作交互主参考 |
| Cloud Codex | **不再强制** |
| open-claude-ui | Cloud 式 UI/静默/Open 产物主参考之一 |

---

## 5. 下一刀建议

**A（推荐）** 写 `Roy产物打开契约.md`：三动作、工具结果入口、静默纪律、命名 Roy 化。  
**B（小代码）** 统一打开入口；后台禁全局快捷键；滚动钉住。  
**C（中期）** 产物池 + 清 Proma 文案 + 自有 token 文档。

## 6. 可选确认

打开默认偏预览还是文件夹？静默场景优先级？只搬交互不换皮？

---

*只读对照；未改 open-claude-ui 与 Roy 业务代码。*
