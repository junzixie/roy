# Spark 模式设计（DeepSeek 前缀缓存 + 推理截断）

> 目标：让 DeepSeek V4.1 Flash 的长会话跑到 **1 亿 input token ≈ ¥4**，同时首字更快、输出更短。
> 本文先拆口径，再写机制，最后给实施顺序和验收标准。所有数字都标注了来源或计算方式。

## 一、结论先行

1. **¥4/亿 不是靠一个算法，而是三个条件同时成立**：缓存命中率 ≥99.3%、输出/输入比 ≤0.7%、上下文规模 ≥30 万 token。
2. **天枢的 Spark 在天枢里是「Pro 专属 provider 预设 + 推理尾截断 + 锚点补偿」**，不是新的推理算法（`docs/releases/v3.0.0.md` §2）。
3. **Roy 现在有一个同名模式但字节零变化**：`deepseekOptimized` 只挂载 `createDeepSeekReasoningBridgeExtension({ restoreSignatures: false })`，历史 thinking 无签名 → 无可截断内容 → 空转。
4. 这次实现把该模式变成真实能力：逐请求缓存账本、已发布历史冻结、边界裁剪、推理尾截断，全部由 `workMode === 'deepseek'` 控制。

## 二、口径拆解

### 2.1 单价

DeepSeek V4.1 Flash 刊例（2026-10-03 核对）：未命中输入 ¥1/M、缓存读 ¥0.02/M、输出 ¥2/M。

### 2.2 100M input 的成本

输入成本 = `(1 − h) × 100 + h × 2 = 100 − 98h`（元，h 为命中率）；加 0.7% 输出（¥1.4）后：

| 命中率 | 100M input | 含 0.7% 输出 |
| --- | --- | --- |
| 90.0% | ¥11.80 | ¥13.20 |
| 92.4%（Roy 当前累计） | ¥9.45 | ¥10.85 |
| 97.0%（Roy 当前单请求中位） | ¥5.92 | ¥7.32 |
| 99.0% | ¥2.98 | ¥4.38 |
| 99.5% | ¥2.49 | ¥3.89 |

**Roy 现在的 ¥10.9 与 ¥4 的差距，全部在命中率上，不在单价或模型选择上。**

### 2.3 命中率的几何上限

`h ≈ 1 − 每轮新增 / 上下文长度`（DeepSeek 按 64-token 块量化，尾部不满一块必 miss）：

| 上下文 | 每轮新增 | 理论上限 | ¥/100M（含输出） |
| --- | --- | --- | --- |
| 100K | 2K | 98.0% | ¥5.4 |
| 100K | 1K | 99.0% | ¥4.4 |
| 200K | 2K | 99.0% | ¥4.4 |
| 400K | 2K | 99.5% | ¥3.9 |

结论：**短会话（100K 上下文、每轮 2K）物理上限就是 98%，¥5.4；¥4 只属于 30 万 token 以上的长会话。** 验收必须分上下文规模报，不能报单一数字。

## 三、天枢 Spark 的可借鉴部分

| 机制 | 天枢做法 | 对 Roy 的适用性 |
| --- | --- | --- |
| 冻结前缀 | system + tools + 稳定上下文会话内不重写 | 直接适用 |
| 历史字节快照 | 每条 user 消息存当时的完整字节（含 volatile trailer + appendix），后续按快照重放 | 直接适用，是本方案核心 |
| 增量附录 | 动态信息只追加到当前轮尾部，只发变化子块（约 200B vs 5KB） | 部分适用（Roy 的动态信息较少） |
| 压缩只在用户边界 | `turn===0` 重写，保留前 2 条作锚点 | 适用 |
| Read 去重 | 未变化文件返回紧凑引用 | 后续阶段 |
| 推理尾截断 + 锚点 | 只回传 reasoning 尾部 2000 字符，N 随会话冻结；被截掉的「已排除路径」提炼成锚点补回 | 代码已在 Roy 仓库里，只差启用 |
| 逐请求 cache-log | input/cacheRead/cacheCreate/hitRate + 碎裂归因 | 直接适用 |

