/**
 * 设置 · 权限设置
 *
 * 「怎么干活」相关的几项：新一段对话默认权限、Agent 运行模式、关闭窗口时、
 * 干活时要不要提示确认、文件放哪里。
 * 电脑操控（看屏幕 / 鼠标键盘）统一在「AI 配置 → 电脑控制」，此处只提供跳转，避免两处开关打架。
 */
import * as React from 'react'
import { useSetAtom } from 'jotai'
import { ROY_PERMISSION_MODE_CONFIG, ROY_PERMISSION_MODE_ORDER, type RoyPermissionMode } from '@roy/shared'
import { SettingsSection, SettingsCard, SettingsRow } from './primitives'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { DataDirSetting } from './DataDirSetting'
import { WorkBehaviorSettings } from './GeneralSettings'
import { CliPathSection } from './CliPathSection'
import { agentDefaultPermissionModeAtom } from '@/atoms/agent-atoms'
import { detectIsWindows } from '@/lib/platform'
import { RUNTIME_MODE_UI, WORK_MODE_ORDER, WORK_MODE_UI, readRuntimeMode, readWorkMode, workModePatch, type AgentRuntimeMode, type AgentWorkMode } from '@/lib/agent-modes'
import { settingsTabAtom } from '@/atoms/settings-tab'
import { ensureProFeature } from '@/atoms/pro-activation'

/** 三种运行模式的真实差异（对照 slim-mode.ts 与 mode-switching-adapter.ts） */

export function PermissionSettings(): React.ReactElement {
  const isWindows = React.useMemo(() => detectIsWindows(), [])
  const setDefaultAtom = useSetAtom(agentDefaultPermissionModeAtom)
  const setSettingsTab = useSetAtom(settingsTabAtom)
  const [permission, setPermission] = React.useState<RoyPermissionMode>('bypassPermissions')
  const [workMode, setWorkMode] = React.useState<AgentWorkMode>('standard')
  const [runtimeMode, setRuntimeMode] = React.useState<AgentRuntimeMode>('fast')
  const modeSettingsRef = React.useRef<{ workMode?: string; agentMode?: string }>({})
  const [closeBehavior, setCloseBehavior] = React.useState<'ask' | 'tray' | 'quit'>('ask')
  const [error, setError] = React.useState('')

  React.useEffect(() => {
    window.electronAPI.getSettings().then((s) => {
      const p = (s as { defaultPermissionMode?: RoyPermissionMode }).defaultPermissionMode
      if (p && p in ROY_PERMISSION_MODE_CONFIG) setPermission(p)
      modeSettingsRef.current = s
      setWorkMode(readWorkMode(s))
      setRuntimeMode(readRuntimeMode(s))
      setCloseBehavior(s.closeBehavior ?? 'ask')
    }).catch(() => undefined)
  }, [])

  const save = (patch: Record<string, unknown>, apply: () => void): void => {
    setError('')
    void window.electronAPI.updateSettings(patch as never).then(apply).catch(() => setError('保存失败，请重试'))
  }

  return (
    <div className="space-y-8">
      <SettingsSection title="权限设置" description="新对话怎么干、关窗时要不要提示确认、文件放哪里">
        <SettingsCard>
          <SettingsRow
            label="新对话默认权限"
            description={`${ROY_PERMISSION_MODE_CONFIG[permission].description}。每个对话也可以在输入框左下角单独切换，只影响之后新开的对话`}
          >
            <Select value={permission} onValueChange={(v) => {
              const next = v as RoyPermissionMode
              save({ defaultPermissionMode: next }, () => { setPermission(next); setDefaultAtom(next) })
            }}>
              <SelectTrigger className="w-[160px] h-8 text-[13px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROY_PERMISSION_MODE_ORDER.map((m) => (
                  <SelectItem key={m} value={m}>{ROY_PERMISSION_MODE_CONFIG[m].label}{m === 'bypassPermissions' ? '（默认）' : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingsRow>
          <SettingsRow
            label="工作模式"
            description={`${WORK_MODE_UI[workMode].desc}。输入框左下角也能切换`}
          >
            <Select value={workMode} onValueChange={(v) => {
              const next = v as AgentWorkMode
              const apply = (): void => {
                const patch = workModePatch(next, modeSettingsRef.current)
                save(patch, () => { modeSettingsRef.current = { ...modeSettingsRef.current, ...patch }; setWorkMode(next); if (patch.agentMode) setRuntimeMode(patch.agentMode) })
              }
              // Pro 模式：没激活就弹激活码窗，激活成功后再切换
              if (WORK_MODE_UI[next].pro) { void ensureProFeature('deepseek-mode', apply).then((ok) => { if (ok) apply() }); return }
              apply()
            }}>
              <SelectTrigger className="w-[160px] h-8 text-[13px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {WORK_MODE_ORDER.map((m) => (
                  <SelectItem key={m} value={m}>{WORK_MODE_UI[m].label}{m === 'standard' ? '（推荐）' : ''}{WORK_MODE_UI[m].pro ? ' · Pro' : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingsRow>
          <SettingsRow
            label="运行方式"
            description={RUNTIME_MODE_UI[runtimeMode].desc}
          >
            <Select value={runtimeMode} onValueChange={(v) => {
              const next: AgentRuntimeMode = v === 'enterprise' ? 'enterprise' : 'fast'
              save({ agentMode: next }, () => { modeSettingsRef.current = { ...modeSettingsRef.current, agentMode: next }; setRuntimeMode(next) })
            }}>
              <SelectTrigger className="w-[160px] h-8 text-[13px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="fast">{RUNTIME_MODE_UI.fast.label}（推荐）</SelectItem>
                <SelectItem value="enterprise">{RUNTIME_MODE_UI.enterprise.label}</SelectItem>
              </SelectContent>
            </Select>
          </SettingsRow>
          <WorkBehaviorSettings />
          <DataDirSetting />
          {error && <p role="alert" className="px-4 pb-3 text-xs text-destructive">{error}</p>}
        </SettingsCard>
      </SettingsSection>
      <CliPathSection />
    </div>
  )
}
