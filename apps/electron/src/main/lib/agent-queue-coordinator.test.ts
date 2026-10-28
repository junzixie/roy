import { describe, expect, it } from 'bun:test'
import { AgentQueueCoordinator } from './agent-queue-coordinator'

type FakeWebContents = { isDestroyed: () => boolean; send: () => void }

function createEntry(sessionId: string, queueMessageId: string) {
  return {
    queueMessageId,
    sessionId,
    userMessage: queueMessageId,
    rawUserMessage: queueMessageId,
    channelId: 'channel',
    dispatch: 'now' as const,
  }
}

function createCoordinator(options: { destroyed?: boolean } = {}) {
  const started: string[] = []
  const webContents: FakeWebContents = {
    isDestroyed: () => options.destroyed === true,
    send: () => {},
  }
  let generation = 0
  const coordinator = new AgentQueueCoordinator({
    isActive: () => false,
    getWebContents: () => webContents as unknown as never,
    startRun: async (input) => {
      started.push(input.queueMessageId)
    },
    sendStarted: () => {},
    reserveRunGeneration: () => {
      generation += 1
      return generation
    },
  })
  return { coordinator, started }
}

describe('AgentQueueCoordinator 停止后的派发恢复', () => {
  it('Given 队列占位被 stopAgent 释放 When 再次派发 Then 队列继续执行', async () => {
    const { coordinator, started } = createCoordinator()
    coordinator.enqueue(createEntry('s1', 'm1'))
    coordinator.enqueue(createEntry('s1', 'm2'))

    // 模拟运行中：第一条已进入 dispatching，第二条留在队列里。
    expect(coordinator.isDispatching('s1')).toBe(true)

    // 用户点停止：orchestrator.stop 不会动 coordinator，必须由 stopAgent 释放占位。
    coordinator.releaseDispatch('s1')
    expect(coordinator.isDispatching('s1')).toBe(false)

    coordinator.onTargetAvailable('s1')
    // startRun 在微任务里执行，需要让出事件循环后再断言。
    await new Promise((resolve) => setTimeout(resolve, 0))
    // finishDispatch 会接力派发下一条，因此队列被完整跑完。
    expect(started).toEqual(['m1', 'm2'])
  })

  it('Given renderer 长期不可用 When 重试达到上限 Then 消息仍保留在队列中而不是凭空消失', () => {
    const { coordinator } = createCoordinator({ destroyed: true })
    coordinator.enqueue(createEntry('s1', 'm1'))

    for (let i = 0; i < 8; i += 1) coordinator.onTargetAvailable('s1')

    expect(coordinator.hasPending('s1')).toBe(true)
    expect(coordinator.snapshot('s1').map((item) => item.input.queueMessageId)).toEqual(['m1'])
  })
})
