/**
 * WelcomeEmptyState — 对话/会话空状态引导
 *
 * 在没有会话时展示：
 * 1. 个性化时段问候（Agent 模式下附一句能力说明）
 * 2. 平台感知的小 Tips
 * 3. Chat/Agent 模式切换 Tab
 * 4. 照 Arthur：分类起手建议，点一条就填进输入框（不直接发）；「找伙伴」打开工作伙伴
 */

import * as React from 'react'
import { useAtomValue, useAtom, useSetAtom } from 'jotai'
import { BarChart3, BookOpen, Bot, Code2, FolderOpen, Globe, Lightbulb, MessageSquare, PenLine, Sparkles, UserRound, X, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { userProfileAtom } from '@/atoms/user-profile'
import { appModeAtom, type AppMode } from '@/atoms/app-mode'
import { themeStyleAtom } from '@/atoms/theme'
import { activeViewAtom, agentSkillsTabAtom } from '@/atoms/active-view'
import { getRandomTip, getPlatform, type Tip } from '@/lib/tips'

/** 根据小时返回时段问候 */
function getGreeting(hour: number): string {
  if (hour < 6) return '夜深了'
  if (hour < 12) return '早上好'
  if (hour < 18) return '下午好'
  return '晚上好'
}

/** 模式配置 */
const MODE_CONFIG: Record<AppMode, { icon: React.ReactNode; label: string }> = {
  chat: { icon: <MessageSquare size={15} />, label: 'Chat' },
  agent: { icon: <Bot size={15} />, label: 'Agent' },
}

type StarterCategory = { name: string; icon: LucideIcon; tips: string[] }

/** 起手建议，内容沿用 Arthur 欢迎页 */
const STARTERS: Record<AppMode, StarterCategory[]> = {
  agent: [
    { name: '整理文件', icon: FolderOpen, tips: ['把下载文件夹里的文件按类型分好，旧安装包挪到一个文件夹里', '找出这台电脑上最占空间的 20 个文件，列个表给我', '把这个文件夹里的照片按拍摄日期改名', '把这几个 PDF 合成一个，按文件名排序'] },
    { name: '写东西', icon: PenLine, tips: ['根据我这周的工作记录写一份周报：', '帮我写一封邮件给客户，说明交付时间要推迟一周，语气客气', '把这份会议录音转写整理成纪要，列出待办和负责人', '写一份产品介绍的 PPT 大纲，10 页左右，主题是：'] },
    { name: '查资料', icon: Globe, tips: ['查一下今天的科技新闻，做成一页摘要', '对比一下这三款笔记本的配置和价格，做成表格：', '查查这家公司最近半年的新闻和动态：', '把这个网页上的表格抓下来存成 Excel：'] },
    { name: '分析数据', icon: BarChart3, tips: ['分析一下这个 Excel，找出销售额最高的产品和趋势，配图表', '把这个 CSV 里的重复行和空值清理掉，另存一份', '按月份汇总这张表，做一张折线图存成图片'] },
    { name: '写代码', icon: Code2, tips: ['做一个单页的个人主页，深色风格，做完截图给我看', '写一个 Python 脚本，每天把桌面截图存到一个文件夹', '看看这个项目的代码，找找有没有明显的 bug'] },
  ],
  chat: [
    { name: '写作', icon: PenLine, tips: ['帮我把这段话改得更通顺、更专业：', '给我的小红书笔记想 5 个标题，内容是：', '把下面这段英文翻成地道的中文：'] },
    { name: '学习', icon: BookOpen, tips: ['用大白话解释一下什么是向量数据库', '我想在一个月内入门 Python，给我排个学习计划', '出 5 道题考考我对 TCP 三次握手的理解'] },
    { name: '生活', icon: Lightbulb, tips: ['给我列一个周末两天的放松计划', '冰箱里有鸡蛋、番茄、土豆，能做什么菜', '帮我规划一次 3 天的杭州旅行，预算 3000'] },
    { name: '头脑风暴', icon: Sparkles, tips: ['给我的咖啡店想 10 个名字，风格温暖一点', '我想做一个副业，帮我分析几个方向的优缺点', '下周团建有什么不尴尬的活动'] },
  ],
}

/** 填进当前输入框（主 Agent / Chat 输入框监听这个事件），光标放到最后 */
function fillComposer(text: string): void {
  window.dispatchEvent(new CustomEvent('roy:fill-composer', { detail: { text } }))
}

export function WelcomeEmptyState(): React.ReactElement {
  const userProfile = useAtomValue(userProfileAtom)
  const [mode, setMode] = useAtom(appModeAtom)
  const themeStyle = useAtomValue(themeStyleAtom)
  const setActiveView = useSetAtom(activeViewAtom)
  const setSkillsTab = useSetAtom(agentSkillsTabAtom)
  const [openCategory, setOpenCategory] = React.useState<string | null>(null)

  // 稳定的随机 Tip（组件挂载时选一条）
  const [tip] = React.useState<Tip>(() => getRandomTip(getPlatform()))

  const hour = new Date().getHours()
  const greeting = getGreeting(hour)
  const displayName = userProfile.userName || '用户'

  // 森息晨光主题下选中按钮使用主色
  const selectedColor = themeStyle === 'forest-light' ? '#4a7858' : undefined

  /** 切换模式：仅切换模式，不创建新会话 */
  const handleModeSwitch = React.useCallback((targetMode: AppMode): void => {
    if (targetMode === mode) return
    setOpenCategory(null)
    setMode(targetMode)
  }, [mode, setMode])

  const categories = STARTERS[mode] ?? STARTERS.chat
  const opened = categories.find((c) => c.name === openCategory)

  return (
    <div className="welcome-empty-state flex h-full flex-col items-center justify-center gap-6 px-4">
      {/* 问候语 */}
      <div className="flex flex-col items-center gap-2">
        <h1 className="text-[26px] font-semibold tracking-tight text-foreground">
          {displayName}，{greeting}
        </h1>
        <p className="text-[13px] text-muted-foreground">
          {mode === 'agent' ? '能读写文件、跑命令、上网、操作浏览器' : '纯聊天，不碰你的文件'}
        </p>
      </div>

      {/* Tips */}
      <div className="flex items-center gap-2.5 rounded-full bg-muted/50 px-4 py-2 text-[13px] text-muted-foreground">
        <Lightbulb size={14} className="flex-shrink-0 text-amber-500/80" />
        <span>{tip.text}</span>
      </div>

      {/* 模式切换 Tab */}
      <div className="relative flex rounded-xl bg-muted/60 p-1">
        {/* 滑动背景指示器 */}
        <div
          className={cn(
            'absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-lg bg-background shadow-sm transition-transform duration-300 ease-in-out',
            mode === 'agent' ? 'translate-x-0' : 'translate-x-full',
          )}
        />
        {(['agent', 'chat'] as const).map((m) => {
          const config = MODE_CONFIG[m]
          const isSelected = mode === m
          return (
            <button
              key={m}
              onClick={() => handleModeSwitch(m)}
              style={isSelected && selectedColor ? { color: selectedColor } : undefined}
              className={cn(
                'relative z-[1] flex items-center gap-1.5 rounded-lg px-5 py-1.5 text-[13px] font-medium transition-colors duration-200',
                isSelected
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {config.icon}
              {config.label}
            </button>
          )
        })}
      </div>

      {/* 起手建议：分类按钮 → 展开几条 → 点一条填进输入框 */}
      <div className="flex w-full max-w-[720px] flex-col items-center gap-3">
        <div className="flex flex-wrap justify-center gap-2">
          {categories.map((c) => {
            const Icon = c.icon
            const active = openCategory === c.name
            return (
              <button
                key={c.name}
                type="button"
                onClick={() => setOpenCategory(active ? null : c.name)}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] transition-colors',
                  active ? 'border-primary/40 bg-primary/[0.06] text-foreground' : 'border-border/70 bg-background/60 text-foreground/75 hover:bg-foreground/[0.04] hover:text-foreground',
                )}
              >
                <Icon size={14} />
                {c.name}
              </button>
            )
          })}
          {mode === 'agent' && (
            <button
              type="button"
              onClick={() => { setSkillsTab('partners'); setActiveView('agent-skills') }}
              className="flex items-center gap-1.5 rounded-lg border border-border/70 bg-background/60 px-3 py-1.5 text-[13px] text-foreground/75 transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
            >
              <UserRound size={14} />
              找伙伴
            </button>
          )}
        </div>

        {opened && (
            <div
              key={opened.name}
              className="w-full overflow-hidden rounded-xl border border-border/60 bg-background/80 p-1 shadow-sm"
            >
              <div className="flex items-center justify-between px-3 py-1.5 text-[12px] text-muted-foreground">
                <span>{opened.name}：点一条填进输入框，改改再发</span>
                <button type="button" onClick={() => setOpenCategory(null)} className="rounded p-0.5 hover:bg-muted" aria-label="收起">
                  <X size={13} />
                </button>
              </div>
              {opened.tips.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => { fillComposer(t); setOpenCategory(null) }}
                  className="block w-full rounded-lg px-3 py-2 text-left text-[13px] text-foreground/80 transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
                >
                  {t}
                </button>
              ))}
            </div>
        )}
      </div>
    </div>
  )
}
