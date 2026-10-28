/**
 * SettingsPanel - 设置面板
 *
 * 在应用主工作区中展示左侧导航和右侧 ScrollArea 内容区域。
 * 使用 Jotai atom 管理当前标签页状态，保持已有设置项与分组顺序。
 */

import * as React from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { cn } from "@/lib/utils";
import { detectIsWindows } from "@/lib/platform";
import { getWindowTitlebarDragInsetStyle } from "@/lib/window-titlebar-layout";
import {
  Settings,
  Radio,
  Eye,
  Palette,
  Globe,
  BookOpen,
  Bot,
  ArrowLeft,
  Keyboard,
  Mic,
  HardDriveDownload,
  HardDrive,
  Brain,
  ShieldCheck,
  RefreshCw,
  MousePointerClick,
  Coins,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ShortcutKeycaps } from "@/components/shortcuts/ShortcutKeycaps";
import {
  settingsTabAtom,
  channelFormDirtyAtom,
  settingsCloseRequestedAtom,
  settingsOpenAtom,
  settingsPendingSessionNavigationAtom,
  type SettingsSessionNavigation,
} from "@/atoms/settings-tab";
import type { SettingsTab } from "@/atoms/settings-tab";
import { activeViewAtom } from "@/atoms/active-view";
import { automationFormAtom } from "@/atoms/automation-atoms";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
const ChannelSettings = React.lazy(() => import("./ChannelSettings").then(m => ({ default: m.ChannelSettings })));
const VisionRelaySettings = React.lazy(() => import("./VisionRelaySettings").then(m => ({ default: m.VisionRelaySettings })));
const GeneralSettings = React.lazy(() => import("./GeneralSettings").then(m => ({ default: m.GeneralSettings })));
const ProxySettings = React.lazy(() => import("./ProxySettings").then(m => ({ default: m.ProxySettings })));
const AppearanceSettings = React.lazy(() => import("./AppearanceSettings").then(m => ({ default: m.AppearanceSettings })));
const PromptSettings = React.lazy(() => import("./PromptSettings").then(m => ({ default: m.PromptSettings })));
const BotHubSettings = React.lazy(() => import("./BotHubSettings").then(m => ({ default: m.BotHubSettings })));
const ShortcutSettings = React.lazy(() => import("./ShortcutSettings").then(m => ({ default: m.ShortcutSettings })));
const VoiceInputSettings = React.lazy(() => import("./VoiceInputSettings").then(m => ({ default: m.VoiceInputSettings })));
const MigrationSettings = React.lazy(() => import("./MigrationSettings").then(m => ({ default: m.MigrationSettings })));
const StorageSettings = React.lazy(() => import("./StorageSettings").then(m => ({ default: m.StorageSettings })));
const PermissionSettings = React.lazy(() => import("./PermissionSettings").then(m => ({ default: m.PermissionSettings })));
const ComputerSettings = React.lazy(() => import("./ComputerSettings").then(m => ({ default: m.ComputerSettings })));
const AboutSettings = React.lazy(() => import("./AboutSettings").then(m => ({ default: m.AboutSettings })));
const MemorySettings = React.lazy(() => import("./MemorySettings").then(m => ({ default: m.MemorySettings })));
const PointsSettings = React.lazy(() => import("./PointsSettings").then(m => ({ default: m.PointsSettings })));
import { useOpenSession } from '@/hooks/useOpenSession'

/** 设置 Tab 定义 */
interface TabItem {
  id: SettingsTab;
  label: string;
  icon: React.ReactNode;
  /** Pro 专享：导航里标「Pro」 */
  pro?: boolean;
}

interface SettingsGroup {
  title: string;
  tabs: TabItem[];
}

/** 第一大类：基础设置 */
const BASE_SETTINGS_GROUP: SettingsGroup = {
  title: "基础设置",
  tabs: [
    { id: "general", label: "通用", icon: <Settings size={16} /> },
    { id: "channels", label: "模型配置", icon: <Radio size={16} /> },
    { id: "points", label: "Roy 点数", icon: <Coins size={16} /> },
    { id: "appearance", label: "外观", icon: <Palette size={16} /> },
    { id: "permissions", label: "权限设置", icon: <ShieldCheck size={16} /> },
    { id: "voice-input", label: "语音输入", icon: <Mic size={16} /> },
  ]
};

/** 第二大类：AI 配置 */
const AI_SETTINGS_GROUP: SettingsGroup = {
  title: "AI 配置",
  tabs: [
    { id: "prompts", label: "内置提示词", icon: <BookOpen size={16} /> },
    { id: "bots", label: "远程连接", icon: <Bot size={16} /> },
    { id: "computer", label: "电脑控制", icon: <MousePointerClick size={16} />, pro: true },
    // 视觉助手已并入「模型配置」；这个位置改为项目记忆（与左侧栏的项目记忆同一份）
    { id: "memory", label: "项目记忆", icon: <Brain size={16} /> },
  ]
};

