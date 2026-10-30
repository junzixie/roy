# 壁纸实现对照：Roy vs DSH `dsh-plugin-wallpaper-engine`

> 2026-10-30 调研。目的：把 DSH 侧成熟做法里**能搬回 Roy** 的部分挑出来，按性价比排序。
> 对照对象：
> - Roy：`apps/electron/src/main/lib/wallpaper-workshop.ts` + `renderer/components/app-shell/{WallpaperLayer,SceneWallpaper,ProceduralWallpaper}.tsx` + `renderer/components/settings/WallpaperPicker.tsx` + `renderer/atoms/wallpaper.ts` + `renderer/lib/{wallpapers,procedural-wallpapers}.ts`
> - DSH：`~/.dsh/profiles/desktop/node_modules/dsh-plugin-wallpaper-engine`（v1.4.0，lib 合计 47286 行，其中 `lib/client.js` 31385 行）
> - 轻量旁证：`@linxin666/dsh-client-ui-skin-center`（纯 CSS 换肤，用于对照「什么时候不该上重方案」）

---

## 一、两套实现的体量差

| 维度 | Roy | DSH 插件 |
|---|---|---|
| 壁纸相关源码 | 约 1520 行（8 个文件） | 约 47000 行（主包 + 7 子包） |
| 宿主能力 | Electron 主进程 IPC + `roy-file://` 自定义协议 | `ctx.webServer` 注册 29 条 HTTP 路由 + 独立 loopback 媒体源 |
| 前端挂载 | React 组件 portal 到 `#root` | 直接 `body.appendChild` 一个 `z-index:-2` 的 div |
| 支持的壁纸类型 | 内置着色器 / WE 视频型 / WE 场景型 / 本地图片 / 本地视频 | Scene / Web / Video / 自定义图片视频（Application 只列不渲染） |
| 配置项 | `WallpaperSettings` 约 10 个字段 | 144 个键（7 个命名空间） |
| 设置界面 | 1 个 picker 组件，约 466 行 | 6 个页签 |

**结论先行**：Roy 不是「缺功能」，而是**缺三样工程护栏**——首帧不闪、大文件不卡、失败有降级。DSH 那 47000 行里真正值得抄的也就 6~8 个模式，不是整套架构。

---

## 二、Roy 现状（带行号）

### 2.1 媒体怎么进渲染层

- 主进程扫工坊：`wallpaper-workshop.ts:76` `readdirSync` + `:84` `statSync` + `:59` 每个项目 `readFileSync(project.json)`，**全部同步**。
- 视频壁纸：`ipc.ts:3620-3626` 把绝对路径换成 `roy-file://<uuid>`，渲染层 `<video src>` 直接用。
- 场景壁纸：`ipc.ts:3631-3634` → `wallpaper-workshop.ts:141` `readFileSync(scene.pkg)` **整包读进内存**，经 IPC 结构化克隆送到渲染进程，再由 `SceneWallpaper.tsx:46-48` `import('webwallgl')` 现场 `bytesSource(...)` 挂载。
- `roy-file://` 实现（`main/lib/local-file-protocol.ts:76-106`）本质是 `net.fetch(pathToFileURL(target))` 转发，**没有自己实现 Range**（靠 Chromium 的 file 协议处理），token 有 1 小时 TTL / 500 条上限（`:27-28`）。

### 2.2 首帧与闪烁（当前最明显的体验缺陷）

- `WallpaperLayer.tsx:245` `key={mediaUrl}`：**每次换源都强制重建 `<video>` 元素**，`opacity: mediaReady ? 1 : 0`（`:247`）+ `transition-opacity duration-300`。
- 换源瞬间新元素 opacity 0，旧元素已被 React 卸载 → **屏上只剩壁纸层垫底色**（`:194-195` 那层永远渲染的 `hsl(var(--background))`）。这就是"切壁纸会闪一下"的根因。
- 场景壁纸同理：`SceneWallpaper.tsx:105` 用 `opacity: ready ? 1 : 0` + `duration-500`，加载期（读包 + 纹理 + 编译 shader）用户一直盯着纯底色。
- `preload="auto"`（`:252`）意味着即使还没确定要播，浏览器也开始拉整片。

