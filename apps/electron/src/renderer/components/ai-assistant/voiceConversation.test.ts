import { describe, expect, test } from 'bun:test'
import { VoiceEndpoint, VoiceReplyQueue, cleanSpokenText, isSocialConversation, takeSpeechChunks } from './voiceConversation'
import { readFileSync } from 'node:fs'
const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const tick = () => new Promise<void>(r => setTimeout(r, 0))
/** 旧式「合成+播放」一步完成的写法，包装成新的 prepare/play 队列 */
const speakQueue = (speak: (text: string, signal: AbortSignal) => Promise<void>, onBusy: (busy: boolean) => void, onError: (error: unknown) => void) =>
  new VoiceReplyQueue(async (text, signal) => () => speak(text, signal), (ready) => ready(), onBusy, onError)
describe('罗伊语音交流', () => {
  test('明确闲聊使用无工具路径，操作和实时查询保留工具', () => {
    for (const text of ['你好', '你今天怎么样？', '谢谢你', '你是谁']) expect(isSocialConversation(text)).toBe(true)
    for (const text of ['查杭州天气', '打开微信', '创建项目', '看看屏幕', '你好，打开记事本', '继续']) expect(isSocialConversation(text)).toBe(false)
  })
  test('有文字后停顿提交，不因句子中途停顿立即截断', () => {
    const v = new VoiceEndpoint(); v.reset(0); v.sound(0.2, 500); v.transcript('今天天气', 600)
    expect(v.shouldStop(1400)).toBe(false)
    expect(v.shouldStop(1800)).toBe(true)
    v.sound(0.1, 1800); expect(v.shouldStop(1900)).toBe(false)
    v.transcript('今天天气怎么样', 2000); expect(v.shouldStop(3000)).toBe(false)
    expect(v.shouldStop(3200)).toBe(true)
  })
  test('没有语音十五秒结束，并可复位', () => {
    const v = new VoiceEndpoint(); v.reset(100)
    expect(v.shouldStop(15000)).toBe(false); expect(v.shouldStop(15100)).toBe(true)
    v.reset(15100); expect(v.shouldStop(15200)).toBe(false)
  })
  test('不把空文本或空格当作有效语音', () => {
    const v = new VoiceEndpoint(); v.reset(0); v.transcript(' ', 100)
    expect(v.shouldStop(2000)).toBe(false)
  })
  test('完整句先播，未结束文本留到下一批', () => {
    expect(takeSpeechChunks('你好。今天')).toEqual({ chunks: ['你好。'], rest: '今天' })
    expect(takeSpeechChunks('今天', true)).toEqual({ chunks: ['今天'], rest: '' })
  })
  test('超过500字不丢失，不把代码块朗读出来', () => {
    const text = '字'.repeat(1200)
    expect(takeSpeechChunks(text, true).chunks.join('')).toBe(text)
    expect(takeSpeechChunks('说明。```js\n危险代码\n```完成。', true).chunks).toEqual(['说明。', '完成。'])
    expect(takeSpeechChunks('```未完代码', true).chunks).toEqual([])
    expect(cleanSpokenText('<think>内部推理</think>你好。')).toBe('你好。')
  })
  test('语音严格按队列顺序，不重叠', async () => {
    const seen: string[] = []; let release: () => void = () => {}
    const q = speakQueue(async text => { seen.push(text); if (text === '一') await new Promise<void>(r => { release = r }) }, () => {}, () => {})
    q.push('一'); q.push('二'); await tick(); expect(seen).toEqual(['一'])
    release(); await q.drain(); expect(seen).toEqual(['一', '二'])
  })
  test('取消后丢弃旧队列且新回答不受影响', async () => {
    const seen: string[] = []; const busy: boolean[] = []; let aborted = false
    const q = speakQueue(async (text, signal) => { seen.push(text); if (text === '旧1') await new Promise<void>(r => signal.addEventListener('abort', () => { aborted = true; r() }, { once: true })) }, v => busy.push(v), () => {})
    q.push('旧1'); q.push('旧2'); await tick(); q.cancel(); q.push('新'); await q.drain(); await tick()
    expect(aborted).toBe(true); expect(seen).toEqual(['旧1', '新']); expect(busy.at(-1)).toBe(false)
  })
  test('某一句合成失败不阻断后续队列', async () => {
    const seen: string[] = []; let errors = 0
    const q = speakQueue(async text => { if (text === '错') throw Error('fail'); seen.push(text) }, () => {}, () => { errors++ })
    q.push('错'); q.push('好'); await q.drain(); expect(errors).toBe(1); expect(seen).toEqual(['好'])
  })
  test('下一句在上一句播放时就开始合成', async () => {
    const prepared: string[] = []; const played: string[] = []; let release: () => void = () => {}
    const q = new VoiceReplyQueue(async text => { prepared.push(text); return async () => { played.push(text); if (text === '一') await new Promise<void>(r => { release = r }) } }, ready => ready(), () => {}, () => {})
    q.push('一'); q.push('二'); await tick()
    expect(prepared).toEqual(['一', '二']); expect(played).toEqual(['一'])
    release(); await q.drain(); expect(played).toEqual(['一', '二'])
  })
  test('第一句遇到逗号先开口，后面按整句', () => {
    expect(takeSpeechChunks('好的，我现在就去默认项目里新建一个项目。', false, true).chunks).toEqual(['好的，', '我现在就去默认项目里新建一个项目。'])
    expect(takeSpeechChunks('没问题马上就来，我先看一下现在的项目列表。', false, true).chunks[0]).toBe('没问题马上就来，')
    expect(takeSpeechChunks('好的，我现在就去。', false, false).chunks).toEqual(['好的，我现在就去。'])
  })
  test('球体页不自动跳项目，不使用免审批', () => {
    const page = source('../../pages/AiAssistantPage.tsx')
    expect(page).not.toContain("'bypassPermissions'")
    expect(page).toContain("permissionModeOverride: 'ask'")
    expect(page).toContain('<PermissionBanner sessionId={session.id} explicitOnly')
    expect(page).toContain('<AskUserBanner')
    expect(page).toContain('<ExitPlanModeBanner')
    expect(page).not.toContain('createTaskUnderDefaultProject')
    expect(page).not.toContain('slice(0, 500)')
    expect(page).toContain("item.type === 'text_delta'")
  })
  test('听写只对助手执行端点检测，其他听写仍保持原有行为', () => {
    const voice = source('../voice-dictation/VoiceDictationApp.tsx')
    expect(voice).toContain("dictationSourceId !== 'roy-ai-workbench-command'")
    expect(voice).toContain('endpointRef.current.shouldStop')
    expect(voice).toContain("dictationSourceRef.current === 'roy-ai-workbench-command'")
  })
  test('云端合成完成后再次检查取消标记', () => {
    const prefs = source('../../lib/roy-workbench-prefs.ts')
    expect(prefs).toContain('if (cancelled()) return noop\n    if (!result.success')
    expect(prefs).toContain('if (signal?.aborted) return')
    expect(prefs).toContain('done?.()')
  })
  test('主进程传递助手模式且闲聊不加载工具技能，操作模式保持权限', () => {
    const pi = source('../../../main/lib/adapters/pi-agent-adapter.ts')
    expect(pi).toContain("input.assistantMode !== 'conversation' && (!input.slimMode")
    expect(pi).toContain("input.assistantMode !== 'conversation'\n                && !compactContextRequested")
    const main = source('../../../main/lib/agent-orchestrator.ts')
    expect(main).toContain('assistantMode: input.assistantMode')
    expect(main).toContain("input.assistantMode !== 'conversation' && Object.keys(mcpServers)")
  })

  test('唤醒不消费半句命令，停止后等待原运行完成', () => {
    const wake = source('./workbenchWakeWatch.ts')
    expect(wake).toContain('if (!res.isFinal) continue')
    expect(wake).not.toContain('if (chunk && utteranceContainsWakeWord')
    const page = source('../../pages/AiAssistantPage.tsx')
    expect(page).toContain('prior.catch(() => {})')
    expect(page).toContain('pendingRunRef.current = run')
    expect(page).toContain('if (!acceptCaptureRef.current) return')
  })
  test('云端合成迟到结果在取消后不会播放', async () => {
    const { speakWorkbenchTts, stopBrowserTts } = await import('../../lib/roy-workbench-prefs')
    const oldWindow = globalThis.window
    let release: (value: unknown) => void = () => {}
    let plays = 0
    const oldAudio = globalThis.Audio
    const storage = new Map<string,string>()
    Object.assign(globalThis, { window: { speechSynthesis: { cancel() {} }, electronAPI: {
      getVoiceTtsSettings: async () => ({ enabled: true, engine: 'doubao', doubaoSpeaker: 'test' }),
      synthesizeVoiceTts: () => new Promise(r => { release = r }),
    } }, localStorage: { getItem: (k: string) => storage.get(k) || null, setItem: (k: string,v: string) => storage.set(k,v) }, Audio: class { onended?: () => void; play() { plays++; this.onended?.(); return Promise.resolve() } pause() {} } })
    try {
      const aborter = new AbortController()
      const promise = speakWorkbenchTts('取消测试唯一长文本', { signal: aborter.signal })
      await tick(); aborter.abort(); release({ success: true, audioBase64: 'mock' }); await promise
      expect(plays).toBe(0)
      stopBrowserTts()
    } finally { Object.assign(globalThis, {window: oldWindow, Audio: oldAudio}) }
  })

})
