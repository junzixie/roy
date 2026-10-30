/**
 * StorageSettings — 磁盘管理设置面板
 *
 * 展示各数据类别的磁盘占用，以及可安全自动清理的临时文件。
 */

import * as React from 'react'
import { Trash2, RefreshCw } from 'lucide-react'
import { formatBytes } from '@roy/shared'
import {
  SettingsSection,
  SettingsCard,
  SettingsRow,
  SettingsToggle,
} from './primitives'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select'
import { Button } from '../ui/button'
import { cn } from '@/lib/utils'
import { DiskScanCard } from './DiskScanCard'

interface StorageCategory {
  label: string
  key: string
  bytes: number
  count: number
  /** 按项目拆分的明细（只有项目与会话数据提供） */
  projects?: StorageProjectUsage[]
}

interface StorageProjectUsage {
  slug: string
  name: string
  workspaceId?: string
  bytes: number
  sessionCount: number
  orphanBytes: number
  orphanCount: number
}

interface StorageStats {
  categories: StorageCategory[]
  totalBytes: number
  calculatedAt: number
}

interface CleanupResult {
  freedBytes: number
  deletedCount: number
  errors: string[]
}

const BAR_COLORS = [
  'bg-blue-500',
  'bg-purple-500',
  'bg-amber-500',
  'bg-emerald-500',
  'bg-rose-500',
  'bg-cyan-500',
]

function StorageBar({ categories, totalBytes }: { categories: StorageCategory[]; totalBytes: number }): React.ReactElement {
  if (totalBytes === 0) {
    return <div className="h-3 w-full rounded-full bg-muted" />
  }
  return (
    <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
      {categories.map((cat, i) => {
        const pct = (cat.bytes / totalBytes) * 100
        if (pct < 0.5) return null
        return (
          <div
            key={cat.key}
            className={cn('h-full transition-all', BAR_COLORS[i % BAR_COLORS.length])}
            style={{ width: `${pct}%` }}
            title={`${cat.label}: ${formatBytes(cat.bytes)}`}
          />
        )
      })}
    </div>
  )
}