### 2.3 性能控制（这块 Roy 做得不差）

- `ProceduralWallpaper.tsx`：半分辨率渲染（`RENDER_SCALE = 0.5`）、`REPLYING_FPS = 8`、`prefers-reduced-motion` 只画一帧、`pauseHidden` 停 rAF、`powerPreference: 'low-power'`。
- `WallpaperLayer.tsx:72` `data-roy-reduced-effects` + `globals.css:3295` 把 `#root *` 的 `backdrop-filter` 全关。
- `SceneWallpaper.tsx:83-101` visibilitychange + blur/focus 暂停。

### 2.4 明确的短板

1. **无缩略图**：`WallpaperPicker.tsx:329-334` 工坊列表只有 `<Film>` 图标 + 标题，一张预览都没有；而 WE 的 `project.json` 里本来就有 `preview` 字段（`wallpaper-workshop.ts:59` 只取了 `title/type/file`，把它丢了）。用户只能靠名字选壁纸。
2. **无内容分级 / 无隐藏 / 无轮播**。
3. **无首帧预览兜底**：场景壁纸要等整包 + 纹理 + shader 编译完才有画面，期间是纯底色。
4. **场景包走 IPC 全量传输**：100~300MB 的 `scene.pkg` 走结构化克隆，内存峰值翻倍，且无法断点。
5. **同步 I/O 在 IPC handler 里**：`listWorkshopWallpapers` 在 Steam 库很大时会让主进程卡住（`wallpaper-workshop.ts:76/84/59` 全是同步 API）。
6. **无失败记忆**：某张场景壁纸渲染不出来，下次还会再试一次同样的失败。
7. **配置只有一个扁平对象**，没有预设/分享概念。

---

## 三、DSH 侧值得抄的 8 个模式

### 模式 1：切源「内容闸门」——旧壁纸留屏，绝不露底色 ⭐最高性价比

DSH 的做法（`lib/client.js:17924-17935`、`:1792-1794`）：
- 新层挂上去先 `.we-layer--pending { opacity: 0 }`；
- 放行条件三条之一：海报图**已加载**（不是"属性存在"）｜`readyState >= 2`｜预算到期；
- **没画面时旧壁纸继续留在屏上**，不 commit。

DSH 甚至为"海报预算"单独调过两次参数（`:17944-17960`）：4000ms → 1200ms，因为"等首帧会把切换推到十几秒"。

**Roy 怎么改**（改动最小、收益最大）：
```
WallpaperLayer 里保留上一张的 src（lastGoodSrc），
新源就绪前渲染两层：底层 = lastGoodSrc（opacity 1），上层 = 新源（opacity 0）
新源 onLoadedData/onCanPlay 后再把上层 opacity 切 1、300ms 后卸底层。
去掉 key={mediaUrl}，改成两个常驻 <video> 交替（A/B 槽），避免重建元素。
```
行号锚点：`WallpaperLayer.tsx:245-254`。

### 模式 2：首帧预算 + 兜底，而不是无限等

DSH 有 `VIDEO_POSTER_BUDGET_MS = 1200`（`:17958`）和 `VIDEO_STALL_GIVE_UP_MS = 15000`（`:17974`）两级：预算到期放行（最坏黑一下）；停滞上限到了**停止等待但也不放行空层**。

Roy 的 `SceneWallpaper` 目前是"永远等"（`SceneWallpaper.tsx:43-70` 只有 catch，没有超时）。建议：
- 加载超过 N 秒 → 显示该壁纸的 `project.json` 里 `preview` 图（WE 项目自带）或纯色 `schemecolor`；
- 真失败 → 写入失败记忆（见模式 6）。

### 模式 3：faststart 虚拟布局——不落盘解决 moov 在尾部

`lib/faststart.js` + `lib/mp4-vfs.js`：**响应期按段表合成** `[ftyp][free][moov(补丁)][mdat]`，mdat 一个字节不动，磁盘成本 0；`stco/co64` 偏移统一 `+len(moov)`，任一条越界就退回原片。

