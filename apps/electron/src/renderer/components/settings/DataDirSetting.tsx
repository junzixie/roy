/**
 * 数据文件夹：项目（Agent 工作区）默认放在哪
 *
 * 默认在 C 盘用户目录下的 .roy/agent-workspaces，可以改到别的盘。
 * 改的时候已有项目可以一起搬过去；改完要重启才生效。
 */

import * as React from 'react'
import { FolderOpen } from 'lucide-react'
import { toast } from 'sonner'
import { SettingsRow } from './primitives'
import { cn } from '@/lib/utils'

interface DataDirInfo {
  current: string
  defaultDir: string
  saved: string
  projectCount: number
}

const btnClass =
  'inline-flex h-8 items-center gap-1.5 rounded-md border border-border/70 px-2.5 text-[12.5px] text-foreground/75 transition-colors hover:bg-foreground/[0.05] hover:text-foreground disabled:opacity-50'

export function DataDirSetting(): React.ReactElement {
  const [info, setInfo] = React.useState<DataDirInfo | null>(null)
  const [pending, setPending] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  const load = React.useCallback(() => {
    window.electronAPI.getDataDirInfo().then(setInfo).catch(console.error)
  }, [])

  React.useEffect(load, [load])

  const needsRestart = !!info && info.saved !== info.current
  const isDefault = !!info && info.saved === info.defaultDir

  const apply = async (target: string, move: boolean): Promise<void> => {
    setBusy(true)
    try {
      const result = await window.electronAPI.changeDataDir(target, move)
      setPending(null)
      load()
      if (result.needsRestart) {
        toast.success(move && result.moved ? `已搬过去 ${result.moved} 个项目，重启后生效` : '已保存，重启后生效', {
          action: { label: '立即重启', onClick: () => { void window.electronAPI.relaunchApp() } },
          duration: 10_000,
        })
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : '修改失败')
    } finally {
      setBusy(false)
    }
  }

  const pick = async (): Promise<void> => {
    const dir = await window.electronAPI.pickDataDir()
    if (!dir || !info) return
    if (dir === info.current) return
    // 当前位置没有项目，直接改；有项目先问要不要一起搬
    if (info.projectCount === 0) await apply(dir, false)
    else setPending(dir)
  }

  return (
    <SettingsRow
      label="数据文件夹"
      description={
        needsRestart
          ? '已改好，重启 Roy 后新建的项目会放到新位置'
          : '新建的项目默认放在这里。C 盘空间紧张时可以换到别的盘'
      }
    >
      <div className="flex max-w-[420px] flex-col items-end gap-2">
        <div className="flex items-center gap-1.5">
          <span
            className="max-w-[230px] truncate rounded-md bg-foreground/[0.04] px-2 py-1 font-mono text-[11.5px] text-foreground/60"
            title={info?.saved}
          >
            {info ? info.saved : '读取中…'}
          </span>
          <button type="button" className={btnClass} disabled={busy} onClick={() => { void pick() }}>
            <FolderOpen className="size-3.5" />
            更改
          </button>
          <button
            type="button"
            className={cn(btnClass, 'px-2')}
            title="在资源管理器里打开"
            onClick={() => { void window.electronAPI.openDataDir() }}
          >
            打开
          </button>
        </div>
        {!isDefault && info && !pending && (
          <button
            type="button"
            className="text-[11.5px] text-foreground/40 hover:text-foreground/70"
            disabled={busy}
            onClick={() => { setPending('') }}
          >
            恢复默认位置
          </button>
        )}
        {needsRestart && (
          <button
            type="button"
            className="text-[11.5px] text-primary hover:underline"
            onClick={() => { void window.electronAPI.relaunchApp() }}
          >
            立即重启
          </button>
        )}
        {pending !== null && info && (
          <div className="w-full rounded-lg border border-border/70 bg-foreground/[0.02] p-2.5 text-[12px] text-foreground/70">
            <div className="mb-2">
              当前位置有 {info.projectCount} 个项目，要一起搬到
              <span className="mx-1 break-all font-mono text-[11.5px] text-foreground">{pending || info.defaultDir}</span>
              吗？
            </div>
            <div className="flex flex-wrap justify-end gap-1.5">
              <button type="button" className={btnClass} disabled={busy} onClick={() => setPending(null)}>取消</button>
              <button type="button" className={btnClass} disabled={busy} onClick={() => { void apply(pending, false) }}>
                只改位置（旧项目找不到了）
              </button>
              <button
                type="button"
                className={cn(btnClass, 'border-primary/50 bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground')}
                disabled={busy}
                onClick={() => { void apply(pending, true) }}
              >
                {busy ? '正在搬…' : '一起搬过去'}
              </button>
            </div>
          </div>
        )}
      </div>
    </SettingsRow>
  )
}
