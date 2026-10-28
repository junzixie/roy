import * as React from 'react'
import { useAtomValue } from 'jotai'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { workVerbosityAtom, type WorkVerbosity } from '@/atoms/work-verbosity'
import { getToolDisplayName, getToolIcon } from './tool-utils'
import type {
  SDKContentBlock,
  SDKToolUseBlock,
  SDKTextBlock,
  SDKThinkingBlock,
} from '@roy/shared'

interface ProcessBlockGroupProps {
  blocks: SDKContentBlock[]
  isStreaming?: boolean
  /** 惰性生成过程项；流式与历史态均渲染完整内容。 */
  renderChildren: () => React.ReactNode
  // 该过程组是否为整条消息的末尾项：是则流式中保留最后一段为正常显示，
  // 否则（最终答案已作为后续兄弟块外置）整组统一弱化。
  isMessageTail?: boolean
}

const MAX_PROCESS_GROUP_ICONS = 4
const PROCESS_GROUP_VIEWPORT_HEIGHT = 320
const PROCESS_GROUP_LIVE_CHILD_WINDOW = 4
const PROCESS_GROUP_COLLAPSE_DURATION_MS = 500
const PROCESS_GROUP_AUTO_COLLAPSE_SOUND_DELAY_MS = 900
const PROCESS_GROUP_AUTO_COLLAPSE_COUNTDOWN_SECONDS = 3
const PROCESS_GROUP_FOLLOW_BOTTOM_THRESHOLD = 24
const PROGRESS_SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '])

export {
  buildAssistantTurnRenderItems,
  type AssistantTurnRenderItem,
  type IndexedContentBlock,
} from './assistant-turn-layout'

/**
 * Reuse the previous array when streaming only changes a sibling block, such as
 * an already-externalized final text block. Delta updates replace changed block
 * objects immutably, so reference identity is enough to detect process changes.
 */
export function stabilizeProcessBlockReferences(
  previous: SDKContentBlock[],
  next: SDKContentBlock[],
): SDKContentBlock[] {
  if (previous.length !== next.length) return next
  for (let index = 0; index < next.length; index++) {
    if (previous[index] !== next[index]) return next
  }
  return previous
}

function buildProcessGroupSummary(blocks: SDKContentBlock[]): string {
  let toolCount = 0
  let messageCount = 0

  for (const block of blocks) {
    if (block.type === 'tool_use') {
      toolCount += 1
    } else if (block.type === 'thinking' || block.type === 'text') {
      messageCount += 1
    }
  }

  const parts: string[] = []
  if (toolCount > 0) parts.push(`${toolCount} 次工具调用`)
  if (messageCount > 0) parts.push(`${messageCount} 条消息`)
  const summary = parts.join('，') || '过程'
  return `执行过程：${summary}`
}

// 照 Arthur：「读了 3 个文件，跑了 2 条命令」这样的一句话
const TOOL_KINDS: [RegExp, string, string][] = [
  [/^read$/i, '读了', '个文件'],
  [/^(write|edit|multiedit|notebookedit|apply_patch)$/i, '改了', '个文件'],
  [/^(bash|powershell|shell|exec)$/i, '跑了', '条命令'],
  [/^(grep|find|ls|glob)$/i, '查找了', '次'],
  [/^(web_?search)$/i, '搜了', '次网页'],
  [/^(web_?fetch|browser.*|web_open|web_snapshot)$/i, '看了', '次网页'],
  [/^computer_/i, '操作了', '次电脑'],
]
const LIVE_VERBS: [RegExp, string][] = [
  [/^read$/i, '正在读文件'],
  [/^(write|edit|multiedit|notebookedit|apply_patch)$/i, '正在改文件'],
  [/^(bash|powershell|shell|exec)$/i, '正在跑命令'],
  [/^(grep|find|ls|glob)$/i, '正在查找'],
  [/^(web_?search)$/i, '正在搜网页'],
  [/^(web_?fetch|browser.*|web_open|web_snapshot)$/i, '正在看网页'],
]