export function StorageSettings(): React.ReactElement {
  const [stats, setStats] = React.useState<StorageStats | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [cleaningKey, setCleaningKey] = React.useState<string | null>(null)
  const [pendingProject, setPendingProject] = React.useState<StorageProjectUsage | null>(null)
  const [deletingProject, setDeletingProject] = React.useState<string | null>(null)
  const [lastResult, setLastResult] = React.useState<CleanupResult | null>(null)
  const [autoCleanupTemp, setAutoCleanupTemp] = React.useState(true)
  const [autoCleanupDays, setAutoCleanupDays] = React.useState(0)
  const [statsError, setStatsError] = React.useState<string | null>(null)

  const loadStats = React.useCallback(async () => {
    setLoading(true)
    setStatsError(null)
    try {
      const result = await window.electronAPI.getStorageStats() as StorageStats
      setStats(result)
    } catch (e) {
      console.error('[存储管理] 获取统计失败:', e)
      setStatsError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    loadStats()
    window.electronAPI.getSettings().then((settings) => {
      setAutoCleanupTemp(settings.autoCleanupTempOnStart !== false)
      setAutoCleanupDays(settings.autoCleanupArchivedDays ?? 0)
    }).catch(console.error)
  }, [loadStats])

  const handleCleanTemp = async (): Promise<void> => {
    if (!window.confirm('仅清理 Roy 临时预览和安装缓存，不删除会话、项目文件或附件。确认清理？')) return
    setCleaningKey('temp-files')
    setLastResult(null)
    try {
      const result = await window.electronAPI.cleanupTempStorage() as CleanupResult
      setLastResult(result)
      await loadStats()
    } catch (e) {
      console.error('[存储管理] 清理临时文件失败:', e)
      setLastResult({ freedBytes: 0, deletedCount: 0, errors: [e instanceof Error ? e.message : String(e)] })
    } finally {
      setCleaningKey(null)
    }
  }

  const handleAutoCleanupTempChange = async (enabled: boolean): Promise<void> => {
    setAutoCleanupTemp(enabled)
    try {
      await window.electronAPI.updateSettings({ autoCleanupTempOnStart: enabled })
    } catch (e) {
      console.error('[存储管理] 更新自动清理设置失败:', e)
    }
  }

  const handleAutoCleanupDaysChange = async (value: string): Promise<void> => {
    const days = parseInt(value, 10)
    setAutoCleanupDays(days)
    try {
      await window.electronAPI.updateSettings({ autoCleanupArchivedDays: days })
    } catch (e) {
      console.error('[存储管理] 更新自动清理天数失败:', e)
    }
  }

  /** 删除项目：先弹确认，确认后调主进程移除索引并删目录 */
  const handleDeleteProject = React.useCallback(async (): Promise<void> => {
    const target = pendingProject
    if (!target?.workspaceId) return
    setDeletingProject(target.slug)
    try {
      await window.electronAPI.deleteAgentWorkspace(target.workspaceId)
      setPendingProject(null)
      await loadStats()
    } catch (error) {
      const message = String(error instanceof Error ? error.message : error)
        .replace(/^Error invoking remote method[^:]*:\s*(Error:\s*)?/, '')
      window.alert(`删除失败：${message}`)
    } finally {
      setDeletingProject(null)
    }
  }, [pendingProject, loadStats])

  return (
    <div className="space-y-6">
      {pendingProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[2px]" onMouseDown={(e) => { if (e.target === e.currentTarget && !deletingProject) setPendingProject(null) }}>
          <div className="w-[380px] space-y-3 rounded-2xl border border-border bg-background p-5 shadow-xl">
            <div className="text-sm font-medium text-foreground">删除项目「{pendingProject.name}」？</div>
            <div className="space-y-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
              <p>会把项目从列表里移除，并删除它下面的 <b className="text-foreground">{pendingProject.sessionCount} 个会话</b>目录，释放约 {formatBytes(pendingProject.bytes)}。</p>
              <p className="text-destructive">删除后不可恢复。</p>
              <p>默认项目和最后一个项目不能删。</p>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" disabled={!!deletingProject} onClick={() => setPendingProject(null)} className="h-8 rounded-md border border-border px-3 text-[12.5px] hover:bg-foreground/[0.04] disabled:opacity-50">取消</button>
              <button type="button" disabled={!!deletingProject} onClick={() => { void handleDeleteProject() }} className="h-8 rounded-md bg-destructive px-3 text-[12.5px] text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50">{deletingProject ? '删除中…' : '确认删除'}</button>
            </div>
          </div>
        </div>
      )}
      {/* 存储用量 */}
      <SettingsSection
        title="存储用量"
        description={stats ? `已统计 ${formatBytes(stats.totalBytes)}（非整盘占用）` : '正在计算...'}
        action={
          <Button
            variant="ghost"
            size="sm"
            onClick={loadStats}
            disabled={loading}
            className="gap-1.5"
          >
            <RefreshCw size={14} className={cn(loading && 'animate-spin')} />
            刷新
          </Button>
        }
      >
        <p className="mb-3 text-xs text-muted-foreground">统计应用数据及项目文件；跳过依赖、构建、版本库等大目录，每个目录最多扫描十万个文件，无法访问的文件不计入。仅临时预览和安装缓存可在这里清理。</p>
        {statsError ? (
          <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/[0.06] px-3 py-2 text-[12.5px] text-destructive">
            读取磁盘用量失败：{statsError}
          </div>
        ) : stats ? (
          <div className="mb-4">
            <StorageBar categories={stats.categories} totalBytes={stats.totalBytes} />
            <div className="mt-1.5 flex items-center justify-between text-[12px] text-muted-foreground">
              <span>{stats.categories.length} 个类别</span>
              <span className="tabular-nums">共 {formatBytes(stats.totalBytes)}</span>
            </div>
          </div>
        ) : loading ? (
          <div className="mb-4 flex items-center gap-2 text-[12.5px] text-muted-foreground">
            <RefreshCw size={13} className="animate-spin" /> 正在统计磁盘用量…
          </div>
        ) : null}
        <SettingsCard>
          {stats?.categories.map((cat, i) => (
            <React.Fragment key={cat.key}>
              <SettingsRow label={cat.label}>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn('inline-block h-2.5 w-2.5 rounded-full', BAR_COLORS[i % BAR_COLORS.length])}
                    />
                    <span className="text-sm text-muted-foreground tabular-nums">
                      {formatBytes(cat.bytes)}
                    </span>
                  </div>
                  {cat.key === 'temp-files' ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCleanTemp}
                      disabled={cleaningKey !== null || cat.bytes === 0}
                      className="h-7 gap-1 text-xs"
                    >
                      <Trash2 size={12} />
                      {cleaningKey === 'temp-files' ? '清理中...' : '清理'}
                    </Button>
                  ) : null}
                </div>
              </SettingsRow>
              {cat.key === 'workspaces' && cat.projects && cat.projects.length > 0 && (
                <div className="border-t border-border/40 bg-foreground/[0.015] px-4 py-2">
                  <div className="mb-1.5 text-[11.5px] text-foreground/45">
                    按项目看占用（共 {cat.projects.length} 个，大的排前面）
                  </div>
                  <div className="max-h-[420px] space-y-0.5 overflow-y-auto">
                    {cat.projects.map((project) => (
                      <div key={project.slug} className="group flex items-center gap-2 rounded-md px-2 py-1 text-[12.5px] hover:bg-foreground/[0.03]">
                        <span className="min-w-0 flex-1 truncate text-foreground/75" title={project.slug}>{project.name}</span>
                        <span className="shrink-0 text-foreground/40 tabular-nums">{project.sessionCount} 个会话</span>
                        {project.orphanCount > 0 && (
                          <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-px text-[10.5px] text-amber-700 dark:text-amber-400">
                            可清 {formatBytes(project.orphanBytes)}
                          </span>
                        )}
                        <span className="w-16 shrink-0 text-right text-foreground/60 tabular-nums">{formatBytes(project.bytes)}</span>
                        <button
                          type="button"
                          title={project.workspaceId ? `删除项目「${project.name}」` : '这个目录已不在项目索引里，请在文件夹里删除'}
                          disabled={!project.workspaceId || deletingProject === project.slug}
                          onClick={() => setPendingProject(project)}
                          className="shrink-0 rounded p-0.5 text-foreground/30 opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive disabled:opacity-20 group-hover:opacity-100"
                        >
                          <Trash2 size={12.5} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </React.Fragment>
          ))}
        </SettingsCard>
      </SettingsSection>

      {/* 自动清理 */}
      <SettingsSection
        title="自动清理"
        description="配置启动时和定期的自动清理规则"
      >
        <SettingsCard>
          <SettingsToggle
            label="启动时清理临时文件"
            description="每次启动时自动删除预览和安装缓存"
            checked={autoCleanupTemp}
            onCheckedChange={handleAutoCleanupTempChange}
          />
          <SettingsRow label="清理已归档会话数据" description="自动清理超过指定天数的已归档会话消息和 SDK 数据">
            <Select value={String(autoCleanupDays)} onValueChange={handleAutoCleanupDaysChange}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">禁用</SelectItem>
                <SelectItem value="7">7 天</SelectItem>
                <SelectItem value="30">30 天</SelectItem>
                <SelectItem value="90">90 天</SelectItem>
              </SelectContent>
            </Select>
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>

      {/* 可清理内容扫描（只读建议） */}
      <DiskScanCard />

      {/* 操作结果提示 */}
      {lastResult && (
        <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm">
          {lastResult.freedBytes > 0 ? (
            <span className="text-emerald-600 dark:text-emerald-400">
              已释放 {formatBytes(lastResult.freedBytes)}，删除 {lastResult.deletedCount} 个文件
            </span>
          ) : (
            <span className="text-muted-foreground">没有需要清理的数据</span>
          )}
          {lastResult.errors.length > 0 && (
            <div className="mt-1 text-xs text-destructive">
              {lastResult.errors.map((err, i) => <div key={i}>{err}</div>)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