Roy 侧对应问题：`roy-file://` 直接转发 file 协议，moov 在尾部的视频（WE 工坊里很常见）首帧要等整文件读完。实测数据在 DSH 注释里：`iris2 764MB / 1761ms`，同一个文件 moov 在前时只要 `149–233ms`。

**Roy 是否要做**：如果只支持 Electron 桌面端，可以更省事——用 ffmpeg 一次性 `-movflags +faststart` 生成副本（Roy 已依赖 `sharp`，加 ffmpeg 不算大）。DSH 那套虚拟布局是**服务端无 ffmpeg** 场景下的解法，Roy 不必照抄。

### 模式 4：媒体走 HTTP 路由而不是 IPC 传字节 ⭐结构性建议

DSH 的场景包走 `/wallpaper-engine/scene-files/<token>`，`serveFile` 完整支持 Range（`lib/serve.js:349-382`，三分支 + 206 + 416），并配一个「载荷传输账本」（`payloadProgress`）让客户端分辨「在下载」还是「出不了帧」。

Roy 现在是 `ipc.ts:3631` 返回 `{ pkg: Uint8Array }` 走 IPC。改成：
```
主进程注册一个本地 http server（或复用现有 dev server），
暴露 GET /wallpaper/scene/:id  → createReadStream(scene.pkg)（自带 Range）
渲染层 iframe / fetch 直接拿 URL，交给 WebWallGL
```
好处：① 不再整包进内存；② 可 Range / 可缓存；③ 进度可观测；④ 和 webwallgl 的 `httpSource` 天然契合（Roy 现在用的是 `bytesSource`，`SceneWallpaper.tsx:48`）。

### 模式 5：缩略图按需生成 + 磁盘缓存 ⭐用户可感知最强

DSH 的 `lib/media/image-preview.js` 文件头写得很直白：上传图片原先"直接把自己当 preview"，卡片 92px 高却让浏览器解码 8064×5376 的原图，一页 24 张 = 400MB 传输 + 24×43MP 解码，"翻到含大图那几页就卡死"。缩略图压到 320px 宽 JPEG ≈ 10KB。

关键纪律（可直接抄）：
- 缓存键含 `size + mtime`（源换了自动失效）；
- 同键并发请求共享一次生成（in-flight 表），一页 24 张不会起 24 个 ffmpeg；
- 失败返回 `null` 让调用方回落原图，绝不抛；
- 产出判定是 **spawn 正常返回**，不是"文件存在"（失败会留 0 字节残片）。

`lib/media/video-preview.js:155-170` 还多一条：抽帧用 `-ss 1` **跳过黑场淡入**，失败回 0。

**Roy 落地**：`WallpaperPicker.tsx:329` 那张卡片加 `<img src={thumbUrl}>`，主进程新增 `wallpaper:thumb` IPC，用 `sharp`（已有依赖）做图片缩略、`ffmpeg` 抽视频首帧，落 `getConfigDir()/thumbs/`。

### 模式 6：失败记忆——同一张壁纸不重复踩坑

DSH 有 `sceneLiveFailures`（`settings-schema.js:1111`），按壁纸 id 记住"这张实时渲染不行"，下次直接走降级链 `sceneLive → sceneVideo → frameUrl → schemeColor`。

Roy 现在 `SceneWallpaper.tsx:62-69` catch 完只 `console.error` + 底部飘一行错误，下次重进还是从零试。建议在 settings 里加 `wallpaper.failedScenes: Record<string, string>`，失败即记，选中时直接提示并跳过。

### 模式 7：内容分级 + 软隐藏 + 轮播

- 分级：WE 的 `project.json` 有 `contentrating`（`Everyone/PG13/Mature`），DSH 原样透传到前端筛选（`wallpaper-scan.js:63-67`），缺省按 Everyone。
- 隐藏：纯软删除 `hiddenIds: []`（`settings-schema.js:525`），只改列表不删文件。
- 轮播：`rotationEnabled/rotationInterval/rotationGroups`，切换时"下一张准备完成后再交接，失败候选自动跳过"。

