# Roy Ubuntu / Linux 第一级支持说明

Roy 的一级 Linux 支持目标是 **Ubuntu 22.04 x86_64**，并提供：

- `.deb`：Ubuntu/Debian 原生安装体验（推荐）
- `AppImage`：可携带运行包，适合不希望安装系统级文件的用户

当前不承诺 Fedora/RHEL、Arch、Linux arm64 等其他发行版的同等体验。

## 下载与安装

从 [GitHub Releases](https://github.com/proma-ai/Roy/releases) 下载对应版本。

```bash
# deb（推荐）
# 历史包名可能为 proma_<版本>_amd64.deb；新包或为 roy_*
sudo apt install ./proma_<版本>_amd64.deb

# AppImage（可携带）
# 历史文件名可能为 Proma-<版本>.AppImage
chmod +x ./Proma-<版本>.AppImage
./Proma-<版本>.AppImage
```

`.deb` 安装后可从应用菜单打开 Roy。AppImage 通常落在用户可写权限的本地目录；若只读目录、网络盘或部分企业托管目录，更新时应用内更新可能不可用。

## 系统范围

| 系统 | 第一级状态 |
| --- | --- |
| Ubuntu 22.04 x86_64 | 目标支持平台 |
| Ubuntu 24.04 x86_64 | 计划支持，待额外验证 |
| Debian 12 x86_64 | 计划支持，待额外验证 |
| Linux arm64 | 未支持 |
| Fedora / RHEL / Arch | 未承诺 |

应用包不内嵌所有运行时依赖库。即使使用 AppImage，宿主系统通常仍需要常见的 GTK、NSS、X11/音视频库；FUSE 不可用时，可使用 `--appimage-extract-and-run` 作为临时兜底方式。

Ubuntu 22.04 与 24.04 的系统库命名不同，不要直接混用跨版本的 `t64` 等过渡包。缺少共享库时，应优先通过 `.deb` 安装，让 apt 解析依赖。

## Chromium sandbox

Roy 不会在 Linux 全局关闭 Chromium sandbox。

- `.deb` 安装后脚本会尝试将 `/opt/Proma/chrome-sandbox`（历史安装路径；新版或为 `/opt/Roy/...`）权限设为 `root:root` 与 `4755`，以启用 SUID sandbox。
- AppImage 使用 `--no-sandbox`，这是因为 AppImage 只读文件系统无法可靠提供 SUID sandbox。
- 若 `.deb` 位于 `nosuid` 文件系统，安装脚本无法设置权限，应用可能无法启动或需要用户显式排查；不会把 `--no-sandbox` 作为正式默认启动参数。

AppImage 的更新链路弱于正确配置的 `.deb`。Roy 的内嵌浏览器加载受保护网页时，更推荐使用 `.deb` 版本。

## 更新

- AppImage：GitHub Release 提供 `latest-linux.yml` 时，electron-updater 可检测并覆盖原 AppImage（原文件需落在可写目录）。
- `.deb`：下一阶段目标是下载并通过 apt 安装新包为默认路径；尚未提供签名 APT repository。
- 更新前 Roy 会等待：正在运行的 Agent 跑完，或用户中断未写完会话。

## 数据位置

正式版本数据位于：

```text
~/.proma/
```

（历史路径。当前数据目录亦可能为 `~/.roy/`，以安装版为准。）

开发模式数据位于：

```text
~/.proma-dev/
```

（或 `~/.roy-dev/`，以开发构建为准。）

会话、工作区、设置和 Skills 使用 JSON/JSONL 文件落盘。迁移前请先退出 Roy，再备份对应目录。

Linux 上 `safeStorage` 依赖 GNOME Keyring、KWallet 或其他 Secret Service 实现。无可用系统密钥环时，不要在共享机器上保存 API Key；请改用环境变量或密钥环可用后再登录 Roy。

## 第一级验收边界

Linux 第一级发布验收以 Ubuntu 22.04 x86_64 为目标。发版前应在干净机完成：

1. `bun install --frozen-lockfile`；
2. AppImage 与 deb 构建；
3. deb 安装、卸载后的清理；
4. AppImage 启动与更新；
5. Chat/Agent 主路径与 JSONL 落盘；
6. 工作区、Skills、MCP、内嵌终端和内嵌浏览器；
7. X11 与 Wayland 下的基本可用性；
8. 中文输入、字体回落、托盘图标与自动启动项。

本阶段实现阶段不执行 Linux 实物机矩阵安装与 E2E；本清单作为发版前的人工检查清单。