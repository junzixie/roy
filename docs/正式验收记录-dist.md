# dist:win 正式装包记录

> 更新：2026-10-22（Asia/Shanghai）

## 结果：**成功**

| 项 | 状态 |
|---|---|
| Spectre 缓解库 | **已补齐** 到 `D:\\ai-projects\\yilai\\vs\\BuildTools`（组件 `VC.Runtimes.x86.x64.Spectre`，EXIT=0） |
| `rebuild:node-pty` | 通过（无 MSB8040） |
| `bun run dist:win` | **EXIT=0** |
| NSIS 安装包 | `E:\\AIproject\\02-roy-harness\\release\\Roy-0.19.88-setup.exe` |
| 源产物 | `C:\\Users\\Administrator\\Desktop\\Roy\\apps\\electron\\out\\Roy-0.19.88-setup.exe` |
| 解包目录 | `...\\out\\win-unpacked\\Roy.exe` |

## 环境对照

- 上次失败：MSB8040，缺 `lib\\spectre\\x64`
- 本次：`VC\\Tools\\MSVC\\14.44.35207\\lib\\spectre\\{x64,x86}` 已存在
- 说明/脚本：`D:\\ai-projects\\yilai\\vs\\README-Spectre.md`、`install-spectre-libs.cmd`

## 签字提示

验收清单 **D** 可用本安装包在干净机/新用户目录安装后勾选。
