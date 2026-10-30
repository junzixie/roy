# Roy 与 DSH 对比报告（缓存 / 压缩 / 工程能力）

> 数据采集时间：2026-10-30
> 采集方式：直接扫描本机真实会话文件，不是估算，也不是引用旧结论。
>
> - Roy 会话：`%USERPROFILE%\.roy\agent-sessions\*.jsonl`，18 个文件
> - DSH 会话：`%USERPROFILE%\.dsh\sessions\**\*.zstd`，79 个文件（zstd 解压后统计）

---

## 一、先纠正一个错误结论

之前我写过「Roy 的提示缓存从未命中，`cached_tokens` 长期为 0」。

**这个结论是错的**，有两处错误：

1. 我引用的那批日志 `prompt_tokens` 全部在 65–195 之间（最大 195），
   是标题生成这类极小请求。这么短的前缀本就不该命中，用它证明
   「真实对话的缓存没命中」不成立。
2. DeepSeek 官方文档明确写着：上下文硬盘缓存**对所有用户默认开启，
   用户无需修改代码即可享用**（[上下文硬盘缓存](https://api-docs.deepseek.com/zh-cn/guides/kv_cache/)）。
   它根本不需要 `prompt_cache_key` 也会命中。

实测数据见下节，Roy 的缓存命中占比是 **92.93%**，本来就在高缓存区间。

---

## 二、缓存命中率实测

口径统一为 `cacheRead / (input + cacheRead)`，只统计会话里的 `usage` 记录。

| 项目 | 会话数 | usage 样本 | 累计 input | 累计 cacheRead | 缓存占比 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Roy | 18 | 2,659 | 27,171,037 | 357,178,456 | **92.93%** |
| DSH | 79 | 5,135 | 31,163,998 | 715,908,579 | **95.83%** |

**结论：两者都是高缓存模式，差距 2.9 个百分点。**

差距来源不是机制缺陷，而是会话规模分布——小会话还没预热完就结束了：

| Roy 会话 | 大小 | 样本 | 缓存占比 |
| --- | ---: | ---: | ---: |
| 956bdee8 | 0.00 MB | 2 | 3.6% |
| c6487c3a | 0.09 MB | 4 | 55.8% |
| dcdb40d8 | 0.47 MB | 37 | 65.0% |
| … | | | |
| bf5461ed | 2.12 MB | 517 | 95.3% |
| aed7db9b | 1.86 MB | 483 | 96.3% |
| 7c767c50 | 1.86 MB | 484 | 96.3% |

大会话（>1.5 MB）稳定在 95–96%，和 DSH 持平。小会话因为轮次少，
前缀还没被复用就结束了，占比自然低。**这不是可以靠改代码修的问题。**

---

## 三、真正的差距：压缩策略

这是 Roy 明显落后于 DSH 的地方，也是「压缩感觉有问题」的实际来源。

### 3.1 DSH 的做法：高频裁剪 + 低频摘要

DSH 的会话事件里有两类压缩事件：

| 事件类型 | 含义 | 单会话最大次数 |
| --- | --- | ---: |
| `compaction/prune` | 裁剪历史工具输出 | **35 次** |
| `compaction/start` → `summary` → `end` | 调 LLM 生成摘要 | 1–6 次 |

实际样本：

```
0aa1d682: prune 35, start 1, summary 1, end 1
43b4a5fd: prune 6,  start 6, summary 5, end 6
965aff91: prune 22（纯裁剪，没做摘要）
088d120d: prune 9,  start 4, summary 4, end 4
```

prune 事件的真实结构（`~/.dsh/sessions` 解压所得）：

```json
{"type":"compaction/prune","seq":349,
 "data":{"shadowedRange":{"start":37,"end":37},
         "shadowedSeqs":[37],
         "shadowedTokenCount":6355}}
```

关键点：`shadowedSeqs` 把某条消息标记为「不参与上下文」，
**但不重写历史**。所以缓存前缀不被破坏，而且不需要调用 LLM（零成本、零延迟）。

### 3.2 Roy 的做法：只有整段摘要

Roy 的压缩只有一种手段——调 LLM 把历史总结成摘要，然后重写整段历史。
后果在真实会话里非常明显：

```
87b3eaf0 会话，压缩了 9 次：
  行    31  before=152207  after=60141   reclaimed=92066  阈值=140000
  行    47  before=171774  after=61973   reclaimed=109801 阈值=140000
  行    58  before=151865  after=61904   reclaimed=89961  阈值=140000
  行    67  before=141003  after=57387   reclaimed=83616  阈值=140000
  行    82  before=142049  after=61183   reclaimed=80866  阈值=140000
  行    96  before=149178  after=64526   reclaimed=84652  阈值=140000
  行   103  before=144920  after=64904   reclaimed=80016  阈值=140000
  行   110  before=150477  after=66742   reclaimed=83735  阈值=140000
  行   121  before=175055  after=65976   reclaimed=109079 阈值=160000（manual）
```

每 5–15 条消息就压一次，每次都调一次 LLM。

### 3.3 根因：49,861 token 的固定开销

同一会话 9 次压缩的 `fixedOverheadTokens` 全部是 **49,861**，一次都没变：

```
fixedOverhead= 49861  before= 152207  after= 60141
fixedOverhead= 49861  before= 171774  after= 61973
fixedOverhead= 49861  before= 151865  after= 61904
...（9 次全同）
```

这 49,861 token 是系统提示 + 工具定义（Roy 有 68 个内置工具），
**压缩永远碰不到它**。

算一笔账：

- 阈值 140,000 token
- 压完残留 ≈ 60,000 token，其中 49,861 是压不掉的固定开销
- 真正可用的净空间只剩 ≈ 80,000 token
- 每轮工具输出很快填满，于是再次撞线 → 再压一次 → 再付一次 LLM 成本

**这就是「反复压缩但仍很慢」的机制。**

---

## 四、本次已做的改动

### 4.1 新增：分级瘦身 `pruneToolResultsTiered`

文件：`packages/shared/src/utils/pi-compaction.ts`

按「离当前多远」决定每条历史工具结果留多少：

| 位置 | 单条上限 |
| --- | --- |
| 最近 6 条 | 原样保留 |
| 中间段（再往前 6 条） | 12,000 字符 |
| 更早 | 3,000 字符 |

设计依据（实测）：

- Roy 会话单条工具结果最大 **85,171 字符**
- 超 12,000 的部分占会话工具输出总量的 **10%–60%**
- 典型：`d7441013` 会话 99 条工具结果里 18 条超 12k，占 59.6%

为什么不全部一刀切：近期几条往往还在被引用（刚跑的命令、刚读的文件），
砍掉会让模型失忆并重跑工具，反而更贵。

### 4.2 新增：缓存档位设置

文件：`packages/shared/src/utils/prompt-cache-policy.ts`

把 `cacheRetention` 的三种取值（`none` / `short` / `long`）暴露成用户设置：

| 档位 | 传给 SDK 的值 | 说明 |
| --- | --- | --- |
| `high`（默认） | `long` | 带 `prompt_cache_key` 会话亲和标记 |
| `standard` | `short` | Pi 的默认短缓存 |
| `off` | `none` | 显式关闭 |

接入点在 `pi-agent-adapter.ts` 的 stream 包装链里。

**要说清楚的话**：这不是「修复了一个缓存 bug」。Roy 之前缓存命中率
已有 92.93%。这个开关的作用是让非 `api.openai.com` 的地址也带上会话亲和
标记，进一步稳定命中；但对 DeepSeek 官方接口，它本来就是自动缓存的。

### 4.3 修正：两处注释与实际不符

| 位置 | 原来写的 | 实际 |
| --- | --- | --- |
| `pi-agent-adapter.ts:1674` | 「约 80% 时触发」 | 常量是 0.9，即 90% |
| `pi-agent-adapter.ts:1678` | 「Pi 默认 20000 会让残留偏高」 | 表述含糊，改为说明 Roy 主动取 12000 的理由 |

---

## 五、还能继续改进的点（未做，按价值排序）

### 5.1 降低固定开销（价值最高）

49,861 token 的固定开销是反复压缩的根因。可选方向：

- 按需装载工具：68 个内置工具全部塞进每次请求，但单轮通常只用几个
- 拆分工具集：MCP 类工具（automation / planning）在不用时不该出现在定义里

**这是唯一能实质降低压缩频率的方向**，但改动面大（涉及工具注册与
模型可见性），需要单独评估。

### 5.2 给 Roy 加真正的 shadow-prune

DSH 的 `shadowedSeqs` 能把旧消息标记为「不参与上下文但保留在存储里」，
Roy 目前做不到——它走 Pi SDK，只能在发送前生成裁剪副本，不落盘。
要做到等价能力，需要在 Pi SDK 的 session 存储层动手，属于上游改动。

### 5.3 `cacheWarming`

Pi SDK 有 `cacheWarming: "off" | "streaming" | "idle"`（默认 `streaming`），
Roy 从未显式设置过。它会预热门缓存，但**要花钱**，所以没擅自打开。

---

## 六、验证记录

| 项目 | 结果 |
| --- | --- |
| `tsc --noEmit`（apps/electron） | 0 错误 |
| `bun test --isolate` | 1058 pass / 2 skip / 0 fail / 3116 expect() / 153 文件 |
| `bun run build:main` | 成功 |
| `bun run build:renderer` | 成功 |

新增测试文件：

- `packages/shared/src/utils/prompt-cache-policy.test.ts`（13 个用例）
- `packages/shared/src/utils/tiered-prune.test.ts`（12 个用例）
