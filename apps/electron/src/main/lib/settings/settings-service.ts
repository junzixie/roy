/**
 * 设置管理服务
 *
 * 负责：
 * - 读取/保存应用设置
 * - 监听设置变化
 * - 提供默认值
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import type { RoySettings } from './settings-types'
import { DEFAULT_SETTINGS } from './settings-types'

const SETTINGS_FILE = join(app.getPath('userData'), 'settings.json')

class SettingsService {
  private settings: RoySettings = { ...DEFAULT_SETTINGS }
  private listeners: Array<(settings: RoySettings) => void> = []

  constructor() {
    this.load()
  }

  /**
   * 加载设置
   */
  private load(): void {
    try {
      if (existsSync(SETTINGS_FILE)) {
        const data = readFileSync(SETTINGS_FILE, 'utf-8')
        const loaded = JSON.parse(data)
        this.settings = { ...DEFAULT_SETTINGS, ...loaded }
      }
    } catch (error) {
      console.error('[Settings] 加载失败，使用默认设置', error)
    }
  }

  /**
   * 保存设置
   */
  private save(): void {
    try {
      writeFileSync(SETTINGS_FILE, JSON.stringify(this.settings, null, 2))
      this.notifyListeners()
    } catch (error) {
      console.error('[Settings] 保存失败', error)
    }
  }

  /**
   * 获取所有设置
   */
  getAll(): RoySettings {
    return { ...this.settings }
  }

  /**
   * 获取单个设置
   */
  get<K extends keyof RoySettings>(key: K): RoySettings[K] {
    return this.settings[key]
  }

  /**
   * 更新设置
   */
  set<K extends keyof RoySettings>(key: K, value: RoySettings[K]): void {
    this.settings[key] = value
    this.save()
  }

  /**
   * 批量更新设置
   */
  setMultiple(updates: Partial<RoySettings>): void {
    this.settings = { ...this.settings, ...updates }
    this.save()
  }

  /**
   * 重置为默认设置
   */
  reset(): void {
    this.settings = { ...DEFAULT_SETTINGS }
    this.save()
  }

  /**
   * 监听设置变化
   */
  onChange(listener: (settings: RoySettings) => void): () => void {
    this.listeners.push(listener)

    // 返回取消监听函数
    return () => {
      const index = this.listeners.indexOf(listener)
      if (index > -1) {
        this.listeners.splice(index, 1)
      }
    }
  }

  /**
   * 通知所有监听器
   */
  private notifyListeners(): void {
    const settings = this.getAll()
    for (const listener of this.listeners) {
      try {
        listener(settings)
      } catch (error) {
        console.error('[Settings] 监听器执行失败', error)
      }
    }
  }
}

// 单例导出
export const settingsService = new SettingsService()