/** 第三大类：系统设置 */
const SYSTEM_SETTINGS_GROUP: SettingsGroup = {
  title: "系统设置",
  tabs: [
    { id: "proxy", label: "代理设置", icon: <Globe size={16} /> },
    { id: "shortcuts", label: "快捷键管理", icon: <Keyboard size={16} /> },
    { id: "migration", label: "数据迁移", icon: <HardDriveDownload size={16} /> },
    { id: "storage", label: "磁盘管理", icon: <HardDrive size={16} /> },
    // 账号、用户档案已移到「通用」最上面；这里改成软件更新（版本、检查更新、更新记录）
    { id: "about", label: "软件更新", icon: <RefreshCw size={16} /> },
  ]
};

const SETTINGS_GROUPS: SettingsGroup[] = [
  BASE_SETTINGS_GROUP,
  AI_SETTINGS_GROUP,
  SYSTEM_SETTINGS_GROUP,
];

/** 根据标签页 id 渲染对应内容 */
function renderTabContent(tab: SettingsTab): React.ReactElement {
  switch (tab) {
    case "general":
      return <GeneralSettings />;
    case "account":
      // 账号已并入「通用」（旧入口、激活码弹窗等跳转仍落到这里）
      return <GeneralSettings />;
    case "about":
      return <AboutSettings />;
    case "permissions":
      return <PermissionSettings />;
    case "computer":
      return <ComputerSettings />;
    case "channels":
      return <ChannelSettings />;
    case "points":
      return <PointsSettings />;
    case "vision-relay":
      return <VisionRelaySettings />;
    case "memory":
      return <MemorySettings />;
    case "prompts":
      return <PromptSettings />;
    case "proxy":
      return <ProxySettings />;
    case "appearance":
      return <AppearanceSettings />;
    case "bots":
      return <BotHubSettings />;
    case "shortcuts":
      return <ShortcutSettings />;
    case "voice-input":
      return <VoiceInputSettings />;
    case "migration":
      return <MigrationSettings />;
    case "storage":
      return <StorageSettings />;
    default:
      return <GeneralSettings />;
  }
}

interface SettingsPanelProps {
  onClose?: () => void;
}