Roy 的 `WallpaperPicker` 现在完全没有这三样。轮播尤其适合 Roy——场景壁纸放着不动反而浪费。

### 模式 8：遮挡暂停的三档判定 + 低频复核

DSH `occlusionReason()`（`lib/client.js:26750-26756`）：
```
pauseOnHidden && document.hidden        → 页面隐藏
!document.hasFocus()（受 adapterCaps().blurPause 门控） → 失焦
pauseOnBattery && 未充电                 → 电池
```
并加了 **3s 低频复核**（`OCCLUSION_RECHECK_MS`，`:26760-26782`），因为"原生模态抢焦点后 focus 事件不保证送达"。

Roy 现在只有 `document.hidden || !document.hasFocus()`（`SceneWallpaper.tsx:87`、`ProceduralWallpaper.tsx:105`）。**建议只加电池档**——桌面端跑 4K 场景壁纸，电池下暂停是真实痛点：
```ts
navigator.getBattery?.().then(bm => { ... bm.addEventListener('chargingchange', sync) })
```
DSH 特意注明 `getBattery` 已废弃但在 Chromium 里仍可用，所以做了 feature-detect（`:30965`）。

---

## 四、不要抄的部分（避免踩坑）

| DSH 的做法 | 为什么不建议 Roy 照抄 |
|---|---|
| 29 条 HTTP 路由 + 独立 loopback 媒体源 | Roy 是单窗口 Electron，`roy-file://` 已经够用；多开一个端口是给 Web 版解决跨源问题的 |
| 47000 行 / 文件头 40-80 行注释 | 那是多人协作 + 机器判据（`test/verify-*.mjs`）撑起来的，Roy 单人维护会变成负担 |
| 144 个配置键 / 6 个设置页签 | 与 Roy「少设置、默认就好」的产品取向冲突 |
| x11 遮挡探针 | 只在 Linux X11 生效，Windows 上恒为 `backend:'none'`；Roy 用 Electron 的 `blur/focus` 就够 |
| WebWallGL 引擎直出（`/scene-live/engine/`） | Roy 已经把 `webwallgl` 当 npm 依赖 `import()`，路径更短，没必要绕 |
| `@linxin666/dsh-client-ui-skin-center` 的整套换肤 | 那是「静态皮肤 + 一张背景图」，与 Roy 的动态壁纸是两条路；但其 `performance-guidelines-v1.md` 值得一读 |

---

## 五、建议的落地顺序

| 优先级 | 事项 | 改动面 | 预期收益 |
|---|---|---|---|
| **P0** | 切源内容闸门（A/B 双 `<video>` 槽 + 就绪后再切） | `WallpaperLayer.tsx` 单文件 | 消除换壁纸闪白，用户立刻可感知 |
| **P0** | 工坊列表加缩略图（sharp / ffmpeg + 磁盘缓存） | 新增 1 个 IPC + picker 卡片 | 从"靠名字选"变成"看脸选" |
| **P1** | 首帧预算 + `project.json` preview 兜底 | `SceneWallpaper.tsx` | 场景壁纸不再长时间纯底色 |
| **P1** | 失败记忆 | settings 加 1 字段 + `SceneWallpaper` | 不重复踩坑 |
| **P1** | 电池档暂停 | 2 个组件各 10 行 | 笔记本续航 |
| **P2** | 场景包改 HTTP + Range（放弃 IPC 传字节） | 主进程 + `SceneWallpaper` | 内存峰值、可观测性 |
| **P2** | 内容分级 + 软隐藏 + 轮播 | `WallpaperPicker` 重构 | 壁纸库变"能用的库" |
| **P3** | faststart 副本（ffmpeg 预处理） | 主进程新增 | 大视频首帧提速 |

---

## 六、一句话总结

DSH 那个插件真正的价值不在"功能多"，而在**每一条容易退化的不变量都只有一处实现 + 一条机器判据**，以及**所有优化都设计成可无损退化为原始路径**（faststart 判不了就发原片、缩略图失败就回原图、转码失败就回原片）。

Roy 该抄的是这两条纪律，加上 P0 的两个具体改法；不该抄的是它的体量和 Web 版包袱。
