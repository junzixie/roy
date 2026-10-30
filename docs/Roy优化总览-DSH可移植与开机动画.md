# Roy 优化总览：问题盘点 + DSH 可移植能力 + 开机动画方案

> 2026-10-30 调研。三块内容：
> ① Roy 自身问题盘点（按投入产出比排序）
> ② DSH 生态里值得搬到 Roy 的能力
> ③ 开机动画 —— 现状、DSH 对照、改进方案

---

# 一、Roy 自身问题盘点

数据来源：`apps/electron/src` 全量统计（839 个源文件、129 个测试文件）。

## 1.1 巨型文件（可维护性最大短板）

| 文件 | 行数 | 它同时负责几件事 |
|---|---|---|
| `main/ipc.ts` | **6767** | 470 个 `ipcMain.handle`，覆盖 agent/channel/market/wallpaper/usage/… 全部域 |
| `renderer/components/app-shell/LeftSidebar.tsx` | **5267** | 会话列表 + 搜索 + 分组 + 拖拽 + 右键菜单 + 设置入口 |
| `preload/index.ts` | **3594** | 全部 IPC 桥接（与 ipc.ts 一一对应，改一处要改两处） |
| `renderer/components/agent/AgentView.tsx` | **3516** | 消息流 + 输入区 + 工具栏 + 滚动管理 |
| `main/lib/agent-orchestrator.ts` | **2888** | 会话编排 + 队列 + 委派 + 中断 |
| `main/lib/adapters/pi-agent-adapter.ts` | **2626** | 模型适配 + 工具注册 + 流处理 |
| `main/lib/feishu-bridge.ts` | **2584** | 飞书全协议（其他 IM 桥各 1-2k 行，有复制粘贴嫌疑） |
| `renderer/components/agent/SidePanel.tsx` | **2553** | 右栏全部面板 |
| `main/lib/channel-manager.ts` | **2483** | 渠道 CRUD + 探测 + 余额 |
| `renderer/hooks/useGlobalAgentListeners.ts` | **2195** | 全部 agent 事件订阅 |

**建议**：`ipc.ts` 按域拆成 `main/ipc/{agent,channel,market,wallpaper,...}.ts`，`preload` 用一份共享的类型表生成——现在两边靠人肉同步，是 typo 的高发区。这是**改造成本最低、收益最大**的一项。

## 1.2 性能隐患

| 问题 | 证据 | 影响 | 建议 |
|---|---|---|---|
| **100MB 附件走 base64 IPC** | `ipc.ts:4772` `readFileSync(...).toString('base64')`，上限 `chat.ts:14` | 界面冻结，内存峰值 200MB+ | 见 1.3b，**P0** |
| 主进程同步 I/O | main 目录 **279 处** `readFileSync`/`writeFileSync`/`execFileSync` | 大目录扫描、大文件读时阻塞事件循环 | 启动路径和 IPC handler 内的改 `fs/promises` |
| `execSync` 执行外部命令 | `bun-finder.ts:121`、`shell-env.ts:93` | 探测 Bun/Shell 时主进程冻结数百 ms～数秒 | 改 `spawn` + Promise + 超时 |
| 同步 IPC 阻塞 UI | `preload/index.ts:2055`、`:2084` | 每次保存设置/草稿都阻塞渲染线程 | 除 `beforeunload` 外改 `invoke` |
| 长列表未虚拟化 | 574 处 `.map(`，FileBrowser 全量渲染（`FileBrowser.tsx:446`） | 数千项目录滚动卡顿 | 用 `@tanstack/react-virtual`（`virtual-sidebar-list.tsx:34` 已有封装） |
| 消息列表只做窗口化 | `AgentMessages.tsx:56`（首屏 40 组、每次 +25），DOM 无上限增长 | 长会话滚回历史后节点数万 | 改真虚拟列表，或对折叠组做 DOM 卸载 |
| 高频组件无 memo | `AgentView` / `SidePanel` / `ContentBlock` 均 0 处 `React.memo` | 流式输出每帧重渲染整棵消息树 | 给 `MessageGroupRenderer`、`ContentBlock` 加 memo + 稳定 key |
| 巨型 effect | `useGlobalAgentListeners.ts:625` 单个 effect 延伸到 `:2194` | 20+ 监听器共用，任一依赖变更全量重订阅 | 按事件域拆 6~8 个 |
| 2 处主进程定时器无句柄 | `ipc.ts:5808`、`roy-account.ts:337` | 热重载/测试环境重复叠加 | 存 id，`before-quit` 清理 |
| 网络请求缺超时 | `dingtalk-bridge.ts:513` `await fetch(...)` 无 signal | 挂起即永久 pending | 统一 `AbortSignal.timeout(30_000)`（`http-tool-executor.ts:117` 已有范例） |

## 1.3 安全问题（2 个 P0）

### ① 登录窗 `main/login-window.ts:51` —— 风险最高

