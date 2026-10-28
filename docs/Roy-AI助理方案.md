# Roy「AI 助理」产品方案（贾维斯式）

> 撰写：2026-10-22（Asia/Shanghai）  
> 目标体验：像 Grok Bot 一样**顺手、偏快**；在侧栏「新建任务/新项目」相关动作之下、**工作流之上**放一个常驻「AI 助理」。  
> 状态：P0 入口 + P1 对话 + P2 建/看项目已落地（见 §6–§8）。P3 主动跟进未做。

---

## 1. 一句话定位

**AI 助理 = Roy 的总控对话入口**：用户用自然语言说「想看 / 想做某件事」，助理理解意图后，调用已有项目/会话/工作流能力去落地（优先新建并进入项目），而不是再发明一套平行 Agent。

---

## 2. 入口位置（已对齐现网 UI）

| 位置 | 现状锚点 | 本轮动作 |
|---|---|---|
| 侧栏展开 · 工具区第一项 | `LeftSidebar` 工具列表以「工作流」开头 | **在工作流上方**插入「AI 助理」 |
| 侧栏折叠 · 工具轨 | collapsedToolItems 以工作流为先 | 同样插在工作流上方 |
| 主区 | `MainArea` + `activeView` | 新增 `'ai-assistant'` → `AiAssistantPage` 空壳 |

说明：用户口头「开始一个新项目」对应侧栏项目区的新建空项目 / 新建任务；产品要求是助理入口落在**新项目相关心智之下、工作流之上**——工具列表顶部（工作流前）最贴切，也避免改动项目列表虚拟行的复杂逻辑。

---

## 3. 会话模型（规划）

1. **独立助理会话**：与普通 Agent 项目会话分开；轻量、可打断、偏「调度」。
2. **可下钻**：一旦确认「做一个叫 X 的项目」，调用现有 `createAgentProject` / `useProjectActions.createProject`，切到新项目默认会话（后期）。
3. **不抢工作流**：工作流仍是结构化自动化；助理可以「建议跑某工作流」或「帮你起草工作流」，但不替代画布。
4. **速度感**：默认短回复、可一键展开细节；权限沿用 Roy 现有 Permission / LOOK_ONLY / 工作台打开契约。

---

## 4. 「建项目」动作（后期实现合同）

触发示例：
- 「我想做一个发票报销小工具」
- 「开个项目叫 arthur-path-demo」
- 「想看上周那个爬虫项目」（→ 搜索已有项目，没有再问是否新建）

行为合同（实现时）：
1. 解析名称 / 根目录偏好（默认可空项目；可询问是否选本地文件夹）。
2. 调用现有创建项目 IPC（与侧栏「新建空项目」同一路径）。
3. 设为当前项目并打开首个会话；助理会话里留一条「已创建并进入」回执。
4. **禁止**在未接通前用假 toast / 假项目列表冒充成功（本轮已遵守）。

---

## 5. 与 Roy harness 的关系

| Harness 层 | 助理怎么用 |
|---|---|
| Orchestrator / Agent Runtime | 助理是**调度壳**；重活仍进项目 Agent 会话 |
| Prompt / Skill | 助理 system 提示强调：快、可行动、会建项目/指路，不重复造轮子 |
| Permission / Checkpoints | 建目录、写文件仍走现有许可与检查点 |
| 产物打开契约 | 助理若产出文件，默认预览工作台，与 `roy-product-open` 一致 |
| CLI PATH（本轮已补） | 高级用户可 `roy ask`；助理是 GUI 侧的对称入口 |

---

## 6. 分期

| 期 | 内容 | 状态 |
|---|---|---|
| P0 | 方案文档 + 侧栏入口 + `AiAssistantPage` 空会话壳（发送禁用） | 已完成 |
| P1 | 接通轻量对话（复用渠道/模型选择） | **已升级：嵌入完整 AgentView** |
| P2 | 「建项目 / 进项目 / 指路工作流」工具调用；与 `useProjectActions` 打通 | **本轮完成**（客户端意图 + `createAgentProject` + 进入动作按钮） |
| P3 | 主动跟进、例行摘要（对齐 cron/routine）；速度与 Grok Bot 体感打磨 | 未做 |

---

## 7. 本轮代码落点（占位）

- `atoms/active-view.ts`：`ai-assistant`
- `pages/AiAssistantPage.tsx`：空壳
- `components/tabs/MainArea.tsx`：视图分支
- `components/app-shell/LeftSidebar.tsx`：工作流上方入口（展开+折叠）

---

*与 `Arthur-CLI对照.md`、设置页「把 roy 加进 PATH」同期推进；助理不依赖 CLI，但共享「顺手入口」产品哲学。*

---

## 8. 本轮实现要点（2026-10-22）

### 对话
- 专用 Agent 会话标题固定为「AI 助理」（`createAgentSession`），复用当前渠道/模型。
- 发送走 `sendAgentMessage`；准流式来自 `onAgentStreamEvent` 的 `sdk_delta.text_delta`。
- `automationContext` 注入助理人设（只称 Roy，不提 Proma/Cowork）。
- `permissionModeOverride: 'ask'`，失败走 `onAgentStreamError` / resultSubtype，界面诚实提示。

### 建/看项目
- `lib/ai-assistant-intent.ts` 启发式解析「开/新建…项目」「想看/打开…项目」。
- 创建：`createAgentProject` → 更新 workspaces/sessions atom → 系统气泡 +「进入项目 / 打开会话」按钮。
- 查看：名称模糊匹配已有 workspace；找不到则诚实说明并可建议新建。
- **无假成功**：创建 IPC 失败会 error 气泡 + toast，并在发给模型的系统备注里写明失败。

### 文件
- `renderer/pages/AiAssistantPage.tsx`
- `renderer/lib/ai-assistant-intent.ts`

### 已知限制
- 意图靠正则，复杂说法可能漏判（仍可当普通聊天）。
- 助理页是精简气泡 UI，不是完整 AgentView（无工具卡片/权限弹窗细览）；重实现请点「进入项目会话」。
- 流式依赖 `setVisibleAgentStreamSession`；若与其它会话抢可见流，可能影响对方页的流式观感。
- P3（主动跟进/例行）未做。

---

## 追加：工作台 UI（2026-10-22）

详见 `docs/Roy-AI工作台.md`：球体工作台、多外观（含艾微风）、语音识别与可选 TTS 接入。Agent 能力仍嵌入 `AgentView`。
