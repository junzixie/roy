/**
 * 内置程序化壁纸（WebGL 片元着色器）
 *
 * 省电是第一位的，因为聊天窗口常驻后台：
 * - 半分辨率渲染再由浏览器拉伸，云气 / 光带本来就是柔边，看不出差别
 * - 帧率上限跟场景壁纸共用 sceneFps（默认 30）
 * - pauseHidden：窗口切走 / 最小化时完全停渲染
 * - Roy 正在回复时（html[data-roy-reduced-effects]）降到 8 帧，把 GPU 让给界面
 * - 系统开了「减少动态效果」时只画一帧静态图
 */

import * as React from 'react'
import { buildProceduralShader, getProceduralWallpaper } from '@/lib/procedural-wallpapers'

interface ProceduralWallpaperProps {
  id: string
  fps: number
  pauseHidden: boolean
  onReady?: (ready: boolean) => void
  onError?: (message: string) => void
  /** 始终画深色版本（比如上面要叠白字的品牌面板），不跟随浅色主题 */
  forceDark?: boolean
}

const RENDER_SCALE = 0.5
const REPLYING_FPS = 8

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('无法创建着色器')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? ''
    gl.deleteShader(shader)
    throw new Error(`着色器编译失败：${log}`)
  }
  return shader
}

export function ProceduralWallpaper({ id, fps, pauseHidden, onReady, onError, forceDark = false }: ProceduralWallpaperProps): React.ReactElement {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)

  React.useEffect(() => {
    const canvas = canvasRef.current
    const preset = getProceduralWallpaper(id)
    onReady?.(false)
    if (!canvas || !preset) { onError?.('这个内置动态壁纸不存在了，请重新选择'); return }
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, preserveDrawingBuffer: false, powerPreference: 'low-power' })
    if (!gl) { onError?.('显卡不支持 WebGL，无法显示动态壁纸'); return }

    let program: WebGLProgram | null = null
    let buffer: WebGLBuffer | null = null
    try {
      program = gl.createProgram()
      if (!program) throw new Error('无法创建着色器程序')
      gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, 'attribute vec2 p;void main(){gl_Position=vec4(p,0.0,1.0);}'))
      gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, buildProceduralShader(preset)))
      gl.linkProgram(program)
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? '着色器链接失败')
      gl.useProgram(program)
      buffer = gl.createBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
      const loc = gl.getAttribLocation(program, 'p')
      gl.enableVertexAttribArray(loc)
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
    } catch (error) {
      onError?.(error instanceof Error ? error.message : '动态壁纸初始化失败')
      return
    }

    const uRes = gl.getUniformLocation(program, 'u_res')
    const uTime = gl.getUniformLocation(program, 'u_time')
    const uLight = gl.getUniformLocation(program, 'u_light')
    const root = document.documentElement
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    // 每次打开从随机位置开始，避免每次启动都是同一个画面
    const timeOffset = Math.random() * 600
    const start = performance.now()
    let raf = 0
    let last = 0
    let ready = false

    const resize = (): void => {
      const w = Math.max(1, Math.round(canvas.clientWidth * RENDER_SCALE))
      const h = Math.max(1, Math.round(canvas.clientHeight * RENDER_SCALE))
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h }
      gl.viewport(0, 0, w, h)
    }

    const draw = (now: number): void => {
      resize()
      gl.uniform2f(uRes, canvas.width, canvas.height)
      gl.uniform1f(uTime, timeOffset + (now - start) / 1000)
      gl.uniform1f(uLight, forceDark || root.classList.contains('dark') ? 0 : 1)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      if (!ready) { ready = true; onReady?.(true) }
    }

    const paused = (): boolean => pauseHidden && (document.hidden || !document.hasFocus())

    const loop = (now: number): void => {
      raf = 0
      if (paused()) return
      const cap = root.hasAttribute('data-roy-reduced-effects') ? REPLYING_FPS : Math.max(1, fps)
      if (now - last >= 1000 / cap - 1) { last = now; draw(now) }
      raf = requestAnimationFrame(loop)
    }

    const sync = (): void => {
      if (reduceMotion.matches) { if (raf) cancelAnimationFrame(raf); raf = 0; draw(performance.now()); return }
      if (paused()) { if (raf) cancelAnimationFrame(raf); raf = 0; return }
      if (!raf) raf = requestAnimationFrame(loop)
    }

    draw(performance.now())
    sync()
    // 主题切换时静止状态下也要重画一帧
    const themeObserver = new MutationObserver(() => { if (!raf) draw(performance.now()) })
    themeObserver.observe(root, { attributes: true, attributeFilter: ['class'] })
    const resizeObserver = new ResizeObserver(() => { if (!raf) draw(performance.now()) })
    resizeObserver.observe(canvas)
    document.addEventListener('visibilitychange', sync)
    window.addEventListener('blur', sync)
    window.addEventListener('focus', sync)
    reduceMotion.addEventListener('change', sync)

    return () => {
      if (raf) cancelAnimationFrame(raf)
      themeObserver.disconnect()
      resizeObserver.disconnect()
      document.removeEventListener('visibilitychange', sync)
      window.removeEventListener('blur', sync)
      window.removeEventListener('focus', sync)
      reduceMotion.removeEventListener('change', sync)
      if (buffer) gl.deleteBuffer(buffer)
      if (program) gl.deleteProgram(program)
    }
  }, [id, fps, pauseHidden, onReady, onError, forceDark])

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" style={{ imageRendering: 'auto' }} />
}
