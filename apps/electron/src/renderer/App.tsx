import * as React from 'react'
import { useAtom } from 'jotai'
import { AppShell } from './components/app-shell/AppShell'
import { EnvironmentCheckDialog } from './components/environment/EnvironmentCheckDialog'
import { TooltipProvider } from './components/ui/tooltip'
import { ShortcutGuideDialog } from './components/shortcuts/ShortcutGuideDialog'
import { FaqDialog } from './components/shortcuts/FaqDialog'
import { PlanningReminderRail } from './components/planning/PlanningReminderRail'
import { environmentCheckDialogOpenAtom } from './atoms/environment'
import { CloseWindowDialog } from './components/app-shell/CloseWindowDialog'

export default function App(): React.ReactElement {
  const [isLoading, setIsLoading] = React.useState(true)

  // 初始化：只判断加载完成。新手引导已移除，不再检查 onboarding 完成状态。
  React.useEffect(() => {
    const initialize = async () => {
      try {
        await window.electronAPI.getSettings()
      } catch (error) {
        console.error('[App] 初始化失败:', error)
      } finally {
        setIsLoading(false)
      }
    }

    initialize()
  }, [])

  // 加载中状态：不渲染任何启动画面。
  // 原生启动页会一直盖着，直到下面通知它退场，所以这里保持透明即可。
  if (isLoading) {
    return <div className="h-screen w-screen bg-transparent" aria-busy="true" />
  }

  // 直接进入主界面（新手引导已移除）
  return (
    <MainWindowContent />
  )
}

/**
 * 主界面内容。
 *
 * 单独抽出来是为了在“已挂载且完成一帧绘制”之后才通知主进程收起启动页：
 * 若在首次 render 时就通知，启动页可能比真实内容更早消失，又露出空白。
 */
function MainWindowContent(): React.ReactElement {
  React.useEffect(() => {
    // 等两帧：第一帧完成布局，第二帧确保已合成到屏幕上
    let secondFrame = 0
    const id = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        void window.electronAPI.notifyRendererReady?.().catch(() => { /* 主进程已关闭时忽略 */ })
      })
    })
    return () => { cancelAnimationFrame(id); cancelAnimationFrame(secondFrame) }
  }, [])

  return (
    <TooltipProvider delayDuration={200} disableHoverableContent>
      <AppShell />
      <PlanningReminderRail />
      <ShortcutGuideDialog />
      <FaqDialog />
      <GlobalEnvironmentCheckDialog />
      <CloseWindowDialog />
    </TooltipProvider>
  )
}

/**
 * 全局环境检测 Dialog，由错误卡片的 recovery action 按钮打开。
 */
function GlobalEnvironmentCheckDialog(): React.ReactElement {
  const [open, setOpen] = useAtom(environmentCheckDialogOpenAtom)
  return <EnvironmentCheckDialog open={open} onOpenChange={setOpen} />
}
