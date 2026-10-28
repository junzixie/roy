/**
 * 渲染性能优化 Hook
 *
 * 解决 Roy 界面卡顿问题：
 * 1. 减少不必要的重渲染
 * 2. 清理定时器
 * 3. 虚拟化长列表
 */

import { useEffect, useRef, useMemo, useCallback } from 'react'

/**
 * 防抖 Hook - 减少高频更新导致的重渲染
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = React.useState(value)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => clearTimeout(timer)
  }, [value, delay])

  return debouncedValue
}

/**
 * 节流 Hook - 控制函数执行频率
 */
export function useThrottle<T extends (...args: any[]) => any>(
  callback: T,
  delay: number = 300
): T {
  const lastRun = useRef(Date.now())

  return useCallback(
    ((...args) => {
      const now = Date.now()
      if (now - lastRun.current >= delay) {
        lastRun.current = now
        return callback(...args)
      }
    }) as T,
    [callback, delay]
  )
}

/**
 * 清理定时器 Hook - 自动清理，避免内存泄漏
 */
export function useInterval(callback: () => void, delay: number | null) {
  const savedCallback = useRef(callback)

  useEffect(() => {
    savedCallback.current = callback
  }, [callback])

  useEffect(() => {
    if (delay === null) return

    const id = setInterval(() => savedCallback.current(), delay)
    return () => clearInterval(id)
  }, [delay])
}

/**
 * 可见性检测 Hook - 只渲染可见的内容
 */
export function useIntersectionObserver(
  ref: React.RefObject<Element>,
  options?: IntersectionObserverInit
): boolean {
  const [isVisible, setIsVisible] = React.useState(false)

  useEffect(() => {
    if (!ref.current) return

    const observer = new IntersectionObserver(([entry]) => {
      setIsVisible(entry.isIntersecting)
    }, options)

    observer.observe(ref.current)

    return () => observer.disconnect()
  }, [ref, options])

  return isVisible
}

/**
 * 虚拟滚动 Hook - 只渲染可见区域的项目
 */
export function useVirtualScroll<T>(
  items: T[],
  containerHeight: number,
  itemHeight: number
) {
  const [scrollTop, setScrollTop] = React.useState(0)

  const visibleRange = useMemo(() => {
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - 5)
    const endIndex = Math.min(
      items.length,
      Math.ceil((scrollTop + containerHeight) / itemHeight) + 5
    )

    return {
      startIndex,
      endIndex,
      visibleItems: items.slice(startIndex, endIndex),
      offsetY: startIndex * itemHeight,
    }
  }, [items, scrollTop, containerHeight, itemHeight])

  const handleScroll = useThrottle((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop)
  }, 16) // 60fps

  return {
    ...visibleRange,
    totalHeight: items.length * itemHeight,
    handleScroll,
  }
}

/**
 * 批量更新 Hook - 合并多次更新为一次
 */
export function useBatchedUpdates<T>(initialValue: T) {
  const [value, setValue] = React.useState(initialValue)
  const pendingUpdates = useRef<Partial<T>[]>([])
  const timeoutRef = useRef<NodeJS.Timeout>()

  const batchUpdate = useCallback((update: Partial<T>) => {
    pendingUpdates.current.push(update)

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    timeoutRef.current = setTimeout(() => {
      if (pendingUpdates.current.length > 0) {
        setValue((prev) => ({
          ...prev,
          ...Object.assign({}, ...pendingUpdates.current),
        }))
        pendingUpdates.current = []
      }
    }, 0)
  }, [])

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  return [value, batchUpdate] as const
}

/**
 * 性能监控 Hook - 测量组件渲染时间
 */
export function useRenderPerformance(componentName: string, enabled = false) {
  const renderCount = useRef(0)
  const startTime = useRef(0)

  if (enabled) {
    renderCount.current += 1
    startTime.current = performance.now()
  }

  useEffect(() => {
    if (!enabled) return

    const renderTime = performance.now() - startTime.current

    if (renderTime > 16) {
      // 超过一帧的时间（16ms）
      console.warn(
        `[性能警告] ${componentName} 渲染耗时 ${renderTime.toFixed(2)}ms (第 ${renderCount.current} 次渲染)`
      )
    }
  })
}