天枢的实测（`docs/reference/observability-harness.md`）：5 个真实会话、2001 次请求、6.45 亿 input、命中 99.3–99.6%、成本从 ¥880 压到 ¥20。逐轮样例：turn 0（34K 上下文）命中 69.2%，turn 15（510K）命中 100%。**这组数字说明命中率随上下文增长而上升，不是每轮都 99%。**

## 四、Roy 侧的四个机制层

### S1 缓存字节纪律（收益约 70%）

| 改动 | 现状问题 | 方案 |
| --- | --- | --- |
| 已发布历史冻结 | `transformContext` 在超过压缩阈值 40% 后做分级裁剪：一条 toolResult 从 recent 跨到 mid、再从 mid 跨到 old 时字节各变一次，前缀在该位置断裂 | 引入「已发布水位线」：`FrozenHistory` 记录每条消息的源哈希与已发送字节，匹配则原样透传；不匹配（上游重写/压缩）则从该位置重置 |
| 裁剪只在边界 | 每轮都可能触发跨档裁剪 | 冻结生效时，裁剪结果只作用于未发布尾部；已发布部分由压缩统一重排 |
| 压缩保留锚点 | 压缩后从摘要重建，整段作废 | 压缩只在 user 边界，保留前 2 条原始消息 |
| 工具集冻结 | 中途加载 skill/MCP 会改 `tools` 字段 | 记为已知断点，不改定义；新能力以尾部提示出现 |

### S2 推理 token（速度 + 输出成本）

| 改动 | 说明 |
| --- | --- |
| 推理尾截断 | `restoreSignatures: true` + `compactRequestReasoning`，截断长度取 `DEFAULT_TRUNCATE_CHARS = 2000` 字符，会话内不变 |
| 锚点补偿 | 已实现，随截断一起开；不开会重复走回头路 |
| 简单回合降档 | 已有（DeepSeek 路径 high→low），对所有模式生效 |
| 杂活换 Flash | 已有（`resolveChoreModelId`） |

注意顺序：**只开补签名不开截断是净增成本**（115 轮会话末轮约 +47K input），两者必须同时生效。

### S3 减少每轮新增（后续阶段）

Read 去重、工具结果阈值下调、并行工具调用合并轮次。

### S4 计量与门禁（先做，否则无法归因）

每条请求落一行 `~/.roy/agent-sessions/<id>.cache.jsonl`：

```json
{"t":1793330000000,"seq":7,"model":"deepseek-v4.1-flash","msgs":42,"chars":81234,
 "divergedAt":-1,"prefixHash":"ab12…","systemHash":"cd34…","toolsHash":"ef56…",
 "input":1806,"output":214,"cacheRead":79488,"cacheWrite":0,"hitRate":0.9778}
```

- `divergedAt = -1` 表示纯追加（理想）；≥0 表示第 N 条消息字节变了（碎裂点）。
- `hitRate = cacheRead / (input + cacheRead + cacheWrite)`，与 usage-summary 口径一致。
- 账本挂在 `before_provider_request` 的最后一个扩展上，记的是推理截断、补偿块生效后的真实
  wire 字节，并单独标出 `systemChanged` / `toolsChanged`（这两类断点在 messages 层看不到）。

### S5 实测断点（2026-10-31，0.20.26 的 Pi 会话 usage 反推）

按「本次 cacheRead 小于上一请求整段 prompt」判定断点，10-28 至 10-30 的 DeepSeek 长会话里，
**断点造成的未命中占全部未命中 input 的 50%～90%**；两次断点之间的单请求命中率本来就在 97%+。
真正的断点分三类（保留比例 90%～99% 的不算：那是快速工具循环里上一请求还没落盘，服务端行为）：

| 断点后 cacheRead | 推断位置 | 处理 |
| --- | --- | --- |
| 0 | 系统提示词开头，或服务端换了缓存节点 | 待 wire 账本确认（看 `systemChanged`） |
| ≈2k | 系统提示词之后的工具定义段 | 待 wire 账本确认（看 `toolsChanged`） |
| ≈39k（跨会话同值） | 系统提示词 + 工具之后的第一条历史消息 | 待 wire 账本确认（看 `divergedAt`） |