export function buildToolKindSummary(blocks: SDKContentBlock[]): string {
  const counts = new Map<string, number>()
  let other = 0
  let total = 0
  for (const block of blocks) {
    if (block.type !== 'tool_use') continue
    total += 1
    const name = (block as SDKToolUseBlock).name
    const kind = TOOL_KINDS.find(([re]) => re.test(name))
    if (kind) counts.set(`${kind[1]}|${kind[2]}`, (counts.get(`${kind[1]}|${kind[2]}`) ?? 0) + 1)
    else other += 1
  }
  const parts = [...counts].map(([key, count]) => {
    const [verb, unit] = key.split('|')
    return `${verb} ${count} ${unit}`
  })
  if (other) parts.push(`用了 ${other} 次工具`)
  return parts.slice(0, 3).join('，') || (total ? `执行了 ${total} 步` : '想了想')
}

/** 静默模式下跑着时的那一行：正在思考 / 正在跑命令…… */
function buildLiveStatus(blocks: SDKContentBlock[]): string {
  const last = blocks[blocks.length - 1]
  if (!last) return '正在处理'
  if (last.type === 'thinking') return '正在思考'
  if (last.type === 'tool_use') {
    const name = (last as SDKToolUseBlock).name
    return LIVE_VERBS.find(([re]) => re.test(name))?.[1] ?? `正在${getToolDisplayName(name)}`
  }
  return '正在整理'
}

export function buildProcessGroupToolNames(blocks: SDKContentBlock[]): string[] {
  const toolNames: string[] = []
  const seen = new Set<string>()

  for (const block of blocks) {
    if (block.type !== 'tool_use') continue
    const toolBlock = block as SDKToolUseBlock
    if (seen.has(toolBlock.name)) continue
    seen.add(toolBlock.name)
    toolNames.push(toolBlock.name)
  }

  return toolNames
}

type ProcessGroupDisplayMode = 'collapsed' | 'expanded'

export function isProgressViewportAtBottom({
  clientHeight,
  scrollHeight,
  scrollTop,
}: Pick<HTMLElement, 'clientHeight' | 'scrollHeight' | 'scrollTop'>): boolean {
  return scrollHeight - scrollTop - clientHeight <= PROCESS_GROUP_FOLLOW_BOTTOM_THRESHOLD
}

function getProcessChildKey(child: React.ReactNode, index: number): string {
  if (React.isValidElement(child) && child.key != null) return String(child.key)
  return `process-child-${index}`
}

interface StableProcessChildCacheEntry {
  child: React.ReactNode
  snapshot: string
}

function getProcessChildSnapshot(child: React.ReactNode): string | null {
  if (!React.isValidElement(child) || child.type !== React.Fragment) return null
  const fragmentProps = child.props as { children?: React.ReactNode }
  const content = fragmentProps.children
  if (!React.isValidElement(content)) return null
  const contentProps = content.props as { block?: SDKContentBlock }
  const block = contentProps.block
  if (!block || (block.type !== 'text' && block.type !== 'thinking')) return null
  const text = block.type === 'text'
    ? (block as SDKTextBlock).text
    : (block as SDKThinkingBlock).thinking
  return `${block.type}:${text}`
}

const StableProcessChild = React.memo(
  function StableProcessChild({ child }: { child: React.ReactNode }): React.ReactElement {
    return <>{child}</>
  },
  (previous, next) => previous.child === next.child,
)

function initialModeFor(verbosity: WorkVerbosity, isStreaming: boolean | undefined): ProcessGroupDisplayMode {
  if (verbosity === 'detail') return 'expanded'
  return 'collapsed'
}

