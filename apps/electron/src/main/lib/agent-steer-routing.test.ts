import { expect, test } from 'bun:test'

/**
 * 三种派发意图的路由契约。
 *
 * 这里不启动真实 Agent，只固化「什么情况该走哪条路」的判断逻辑，
 * 防止以后改动把 steer 误写成 interrupt（那会打断正在跑的命令）。
 */

type Dispatch = 'after_current' | 'steer' | 'now'

interface RouteInput {
  dispatch: Dispatch
  interrupt?: boolean
  active: boolean
  modelChanged?: boolean
}

type Route = 'inject-now' | 'inject-steer' | 'enqueue'

/** 与 agent-service.ts 的 submitOrEnqueueAgentMessage 判断顺序保持一致 */
function route(input: RouteInput): Route {
  if (input.dispatch === 'steer' && input.active) {
    // 模型换了就不插，交给队列用新模型重开
    if (input.modelChanged) return 'enqueue'
    return 'inject-steer'
  }
  if (input.dispatch === 'now' && input.active) {
    if (input.modelChanged && input.interrupt) return 'enqueue'
    return 'inject-now'
  }
  return 'enqueue'
}

test('运行中默认派发走 steer，不打断当前工具', () => {
  expect(route({ dispatch: 'steer', active: true })).toBe('inject-steer')
})

test('steer 不带 interrupt 时才安全；带 interrupt 的是 now 模式', () => {
  // steer 模式即使误传 interrupt，也走 steer 分支，不会 abort
  expect(route({ dispatch: 'steer', active: true, interrupt: true })).toBe('inject-steer')
  // 只有 now + interrupt 才是强打断
  expect(route({ dispatch: 'now', active: true, interrupt: true })).toBe('inject-now')
})

test('会话空闲时一律进队列，由主进程决定何时启动', () => {
  expect(route({ dispatch: 'steer', active: false })).toBe('enqueue')
  expect(route({ dispatch: 'now', active: false })).toBe('enqueue')
  expect(route({ dispatch: 'after_current', active: false })).toBe('enqueue')
})

test('steer 遇到模型已切换：不注入旧模型，改为排队', () => {
  expect(route({ dispatch: 'steer', active: true, modelChanged: true })).toBe('enqueue')
})

test('after_current 永远排队，等本轮完全结束', () => {
  expect(route({ dispatch: 'after_current', active: true })).toBe('enqueue')
})
