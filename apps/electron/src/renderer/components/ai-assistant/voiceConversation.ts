/** 只处理面向用户的文本；推理、工具原始结果不进入播报队列。 */
export function cleanSpokenText(text: string): string {
  return text.replace(/```[\s\S]*?(?:```|$)/g, ' ').replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '链接').replace(/^[\s#>*-]+/gm, '').replace(/[`*_~]/g, '').replace(/\s+/g, ' ').trim()
}

/** Default ordinary dialogue to no-tool; external facts and actions keep their permission path. */
export function isSocialConversation(text: string): boolean {
  const s = text.trim()
  if (!s) return false
  if (/(继续|接着|重试|执行|查[询找看一]|搜[索一下]|天气|温度|热不热|下雨|新闻|汇率|股价|比赛|最新|实时|现在几点|今天几号|打开|关闭|关掉|关了|启动|停止|删除|删掉|修改|改成|保存|下载|安装|卸载|创建|新建|生成.{0,8}(文件|项目|文档|表格)|项目|文件|文件夹|屏幕|软件|服务器|数据库|联网|浏览器|技能|记忆|日历|待办|今天该做什么|当前的项目|https?:\/\/|[A-Z]:[\\/])/i.test(s)) return false
  return true
}

/**
 * 以完整句子为先；长句按安全长度分段，不把整篇截成 500 字。
 * first=true 时是本轮第一句：遇到逗号就先切出来，尽早开口（像真人先回应再展开）。
 */
export function takeSpeechChunks(buffer: string, flush = false, first = false): { chunks: string[]; rest: string } {
  const chunks: string[] = []
  let rest = buffer
  // 代码围栏未闭合时不朗读其内容。
  while (rest.length) {
    const fence = rest.indexOf('```')
    if (fence === 0) {
      const end = rest.indexOf('```', 3)
      if (end < 0) { if (flush) rest = ''; break }
      rest = rest.slice(end + 3); continue
    }
    const limit = fence >= 0 ? Math.min(160, fence) : 160
    let end = rest.slice(0, limit).search(/[。！？!?；;\n]/)
    if (first && !chunks.length) {
      const comma = rest.slice(0, limit).search(/[，,、：:]/)
      if (comma >= 2 && (end < 0 || comma < end)) end = comma
    }
    if (end >= 0) end += 1
    else if (fence > 0 && fence <= 160) end = fence
    else if (rest.length >= 160) end = 160
    else if (flush) end = rest.length
    else break
    const spoken = cleanSpokenText(rest.slice(0, end))
    rest = rest.slice(end)
    if (spoken) chunks.push(spoken)
  }
  return { chunks, rest }
}

/**
 * 播报队列：每句入队就开始合成（prepare），播放严格按入队顺序（play）。
 * 这样第二句在第一句播放时已经合成好，句间没有停顿。
 */
export class VoiceReplyQueue {
  private aborter = new AbortController()
  private tail: Promise<void> = Promise.resolve()
  private pending = 0
  constructor(
    private prepare: (text: string, signal: AbortSignal) => Promise<() => Promise<void>>,
    private play: (ready: () => Promise<void>, signal: AbortSignal) => Promise<void>,
    private onBusy: (busy: boolean) => void,
    private onError: (error: unknown) => void,
  ) {}
  push(text: string): void {
    if (!text.trim()) return
    const signal = this.aborter.signal
    this.pending += 1
    this.onBusy(true)
    const ready = this.prepare(text, signal)
    ready.catch(() => { /* 错误在按顺序播放时再报，避免未处理的 rejection */ })
    this.tail = this.tail.then(async () => {
      if (signal.aborted) return
      try { await this.play(await ready, signal) } catch (error) { if (!signal.aborted) this.onError(error) }
    }).finally(() => {
      if (signal !== this.aborter.signal) return
      this.pending -= 1
      if (!this.pending) this.onBusy(false)
    })
  }
  async drain(): Promise<void> { await this.tail }
  cancel(): void {
    this.aborter.abort()
    this.aborter = new AbortController()
    this.tail = Promise.resolve()
    this.pending = 0
    this.onBusy(false)
  }
}

/** 助手专用端点检测；普通系统听写不使用它。 */
export class VoiceEndpoint {
  private beganAt = 0
  private lastSoundAt = 0
  private lastTextAt = 0
  private text = ''
  reset(now: number): void { this.beganAt = this.lastSoundAt = this.lastTextAt = now; this.text = '' }
  sound(level: number, now: number): void { if (level >= 0.025) this.lastSoundAt = now }
  transcript(text: string, now: number): void { if (text !== this.text) { this.text = text; this.lastTextAt = now } }
  shouldStop(now: number): boolean {
    return this.text.trim().length > 0
      ? now - this.lastTextAt >= 1100 && now - this.lastSoundAt >= 900
      : now - this.beganAt >= 15000
  }
}
