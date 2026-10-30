/**
 * 登录窗专用 preload。
 *
 * 登录窗原来开着 `nodeIntegration: true` + `contextIsolation: false` +
 * `sandbox: false`，页面里直接 `require('electron')` 调 `login:submit`。
 * 这是**密码入口**，是整仓风险最高的窗口，所以：
 *
 *  - 只暴露 3 个函数，没有任何 `send(channel, ...)` 透传口；
 *  - 入参在这里做类型收敛，主进程侧的 `mine(e)` 校验保持不变（双保险）；
 *  - 窗口恢复 `contextIsolation: true` + `sandbox: true`，页面拿不到 Node。
 *
 * 注意：这里**不做**密码校验，也**不缓存**密码。校验仍然只在主进程的
 * `verifyLocalUserPassword` 里发生，preload 只是搬运。
 */

import { contextBridge, ipcRenderer } from 'electron'

/** 登录窗初始化数据。 */
interface LoginInit {
  users: Array<{ username: string; displayName: string; hasPassword: boolean; primary?: boolean }>
  active: string
  logo: string
}

/** 提交结果。 */
interface LoginSubmitResult {
  ok: boolean
  error?: string
}

contextBridge.exposeInMainWorld('royLogin', {
  /**
   * 取用户列表、当前选中用户与 logo。
   *
   * @returns 初始化数据；主进程拒绝时返回空列表而不是抛错，页面据此停在空态。
   */
  async init(): Promise<LoginInit> {
    try {
      const raw = await ipcRenderer.invoke('login:init')
      if (raw === null || typeof raw !== 'object') return { users: [], active: '', logo: '' }
      const { users, active, logo } = raw as Partial<LoginInit>
      return {
        users: Array.isArray(users) ? users : [],
        active: typeof active === 'string' ? active : '',
        logo: typeof logo === 'string' ? logo : '',
      }
    } catch {
      return { users: [], active: '', logo: '' }
    }
  },

  /**
   * 提交选中的用户与密码。
   *
   * @param username - 选中的用户名。
   * @param password - 输入的密码（没有密码的用户传空串）。
   * @returns 是否通过；不通过时带一句可展示的错误。
   */
  async submit(username: string, password: string): Promise<LoginSubmitResult> {
    if (typeof username !== 'string' || username === '') return { ok: false, error: '请选一个用户' }
    try {
      const raw = await ipcRenderer.invoke('login:submit', username, typeof password === 'string' ? password : '')
      if (raw === null || typeof raw !== 'object') return { ok: false, error: '登录失败，请重试' }
      const { ok, error } = raw as Partial<LoginSubmitResult>
      return { ok: ok === true, error: typeof error === 'string' ? error : undefined }
    } catch {
      return { ok: false, error: '登录失败，请重试' }
    }
  },

  /** 关闭窗口即退出 Roy。 */
  quit(): void {
    ipcRenderer.send('login:quit')
  },
})