```ts
webPreferences: { nodeIntegration: true, contextIsolation: false, sandbox: false }
...
void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(PAGE)}`)  // :98
```
**这是密码入口**，却关掉了全部三层隔离，页面还走 `data:` URL（无 CSP）。窗口内的内联脚本可以直接 `ipcRenderer.invoke('login:submit')`。虽然 `ipcMain` 侧有 `mine(e)` 校验发送者，但一旦 `PAGE` 里任何插值来自用户数据（用户名回显、错误消息），就是密码泄露面。

### ② 悬浮球 `main/floating-ball-window.ts:120`

```ts
webPreferences: { nodeIntegration: true, contextIsolation: false, sandbox: false, backgroundThrottling: true }
...
void this.win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(PAGE)}`)  // :124
```
同样关掉全部隔离 + `data:` URL。`ipcMain` 侧有 `isMine(sender)` 校验，但 `PAGE` 里的图标 URL、状态文本都是动态写入的。

**共性根因**：这两个窗口都是「主进程内嵌 HTML 字符串」的形态，绕过了 renderer 的安全边界与组件体系。同类还有 `lib/mobile-remote-page.ts`、`lib/quick-task-window.ts`、`lib/computer-overlay.ts`。

**建议**：抽一个 `createSecureWindow()` 工厂统一安全策略，两个窗口改 `contextIsolation: true` + 独立 preload（`contextBridge` 只暴露该窗口需要的那几个通道），页面改本地文件而非 `data:` URL。改动约 100 行，把 2 个 P0 一起清掉。

**安全面检查通过的部分**：
- `dangerouslySetInnerHTML` 仅 3 处，**均已净化**（`live-markdown-table-inline.ts:8` 用 `html: false` 且显式转义 fallback；`DiffTabContent.tsx:864` 过 `DOMPurify.sanitize`）
- `as any` 全仓仅 3 处（非测试），类型纪律很好
- 全仓无 `ipcRenderer` 本体泄漏、无动态通道透传
- 路径拼接已校验（`ipc.ts:4765` `isPathAllowed`、`:2196` `startsWith(resourcesDir+sep)`、`:4792`）
- 包间无循环依赖（`core→shared`、`session-core→shared`、`ui→core`），main 与 renderer 无跨层 import

## 1.3b 一个被我先前漏掉的 P0：100MB 附件走 base64 IPC

**`main/ipc.ts:4772`**
```ts
const st = statSync(resolved)
if (st.size > effectiveMaxSize) return null
return readFileSync(resolved).toString('base64')
```
上限 `MAX_ATTACHMENT_SIZE = 100 * 1024 * 1024`（`packages/shared/src/types/chat.ts:14`），消费方 `AgentView.tsx:1349`。

**后果**：拖入一个 100MB 附件 → 主进程同步读盘阻塞 → 编码成 base64 再膨胀 1.33 倍 → 经结构化克隆送进渲染进程，**内存峰值 200MB+，界面直接冻结**。

**建议**：改分块流式（`webContents.send` 多次），或干脆走 `roy-file://` 自定义协议让 `<img>`/`<video>` 自己加载，去掉 base64 这一层。

## 1.4 工程卫生

| 项 | 现状 | 建议 |
|---|---|---|
| 根目录临时脚本 | 28 个 `_tmp_*.py`（351 KB），**未被 git 跟踪** | 删掉，加 pre-commit 拦截 |
| `_tmp/` | **855 MB** | `.gitignore:53` 已覆盖，可删 |
| `backups/` | 506 MB | 移出仓库，补 `.gitignore` |
| `release/` | **8.6 GB** | 移出仓库，补 `.gitignore` |
| 死依赖 | `react-virtuoso@^4`、`reactflow@^11`（实际用 `@xyflow/react`）、`node-cron` 全仓 0 引用 | 从根 `package.json:41-43` 移除 |
| 依赖重复声明 | 根 `package.json` 与 `apps/electron/package.json` 都声明 dompurify/ink-mde/jotai 等 | 根只留 workspace 与工具链 |
| 重复工具函数 | `formatBytes`/`formatFileSize`/`formatSize` **7 份**、`formatDuration` **3 份**（`cn()` 无重复） | 收敛到 `packages/shared/src/format.ts` |
| IPC 通道命名 | `ipc.ts` 内 **85 个裸字符串** vs 63 个常量引用；常量散在 12 个对象、2 个包 | 全改常量 + `@roy/shared` 建 `IpcChannel` 联合类型 |
| 死代码 | `ai-assistant-intent.ts`（75 行）全仓 0 import | 删 |
| 测试密度 | 129 测试 / 839 源文件 ≈ 15% | 够用但偏薄，优先补 `agent-orchestrator`、`channel-manager` |

## 1.5 Top 5 最该先修（已按审计修正）

