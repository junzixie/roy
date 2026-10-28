# Arthur CLI 对照（→ Roy harness）

> 审查时间：2026-10-22（Asia/Shanghai）  
> Arthur：`D:\ai-projects\aixiangmu\Arthur`（含 `dist\...\resources\app\bin`）  
> Roy：`C:\Users\Administrator\Desktop\Roy`  
> 只读对照；本轮未改业务代码。

---

## 1. 直接回答用户两问

### 1.1 Roy 是否已加入类似 Arthur 的命令行？

**有命令行，但还没有 Arthur 那种「一键加进用户 PATH」的完整产品面。**

| 维度 | Arthur（截图场景） | Roy 现状 |
|---|---|---|
| 命令名 | `arthur` | `roy`（`@roy/cli` bin） |
| 打包落地 | `resources/app/bin/arthur` + `arthur.cmd` | 已有 `apps/electron/resources/bin/roy.exe`（约 96MB 编译产物）+ `build-cli.ts` 写入 extraResources |
| 包装方式 | `ELECTRON_RUN_AS_NODE=1` 调同目录 Arthur.exe 跑 `electron/cli.js`（**不要求本机装 Node**） | bun `--compile` 成独立 `roy.exe` |
| 运行时桥 | inbox 投递 + `app.pid`；App 未开可**自动拉起**再执行 | `~/.roy/cli-bridge.json` 本地 HTTP；**多数写操作要求 Roy 已在跑** |
| 设置里一键 PATH | **有**：`src/settings/General.tsx`「把 arthur 加进 PATH」+ `cliPathStatus` / `cliPathSet`（改当前用户 PATH，无需管理员） | **未找到**等价设置页开关；内嵌终端可通过 `ROY_CLI` / PATH 前置给 Agent，但用户系统 PATH 一键接入缺失 |
| 命令覆盖 | `run` / `open` / `workflow` / `routine` / `todo` / `help` / `status`… | `ask` / `stop` / `sessions` / `session *` / `cron` / `todo` / `workflow` / `help`；**无 `routine` 别名**（定时用 `cron`） |

**结论（给用户的一句话）**  
Roy **已经有** `roy` CLI 与打包二进制，能力上覆盖 ask / todo / cron / workflow；**还没有** Arthur 截图里那种「设置里一键加入 PATH、任意新开 cmd/PowerShell 直接敲 arthur」的体验闭环。差在：**用户 PATH 产品化 + App 未开时的投递/拉起 + 部分命名（routine）与帮助文案体验。**

### 1.2 Arthur 有哪些优点可吸取进 Roy harness？

见下文 P0 / P1。

---

## 2. 两边结构速查

### Arthur

- `bin/arthur` / `bin/arthur.cmd` → `electron/cli.js`
- `electron/cli-bridge.js`：进程内 PATH 前置、inbox 监视、`cliPathStatus`/`cliPathSet`
- 设置 UI：`src/settings/General.tsx`「命令行工具」区块
- 截图路径形态：`...\Arthur-win32-x64\resources\app\bin`

### Roy

- `apps/cli/`：`roy` 入口 + commands（basic / ops / workflow / session）
- `apps/electron/src/main/lib/cli-bridge.ts`：本机 HTTP 桥
- `apps/electron/scripts/build-cli.ts` → `resources/bin/roy.exe`
- `config-paths.ts`：`getBundledCliPath()` / `ROY_CLI` 给 Agent/Skill

---

## 3. 命令对照

| 用户意图 | Arthur | Roy | 差距 |
|---|---|---|---|
| 总帮助 | `arthur help` | `roy help` / `roy` | 有；Arthur 帮助表更「人话」、带数据目录 |
| 丢一句话干活 | `arthur run "…"` | `roy ask "…"` | 有；Arthur 可 inbox + 自动开 App |
| 工作流 | `arthur workflow list/show/run/…` | `roy workflow …` | 基本齐 |
| 定时/例行 | `arthur routine …` | `roy cron …` | **命名不同**；可加 `routine` 别名 |
| Todo | `arthur todo …` | `roy todo …` | 齐 |
| 打开 App | `arthur open` | （依赖已开或手动开） | Roy 弱 |
| 状态摘要 | `arthur status`（运行中/用户/数量） | `roy` 侧偏 sessions/status 分散 | 可补一页式 status |

