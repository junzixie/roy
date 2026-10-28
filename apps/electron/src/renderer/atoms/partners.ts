/**
 * 工作伙伴状态：已安装 / 停用 / 当前选中。
 *
 * 真正的数据存在主进程 settings.json 的 partners 字段里（主进程拼系统提示词时读取），
 * 这里只做渲染端缓存，所有修改都先写回设置再更新缓存。
 */

import * as React from 'react'
import { atom, useAtom } from 'jotai'
import { normalizePartnerSettings, type PartnerDefinition, type PartnerSettings } from '@roy/shared'

export const partnerSettingsAtom = atom<PartnerSettings>({ installed: [], disabled: [] })
const partnerSettingsLoadedAtom = atom(false)

export interface PartnerActions {
  settings: PartnerSettings
  install: (id: string) => Promise<void>
  uninstall: (id: string) => Promise<void>
  setEnabled: (id: string, enabled: boolean) => Promise<void>
  setActive: (id: string | undefined) => Promise<void>
  saveCustom: (partner: PartnerDefinition) => Promise<void>
  removeCustom: (id: string) => Promise<void>
}

export function usePartners(): PartnerActions {
  const [settings, setSettings] = useAtom(partnerSettingsAtom)
  const [loaded, setLoaded] = useAtom(partnerSettingsLoadedAtom)

  React.useEffect(() => {
    if (loaded) return
    setLoaded(true)
    window.electronAPI.getSettings()
      .then((s) => setSettings(normalizePartnerSettings((s as { partners?: unknown }).partners)))
      .catch((error: unknown) => console.error('[工作伙伴] 读取设置失败:', error))
  }, [loaded, setLoaded, setSettings])

  const save = React.useCallback(async (next: PartnerSettings) => {
    const normalized = normalizePartnerSettings(next)
    const prev = settings
    setSettings(normalized)
    try {
      await window.electronAPI.updateSettings({ partners: normalized })
    } catch (error) {
      setSettings(prev)
      throw error
    }
  }, [settings, setSettings])

  return {
    settings,
    install: (id) => save({ ...settings, installed: [...settings.installed.filter((x) => x !== id), id], disabled: (settings.disabled ?? []).filter((x) => x !== id) }),
    uninstall: (id) => save({
      installed: settings.installed.filter((x) => x !== id),
      disabled: (settings.disabled ?? []).filter((x) => x !== id),
      ...(settings.active && settings.active !== id ? { active: settings.active } : {}),
    }),
    setEnabled: (id, enabled) => save({
      ...settings,
      disabled: enabled ? (settings.disabled ?? []).filter((x) => x !== id) : [...new Set([...(settings.disabled ?? []), id])],
      ...(!enabled && settings.active === id ? { active: undefined } : {}),
    }),
    setActive: (id) => save({ ...settings, active: id }),
    saveCustom: (partner) => save({ ...settings, custom: [...(settings.custom ?? []).filter((x) => x.id !== partner.id), partner], installed: [...settings.installed.filter((x) => x !== partner.id), partner.id], disabled: (settings.disabled ?? []).filter((x) => x !== partner.id) }),
    removeCustom: (id) => save({ ...settings, custom: (settings.custom ?? []).filter((x) => x.id !== id), installed: settings.installed.filter((x) => x !== id), disabled: (settings.disabled ?? []).filter((x) => x !== id), ...(settings.active === id ? { active: undefined } : {}) }),
  }
}