| 顺序 | 事项 | 证据 | 投入 | 收益 |
|---|---|---|---|---|
| 1 | **100MB 附件去 base64** | `ipc.ts:4772` + `chat.ts:14` | 半天 | 直接消除最严重的界面冻结 |
| 2 | **两个 `nodeIntegration:true` 窗口** | `login-window.ts:51`、`floating-ball-window.ts:120` | 100 行 | 含密码入口，风险最高 |
| 3 | `ipc.ts` 按域拆分 + preload 类型共享 | `main/ipc.ts`（6767 行 / 470 handler） | 半天 | 后续所有 IPC 改动都变快 |
| 4 | 拆 `useGlobalAgentListeners` 的巨型 effect | `useGlobalAgentListeners.ts:625-2194` | 半天 | 20+ 监听器共用一个 effect，任一依赖变更全量重订阅 |
| 5 | 清理约 10 GB 构建残留 + 3 个死依赖 | `_tmp/` 855M、`release/` 8.6G、`backups/` 506M | 10 分钟 | 立刻回收磁盘与 grep/pack 速度 |

## 1.6 三个「文档里说已修、实际没落地」的项

这几条值得单独拎出来，因为**照着旧文档改会走弯路**：

| 文档承诺 | 实际状态 |
|---|---|
| 《渲染卡顿解决方案.md》说要接 `react-virtuoso` 做虚拟滚动 | `react-virtuoso` 在 `package.json:42` 声明了，但**全仓 0 引用**。真正在用的是 `@tanstack/react-virtual`（`ui/virtual-sidebar-list.tsx:34`）。要接虚拟化应该用它，不是 virtuoso |
| 定时器泄漏 | **已基本治理**：22 个 `setInterval` / 27 个 `clearInterval`，逐文件比对无缺口。只剩 `ipc.ts:5808`、`roy-account.ts:337` 两处主进程定时器没存句柄 |
| 重复工具函数 | `cn()` **无重复**（只有 `renderer/lib/utils.ts:4` 一处）。但 `formatBytes`/`formatFileSize`/`formatSize` 有 **7 份同义实现**，`formatDuration` 3 份——单位精度不一致，建议收敛到 `packages/shared/src/format.ts` |

---

# 二、DSH 生态里值得搬到 Roy 的能力

已逐个读 25 个插件的 `package.json` / `README` / `lib`，并在 Roy 源码里 grep 对照。

## 2.1 Roy 已有、不用抄

`dsh-usage`（Roy 有 UsagePage + 余额）、`dsh-free-search`（`roy-web-tools.ts` 已有 Bing + DDG）、`dsh-im`（Slack/Telegram/飞书/钉钉齐全）、`dsh-pet`（`floating-ball-window` + `agent-island-service`）、`dsh-plugin-subscriptions`（channel 体系）、`dshmarket`（SkillMarket/McpRepo）。

## 2.2 Roy 完全没有、值得抄

| 插件 | 能力 | 移植价值 | 成本 |
|---|---|---|---|
| `@changfenhuang/dsh-genui` | ` ```dsh-ui ` 生成式 UI：schema 校验 + 自动修复、图表/mermaid/quiz/3D、action 回环 | 高（战略级） | 高 |
| `@yolk_vat-y/dsh-project-memory` | BM25 召回 + 8 语言符号扫描 + `路径:行号` 引用 | 高 | 中 |
| `dsh-image-gen` | 图像套件（画布/批量/多模型/图库） | 中高 | 中 |
| `dsh-worktable` | 分栏工作区引擎（拖拽分割/标签页/终端/浏览器） | 中高 | 高 |
| `dsh-meme` | 表情包图库 + AI 学图 + 导入导出 | 中低 | 低 |

## 2.3 Roy 部分有、缺口明确

| 插件 | Roy 现状 | 缺什么 |
|---|---|---|
| `dsh-diff-approval` | 有 `git-diff-service` + `@pierre/diffs` 的 DiffView | **只有 git 视角**，没有"每次 edit/write 折成 pending 列表 + Keep/Revert" |
| `dsh-context` | `context-ledger.ts` 已在记 `tokensBefore/After/Reclaimed` | **没有任何可视化**，数据白记了 |
| `@nanmicoder/dsh-agent-teams` | 有 `agent-collaboration-tools.ts` 委派 | **无任务 DAG、无质量门契约** |
| `cc-safety-net` | `permission-rules.ts` 正则黑名单 | **换写法就能绕**，缺命令语义解析 |
| `@michengai/dsh-archive-manager` | 有 `session.archived` | 缺墓碑（tombstone）与损坏会话修复 |

## 2.4 工程做法层面（比功能更值钱）

**① 工具结果先落快照再分页**
`dsh-ops/lib/capabilities/result.js` 把大输出存成 `ref://session/tool/uuid` 句柄，模型只能 `page(offset/limit/maxBytes/equals)`。Roy 现在全文进上下文，靠 `agent-tool-token-estimator.ts` 事后估算。
→ 在 `main/lib/adapters/roy-*-tools.ts` 加一层 result-store，返回 `{refId, total, preview}`。

