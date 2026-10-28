/**
 * Roy 中央球 — AIWorkstation jarvis-ball（WebGL）。
 * 大画布主视觉；自转 + 拖拽 orbit；点球由上层开说（不跳项目）。
 */
import * as React from 'react'
import { cn } from '@/lib/utils'
import type { RoyWorkbenchSkin } from '@/lib/roy-workbench-prefs'
import {
  createJarvisBall,
  type JarvisBallHandle,
  type JarvisBallStateName,
} from './jarvisBall'

export type RoyOrbState = 'idle' | 'ready' | 'listening' | 'thinking' | 'busy' | 'speaking' | 'offline' | 'awake'

function skinHue(skin: RoyWorkbenchSkin): number {
  switch (skin) {
    case 'aivy':
      return 168
    case 'mineral':
      return 205
    case 'ink':
      return 220
    default:
      return 219
  }
}

function toJarvisState(state: RoyOrbState): JarvisBallStateName {
  switch (state) {
    case 'listening':
    case 'awake':
      return 'listening'
    case 'thinking':
      return 'thinking'
    case 'busy':
    case 'speaking':
      return 'speaking'
    default:
      return 'idle'
  }
}

function idleLevel(state: RoyOrbState): number {
  switch (state) {
    case 'listening':
    case 'awake':
      return 0.38
    case 'thinking':
      return 0.22
    case 'busy':
    case 'speaking':
      return 0.45
    case 'offline':
      return 0.04
    case 'ready':
      return 0.1
    default:
      return 0.08
  }
}

export function RoyWorkbenchOrb({
  state = 'ready',
  skin = 'aurora',
  onActivate,
  className,
  engaged = false,
}: {
  state?: RoyOrbState
  skin?: RoyWorkbenchSkin
  /** @deprecated 状态文案改到输入框下方，球下不再显示 */
  label?: string
  sublabel?: string
  onActivate: () => void
  className?: string
  engaged?: boolean
}): React.ReactElement {
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const wrapRef = React.useRef<HTMLButtonElement>(null)
  const ballRef = React.useRef<JarvisBallHandle | null>(null)
  const dragRef = React.useRef<{ x: number; y: number; dragging: boolean; moved: boolean }>({
    x: 0,
    y: 0,
    dragging: false,
    moved: false,
  })

  const light = React.useMemo(() => {
    if (typeof document === 'undefined') return false
    return !document.documentElement.classList.contains('dark')
  }, [])

  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const lowPower =
      typeof navigator !== 'undefined' && Number(navigator.hardwareConcurrency || 8) <= 4
    const ball = createJarvisBall(canvas, {
      count: lowPower ? 7000 : 15000,
      clusters: 11,
      shape: 'orb',
      hue: skinHue(skin),
      theme: light ? 'light' : 'dark',
      // 略大于 AIWorkstation 默认 0.72，配合更大画布做主视觉
      radius: 0.92,
      maxDpr: lowPower ? 1.25 : 2,
    })
    ballRef.current = ball
    ball.setState(toJarvisState(state))
    ball.setLevel(idleLevel(state))
    return () => {
      ball.destroy()
      ballRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  React.useEffect(() => {
    const ball = ballRef.current
    if (!ball || ball.unsupported) return
    ball.setHue(engaged ? 145 : skinHue(skin), light ? 'light' : 'dark')
  }, [skin, light, engaged])

  React.useEffect(() => {
    const ball = ballRef.current
    if (!ball || ball.unsupported) return
    ball.setState(toJarvisState(state))
    ball.setLevel(idleLevel(state))
  }, [state])

  const onPointerDown = (e: React.PointerEvent): void => {
    if (e.button !== 0) return
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    dragRef.current = { x: e.clientX, y: e.clientY, dragging: true, moved: false }
    ballRef.current?.setDragging(true)
  }
  const onPointerMove = (e: React.PointerEvent): void => {
    if (!dragRef.current.dragging) return
    const dx = e.clientX - dragRef.current.x
    const dy = e.clientY - dragRef.current.y
    if (Math.hypot(dx, dy) > 2) dragRef.current.moved = true
    dragRef.current.x = e.clientX
    dragRef.current.y = e.clientY
    ballRef.current?.orbit(dx, dy)
  }
  const endDrag = (e: React.PointerEvent): void => {
    const wasDrag = dragRef.current.moved
    dragRef.current.dragging = false
    ballRef.current?.setDragging(false)
    if (!wasDrag) {
      // 点击唤醒：回正视差，避免点完还歪着
      ballRef.current?.resetTilt()
      onActivate()
    }
    try {
      ;(e.target as HTMLElement).releasePointerCapture?.(e.pointerId)
    } catch {
      /* ignore */
    }
  }

  return (
    <div className={cn('relative flex flex-col items-center', className)}>
      <button
        ref={wrapRef}
        type="button"
        aria-label="点击球开始说话，回答或执行中点击可打断"
        className="group relative aspect-square cursor-grab touch-none rounded-full transition-[width,height,filter] duration-700 ease-in-out motion-reduce:transition-none active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
        data-engaged={engaged}
        style={{ touchAction: 'none', width: engaged ? 'min(64cqw, 80cqh, 360px)' : 'min(96cqw, 96cqh)', height: engaged ? 'min(64cqw, 80cqh, 360px)' : 'min(96cqw, 96cqh)', filter: engaged ? 'drop-shadow(0 0 20px rgba(16,185,129,.18))' : undefined }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={() => { dragRef.current.dragging = false; dragRef.current.moved = false; ballRef.current?.setDragging(false) }}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onActivate() } }}
      >
        <canvas
          ref={canvasRef}
          className="pointer-events-none absolute inset-0 z-10 h-full w-full"
        />
      </button>
    </div>
  )
}