代码审查另发现一处必然断点并已修复：补偿块只追加在「当前末条 user」上，同一回合第二个请求
末条变成 toolResult 后补偿块消失，这条 user 消息字节改变，每回合断一次。现在每条 user 消息的
补偿块只在首次发出时定稿（`pinExcludedPaths`），定稿表按会话持有，跨回合不丢。

## 五、实施顺序

| 阶段 | 内容 | 验收 |
| --- | --- | --- |
| P0 | cache-log + 碎裂归因（无行为变更） | 能对任一真实会话列出逐请求命中率与分歧位置 |
| P1 | 已发布历史冻结（`FrozenHistory`） | 纯追加回合 `divergedAt = -1`；单请求命中 ≥99%（长会话） |
| P2 | 裁剪只作用于未发布尾部 | 越过裁剪门槛后不再每轮产生新的分歧点 |
| P3 | 推理尾截断 + 锚点（Spark 模式） | 输出 token 下降，任务完成率不降（A/B） |

## 六、风险

1. **冻结会减少可回收空间**：已发送的大 tool 结果不能再裁，上下文增长更快，可能更早触发压缩。用「压缩保留前 2 条锚点」抵消；压缩本身仍是一次断点，需要计数。
2. **推理截断可能让模型重复试错**：锚点只捞「明确排除」的句子，捞不回的沉默成本必须用 A/B 的任务完成率验证，不能只看 token。
3. **改动跨越所有 provider**：`transformContext` 是 Pi 通用钩子，冻结逻辑仅在 `workMode === 'deepseek'` 时启用，其余模式保持原行为。
4. **不要再发布空壳开关**：任何模式必须能指认它改动了哪一字节，否则不做成卖点。

## 七、相关代码

| 文件 | 作用 |
| --- | --- |
| `apps/electron/src/main/lib/adapters/session-cache-log.ts` | 逐请求账本与碎裂归因 |
| `apps/electron/src/main/lib/adapters/frozen-history.ts` | 已发布字节冻结 |
| `apps/electron/src/main/lib/adapters/deepseek-reasoning-bridge.ts` | 推理尾截断 + 锚点 |
| `apps/electron/src/main/lib/adapters/pi-agent-adapter.ts` | 三者的接线点（transformContext / streamFunction / message_end） |
| `apps/electron/src/main/lib/adapters/mode-switching-adapter.ts` | `workMode === 'deepseek'` → `deepseekOptimized` |

## 八、验证方法

### 8.1 逐请求命中率

```bash
# 单会话逐请求（divergedAt=-1 表示纯追加）
cat ~/.roy/agent-sessions/<sessionId>.cache.jsonl | \
  jq -c '{seq,msgs,input,cacheRead,hitRate,divergedAt,divergedRole}'

# 会话累计命中率（与 usage-summary 同口径）
jq -s '{hit: (map(.cacheRead // 0)|add) / (map((.input // 0)+(.cacheRead // 0)+(.cacheWrite // 0))|add)}' \
  ~/.roy/agent-sessions/<sessionId>.cache.jsonl
```

判读：
- `divergedAt` 长期为 -1：前缀稳定，优化生效。
- 每轮都出现新的 `divergedAt`：说明还有地方在改写历史，回到 `transformContext` 找原因。
- `hitRate` 稳定在 0.99+ 才谈得上 ¥4/亿；0.90 附近说明冷启动或短会话占主导。

### 8.2 自动化测试

```bash
bun test apps/electron/src/main/lib/adapters/session-cache-log.test.ts \
         apps/electron/src/main/lib/adapters/frozen-history.test.ts \
         apps/electron/src/main/lib/adapters/deepseek-reasoning-compaction.test.ts
```

### 8.3 生效条件

| 条件 | 说明 |
| --- | --- |
| `workMode === 'deepseek'` | 设置 → 工作模式选 DeepSeek Spark |
| Pro 已解锁（`deepseek-mode`） | 未解锁时 `deepseekOptimized` 恒为 false |
| 模型 provider 为 `deepseek` | 账本与推理截断都只对 DeepSeek 渠道生效 |
| 重新构建安装包 | 源码改动需要重新打包才在已安装的 Roy 里生效 |