**② 质量门写成纯函数模块**
`dsh-agent-teams/lib/quality-gates.js` 1832 行纯规则：kind 白名单、`needs_revision`/`reject` 必须 fail、review 轮次上限、契约可 `amend` 且留台账。解决"跑完了但说不清算不算完成"。
→ 给 `agent-collaboration-tools.ts` 加 `kind` + `acceptance` + `verify` + `verdict`。

**③ 事件驱动调度，不保留轮询轮**
`scheduler.js` 开头明写：不用轮询任务表，靠 idle/running 边驱动，每次 idle 或任务图变更触发一次原子 claim。
→ `agent-queue-coordinator.ts` 从"队列轮到我"改成"成员变 idle 时尝试 claim"。

**④ 面板做成注册式服务**
`dsh-better-sidebar` 的 `ctx.betterSidebar.registerTab/registerFileViewer`，自己的 5 个 tab 也走这套，所以生态 28+ 插件能复用。
→ 抽 `rightPanelRegistry`，内置面板改为注册项。

**⑤ 输出侧也定 schema，且校验失败自动修复**
`modlens/dsh/vision-schema.json` 把视觉输出固定成 6 个必填段（含 `uncertainty`）；`genui` 的校验器带 repaired 输出，坏组件被丢弃而非整块失败。
→ Roy 入参用 typebox，**输出侧没有 schema**，可给 web/document 类工具补上。

**⑥ 记忆是"正常工作的副产品"**
`dsh-project-memory`：`lazyIndexing` 让模型读到哪个文件就索引哪个；内容哈希增量；派生数据不落盘、读取期计算；召回必带 `路径:行号`。
→ Roy 的 `global-memory.ts` 是一篇 ≤12000 字 md、`GLOBAL_MEMORY_PROMPT_CHARS=4000` 直接注入，不可检索、越写越贵。

**⑦ 安全拦截做命令语义解析**
`cc-safety-net` 明写"wrapping the command or reordering flags does not hide it"，同时诚实声明"is not a sandbox"。
→ 只改 `packages/shared/src/constants/permission-rules.ts` 一个文件。

## 2.5 不建议抄

- **`dsh-univer-office`**：libsql + puppeteer-core + 公式引擎 + Gateway 进程，等于引入第二个运行时。Roy 的 `document-parser.ts` 已覆盖"读"，"编辑表格"不是 Roy 定位。
- **`dsh-pet`**：与现有悬浮球抢位置。
- **`dsh-unlag`**：它的价值来自"插件是可替换实例"，Roy 是编译进 Electron 的 monorepo，抄不动；dev 已有 Vite HMR。只值得抄原则：重载 UI 别中止在跑的轮次。
- **`dshmarket` 全量目录**：4200+ 条是 DSH 生态镜像，Roy 没有插件运行时。只抄兼容性判定与日志脱敏。
- **`agent-teams` 的 captain/mailbox/常驻成员**：Roy 是父子会话模型（`MAX_RUNNING_DELEGATIONS_PER_PARENT=50`），引入信箱会与 `agent-queue-coordinator` 抢生命周期。只抄质量门。
- **`dsh-ops` 的 PTC 模式**：Roy 不是 PTC 架构。

## 2.6 Top 5（按 ROI）

| 顺序 | 事项 | 为什么排这么前 |
|---|---|---|
| 1 | `dsh-diff-approval` 的 pending keep/revert | 数据源（`git-diff-service` + DiffView）全都有，只差一层折叠 + 两个按钮 |
| 2 | `dsh-context` 上下文仪表盘 | `context-ledger.ts` 已在记录，**零新增采集成本**，只差展示 |
| 3 | `cc-safety-net` 命令语义解析 | 只改一个文件 |
| 4 | `agent-teams` 质量门契约 | 解决委派"算不算完成"的判定缺失 |
| 5 | `project-memory` BM25 召回 | 做完才能替换掉那 4000 字硬注入 |

> `genui` 战略价值最高但成本也最高（要一套 renderer 组件库 + 校验器 + action 回环）。建议先做 `table`/`chart`/`callout` 三种最小组件验证模型输出稳定性。

---

# 三、开机动画

## 3.1 先说结论

**Roy 已经有一套完整的开机动画了。** 而且和 DSH 社区的成熟插件在架构上高度相似——但缺了三个关键设计。

**DSH 本体（`@deepseek-ai/*`）没有开机动画**：`/lib/welcome/` 是登录引导窗口（React + spinner），不是动画。

但 **DSH 社区有三个**（通过 `@linxin666/dsh-client-ui-community-plugins` 的 131 条目录查证）：

| 插件 | 作者 | 做法 | 与 Roy 的关系 |
|---|---|---|---|
| **`dsh-boot-animation`** | Alice-Marx（上游 lxj5820） | 用本地视频替换启动页，播放完过渡进应用 | **和 Roy 现在的做法几乎一样**，最佳参照 |
| `dsh-550c-boot` | yannicksong0106 | 550C 全屏片头（简易 4s / 完整 17s）+ 可交互 UEG 登录授权 | 更重，含登录流程 |
| `dsh-startup-secret` | huzhengcai471-crypto | 未查证 | — |

