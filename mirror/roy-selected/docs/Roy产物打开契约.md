# Roy 产物打开契约

> 更新：2026-10-22（Asia/Shanghai）  
> 用户确认：**打开产物默认进「预览工作台」**  
> 命名：全 Roy；**禁止**用户可见文案使用 Artifact / Cowork / Proma / Open Cloud

---

## 1. 三动作

| 动作 ID | 用户可见文案 | 默认 | 行为 | 实现落点 |
|---|---|---|---|---|
| `open_workbench` | **打开工作台** | **是（单击主入口）** | 在当前会话右侧预览工作台打开该文件（`openPreview` / `previewOnly`） | `preview-opener.ts`、`PreviewOpenButton`、`FilePathChip` 单击 |
| `reveal_in_folder` | **在文件夹中显示** | 否（菜单/旁路） | 系统资源管理器揭示文件（`showItemInFolder`） | `FilePathChip` 右键、`PreviewOpenButton` 菜单 |
| `open_project_doc` | **打开项目文档** | 文档类文件可作为主按钮文案 | **同一预览工作台通道**；用于 `.md/.mdx/.txt/.rst` 等文档产物，强调「读文档」语义，不另开浏览器 | 主按钮文案分支；仍走 `openPreview` |

### 规则

1. **默认单击 = 打开工作台**（进预览），不是访达、不是外部默认 App。  
2. **在文件夹中显示** 必须保留为旁路，不得删除。  
3. **打开项目文档** 与打开工作台同通道；仅文案与适用扩展名不同，避免第三套预览栈。  
4. 工具结果（Read / Write / Edit 等带路径）须露出至少「打开工作台」入口；文档类可用「打开项目文档」作主文案。  
5. 无会话 ID / 无合法路径时不渲染入口。

---

## 2. 静默焦点纪律（电脑控制 / 后台跑）

对照 Claude Desktop 后台 Computer Use 教训与 Roy `computer-control.ts`：

1. **电脑控制会话激活期间**，允许且仅允许注册紧急停止全局快捷键 `Ctrl+Alt+End`（`COMPUTER_STOP_KEY`）。  
2. **禁止**在电脑控制模块内再注册其它 `globalShortcut`（避免后台抢键、打断用户在其它窗口输入）。  
3. 用户选择「先把 Roy 藏起来」时：可最小化主窗；停止时再按需恢复。停止路径必须 `unregister` 快捷键。  
4. 自动化 / 委派触发（`triggeredBy: automation | delegation`）不暴露电脑控制工具（已有逻辑，保持）。  
5. 任何「静默跑」扩展（定时、远端桥）若需全局快捷键：单独评审，默认不抢焦点、不吞系统快捷键。

---

## 3. 命名对照（内部 → 用户可见）

| 不要用（用户可见） | 使用 |
|---|---|
| Artifact / Open Artifact | 打开工作台 / 打开项目文档 |
| Cowork | （功能上用多会话 / 产物池，文案另定） |
| Proma | Roy |
| Open Cloud | 打开工作台 / 在文件夹中显示 |

---

## 4. 验收

1. 会话中 Write/Edit/Read 结果旁能点「打开工作台」或「打开项目文档」，右侧预览打开对应文件。  
2. 右键或菜单「在文件夹中显示」能揭示文件。  
3. 电脑控制授权后仅 `Ctrl+Alt+End` 为全局抢键；结束后快捷键注销。  
