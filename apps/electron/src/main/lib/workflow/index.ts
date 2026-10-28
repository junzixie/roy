/** Roy 内置轻量工作流，旧目录名仅用于兼容已保存数据及 IPC。 */
import { WorkflowExecutor } from './engine/executor'
import { executeLightNode, lightNodeTypes, settleRemembered } from './light-nodes'
export const workflowExecutor = new WorkflowExecutor(settleRemembered)
export function registerBuiltinNodes() {
  for (const node of lightNodeTypes) workflowExecutor.registerNode(node.type, { execute: (inputs, runtime) => executeLightNode(node.type, inputs, runtime) })
}
registerBuiltinNodes()
export * from './engine/executor'
export * from './nodes/base/base-node'