---

## 4. 可吸取优点（优先级）

### P0（对「像截图那样好用」最关键）

1. **设置页一键「把 roy 加进 PATH」**  
   - 学 Arthur `cliPathStatus` / `cliPathSet`（仅当前用户 PATH、PowerShell 改注册表用户环境、无需管理员）  
   - UI 文案：已加入 / 未加入 + bin 实际路径 +「新开终端后试 `roy help`」  
2. **安装/打包路径可发现**  
   - 保证安装版 `resources/bin` 稳定存在；设置里展示真实路径（对标截图里的 bin 路径）  
3. **App 未运行时的投递策略（可选 inbox）**  
   - Arthur：`run`/`workflow run`/`routine run` 写 inbox，必要时 spawn App  
   - Roy：今日多数命令硬依赖 cli-bridge；可对 `ask`/`workflow run`/`cron run` 做「排队到下次启动」或「自动拉起」  

### P1（体验与 harness 一致性）

4. `routine` 作为 `cron` 的别名（或统一文档用语），降低从 Arthur 迁移成本  
5. 中文友好 help / 表格输出（Arthur `table()` + 长 HELP）  
6. 内嵌终端与系统终端 PATH 策略对齐（进程内前置 + 用户 PATH 开关）  
7. `roy status` 一页摘要：App 是否在跑、桥端口、workflow/cron/todo 计数  
8. Windows `roy.cmd` 薄包装（若需非 .exe 场景）；保持不强制本机 Node（Roy 已用 compile，方向正确）

### 不建议照搬

- 与 Arthur 抢同一 `arthur` 命令名  
- 把 CLI 绑死 `ELECTRON_RUN_AS_NODE`（Roy 已有独立 exe，更好维护）  
- 在未做安全评审前，让 CLI 静默改系统/机器级 PATH（只动用户级）  

---

## 5. 与 Roy harness 路线的关系

| 已有 harness 能力 | CLI 缺口如何补 |
|---|---|
| Orchestrator / Runtime / 产物打开契约 | CLI 是**外骨骼入口**，不替代会话内预览默认 |
| Proactive / cron 设计 | 对齐 `routine` 命名与 CLI CRUD |
| 脱 Proma | CLI 文案一律 Roy；设置开关不出现 Proma |

---

## 6. 建议下一刀（仍可先文档/小改）

1. 产品说明：设置 →「命令行工具」原型文案 + 目标 PATH API（`cliPathStatus`/`cliPathSet`）  
2. 实现用户 PATH 开关（Win 优先；mac/linux 标 supported:false 或后续）  
3. （可选）`roy routine` → `cron` 别名；`roy status` 摘要  

---

*依据：Roy `apps/cli`、`cli-bridge.ts`、`build-cli.ts`、`resources/bin/roy.exe`；Arthur `bin/*`、`electron/cli.js`、`electron/cli-bridge.js`、`src/settings/General.tsx`。*

---

## 7. 落地进度（2026-10-22）

- **已实现**：设置 → 通用 →「命令行工具」→「把 roy 加进 PATH」（用户级 PATH、展示真实 bin、已加入状态、示例命令可复制）。
- 代码：`main/lib/cli-path.ts`、`ipc` `cli:path-status`/`cli:path-set`、`preload`、`GeneralSettings.tsx` `CliPathSection`。
- 仍待：App 未开 inbox/自动拉起；`routine` 别名；`roy status` 摘要（见上文 P1）。

---

## 8. CLI inbox（2026-10-22 正式版冲刺）

- 已落地：`apps/cli/src/inbox.ts`；`call()` 在桥不可用时入队并 `launchRoyApp()`；主进程 `drainCliInbox`。
- 仍待：装包后 `ROY_APP`/路径发现的干净机验证；`routine` 别名。