**`dsh-boot-animation` 才是你该看的那个。** 我下了它的 npm 包（`@ljwei-stak/dsh-boot-animation@0.4.0`，78 MB 主要是 4 个内置视频）逐文件读过源码。

## 3.1b `dsh-boot-animation` 的关键设计（Roy 缺的就是这些）

### ① 它读的是**真实启动进度**，不是假动画 ⭐

`src/boot-screen.js:491-503`：

```js
/** Drive the bar from the kernel's own progress arc. */
function observeProgress() {
  var boot = document.querySelector('[data-dsh-boot]')
  if (boot === null) return
  var spinner = boot.querySelector('[data-dsh-boot-spinner]')
  if (spinner === null) return
  var update = function () {
    var raw = parseFloat(spinner.style.getPropertyValue('--dsh-boot-arc'))
    var ratio = Number.isFinite(raw) ? Math.min(Math.max((raw - ARC_MIN) / ARC_SPAN, 0), 1) : 0
    parts.fill.style.width = (ratio * 100).toFixed(1) + '%'
  }
  update()
  new MutationObserver(update).observe(spinner, { attributes: true, attributeFilter: ['style'] })
}
```

**它监视内核启动页自己写在 spinner 上的 CSS 变量 `--dsh-boot-arc`**（72deg = 0 个插件激活，288deg = 全部激活），用 `MutationObserver` 跟随。进度条第一次说真话。

**这正是 Roy 缺的**——Roy 的 `index.html:82` 是固定 2.2s 动画停在 86%。

### ② 它能在**启动失败**时救命

`src/boot-screen.js:509-520`：

```js
/** Detect the kernel's failure rendering. ... without this the screen would
 *  hold the viewport forever and hide the diagnosis. */
function observeFailure() {
  var boot = document.querySelector('[data-dsh-boot]')
  if (boot === null) return
  var check = function () {
    if (namespace.failed) return
    var text = boot.textContent || ''
    if (text.indexOf('Failed to load plugins') < 0 && text.indexOf('did not activate') < 0) return
    namespace.failed = true
    attention('启动失败，点击查看')
  }
  // ...
}
```

**Roy 有同样的风险**：如果渲染进程崩溃，`renderer-ready` 永远不发，splash 就永远停在屏幕上（Roy 只在 `showRendererFailure` 里调 `dismissStartupSplash`，见 `index.ts:685`，但那是崩溃处理器，不是兜底超时）。

### ③ 三个入场时机（`enterMode`）

`src/boot-screen.js:37-40`：

| 模式 | 行为 |
|---|---|
| `tail`（默认） | 视频最后 `FADE_MS` 内溶解，画面与淡出同时结束 |
| `end` | 播完再淡出 |
| `click` | 不自动进，等用户点 |

Roy 现在是固定"最短 2000ms + 淡出 320ms"，**没有"等用户点"这个档**。

### ④ 无限长/未知时长视频的兜底

```js
// A clip whose length is unknown never fires `ended` — a MediaRecorder WebM
// reports `duration = Infinity` — so waiting for an end that cannot come would
// hold the screen forever. This bounds that, and only that.
var ENDLESS_MS = 20000
```

Roy 的 10 个 mp4 都有明确时长，暂时用不上，但**用户自定义视频**就会踩到。

### ⑤ 设置页能**实时预览**，不用重启

`src/boot-screen.js:400-410` 的 `namespace.preview({ name, fadeMs, ... })`：

> 用卡片当前显示的设置**重建 overlay**，用指定的 clip 而不是随机抽，退场走**和真实启动路径同一个 `enter()`**。

Roy 的设置页只有静态缩略图，改完要重启才能看到效果。

### ⑥ faststart 一键优化（纯 JS，无 ffmpeg）

`src/remux.js`（367 行）——**无损把 moov 移到文件头**，in-process，不 shell out：

> 不变量：等长、剥掉 moov 后媒体载荷逐字节相同、chunk offset 表按布局位移精确平移、**并断言输出文件里 moov 真的在 mdat 之前**（检查输出而非计划——"计划没动 moov"能通过其它所有证明，这个工具曾因此写出字节完全相同的副本并报告成功）。

**Roy 的 10 个 mp4 已经是 faststart**（我 hexdump 验过：`ftyp` 后紧跟 `moov`），所以这条对内置动画无用，但对用户导入的视频有用。

## 3.2 Roy 现有实现（已跑通）

### 架构：双窗口交接

```
主进程启动
  ↓
createStartupSplashWindow()          main/index.ts:460
  ├─ 无边框窗口，尺寸/最大化状态与主窗口一致（避免尺寸跳变）
  ├─ backgroundColor: '#050b0e'      ← 与启动页背景同色，避免闪一下
  ├─ sandbox: true, contextIsolation: true
  └─ loadFile(resources/startup-splash/index.html?anim=<设置值>)
  ↓
splash.once('ready-to-show') → splash.show()
  ↓（同时主窗口在后台创建、加载 Renderer）
  ↓
renderer 挂载完成 → 等两帧 → notifyRendererReady()   App.tsx:52-56
  ↓
ipcMain.handle('app:renderer-ready') → dismissStartupSplash()   index.ts:768
  ├─ 保证最短 2000ms 可见（STARTUP_SPLASH_MIN_ON_SCREEN_MS）
  ├─ executeJavaScript: window.stopRoySplash() + opacity → 0
  └─ 320ms 后 destroy
```

