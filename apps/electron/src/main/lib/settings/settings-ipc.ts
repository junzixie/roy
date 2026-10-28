/**
 * 设置相关 IPC 处理器
 */

import { ipcMain } from 'electron'
import { settingsService } from './settings-service'

export function registerSettingsIpc(): void {
  // 获取所有设置
  ipcMain.handle('settings:get-all', () => {
    return settingsService.getAll()
  })

  // 获取单个设置
  ipcMain.handle('settings:get', (_, key: string) => {
    return settingsService.get(key as any)
  })

  // 更新单个设置
  ipcMain.handle('settings:set', (_, key: string, value: any) => {
    settingsService.set(key as any, value)
    return settingsService.getAll()
  })

  // 批量更新设置
  ipcMain.handle('settings:set-multiple', (_, updates: any) => {
    settingsService.setMultiple(updates)
    return settingsService.getAll()
  })

  // 重置设置
  ipcMain.handle('settings:reset', () => {
    settingsService.reset()
    return settingsService.getAll()
  })

  console.log('[Settings IPC] 已注册')
}