export function SettingsPanel({
  onClose,
}: SettingsPanelProps): React.ReactElement {
  const isWindows = React.useMemo(() => detectIsWindows(), [])
  const [activeTab, setActiveTab] = useAtom(settingsTabAtom);
  const channelFormDirty = useAtomValue(channelFormDirtyAtom);
  const [closeRequested, setCloseRequested] = useAtom(settingsCloseRequestedAtom);
  const [pendingSessionNavigation, setPendingSessionNavigation] = useAtom(settingsPendingSessionNavigationAtom);
  const setSettingsOpen = useSetAtom(settingsOpenAtom);
  const setActiveView = useSetAtom(activeViewAtom);
  const setAutomationForm = useSetAtom(automationFormAtom);
  const openSession = useOpenSession()
  /** 统一的退出拦截对话框状态 */
  type PendingAction =
    | { type: 'tab'; tabId: SettingsTab }
    | { type: 'close' }
    | { type: 'session'; navigation: SettingsSessionNavigation }
    | null
  const [pendingAction, setPendingAction] = React.useState<PendingAction>(null)
  const showNavDialog = pendingAction !== null

  /** 执行待处理的操作 */
  const executePendingAction = (): void => {
    if (!pendingAction) return
    if (pendingAction.type === 'tab') {
      setActiveTab(pendingAction.tabId)
    } else if (pendingAction.type === 'session') {
      openSession(
        pendingAction.navigation.type,
        pendingAction.navigation.sessionId,
        pendingAction.navigation.title,
        {
          bypassSettingsGuard: true,
          onOpened: pendingAction.navigation.onOpened,
        },
      )
    } else {
      onClose?.()
    }
    setPendingAction(null)
  }

  /** 取消待处理的操作 */
  const cancelPendingAction = (): void => {
    setPendingAction(null)
  }

  /** 切换标签页时检测是否有未保存内容 */
  const handleTabChange = (tabId: SettingsTab): void => {
    if (tabId === activeTab) return
    if (activeTab === 'channels' && channelFormDirty) {
      setPendingAction({ type: 'tab', tabId })
      return
    }
    setActiveTab(tabId)
  }

  /** 关闭设置面板时检测是否有未保存内容 */
  const handleClose = React.useCallback((): void => {
    if (activeTab === 'channels' && channelFormDirty) {
      setPendingAction({ type: 'close' })
      return
    }
    onClose?.()
  }, [activeTab, channelFormDirty, onClose])

  /** 按 ESC 退出设置面板：window 级监听确保焦点在设置面板内任何位置（含 body）都生效；
   *  Radix 弹层（Select 下拉/AlertDialog/Popover 等）处理 ESC 时会 preventDefault，
   *  此时交给弹层自行关闭，不退出设置。 */
  React.useEffect(() => {
    const handleWindowKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      if (e.defaultPrevented) return
      handleClose()
    }
    window.addEventListener('keydown', handleWindowKeyDown)
    return () => window.removeEventListener('keydown', handleWindowKeyDown)
  }, [handleClose])

  // 左侧会话点击在渠道表单有未保存内容时，由 useOpenSession 暂存目标并交给此处确认。
  React.useEffect(() => {
    if (!pendingSessionNavigation) return
    setPendingAction({ type: 'session', navigation: pendingSessionNavigation })
    setPendingSessionNavigation(null)
  }, [pendingSessionNavigation, setPendingSessionNavigation])

  // Cmd+W 等外部关闭请求：弹出确认对话框
  React.useEffect(() => {
    if (closeRequested && activeTab === 'channels') {
      setPendingAction({ type: 'close' })
      setCloseRequested(false)
    }
  }, [closeRequested, activeTab, setCloseRequested])

  // 壁纸「只在对话区」时，设置页里从导航右边开始铺（导航 278px，含 1px 分隔线）
  React.useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--roy-wp-left', '278px')
    return () => { root.style.removeProperty('--roy-wp-left') }
  }, [])

  // 通用设置导航；Agent Skills / MCP 独立在侧边栏能力中心管理。
  const tabs = React.useMemo(() => {
    return SETTINGS_GROUPS.flatMap(group => group.tabs);
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col bg-content-area text-foreground">
      <div className="relative flex h-[35px] flex-shrink-0">
        {/* 标题栏只在导航那一段有底色，右边透出壁纸（以前整条都是侧栏色，壁纸上方像一条白边） */}
        <div className="h-full w-[278px] flex-shrink-0 border-r border-border/80 bg-[hsl(var(--sidebar-surface))] dark:border-border/70" />
        {/* 和下面内容区用同一种底色，顶上不会多出一条颜色不同的带子 */}
        <div className="roy-settings-content h-full min-w-0 flex-1 bg-content-area" />
        <div
          aria-hidden="true"
          className="titlebar-drag-region pointer-events-none absolute inset-y-0 left-0"
          style={getWindowTitlebarDragInsetStyle(isWindows)}
        />
      </div>

      {/* 主体：左导航 + 右内容 */}
      <div className="flex flex-1 min-h-0">
        {/* 左侧 Tab 导航 */}
        <div className="flex h-full min-h-0 w-[278px] flex-shrink-0 flex-col border-r border-border/80 bg-[hsl(var(--sidebar-surface))] dark:border-border/70">
          <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 pt-5 scrollbar-thin">
            {SETTINGS_GROUPS.map((group, groupIndex) => (
              <div key={group.title}>
                {groupIndex > 0 && <div className="h-px bg-border/50 my-3 mx-2" />}
                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground/70">
                  {group.title}
                </div>
                {group.tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => handleTabChange(tab.id)}
                    className={cn(
                      // 占满整行：选中底色框和文字长短无关，各项左右对齐
                      "flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm transition-colors [&>svg]:shrink-0",
                      activeTab === tab.id
                        ? "bg-muted text-foreground font-medium"
                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                    )}
                  >
                    {tab.icon}
                    <span className="min-w-0 flex-1 truncate">{tab.label}</span>
                    {tab.pro && <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-px text-[10.5px] font-semibold text-amber-700 dark:text-amber-400">Pro</span>}
                  </button>
                ))}
              </div>
            ))}
          </nav>
          <div className="flex-shrink-0 p-3">
            <button
              onClick={handleClose}
              className="group flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-background/60 hover:text-foreground"
            >
              <ArrowLeft size={16} />
              <span>返回</span>
              <span aria-hidden="true" className="ml-auto inline-flex opacity-0 transition-opacity group-hover:opacity-100">
                <ShortcutKeycaps accelerator="Esc" />
              </span>
            </button>
          </div>
        </div>

        {/* 右侧内容区域 */}
        <ScrollArea className="roy-settings-content min-w-0 flex-1 bg-content-area">
          <div className="mx-auto w-full max-w-[1080px] px-5 py-8 pb-12 sm:px-8">
            <React.Suspense fallback={<div role="status" className="p-6 text-muted-foreground">正在加载此设置页…</div>}>{renderTabContent(activeTab)}</React.Suspense>
          </div>
        </ScrollArea>
      </div>

      {/* 退出拦截弹窗（侧边栏导航 / X 关闭 / Cmd+W） */}
      <AlertDialog open={showNavDialog} onOpenChange={(open) => { if (!open) cancelPendingAction() }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>放弃未保存的更改？</AlertDialogTitle>
            <AlertDialogDescription>
              当前渠道配置尚未保存，确定要离开吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelPendingAction}>留在当前页</AlertDialogCancel>
            <AlertDialogAction onClick={executePendingAction}>放弃并离开</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