关键设计（都写在注释里，是正确的）：
- **不等固定时长，等真实信号**：`app:renderer-ready` 由渲染层在两帧后发出，机器快慢都能盖住空白期（`index.ts:766-767`）
- **先淡出再销毁**：直接 `destroy` 会露出主窗口上屏前的空白（`index.ts:441`）
- **Windows 不支持 `setOpacity`**，所以用 CSS 淡出兼容两种情况（`index.ts:445`）
- **主窗口用 `html[data-roy-booting]` 把背景让出来**（`globals.css:3029`），AppShell 挂载后两帧再撤销——两个窗口交接时不露灰白

### 动画资源：11 个

`resources/startup-splash/` 下 10 个 mp4（每个 150 KB ~ 1.5 MB，共约 4.7 MB）+ 一个 Canvas 2D 粒子球：

| 名字 | 类型 | 大小 |
|---|---|---|
| `orb` | **Canvas 2D 程序生成**（9000+ 点球面自转 + 星尘反向慢转） | 0（代码画） |
| `fb-gateway` / `fb-planet` / `fb-bolt` / `fb-arches` / `fb-astronaut` / `fb-neon-helmet` / `fb-aurora` / `fb-night` / `anim-bg2` / `anim-hf1` | mp4 整屏循环 | 4.7 MB |

粒子球的实现质量很高（`index.html:141-232`）：
- 黄金角螺旋分布保证球面均匀
- `dpr = min(devicePixelRatio, 2)`
- 按画布尺寸自适应点数（2600 ~ 9600）
- 深度决定亮度与点大小，`globalCompositeOperation = 'lighter'`
- `prefers-reduced-motion` 时限到 12 fps
- `document.hidden` 时跳过绘制
- 视频加载失败**自动退回粒子球**，绝不留黑屏（`index.html:262-268`）

### 设置页

`StartupAnimationSetting.tsx` —— 12 个选项（含「随机」），每个带 webp 缩略图 + 中文名 + 描述 + 时长，编号网格 + 当前选择大预览。存 `settings.startupAnimation`，主进程通过 `loadFile` 的 query 传给 splash。

## 3.3 现有实现的三个真实缺陷

### 缺陷 1：进度条是假的

`index.html:82-89`：
```css
.fill { animation: progress 2.2s cubic-bezier(.3,0,.2,1) .15s forwards; }
@keyframes progress {
  0% { width: 0; }
  55% { width: 52%; }
  100% { width: 86%; }
}
```
固定 2.2 秒走到 86% 就停住，**与真实启动进度毫无关系**。机器慢时壁纸停在 86% 干等，机器快时动画没走完就被淡出。

### 缺陷 2：步骤文案是假的

`index.html:120-131`：
```js
const STEPS = ['正在读取配置', '正在连接模型', '正在启动 MCP 服务器', '正在扫描技能', '正在准备你的工作目录']
setInterval(() => { si = (si + 1) % STEPS.length; renderStep() }, 1600)
```
每 1.6 秒轮播一次，**循环播放、不知道真实状态**。用户看到"正在启动 MCP 服务器"时，可能 MCP 早就起好了，或者压根还没到那一步。

### 缺陷 3：没有失败兜底（`dsh-boot-animation` 有）

如果渲染进程崩溃、或 `renderer-ready` 因为任何原因没发出，splash 会**永远停在屏幕上**，而且盖住了下面的错误信息。

Roy 只在崩溃处理器里收（`index.ts:685` 的 `showRendererFailure`），但那是"已经检测到崩溃"的分支。`dsh-boot-animation` 的做法更彻底（`src/boot-screen.js:509-520`）：

```js
// The kernel replaces the boot card's children with a failure report and never
// mounts the application, so without this the screen would hold the viewport
// forever and hide the diagnosis.
if (text.indexOf('Failed to load plugins') < 0 && text.indexOf('did not activate') < 0) return
namespace.failed = true
attention('启动失败，点击查看')
```

它**主动去看底层有没有渲染出错误文案**，有就让位并提示"点击查看"。

## 3.4 改进方案

### 方案 A：接真实启动进度（推荐，收益最大）

主进程把启动里程碑实时推给 splash，替换掉假的进度条和轮播文案。

**关键洞察：`safeRun` / `safeAwait` 就是现成的钩子。**

`main/index.ts:1165-1180` 这两个函数**已经包裹了全部 28 个启动步骤**：

