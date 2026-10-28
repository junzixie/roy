/**
 * 用量卡片
 *
 * 展示累计 token、今日/近 7 天/近 30 天活动，以及本机账号的重置入口。
 * 数据来自主进程扫描 ~/.roy/agent-sessions 的只读统计。
 */

import * as React from 'react'
import { Activity, Coins, Loader2, LogOut, RefreshCw, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { SettingsCard, SettingsRow, SettingsSection } from './primitives'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface Bucket {
  sessions: number
  messages: number
  inputTokens: number
  outputTokens: number
}

interface UsageSummary {
  total: Bucket
  today: Bucket
  last7Days: Bucket
  last30Days: Bucket
  scannedSessions: number
  truncated: boolean
}

const EMPTY: Bucket = { sessions: 0, messages: 0, inputTokens: 0, outputTokens: 0 }
const EMPTY_SUMMARY: UsageSummary = {
  total: EMPTY,
  today: EMPTY,
  last7Days: EMPTY,
  last30Days: EMPTY,
  scannedSessions: 0,
  truncated: false,
}

/** 把 token 数换成易读单位：1234 -> 1.2k，1234567 -> 1.23M */
function formatTokens(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0'
  if (value < 1000) return String(Math.round(value))
  if (value < 1_000_000) return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}k`
  return `${(value / 1_000_000).toFixed(2)}M`
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }): React.ReactElement {
  return (
    <div className="min-w-0 flex-1">
      <div className="text-[11.5px] text-foreground/40">{label}</div>
      <div className="mt-0.5 truncate text-[17px] font-semibold tabular-nums text-foreground">{value}</div>
      {hint && <div className="mt-0.5 truncate text-[11px] text-foreground/35">{hint}</div>}
    </div>
  )
}

export function UsageSection({ userName }: { userName: string }): React.ReactElement {
  const [summary, setSummary] = React.useState<UsageSummary | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [resetOpen, setResetOpen] = React.useState(false)
  const [resetting, setResetting] = React.useState(false)

  const load = React.useCallback(() => {
    setLoading(true)
    window.electronAPI
      .getUsageSummary()
      .then((value) => setSummary(value as UsageSummary))
      .catch((error: unknown) => {
        console.error('[用量] 读取失败:', error)
        setSummary(EMPTY_SUMMARY)
      })
      .finally(() => setLoading(false))
  }, [])

  React.useEffect(() => { load() }, [load])

  const data = summary ?? EMPTY_SUMMARY
  const totalTokens = data.total.inputTokens + data.total.outputTokens

  const handleReset = React.useCallback(async () => {
    setResetting(true)
    try {
      await window.electronAPI.updateUserProfile({
        userName: '用户',
        avatar: '🙂',
      })
      toast.success('已重置本机档案')
      setResetOpen(false)
      // 档案变化在设置页内部靠重新挂载生效，这里直接刷新窗口最稳妥
      window.location.reload()
    } catch (error) {
      console.error('[账号] 重置失败:', error)
      toast.error('重置失败，请重试')
    } finally {
      setResetting(false)
    }
  }, [])

  return (
    <SettingsSection
      title="用量与余额"
      description="统计本机所有会话的 token 消耗，数据只存在本地"
    >
      <SettingsCard>
        <div className="flex flex-wrap items-start gap-4 px-4 py-4">
          <div className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-xl bg-foreground/[0.05] text-foreground/60">
              <Coins size={16} />
            </span>
          </div>
          <Metric
            label="累计 token"
            value={formatTokens(totalTokens)}
            hint={`输入 ${formatTokens(data.total.inputTokens)} · 输出 ${formatTokens(data.total.outputTokens)}`}
          />
          <Metric label="今日" value={formatTokens(data.today.inputTokens + data.today.outputTokens)} hint={`${data.today.sessions} 个会话`} />
          <Metric label="近 7 天" value={formatTokens(data.last7Days.inputTokens + data.last7Days.outputTokens)} hint={`${data.last7Days.sessions} 个会话 · ${data.last7Days.messages} 条消息`} />
          <Metric label="近 30 天" value={formatTokens(data.last30Days.inputTokens + data.last30Days.outputTokens)} hint={`${data.last30Days.sessions} 个会话`} />
          <button
            type="button"
            onClick={load}
            disabled={loading}
            title="重新统计"
            className="mt-1 grid size-8 place-items-center rounded-lg text-foreground/45 hover:bg-foreground/[0.06] hover:text-foreground disabled:opacity-50"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          </button>
        </div>

        <SettingsRow label="统计范围" description="扫描 ~/.roy/agent-sessions 下的会话文件，超过 24MB 的会话只统计最近部分">
          <span className="text-[12.5px] text-foreground/45">
            {loading ? '统计中…' : `${data.scannedSessions} 个会话${data.truncated ? '（部分截断）' : ''}`}
          </span>
        </SettingsRow>

        <SettingsRow label="余额" description="Roy 不依赖云端账户，余额取决于你在「模型配置」里填的渠道">
          <span className="flex items-center gap-1.5 text-[12.5px] text-foreground/45">
            <Zap size={13} /> 按渠道计费
          </span>
        </SettingsRow>

        <SettingsRow label="当前账号" description="本机档案，仅用于界面显示与提示词称呼">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-[13px] text-foreground/70">
              <Activity size={13} className="text-emerald-500" /> {userName}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setResetOpen(true)}
              className="h-7 gap-1.5 px-2.5 text-[12px]"
            >
              <LogOut size={12} />
              退出登录
            </Button>
          </div>
        </SettingsRow>
      </SettingsCard>

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="max-w-[420px]">
          <DialogHeader>
            <DialogTitle>退出登录</DialogTitle>
            <DialogDescription>
              Roy 是本地应用，没有云端账户。退出会把本机档案（用户名、头像）重置为默认值，会话、项目与技能都不受影响。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetOpen(false)} disabled={resetting}>
              取消
            </Button>
            <Button onClick={() => void handleReset()} disabled={resetting}>
              {resetting ? '重置中…' : '确认退出'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsSection>
  )
}
