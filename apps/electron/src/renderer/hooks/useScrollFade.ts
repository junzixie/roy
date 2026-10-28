/**
 * 滚动边缘羽化
 *
 * 移植自 CDS：滚动容器顶部/底部用 7 级非线性渐变遮罩，避免文字被硬切。
 * 触顶时收起顶部遮罩、触底时收起底部遮罩，保证首尾内容 100% 清晰。
 *
 * 用法：
 * ```tsx
 * const { ref, isAtTop, isAtBottom } = useScrollFade<HTMLDivElement>()
 * <div ref={ref} className="roy-scroll-fade" data-at-top={isAtTop} data-at-bottom={isAtBottom} />
 * ```
 */

import * as React from 'react'

/** 判定为“在边缘”的容差，避免小数滚动位置导致状态抖动 */
const EDGE_THRESHOLD = 2

export function useScrollFade<T extends HTMLElement = HTMLDivElement>(): {
  ref: React.RefObject<T | null>
  isAtTop: boolean
  isAtBottom: boolean
} {
  const ref = React.useRef<T | null>(null)
  const [isAtTop, setIsAtTop] = React.useState(true)
  const [isAtBottom, setIsAtBottom] = React.useState(false)

  React.useEffect(() => {
    const node = ref.current
    if (!node) return

    let frame = 0

    const update = (): void => {
      frame = 0
      const { scrollTop, scrollHeight, clientHeight } = node
      setIsAtTop(scrollTop <= EDGE_THRESHOLD)
      // 内容不足一屏时同时视为触顶和触底，两侧遮罩都不该出现
      setIsAtBottom(scrollTop + clientHeight >= scrollHeight - EDGE_THRESHOLD)
    }

    const schedule = (): void => {
      if (frame) return
      frame = requestAnimationFrame(update)
    }

    update()
    node.addEventListener('scroll', schedule, { passive: true })

    // 内容高度变化（流式输出、折叠展开）时也要重新判定
    const observer = new ResizeObserver(schedule)
    observer.observe(node)

    return () => {
      if (frame) cancelAnimationFrame(frame)
      node.removeEventListener('scroll', schedule)
      observer.disconnect()
    }
  }, [])

  return { ref, isAtTop, isAtBottom }
}
