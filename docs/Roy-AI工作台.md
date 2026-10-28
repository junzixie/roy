# Roy AI 工具台

侧栏「新建任务」下的 **「AI 工具台」** 打开即为沉浸一屏（对标 AIWorkstation 贾维斯；不再强调「工作台」二次入口）。项目树不展示同名会话。

## 布局

- **无左右侧栏**：状态、皮肤、最近项目、语音并入**顶栏**与轻量浮层。
- **中央**：粒子球 + 快捷芯片 + 指令输入 + **点击说话**麦克风。
- **进入对话**：顶栏「进入对话」/ 芯片 / 发指令 / 听写结果 → 本页全屏 AgentView；返回仍回舞台。点球只开说，不跳进项目树。

## 球动效

中央球移植 AIWorkstation `jarvis-ball.js`（WebGL，约 1.5 万点 + 呼吸/涡流）。

## 语音识别（豆包）

- **引擎**：豆包 / 火山引擎流式 ASR（`doubao-asr-service`）。设置 → **语音输入** 填写：
  - 豆包 APP ID（`X-Api-App-Key`）
  - Access Token（`X-Api-Access-Key`，本机加密存储）
  - Resource ID（默认 `volc.seedasr.sauc.duration`）
- 控制台：https://console.volcengine.com/speech/service/
- **工具台**：点球 / 唤醒词（默认「小爱同学」）/ 指令栏麦克风 → `toggleVoiceDictation`，均走上述豆包识别。
- 未填密钥时识别不可用；请按设置页说明开通，不要依赖浏览器 Web Speech 作主路径。

## 语音合成（可选，可切换引擎）

设置 → 语音输入 → **语音合成**（在识别下方）：

| 引擎 | 说明 | 需要填写 |
|------|------|----------|
| **系统 speechSynthesis** | 本机朗读，免密钥 | 无 |
| **豆包 TTS** | 火山 openspeech | **旧版**：APP ID、Access Token、Cluster、voice_type（`/api/v1/tts`）；**新版**：API Key、Resource ID（如 seed-tts-2.0（与 speaker 必须同代，如 zh_female_vv_uranus_bigtts；旧版 BV001_streaming 不可用于 V3））、speaker（`/api/v3/tts/unidirectional`，X-Api-Key） |
| **Minimax** | t2a_v2 | Group ID、API Key、voice_id、模型 |

- 默认**关闭**；打开并选引擎后，工具台会朗读 Agent 回复。
- 唤醒短应答「在」「好的」始终用本机合成（低延迟、不耗云额度）。
- 密钥只存本机 `settings.voiceTts`（safeStorage 加密），不写仓库。

## 建任务（默认项目下）

说「我想创建一个新的项目，做某某」或「新建一个任务…」→ `parseCreateTaskIntent` → 在**默认项目**下 `createAgentSession` 并尽量开跑。

## 对话中换模型

运行中切换模型后，**插话**若新模型 ≠ 当前 run：停旧轮、按新模型开新轮；顶栏与气泡与真实推理一致。

## 相关文件

- `components/settings/VoiceInputSettings.tsx` — 识别 + 合成 UI
- `main/lib/doubao-asr-service.ts` — 豆包识别
- `main/lib/voice-tts-service.ts` / `voice-tts-settings-service.ts` — 合成
- `lib/roy-workbench-prefs.ts` — `speakWorkbenchTts` 路由
- `pages/AiAssistantPage.tsx` — 工具台唤醒与播报

## 修订记录

- 2026-10-22：WebGL 球；点球只开说；建任务落默认项目。
- 2026-10-22：豆包 ASR/TTS 增加鉴权模式：旧版（APP ID+Token）/ 新版（API Key）；新版 TTS 走 V3 HTTP。申请：旧版语音服务控制台应用页；新版控制台 API Key 管理。
- 2026-10-22：语音合成引擎可选（系统 / 豆包 / Minimax）；识别明确为豆包并完善设置说明。