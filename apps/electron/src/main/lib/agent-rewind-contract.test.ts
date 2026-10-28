import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

const viewSource = readFileSync(new URL('../../renderer/components/agent/AgentView.tsx', import.meta.url), 'utf-8')
const orchestratorSource = readFileSync(new URL('./agent-orchestrator.ts', import.meta.url), 'utf-8')
const rewindHandler = viewSource.slice(
  viewSource.indexOf('const handleRewindConfirm ='),
  viewSource.indexOf('}, [rewindTargetUuid, sessionId, store])'),
)
const rewindMethod = orchestratorSource.slice(
  orchestratorSource.indexOf('  async rewindSession('),
  orchestratorSource.indexOf('  /** 中止所有活跃的 Agent 会话'),
)
const applyFileRewind = orchestratorSource.slice(
  orchestratorSource.indexOf('  private applyFileRewind('),
  orchestratorSource.indexOf('  async rewindSession('),
)

// 静态契约检查：回退 = 截断对话 + 用写前检查点恢复 AI 改过的文件。
// 实际对话截断由 agent-session-manager.test.ts 覆盖，检查点恢复由 file-checkpoints.test.ts 覆盖。
describe('Pi 对话回退提示契约', () => {
  test('Given 回退会恢复文件 When 展示确认弹窗 Then 说清截断对话、恢复文件的范围，并保留不可撤销提醒', () => {
    expect(viewSource).toContain('回退将截断该消息之后的所有对话')
    expect(viewSource).toContain('AI 在这之后写过、改过的文件也会恢复成改之前的样子')
    // 命令行里改的文件没有检查点，必须提前告诉用户恢复不了
    expect(viewSource).toContain('命令行里改的不会')
    expect(viewSource).toContain('此操作不可撤销，确定要回退吗？')
  })

  test('Given 对话成功回退 When 恢复文件 Then 按恢复结果提示，部分失败给警告而不是报错', () => {
    expect(rewindHandler).toContain('restoreFiles: true')
    expect(rewindMethod).toContain('await rewindPiAgentSession(sessionId, assistantMessageUuid)')
    expect(rewindMethod).toContain('fileRewind: this.applyFileRewind(sessionId, cutAt, restoreFiles)')
    // 截断对话前先算好时间点，截断后就找不到那些消息了
    expect(rewindMethod.indexOf('this.rewindCutAt(')).toBeLessThan(rewindMethod.indexOf('rewindPiAgentSession('))
    expect(rewindMethod).not.toMatch(/error\s*:/)
    expect(rewindHandler).toContain("toast.success('已回退到此处'")
    expect(rewindHandler).toContain("toast.warning('已回退对话'")
  })

  test('Given 不恢复文件 When 回退 Then 丢弃之后的检查点，不残留可被误恢复的备份', () => {
    expect(applyFileRewind).toContain('dropCheckpointsAfter(sessionId, cutAt)')
    expect(applyFileRewind).toContain('restoreCheckpoints(sessionId, cutAt)')
  })

  test('Given 对话回退真的失败 When 捕获异常 Then 仍展示错误且保留运行中与无会话 ID 校验', () => {
    expect(rewindHandler).toContain('catch (error)')
    expect(rewindHandler).toContain("toast.error('回退失败'")
    expect(rewindMethod).toContain("throw new Error('会话正在运行中，请停止后再回退')")
    expect(rewindMethod).toContain("throw new Error('会话没有 Pi session ID，无法回退')")
  })
})
