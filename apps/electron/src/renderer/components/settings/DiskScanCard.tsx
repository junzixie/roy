/**
 * DiskScanCard — 磁盘可清理项扫描
 *
 * 只读扫描系统各处的可清理内容并给出建议，不删除任何文件。
 * 用户可查看每项的影响说明和风险等级，自行决定是否处理。
 */

import * as React from 'react'
import {
  ScanSearch,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  HardDrive,
} from 'lucide-react'
import {
  SettingsSection,
  SettingsCard,
} from './primitives'
import { Button } from '../ui/button'
import { cn } from '@/lib/utils'
import { formatBytes as __sharedFormatBytes } from '@roy/shared'

type ScanRisk = 'safe' | 'caution' | 'danger'

interface ScanItem {
  id: string
  category: string
  label: string
  description: string
  path?: string
  bytes: number
  fileCount: number
  risk: ScanRisk
  warning?: string
  deletable: boolean
}

interface ScanGroup {
  category: string
  label: string
  description: string
  items: ScanItem[]
  bytes: number
  fileCount: number
}

interface ScanResult {
  groups: ScanGroup[]
  totalBytes: number
  totalFileCount: number
  scannedAt: number
  errors: string[]
  durationMs: number
}

const RISK_META: Record<ScanRisk, { label: string; className: string; Icon: typeof ShieldCheck }> = {
  safe: {
    label: '可以清理',
    className: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400',
    Icon: ShieldCheck,
  },
  caution: {
    label: '需要确认',
    className: 'bg-amber-500/12 text-amber-700 dark:text-amber-400',
    Icon: AlertTriangle,
  },
  danger: {
    label: '不建议清理',
    className: 'bg-destructive/12 text-destructive',
    Icon: ShieldAlert,
  },
}

function RiskBadge({ risk }: { risk: ScanRisk }): React.ReactElement {
  const meta = RISK_META[risk]
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-px text-[10.5px]', meta.className)}>
      <meta.Icon size={10.5} />
      {meta.label}
    </span>
  )
}

function ScanItemRow({ item }: { item: ScanItem }): React.ReactElement {
  const isDrive = item.category === 'drives'
  return (
    <div className="rounded-md px-2 py-1.5 hover:bg-foreground/[0.03]">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[12.5px] text-foreground/80" title={item.description}>
          {item.label}
        </span>
        {!isDrive && item.fileCount > 0 && (
          <span className="shrink-0 text-[11.5px] text-foreground/35 tabular-nums">
            {item.fileCount.toLocaleString()} 个文件
          </span>
        )}
        <RiskBadge risk={item.risk} />
        {!isDrive && (
          <span className="w-16 shrink-0 text-right text-[12px] text-foreground/60 tabular-nums">
            {__sharedFormatBytes(item.bytes)}
          </span>
        )}
      </div>
      <div className="mt-0.5 text-[11.5px] leading-relaxed text-foreground/40">{item.description}</div>
      {item.warning && (
        <div className="mt-0.5 text-[11.5px] leading-relaxed text-amber-700/80 dark:text-amber-400/80">
          {item.warning}
        </div>
      )}
      {item.path && (
        <div
          className="mt-0.5 truncate font-mono text-[11px] text-foreground/25 select-text"
          title="选中后可复制路径"
        >
          {item.path}
        </div>
      )}
    </div>
  )
}

function GroupBlock({ group }: { group: ScanGroup }): React.ReactElement {
  const [open, setOpen] = React.useState(true)
  const isDrive = group.category === 'drives'
  return (
    <div className="border-t border-border/40 first:border-t-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-foreground/[0.02]"
      >
        {open ? <ChevronDown size={13} className="shrink-0 text-foreground/35" /> : <ChevronRight size={13} className="shrink-0 text-foreground/35" />}
        <span className="text-[12.5px] font-medium text-foreground/75">{group.label}</span>
        <span className="min-w-0 flex-1 truncate text-[11.5px] text-foreground/35">{group.description}</span>
        {!isDrive && (
          <span className="shrink-0 text-[12px] text-foreground/55 tabular-nums">{__sharedFormatBytes(group.bytes)}</span>
        )}
      </button>
      {open && (
        <div className="pb-1.5 pl-3 pr-3">
          {group.items.map((item) => <ScanItemRow key={item.id} item={item} />)}
        </div>
      )}
    </div>
  )
}

export function DiskScanCard(): React.ReactElement {
  const [result, setResult] = React.useState<ScanResult | null>(null)
  const [scanning, setScanning] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const runScan = React.useCallback(async (): Promise<void> => {
    setScanning(true)
    setError(null)
    try {
      const res = await window.electronAPI.scanCleanableStorage() as ScanResult
      setResult(res)
    } catch (e) {
      console.error('[磁盘扫描] 扫描失败:', e)
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setScanning(false)
    }
  }, [])

  return (
    <SettingsSection
      title="可清理内容"
      description={
        result
          ? `上次扫描 ${new Date(result.scannedAt).toLocaleString('zh-CN')}，耗时 ${(result.durationMs / 1000).toFixed(1)} 秒`
          : '扫描系统各处的临时文件、缓存和旧安装包，给出清理建议'
      }
      action={
        <Button
          variant="ghost"
          size="sm"
          onClick={runScan}
          disabled={scanning}
          className="gap-1.5"
        >
          <ScanSearch size={14} className={cn(scanning && 'animate-pulse')} />
          {scanning ? '扫描中…' : result ? '重新扫描' : '开始扫描'}
        </Button>
      }
    >
      <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
        扫描结果仅供参考，本页不会删除任何文件。请按风险提示自行判断，删除前建议确认文件确实不再需要。
      </p>

      {error && (
        <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/[0.06] px-3 py-2 text-[12.5px] text-destructive">
          扫描失败：{error}
        </div>
      )}

      {!result && !scanning && !error && (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border/60 py-8 text-center">
          <HardDrive size={22} className="text-foreground/20" />
          <div className="text-[12.5px] text-muted-foreground">还没有扫描过</div>
          <div className="text-[11.5px] text-foreground/35">点击右上角「开始扫描」查看可以清理的内容</div>
        </div>
      )}

      {scanning && !result && (
        <div className="flex items-center justify-center gap-2 rounded-lg border border-border/50 py-8 text-[12.5px] text-muted-foreground">
          <ScanSearch size={14} className="animate-pulse" />
          正在扫描，目录较大时需要几秒…
        </div>
      )}

      {result && (
        <>
          <div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-lg border border-border/50 bg-muted/25 px-3.5 py-2.5">
            <span className="text-[13px] text-foreground/80">
              可清理约 <b className="tabular-nums">{__sharedFormatBytes(result.totalBytes)}</b>
            </span>
            <span className="text-[12px] text-muted-foreground tabular-nums">
              共 {result.totalFileCount.toLocaleString()} 个文件
            </span>
            <span className="text-[12px] text-foreground/35">
              {result.groups.filter((g) => g.category !== 'drives').length} 个类别
            </span>
          </div>

          {result.errors.length > 0 && (
            <div className="mb-2 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2 text-[11.5px] text-amber-700 dark:text-amber-400">
              {result.errors.map((err, i) => <div key={i}>{err}</div>)}
            </div>
          )}

          <SettingsCard>
            {result.groups.length === 0 ? (
              <div className="px-3 py-6 text-center text-[12.5px] text-muted-foreground">
                没有发现可清理的内容
              </div>
            ) : (
              result.groups.map((group) => <GroupBlock key={group.category} group={group} />)
            )}
          </SettingsCard>
        </>
      )}
    </SettingsSection>
  )
}
