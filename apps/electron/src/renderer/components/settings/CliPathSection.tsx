import * as React from 'react'
import { toast } from 'sonner'
import { SettingsSection, SettingsCard } from './primitives'
import { Switch } from '../ui/switch'

/** 命令行工具：把 roy 加进当前用户 PATH（对照 Arthur General.tsx CliSection） */
const CLI_EXAMPLES: Array<[string, string]> = [
  ['roy help', '看全部命令'],
  ['roy ask "整理这个文件夹"', '让 Roy 干一件事'],
  ['roy workflow list', '列出工作流'],
  ['roy cron list', '看定时任务'],
  ['roy todo add "给客户发邮件"', '加一条 Todo'],
]

export function CliPathSection(): React.ReactElement {
  const [st, setSt] = React.useState<{ bin: string; binaryExists: boolean; inPath: boolean; supported: boolean } | null>(null)
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    void window.electronAPI.cliPathStatus().then(setSt).catch(() => undefined)
  }, [])

  const set = async (on: boolean): Promise<void> => {
    setBusy(true)
    try {
      const next = await window.electronAPI.cliPathSet(on)
      setSt(next)
      toast.success(on ? '已加入：请新开一个终端窗口，再试 roy help' : '已从 PATH 里去掉')
      if (on && next && !next.binaryExists) {
        toast.message('PATH 已写入，但本机尚未找到 roy 可执行文件', {
          description: '打包安装版会带 resources/bin；开发态请先跑 build:cli 生成 roy.exe',
        })
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '修改 PATH 失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <SettingsSection
      title="命令行工具"
      description="在任意终端输入 roy，就能跑工作流、定时任务、Todo，或让 Roy 干一件事。新开终端后生效。"
    >
      <SettingsCard>
        <div className="flex items-start justify-between gap-4 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-[13px] font-medium text-foreground">
              <span>把 roy 加进 PATH</span>
              {st && (
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-normal ${
                    st.inPath
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {st.inPath ? '已加入' : '还没有'}
                </span>
              )}
            </div>
            <div className="mt-0.5 break-all text-xs text-muted-foreground">
              {st
                ? `只改当前用户 PATH，无需管理员。位置：${st.bin}${st.binaryExists ? '' : '（尚未找到可执行文件）'}`
                : '正在检查…'}
            </div>
          </div>
          {st?.supported !== false && (
            <Switch
              checked={!!st?.inPath}
              disabled={busy || !st}
              onCheckedChange={(checked) => { void set(checked) }}
            />
          )}
          {st?.supported === false && (
            <span className="shrink-0 text-xs text-muted-foreground">当前系统暂不支持一键写入</span>
          )}
        </div>
        <div className="px-4 pb-3 pt-1">
          <div className="overflow-hidden rounded-lg border border-border">
            {CLI_EXAMPLES.map(([cmd, desc]) => (
              <button
                key={cmd}
                type="button"
                title="点一下复制"
                onClick={() => {
                  void navigator.clipboard.writeText(cmd).then(
                    () => toast.success('已复制'),
                    () => toast.error('复制失败'),
                  )
                }}
                className="flex w-full items-center gap-3 border-b border-border px-3 py-1.5 text-left last:border-b-0 hover:bg-muted/45"
              >
                <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-foreground">{cmd}</code>
                <span className="shrink-0 text-[12px] text-muted-foreground">{desc}</span>
              </button>
            ))}
          </div>
          <div className="mt-1.5 text-[11.5px] text-muted-foreground">
            改完 PATH 后请新开终端再试 roy；多数命令还可用 --json 输出 JSON，方便写脚本。
          </div>
        </div>
      </SettingsCard>
    </SettingsSection>
  )
}