```ts
function safeRun(name: string, fn: () => void): void {
  try { fn() } catch (err) { console.error(`[启动] ${name} 失败（已隔离）:`, err) }
}
async function safeAwait(name: string, fn: () => Promise<unknown>): Promise<void> {
  try { await fn() } catch (err) { console.error(`[启动] ${name} 失败（已隔离）:`, err) }
}
```

所以**只要在这两个函数里各加一行**，28 个启动点全部自动带上进度，调用方一行都不用改：

```ts
function safeRun(name: string, fn: () => void): void {
  reportBootProgress(name)          // ← 只加这一行
  try { fn() } catch (err) { console.error(`[启动] ${name} 失败（已隔离）:`, err) }
}

async function safeAwait(name: string, fn: () => Promise<unknown>): Promise<void> {
  reportBootProgress(name)          // ← 只加这一行
  try { await fn() } catch (err) { console.error(`[启动] ${name} 失败（已隔离）:`, err) }
}
```

`reportBootProgress` 把内部代号翻成用户能读的中文，按真实顺序推进：

```ts
/** 启动步骤代号 → 启动页文案。按真实执行顺序排列，未列出的代号不推进进度。 */
const BOOT_STEP_LABELS: Record<string, string> = {
  initializeRuntime: '正在初始化运行环境',
  seedDefaultSkills: '正在准备技能',
  upgradeDefaultSkillsInWorkspaces: '正在升级技能',
  registerIpcHandlers: '正在注册接口',
  cliBridge: '正在启动命令行',
  mobileRemote: '正在启动远程控制',
  startWorkspaceWatcher: '正在监听工作目录',
  startAllBridges: '正在连接消息渠道',
  startScheduler: '正在启动定时任务',
  startPlanningReminderScheduler: '正在准备提醒',
}
const BOOT_STEP_TOTAL = Object.keys(BOOT_STEP_LABELS).length
let bootStepDone = 0

function reportBootProgress(name: string): void {
  if (!(name in BOOT_STEP_LABELS)) return
  bootStepDone = Math.min(BOOT_STEP_TOTAL, bootStepDone + 1)
  if (!startupSplashWindow || startupSplashWindow.isDestroyed()) return
  startupSplashWindow.webContents.send('splash:progress', {
    label: BOOT_STEP_LABELS[name],
    percent: Math.round((bootStepDone / BOOT_STEP_TOTAL) * 100),
  })
}
```

**改动点汇总：**

| 文件 | 改什么 | 量 |
|---|---|---|
| `main/index.ts` | `safeRun`/`safeAwait` 各加一行 + 新增 `BOOT_STEP_LABELS` 和 `reportBootProgress` | ~30 行 |
| 新建 `preload/splash.ts` | 极小 preload，只暴露 `onProgress(cb)` | ~15 行 |
| `main/index.ts:474` | splash 的 `webPreferences` 加 `preload` 路径 | 1 行 |
| `resources/startup-splash/index.html` | 加监听，替换假动画 | ~20 行 |

**splash 端改法**（`index.html`）：

```js
// 删掉这两个假的东西：
//   .fill 的 @keyframes progress（固定 2.2s 走到 86%）
//   const STEPS = [...] + setInterval(...) 轮播

const fillEl = document.querySelector('.fill')
const stepEl = document.getElementById('step')
const splashApi = window.roySplash   // 来自 preload

splashApi?.onProgress(({ label, percent }) => {
  // 关掉那条 CSS 假动画，改由真实进度驱动
  fillEl.style.animation = 'none'
  fillEl.style.transition = 'width .45s cubic-bezier(.3,0,.2,1)'
  fillEl.style.width = Math.max(percent, 4) + '%'

  stepEl.innerHTML = ''
  const s = document.createElement('span')
  s.textContent = label
  s.style.animation = 'step-in 1.6s ease-in-out both'
  stepEl.appendChild(s)
})
```

**为什么用 preload 而不是 `executeJavaScript`**：主进程已有 `executeJavaScript` 的用法（`index.ts:447` 淡出那段），但每次调用都是一次跨进程往返 + 字符串拼接，28 次启动步骤会放大这个成本。给 splash 加一个只暴露一个函数的 preload 更干净，也不破坏 `sandbox: true`。

**兜底**：某步卡住时进度就停在那一格——这恰好是**有用的信息**（用户知道卡在哪）。再加一条：15 秒没动静就把文案改成「启动比平时慢，仍在继续…」。

**收益**：进度条第一次说真话；用户能看出卡在哪一步；慢机器上不再干等一个假 86%。

### 方案 B：失败兜底（抄 `dsh-boot-animation`，成本极低）

**问题**：`renderer-ready` 万一不发，splash 永远停在屏幕上，还盖住下面的错误。

**改法**（`main/index.ts`，约 15 行）：`createStartupSplashWindow()` 里加一个硬超时——

```ts
// 兜底：渲染层 30 秒还没 ready，说明卡住或崩了，让出屏幕别挡住诊断信息
const SPLASH_HARD_TIMEOUT_MS = 30_000
setTimeout(() => {
  if (!startupSplashWindow || startupSplashWindow.isDestroyed()) return
  console.warn('[启动] 渲染层超时未就绪，强制收起启动页')
  dismissStartupSplash()
}, SPLASH_HARD_TIMEOUT_MS)
```

