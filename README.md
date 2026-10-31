# Roy

为专业用户打造的桌面 Agent。左边管理会话与项目，中间是 Agent 的主输出区，右边放一切辅助内容：项目文件、每轮改动、文档预览、子会话、内嵌浏览器、终端、Obsidian、日程、Todo、Skills。

Roy 不是把聊天框塞进一个窗口，而是围绕一件事重新设计界面：**让 Agent 拿到更好的上下文，并且让这个上下文对你是可见、可改、可回退的。**

## 核心能力

- **三种工作模式**：Chat、Agent、计划模式，可切换到更强的自主执行或先出方案再动手。
- **项目分区**：项目 = 文件夹 + 项目说明 + 会话，不同项目的上下文与记忆互相隔离。
- **记忆**：全局记忆与项目记忆分开维护，Agent 跨会话记得住稳定偏好与结论。
- **子会话与主会话**：主会话派活，子会话带独立上下文执行并把结果交回来，可并行、可迭代、可对抗审查。
- **Agent 探索**：并行探索多个方向，不污染主上下文，需要时把结论带回。
- **文件改动可视化**：每轮改了哪些文件、具体差异，可撤销。
- **内嵌终端与浏览器**：Agent 可以直接使用可见的终端和浏览器，也能远程查看会话。
- **Skills / MCP / CLI**：技能与 MCP 服务卡片化管理，也能通过 CLI 从命令行驱动。
- **定时任务**：让 Agent 在指定时间自动执行重复工作。
- **远程接入**：微信、飞书、钉钉、Slack 等渠道可以把任务交给本机的 Roy。
- **专业场景适配**：Todo、日程（可与系统提醒事项/日历同步）、Obsidian 深度集成、Office 与 PDF 预览编辑。
- **自动 worktree**：基于 git worktree 开发时，右侧自动选中对应 worktree 并展示相对 main 的差异。

## 安装

从 [Releases](../../releases) 下载对应平台的安装包：

- macOS（Apple Silicon / Intel）
- Windows（x64）
- Linux（`.deb`、AppImage）

Linux 的安装与安全边界说明见 [docs/linux.md](./docs/linux.md)。

## 从源码运行

需要 [Bun](https://bun.sh) 1.4+ 和 Node 20+。

```bash
bun install
bun run dev          # 开发模式（Vite + Electron）
bun run test         # 全量测试，必须带 --isolate
bun run typecheck    # 类型检查
bun run dist:win     # 打 Windows 安装包
```

`bun run test` 已经自带 `--isolate`，不要直接跑 `bun test`，否则跨文件的模块级单例会互相污染。

打包需要平台工具链：Windows 需要 VS Build Tools（Spectre 库），macOS 需要 Xcode Command Line Tools。`node-pty` 由 `electron-rebuild` 重新编译。

## 项目结构

```text
apps/electron/          Electron 主程序
  src/main/             主进程：窗口、会话编排、权限、渠道、定时任务
  src/main/lib/         各能力模块（浏览器、终端、MCP、记忆、计划、子会话…）
  src/renderer/         界面（React）
  src/utility/          Agent 与终端运行时
apps/cli/               命令行入口
packages/core/          Agent 核心：provider 适配、工具、压缩、会话流
packages/session-core/  会话存储与检索
packages/shared/        共享类型
packages/ui/            通用 UI 组件
patches/                对上游依赖的补丁
docs/                   产品与设计文档
```

Roy 的 Agent 内核基于 [pi](https://www.npmjs.com/package/@earendil-works/pi-coding-agent)（MIT），并对 `pi-ai`、`pi-coding-agent`、`node-pty` 打了本地补丁，补丁源码在 `patches/`。

## 数据与隐私

- 会话、记忆、技能、项目配置都保存在本机，不上传。
- 模型请求直接发给你配置的供应商，不经过 Roy 的中转。
- 权限分为多个级别，高风险操作（写文件、执行命令、控制桌面）需要批准。
- 远程渠道（微信/飞书/钉钉/Slack）只在你主动绑定后才建立连接。

## 关于官方服务

开源版可以完全用自己的 API Key 运行。以下功能依赖 Roy 官方服务器（`roy-server-cert.ts`、`pinned-certificates.ts` 中配置的地址），自建部署时这些功能不可用或需要自行替换：

- 官方内置模型渠道与账号登录
- 自动更新检查
- 第三方安装包清单

不影响核心的 Chat / Agent / 工具 / 内嵌浏览器与终端等能力。

## 许可证与来源

Roy 以 [GNU Affero General Public License v3.0](./LICENSE) 发布。

Roy 由 Proma 开源版（AGPL-3.0）发展而来，上游关系与第三方组件见 [NOTICE](./NOTICE)。早期版本的完整说明保留在 [docs/README-upstream.md](./docs/README-upstream.md)。

商业使用需遵守 AGPL-3.0：通过网络对外提供服务时须公开修改后的完整源码。
