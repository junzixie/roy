/**
 * 电脑控制进行中：屏幕顶部正中的常驻提示「AI 正在操控电脑」。
 *
 * - 鼠标点击直接穿透，不挡用户操作，也不抢焦点
 * - 开了内容保护：AI 截屏时看不到它，不会把它当成界面元素去点
 * - 跟随主屏，停止或这一轮结束时消失
 * - 实时显示 AI 当前在做哪一步（「后台点击 · 微信」）
 * - AI 在后台窗口里操作时（用户看不到那个窗口），下方显示该窗口的实时小预览
 */

import { BrowserWindow, screen, type NativeImage } from 'electron'

let win: BrowserWindow | null = null
let ready = false
let pending: { action?: string; preview?: { src: string; title: string } | null } = {}

const WIDTH = 380
const PILL_H = 52
const PREVIEW_W = 340

const html = (stopKey: string): string => `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;background:transparent;overflow:hidden;font:13px/1.2 -apple-system,"Segoe UI","Microsoft YaHei",sans-serif;color:#fff}
.wrap{display:flex;flex-direction:column;align-items:center;gap:6px;padding-top:6px}
.pill{width:max-content;max-width:${WIDTH - 16}px;display:flex;align-items:center;gap:8px;padding:8px 14px;border-radius:999px;
background:rgba(20,22,30,.86);box-shadow:0 6px 24px rgba(0,0,0,.25);backdrop-filter:blur(8px)}
.dot{flex:none;width:8px;height:8px;border-radius:50%;background:#f43f5e;box-shadow:0 0 0 0 rgba(244,63,94,.7);animation:p 1.6s infinite}
.k{opacity:.7;flex:none}
#act{opacity:.85;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:150px}
#act:empty{display:none}
.pv{display:none;width:${PREVIEW_W}px;border-radius:10px;overflow:hidden;background:rgba(20,22,30,.86);box-shadow:0 8px 28px rgba(0,0,0,.3)}
.pv.on{display:block}
.pv img{display:block;width:100%;height:auto}
.pvt{padding:5px 10px;font-size:11.5px;opacity:.8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
@keyframes p{0%{box-shadow:0 0 0 0 rgba(244,63,94,.6)}70%{box-shadow:0 0 0 8px rgba(244,63,94,0)}100%{box-shadow:0 0 0 0 rgba(244,63,94,0)}}
@media (prefers-reduced-motion:reduce){.dot{animation:none}}
</style></head><body><div class="wrap">
<div class="pill"><span class="dot"></span><span>AI 正在操控电脑</span><span id="act"></span><span class="k">· ${stopKey} 停止</span></div>
<div class="pv" id="pv"><div class="pvt" id="pvt"></div><img id="pvi" alt=""></div>
</div><script>
window.__set = (s) => {
  if ('action' in s) document.getElementById('act').textContent = s.action ? '· ' + s.action : ''
  if ('preview' in s) {
    const pv = document.getElementById('pv')
    if (s.preview) { document.getElementById('pvi').src = s.preview.src; document.getElementById('pvt').textContent = '后台窗口：' + s.preview.title; pv.classList.add('on') }
    else pv.classList.remove('on')
  }
}
</script></body></html>`

function position(height: number): void {
  if (!win || win.isDestroyed()) return
  const d = screen.getPrimaryDisplay()
  win.setBounds({ x: Math.round(d.workArea.x + (d.workArea.width - WIDTH) / 2), y: d.workArea.y, width: WIDTH, height })
}

function flush(): void {
  if (!win || win.isDestroyed() || !ready) return
  const state = pending
  pending = {}
  if ('preview' in state) {
    const p = state.preview
    // 预览图按宽 PREVIEW_W 缩放后的高度 + 标题行
    position(p ? PILL_H + 8 + Math.round(previewHeight) + 36 : PILL_H)
  }
  win.webContents.executeJavaScript(`window.__set(${JSON.stringify(state)})`).catch(() => undefined)
}

let previewHeight = 0

export function showComputerOverlay(stopKey: string): void {
  if (win && !win.isDestroyed()) { win.showInactive(); return }
  ready = false
  win = new BrowserWindow({
    width: WIDTH,
    height: PILL_H,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  })
  position(PILL_H)
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setIgnoreMouseEvents(true)
  // AI 截屏时把它排除掉（Windows 10 2004 起支持）
  win.setContentProtection(true)
  win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html(stopKey))).catch(() => undefined)
  win.once('ready-to-show', () => win?.showInactive())
  win.webContents.once('did-finish-load', () => { ready = true; flush() })
  win.on('closed', () => { win = null; ready = false })
}

/** 显示 AI 当前这一步在做什么；传空清掉 */
export function setComputerOverlayAction(action: string | undefined): void {
  pending.action = (action ?? '').slice(0, 40)
  flush()
}

/**
 * 后台窗口实时预览。AI 操作的窗口在别的窗口后面、用户看不到时调用；
 * 回到前台操作（用户能直接看到屏幕）时传 null 收起。
 */
export function setComputerOverlayPreview(img: NativeImage | null, title = ''): void {
  if (!img || img.isEmpty()) {
    pending.preview = null
    previewHeight = 0
  } else {
    const small = img.resize({ width: PREVIEW_W, quality: 'good' })
    previewHeight = small.getSize().height
    pending.preview = { src: `data:image/jpeg;base64,${small.toJPEG(75).toString('base64')}`, title }
  }
  flush()
}

export function hideComputerOverlay(): void {
  if (win && !win.isDestroyed()) win.close()
  win = null
  ready = false
  pending = {}
  previewHeight = 0
}
