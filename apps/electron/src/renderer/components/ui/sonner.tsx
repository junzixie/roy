import { useAtomValue } from "jotai"
import { Toaster as Sonner } from "sonner"
import { resolvedThemeAtom } from "@/atoms/theme"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ style, ...props }: ToasterProps) => {
  const theme = useAtomValue(resolvedThemeAtom)

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      position="top-right"
      offset={{ top: 58, right: 12 }}
      className="toaster group"
      toastOptions={{
        className: 'pointer-events-auto',
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
      // sonner 默认 z-index: 999999999，会盖住 z-[100] 的弹窗；
      // 截图里「已添加到剪贴板」正好挡住「删除项目」按钮，点击落到提示上就传不到按钮。
      // 降到 90（低于 dialog/alert-dialog 的 z-[100]），弹窗始终在最上层。
      // pointerEvents: 容器不拦截点击（固定定位的空白区域也会抽走事件），只有 toast 本体可点（见 toastOptions.className）。
      style={{ zIndex: 90, pointerEvents: 'none', ...style }}
    />
  )
}

export { Toaster }
