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

/*
 * 页面本体已移到 resources/login/index.html。
 *
 * 以前这里是一整个模板字符串，用 `data:text/html` 加载——这是密码入口，
 * 却因此关掉了全部三层隔离（页面里要 require('electron')）。改成独立文件后，
 * 页面只能通过 preload 暴露的 window.royLogin 说话。
 */

/** 需要时弹登录窗；返回后接着启动（选了别的用户会直接重启，不会返回） */
export function runLoginGate(): Promise<void> {
  return new Promise((resolve) => {
    let failures = 0
    let lockedUntil = 0
    const win = new BrowserWindow({
      width: 400, height: 470, frame: false, transparent: true, resizable: false, maximizable: false,
      fullscreenable: false, show: false, center: true, title: 'Roy',
      webPreferences: {
        // 密码入口必须三层隔离全开：页面走独立文件 + 专用 preload。
        // 以前这里是 nodeIntegration: true / contextIsolation: false / sandbox: false。
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        preload: join(__dirname, 'preload-login.cjs'),
      },
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
    const resourcesDir = app.isPackaged ? process.resourcesPath : join(__dirname, 'resources')
    void win.loadFile(join(resourcesDir, 'login', 'index.html'))
    win.once('ready-to-show', () => win.show())
  })
}