export function ProcessBlockGroup({ blocks, isStreaming, renderChildren, isMessageTail = false }: ProcessBlockGroupProps): React.ReactElement {
  const verbosity = useAtomValue(workVerbosityAtom)
  const initialDisplayMode: ProcessGroupDisplayMode = initialModeFor(verbosity, isStreaming)
  const [displayMode, setDisplayMode] = React.useState<ProcessGroupDisplayMode>(initialDisplayMode)
  const [shouldRenderContent, setShouldRenderContent] = React.useState(initialDisplayMode !== 'collapsed')
  const [keepProgressViewport, setKeepProgressViewport] = React.useState(false)
  // 静默模式跑着时那一行显示「正在思考 · 12 秒」
  // 只有最后一段才算在跑，否则整条消息里每个命令都会各自跳秒。
  const isLive = !!isStreaming && isMessageTail
  const liveStartedRef = React.useRef<number>(Date.now())
  const [liveTick, setLiveTick] = React.useState(0)
  React.useEffect(() => {
    if (!isLive) return
    liveStartedRef.current = Date.now()
    const timer = window.setInterval(() => setLiveTick((n) => n + 1), 1000)
    return () => window.clearInterval(timer)
  }, [isLive])
  const liveTickKey = liveTick
  const [collapseCountdown, setCollapseCountdown] = React.useState<number | null>(null)
  const userToggledRef = React.useRef(false)
  const followLatestRef = React.useRef(true)
  const smoothScrollTargetRef = React.useRef<number | null>(null)
  const scrollFrameRef = React.useRef<number | null>(null)
  const wasStreamingRef = React.useRef(!!isStreaming)
  const autoCollapseTimersRef = React.useRef<number[]>([])
  const contentRef = React.useRef<HTMLDivElement>(null)
  const contentInnerRef = React.useRef<HTMLDivElement>(null)
  const stableChildrenRef = React.useRef(new Map<string, StableProcessChildCacheEntry>())
  const stableProcessBlocksRef = React.useRef(blocks)
  stableProcessBlocksRef.current = stabilizeProcessBlockReferences(stableProcessBlocksRef.current, blocks)
  const stableProcessBlocks = stableProcessBlocksRef.current
  const collapseFrameRef = React.useRef<number | null>(null)
  const [measuredHeight, setMeasuredHeight] = React.useState<number | undefined>(undefined)

  const isContentExpanded = displayMode === 'expanded'
  const shouldShowContent = isContentExpanded || shouldRenderContent
  const visibleChildren = shouldShowContent ? renderChildren() : null

  const clearAutoCollapseTimers = React.useCallback(() => {
    for (const timer of autoCollapseTimersRef.current) window.clearTimeout(timer)
    autoCollapseTimersRef.current = []
  }, [])

  React.useEffect(() => {
    clearAutoCollapseTimers()

    // 细节：一直展开，不限高度，不自动收起
    if (verbosity === 'detail') {
      setCollapseCountdown(null)
      setKeepProgressViewport(false)
      if (!userToggledRef.current) setDisplayMode('expanded')
      wasStreamingRef.current = !!isStreaming
      return
    }

    // 静默：跑着也只露一行，跑完保持收起；Claude 形式不用外层分组，同样不开计时器
    if (verbosity === 'quiet' || verbosity === 'list') {
      setCollapseCountdown(null)
      setKeepProgressViewport(false)
      if (!userToggledRef.current) setDisplayMode('collapsed')
      wasStreamingRef.current = !!isStreaming
      return
    }

    if (isStreaming) {
      setCollapseCountdown(null)
      setKeepProgressViewport(true)
      if (!wasStreamingRef.current) {
        userToggledRef.current = false
        followLatestRef.current = true
        smoothScrollTargetRef.current = null
        if (scrollFrameRef.current !== null) {
          cancelAnimationFrame(scrollFrameRef.current)
          scrollFrameRef.current = null
        }
      }
      if (!userToggledRef.current) setDisplayMode('expanded')
      wasStreamingRef.current = true
      return
    }

    const shouldAutoCollapseAfterCompletion = wasStreamingRef.current && !userToggledRef.current
    wasStreamingRef.current = false

    if (!shouldAutoCollapseAfterCompletion) {
      setKeepProgressViewport(false)
      if (!userToggledRef.current) setDisplayMode('collapsed')
      return
    }

    const soundDelayTimer = window.setTimeout(() => {
      setCollapseCountdown(PROCESS_GROUP_AUTO_COLLAPSE_COUNTDOWN_SECONDS)

      for (let second = PROCESS_GROUP_AUTO_COLLAPSE_COUNTDOWN_SECONDS - 1; second >= 1; second--) {
        const elapsed = (PROCESS_GROUP_AUTO_COLLAPSE_COUNTDOWN_SECONDS - second) * 1000
        autoCollapseTimersRef.current.push(window.setTimeout(() => setCollapseCountdown(second), elapsed))
      }

      autoCollapseTimersRef.current.push(window.setTimeout(() => {
        setCollapseCountdown(null)
        setDisplayMode('collapsed')
        autoCollapseTimersRef.current.push(window.setTimeout(
          () => setKeepProgressViewport(false),
          PROCESS_GROUP_COLLAPSE_DURATION_MS,
        ))
      }, PROCESS_GROUP_AUTO_COLLAPSE_COUNTDOWN_SECONDS * 1000))
    }, PROCESS_GROUP_AUTO_COLLAPSE_SOUND_DELAY_MS)
    autoCollapseTimersRef.current.push(soundDelayTimer)

    return clearAutoCollapseTimers
  }, [clearAutoCollapseTimers, isStreaming, verbosity])

  const scrollToLatest = React.useCallback(() => {
    if (!followLatestRef.current) return
    const viewport = contentRef.current
    if (!viewport) return

    smoothScrollTargetRef.current = Math.max(0, viewport.scrollHeight - viewport.clientHeight)
    if (scrollFrameRef.current !== null) return

    const advanceScroll = (): void => {
      const target = smoothScrollTargetRef.current
      const activeViewport = contentRef.current
      if (!followLatestRef.current || target == null || !activeViewport) {
        scrollFrameRef.current = null
        return
      }

      const distance = target - activeViewport.scrollTop
      if (Math.abs(distance) <= 1) {
        activeViewport.scrollTop = target
        smoothScrollTargetRef.current = null
        scrollFrameRef.current = null
        return
      }

      // 内容突增时快速追近，正常增量则保持低成本的连续插值。
      const nextTop = distance > 72
        ? target - 48
        : activeViewport.scrollTop + distance * 0.32
      activeViewport.scrollTop = nextTop
      scrollFrameRef.current = requestAnimationFrame(advanceScroll)
    }

    scrollFrameRef.current = requestAnimationFrame(advanceScroll)
  }, [])

  React.useLayoutEffect(() => {
    if (!isStreaming || !keepProgressViewport) return
    const content = contentInnerRef.current
    if (!content) return

    const frame = requestAnimationFrame(scrollToLatest)
    const observer = new ResizeObserver(scrollToLatest)
    observer.observe(content)
    return () => {
      cancelAnimationFrame(frame)
      if (scrollFrameRef.current !== null) {
        cancelAnimationFrame(scrollFrameRef.current)
        scrollFrameRef.current = null
      }
      observer.disconnect()
    }
  }, [isStreaming, keepProgressViewport, scrollToLatest])

  React.useLayoutEffect(() => {
    if (isStreaming && keepProgressViewport) scrollToLatest()
  }, [stableProcessBlocks, isStreaming, keepProgressViewport, scrollToLatest])

  const handleProgressScroll = React.useCallback((event: React.UIEvent<HTMLDivElement>): void => {
    if (!isProgressViewportAtBottom(event.currentTarget)) return
    followLatestRef.current = true
    scrollToLatest()
  }, [scrollToLatest])

  const handleProgressScrollIntent = React.useCallback((): void => {
    smoothScrollTargetRef.current = null
    followLatestRef.current = false
    if (scrollFrameRef.current !== null) {
      cancelAnimationFrame(scrollFrameRef.current)
      scrollFrameRef.current = null
    }
  }, [])

  const handleProgressKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (PROGRESS_SCROLL_KEYS.has(event.key)) handleProgressScrollIntent()
  }, [handleProgressScrollIntent])

  // 折叠前测量实际高度，用于丝滑的 height 过渡（子元素不 reflow，只裁剪边界）
  React.useEffect(() => {
    if (isContentExpanded) {
      if (collapseFrameRef.current !== null) {
        cancelAnimationFrame(collapseFrameRef.current)
        collapseFrameRef.current = null
      }
      setShouldRenderContent(true)
      setMeasuredHeight(undefined)
      return
    }

    // 折叠时：先测量当前高度，触发 height 过渡动画，动画结束后卸载 DOM
    const el = contentRef.current
    if (el) {
      const h = el.clientHeight
      setMeasuredHeight(h)
      collapseFrameRef.current = requestAnimationFrame(() => {
        collapseFrameRef.current = null
        setMeasuredHeight(0)
      })
    }

    const timer = window.setTimeout(() => setShouldRenderContent(false), PROCESS_GROUP_COLLAPSE_DURATION_MS)
    return () => {
      window.clearTimeout(timer)
      if (collapseFrameRef.current !== null) {
        cancelAnimationFrame(collapseFrameRef.current)
        collapseFrameRef.current = null
      }
    }
  }, [isContentExpanded])

  const doneSummary = React.useMemo(
    () => verbosity === 'list' ? buildToolKindSummary(blocks) : buildProcessGroupSummary(blocks),
    [blocks, verbosity],
  )
  const liveSeconds = React.useMemo(() => {
    // 优先用最后一条工具调用自己的开始时间：这样每条命令各自计时，
    // 不含前面的思考和等待时间。历史会话没有 startedAt 时回退到消息级起点。
    let startedAt = liveStartedRef.current
    for (let i = blocks.length - 1; i >= 0; i -= 1) {
      const b = blocks[i]
      if (b?.type === 'tool_use') {
        const ts = (b as SDKToolUseBlock).startedAt
        if (typeof ts === 'number' && Number.isFinite(ts)) startedAt = ts
        break
      }
    }
    return Math.max(1, Math.round((Date.now() - startedAt) / 1000))
    // blocks 变化时要重算；每秒的 setLiveTick 也会触发重渲染
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks, liveTickKey])
  const summary = isLive && !isContentExpanded
    ? `${buildLiveStatus(blocks)} · ${liveSeconds} 秒`
    : doneSummary
  const toolNames = React.useMemo(() => buildProcessGroupToolNames(blocks), [blocks])
  const visibleToolNames = toolNames.slice(0, MAX_PROCESS_GROUP_ICONS)
  const hiddenToolCount = Math.max(0, toolNames.length - visibleToolNames.length)

  // 只让最近几项参与高频更新；旧项保留在 DOM 中供用户滚动查看，但冻结其 React 子树。
  const renderContentChildren = (): React.ReactNode => {
    const childArray = React.Children.toArray(visibleChildren)
    const liveStart = Math.max(0, childArray.length - PROCESS_GROUP_LIVE_CHILD_WINDOW)
    const activeKeys = new Set<string>()

    const rendered = childArray.map((child, i) => {
      const key = getProcessChildKey(child, i)
      activeKeys.add(key)
      const cachedEntry = stableChildrenRef.current.get(key)
      const snapshot = getProcessChildSnapshot(child)
      const shouldFreeze = !!isStreaming && i < liveStart && snapshot !== null
      const stableChild = shouldFreeze && cachedEntry?.snapshot === snapshot
        ? cachedEntry.child
        : child
      if (!shouldFreeze || !cachedEntry || cachedEntry.snapshot !== snapshot) {
        stableChildrenRef.current.set(key, { child, snapshot: snapshot ?? '' })
      }

      const isLast = i === childArray.length - 1
      const dimmed = isStreaming && !(isMessageTail && isLast)
      return (
        <div key={key} className={cn(dimmed && 'opacity-80')}>
          <StableProcessChild child={stableChild} />
        </div>
      )
    })

    for (const key of stableChildrenRef.current.keys()) {
      if (!activeKeys.has(key)) stableChildrenRef.current.delete(key)
    }
    return rendered
  }

  // Claude 形式：没有「执行过程」外框，思考、每个工具、说明文字按顺序各占一行
  if (verbosity === 'list') {
    return <div className="space-y-0.5">{renderChildren()}</div>
  }

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        className={cn(
          'flex max-w-full items-center gap-2 py-0.5 text-left transition-opacity group',
          'hover:opacity-70',
        )}
        onClick={() => {
          userToggledRef.current = true
          clearAutoCollapseTimers()
          setCollapseCountdown(null)
          if (!isStreaming) setKeepProgressViewport(false)
          setDisplayMode((previous) => previous === 'collapsed' ? 'expanded' : 'collapsed')
        }}
      >
        <ChevronRight
          className={cn(
            'size-3 shrink-0 text-muted-foreground/40 transition-transform duration-150',
            isContentExpanded && 'rotate-90',
          )}
        />
        {isStreaming && !isContentExpanded && (
          <span className="roy-loader-dots sm shrink-0 text-primary/70" aria-hidden>
            <i />
            <i />
            <i />
          </span>
        )}
        <span className={cn('min-w-0 truncate text-muted-foreground', 'text-[14px]')}>{summary}</span>
        {collapseCountdown !== null && (
          <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground/50">
            （{collapseCountdown}）
          </span>
        )}
        {visibleToolNames.length > 0 && (
          <span className="flex shrink-0 items-center gap-1 text-muted-foreground/60">
            {visibleToolNames.map((toolName) => {
              const ToolIcon = getToolIcon(toolName)
              return (
                <ToolIcon
                  key={toolName}
                  className="size-3.5"
                  aria-label={getToolDisplayName(toolName)}
                />
              )
            })}
            {hiddenToolCount > 0 && (
              <span className="text-[11px] tabular-nums text-muted-foreground/60">
                +{hiddenToolCount}
              </span>
            )}
          </span>
        )}
      </button>

      {shouldRenderContent && (
        <div
          ref={contentRef}
          data-agent-history-selection-excluded={isContentExpanded ? undefined : 'true'}
          className={cn(
            'overflow-hidden focus:outline-none',
            keepProgressViewport && 'overflow-y-auto overscroll-contain scrollbar-none',
          )}
          tabIndex={keepProgressViewport ? 0 : undefined}
          onScroll={keepProgressViewport ? handleProgressScroll : undefined}
          onPointerDown={keepProgressViewport ? handleProgressScrollIntent : undefined}
          onWheel={keepProgressViewport ? handleProgressScrollIntent : undefined}
          onTouchStart={keepProgressViewport ? handleProgressScrollIntent : undefined}
          onKeyDown={keepProgressViewport ? handleProgressKeyDown : undefined}
          style={{
            maxHeight: keepProgressViewport ? `${PROCESS_GROUP_VIEWPORT_HEIGHT}px` : undefined,
            height: measuredHeight !== undefined ? `${measuredHeight}px` : 'auto',
            opacity: isContentExpanded ? 1 : 0,
            transition: measuredHeight !== undefined
              ? `height ${PROCESS_GROUP_COLLAPSE_DURATION_MS}ms ease-in-out, opacity ${PROCESS_GROUP_COLLAPSE_DURATION_MS}ms ease-in-out`
              : `opacity ${PROCESS_GROUP_COLLAPSE_DURATION_MS}ms ease-in-out`,
          }}
        >
          <div ref={contentInnerRef} className="space-y-2">
            {renderContentChildren()}
          </div>
        </div>
      )}
    </div>
  )
}
