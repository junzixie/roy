/**
 * 启动登录窗（本地多用户）
 *
 * 在 Roy 启动的最开头弹出（任何会话、定时任务、机器人启动之前）：
 * 选用户，有密码的输密码。选的就是这次的用户 → 继续启动；选了别人 → 记下来并重启 Roy。
 * 关掉窗口 = 退出 Roy。连续输错 5 次要等 30 秒。
 */

import { app, BrowserWindow, ipcMain, nativeImage } from 'electron'
import { join } from 'node:path'
import { getActiveUsername, getLocalUsersState, selectLocalUser, verifyLocalUserPassword } from './lib/local-users'

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Roy</title><style>
*{box-sizing:border-box}html,body{margin:0;height:100%;font-family:"Microsoft YaHei UI","Segoe UI",sans-serif;background:transparent}
.card{position:absolute;inset:8px;border-radius:16px;background:#faf9f6;box-shadow:0 8px 30px rgba(0,0,0,.18);padding:28px 30px;display:flex;flex-direction:column;-webkit-app-region:drag}
.top{display:flex;align-items:center;gap:12px;margin-bottom:18px}.top img{width:40px;height:40px;border-radius:10px}
h1{font-size:18px;margin:0;color:#1f2328}.sub{font-size:12.5px;color:#6b7280;margin-top:2px}
.x{position:absolute;right:14px;top:12px;border:0;background:transparent;font-size:18px;color:#9ca3af;cursor:pointer;-webkit-app-region:no-drag}
.list{display:flex;flex-direction:column;gap:6px;overflow:auto;max-height:190px;-webkit-app-region:no-drag}
.u{display:flex;align-items:center;gap:10px;padding:9px 12px;border:1px solid #e5e7eb;border-radius:10px;cursor:pointer;background:#fff}
.u:hover{border-color:#cbd5e1}.u.on{border-color:#2f6b4f;box-shadow:0 0 0 2px rgba(47,107,79,.15)}
.av{width:30px;height:30px;border-radius:50%;background:#2f6b4f;color:#fff;display:flex;align-items:center;justify-content:center;font-size:14px}
.n{font-size:14px;color:#111827}.m{font-size:11.5px;color:#9ca3af}
.pw{margin-top:14px;-webkit-app-region:no-drag}input{width:100%;height:36px;border:1px solid #d1d5db;border-radius:8px;padding:0 10px;font-size:14px;outline:none}
input:focus{border-color:#2f6b4f}.err{color:#dc2626;font-size:12.5px;min-height:18px;margin-top:6px}
.go{margin-top:auto;height:38px;border:0;border-radius:10px;background:#2f6b4f;color:#fff;font-size:14px;cursor:pointer;-webkit-app-region:no-drag}.go:disabled{opacity:.5}
</style></head><body><div class="card"><button class="x" id="x" title="退出 Roy">×</button>
<div class="top"><img id="logo" alt=""><div><h1>选择用户</h1><div class="sub">每个用户的会话、项目和设置都是分开的</div></div></div>
<div class="list" id="list"></div><div class="pw" id="pwbox" hidden><input id="pw" type="password" placeholder="输入密码"></div><div class="err" id="err"></div>
<button class="go" id="go">进入 Roy</button></div><script>
const {ipcRenderer}=require('electron');let users=[],sel='';
const $=id=>document.getElementById(id);
function render(){const l=$('list');l.textContent='';for(const u of users){const d=document.createElement('div');d.className='u'+(u.username===sel?' on':'');
const a=document.createElement('div');a.className='av';a.textContent=(u.displayName||u.username).slice(0,1);
const t=document.createElement('div');const n=document.createElement('div');n.className='n';n.textContent=u.displayName;const m=document.createElement('div');m.className='m';m.textContent=(u.primary?'第一个用户':u.username)+(u.hasPassword?' · 有密码':'');t.append(n,m);d.append(a,t);
d.onclick=()=>{sel=u.username;$('err').textContent='';render()};l.append(d)}
const cur=users.find(u=>u.username===sel);$('pwbox').hidden=!(cur&&cur.hasPassword);if(cur&&cur.hasPassword)setTimeout(()=>$('pw').focus(),0)}
async function go(){$('go').disabled=true;const r=await ipcRenderer.invoke('login:submit',sel,$('pw').value);$('go').disabled=false;if(!r.ok){$('err').textContent=r.error;$('pw').select()}}
$('go').onclick=go;$('pw').onkeydown=e=>{if(e.key==='Enter')go()};$('x').onclick=()=>ipcRenderer.send('login:quit');
ipcRenderer.invoke('login:init').then(d=>{users=d.users;sel=d.active;$('logo').src=d.logo||'';render()});
</script></body></html>`

/** 需要时弹登录窗；返回后接着启动（选了别的用户会直接重启，不会返回） */
export function runLoginGate(): Promise<void> {
  return new Promise((resolve) => {
    let failures = 0
    let lockedUntil = 0
    const win = new BrowserWindow({
      width: 400, height: 470, frame: false, transparent: true, resizable: false, maximizable: false,
      fullscreenable: false, show: false, center: true, title: 'Roy',
      webPreferences: { nodeIntegration: true, contextIsolation: false, sandbox: false },
    })
    const mine = (e: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent): boolean => !win.isDestroyed() && e.sender.id === win.webContents.id
    let done = false
    const cleanup = (): void => {
      ipcMain.removeHandler('login:init')
      ipcMain.removeHandler('login:submit')
      ipcMain.removeAllListeners('login:quit')
    }
    ipcMain.handle('login:init', (e) => {
      if (!mine(e)) return { users: [], active: '' }
      const state = getLocalUsersState()
      let logo = ''
      for (const p of [join(process.resourcesPath ?? '', 'icon.png'), join(__dirname, 'resources', 'icon.png')]) {
        const img = nativeImage.createFromPath(p)
        if (!img.isEmpty()) { logo = img.resize({ width: 80, height: 80 }).toDataURL(); break }
      }
      return { users: state.users, active: state.active || state.users[0]?.username || '', logo }
    })
    ipcMain.handle('login:submit', (e, username: unknown, password: unknown) => {
      if (!mine(e) || typeof username !== 'string') return { ok: false, error: '请选一个用户' }
      if (Date.now() < lockedUntil) return { ok: false, error: `输错太多次，请 ${Math.ceil((lockedUntil - Date.now()) / 1000)} 秒后再试` }
      const pw = typeof password === 'string' ? password : ''
      if (!verifyLocalUserPassword(username, pw)) {
        failures += 1
        if (failures >= 5) { lockedUntil = Date.now() + 30_000; failures = 0 }
        return { ok: false, error: '密码不对' }
      }
      if (username === getActiveUsername()) {
        selectLocalUser(username, pw)
        done = true
        cleanup()
        // 先藏起来，等主窗口出来再销毁：否则「所有窗口都关了」会让 Roy 直接退出
        win.hide()
        setTimeout(() => { if (!win.isDestroyed()) win.destroy() }, 8000)
        resolve()
        return { ok: true }
      }
      // 换了用户：各种路径在启动时已经按原用户算好，必须重启
      selectLocalUser(username, pw)
      done = true
      app.relaunch()
      app.exit(0)
      return { ok: true }
    })
    ipcMain.on('login:quit', (e) => { if (mine(e)) app.exit(0) })
    win.on('closed', () => { if (!done) app.exit(0) })
    void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(PAGE)}`)
    win.once('ready-to-show', () => win.show())
  })
}