并在 `index.html` 里加"点击跳过"（用户已经有这个直觉了）：

```js
// 点一下立即结束，不用等最短 2000ms
document.addEventListener('click', () => window.stopRoySplash?.(), { once: true })
// 或者更彻底：通知主进程立刻淡出
```

### 方案 C：加"点击跳过"与 `enterMode` 三档

抄 `dsh-boot-animation` 的 `tail` / `end` / `click`（`src/boot-screen.js:37-40`）：

| 模式 | Roy 现状 | 改动 |
|---|---|---|
| `tail` | 等价于现在的行为 | 保持 |
| `end` | 无 | 等 `video.ended` 再淡出 |
| `click` | 无 | 不自动退，等用户点 |

Roy 现在只有一个"最短 2000ms"，加一个 `click` 档对**想看清动画的用户**很有用（他们可以一直看，看完再点）。

### 方案 D：设置页实时预览

`dsh-boot-animation` 的 `namespace.preview({ name, ... })` 能在已启动的页面上重跑一次真实 overlay（`src/boot-screen.js:400-410`）。Roy 的设置页只有静态 webp 缩略图。

**改法**：在 `StartupAnimationSetting.tsx` 的选中卡片上加一个「预览」按钮，点击后**开一个无边框小窗口**加载同一个 `index.html?anim=<id>&preview=1`，播放完或点击后关闭。复用现有的 splash 窗口创建逻辑即可。

### 方案 E：首次启动用独立动画

现有 11 个动画是"日常启动"用的。首次启动（检测不到 `settings` 文件）可以：
- 用粒子球 + 更长的文字（品牌时刻）
- 或直接跳过 splash，进引导页

**改动**：`createStartupSplashWindow()` 里判断 `isFirstRun()`，传 `?anim=orb&first=1`。

### 方案 F：加音效

`dsh-boot-animation` 有完整的音效实现（`SOUND_ON`、`AUDIO_GRACE_MS = 1300`、淡出按片头时长提前排程）。Roy 的 `index.html` 里 `window.stopRoySplash` 已经在暂停所有 `getAnimations()`，加 `<audio>` 很自然。

注意：
- 默认静音，设置里开关
- 系统启动时（开机自启）不要响
- 必须 `muted` 才能自动播，用户交互后解除

**建议**：优先级最低。

### 方案 G：加一个新动画（如果只是想要更多选择）

流程很简单，4 步：
1. mp4 丢进 `apps/electron/resources/startup-splash/`
2. 生成 webp 缩略图放 `apps/electron/src/renderer/assets/startup/`
3. `StartupAnimationSetting.tsx` 的 `STARTUP_ANIMATION_OPTIONS` 加一行
4. `index.html` 的 `ANIMATIONS` 数组加一行

`bun run build:resources`（`scripts/copy-resources.ts`）会把整个 `resources/` 复制到 `dist/resources/`，`electron-builder.yml:55` 的 `extraResources` 再打进安装包。**不需要改构建配置。**

> 提示：现有 10 个 mp4 **全部已经是 faststart**（我 hexdump 验过，`ftyp` 后紧跟 `moov`），所以首帧不会等整文件读完。新加的动画也建议先跑一次 `ffmpeg -movflags +faststart`。

## 3.5 建议的执行顺序

| 优先级 | 事项 | 改动文件 | 预估 |
|---|---|---|---|
| **P0** | 方案 A：接真实进度 | `main/index.ts` + `index.html` + 新增 splash preload | 2-3 小时 |
| 优先级 | 事项 | 改动文件 | 预估 |
|---|---|---|---|
| **P0** | 方案 A：接真实进度 | `main/index.ts`（`safeRun`/`safeAwait` 各加一行）+ `index.html` + 新增 splash preload | 2-3 小时 |
| **P0** | 方案 B：失败兜底 | `main/index.ts` + `index.html` | 30 分钟 |
| P1 | 方案 C：点击跳过 + `enterMode` | `index.html` + `main/index.ts` | 1 小时 |
| P1 | 方案 D：设置页实时预览 | `StartupAnimationSetting.tsx` + 复用 splash 窗口 | 2 小时 |
| P2 | 方案 E：首次启动变体 | `main/index.ts` + `index.html` | 1 小时 |
| P2 | 方案 G：加新动画 | 4 个文件各加一行 | 30 分钟/个 |
| P3 | 方案 F：音效 | `index.html` + settings | 2 小时 |

---

# 附：三份报告的关系

- 壁纸专项 → `docs/壁纸插件对照-DSH-wallpaper-engine.md`
- 本文档 = 全局问题 + DSH 可移植 + 开机动画

建议先做壁纸 P0（切源闸门，用户立刻可感知）+ 悬浮球安全修复（30 行），再做本文档的 P1 批次。
