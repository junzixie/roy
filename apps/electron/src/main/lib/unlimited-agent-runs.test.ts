import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
test('编排入口不再读取旧全局任务数量限制，但保留同会话保护', () => {
 const source=readFileSync(new URL('./agent-orchestrator.ts', import.meta.url),'utf8')
 expect(source).not.toContain('appSettings.agentMaxConcurrentRuns')
 expect(source).not.toContain('this.runQueue.push')
 expect(source).toContain('this.activeSessions.has(sessionId)')
})
