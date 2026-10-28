/**
 * 一轮回复里「还在输出」的块。
 *
 * 整轮运行中，只有最后一个块可能还在输出；前面的思考、正文都已经结束。
 * 之前把整轮的流式状态传给每个思考块，导致早就想完的块一直显示「思考中 N 秒」并计时到整轮结束。
 * 最后一个块是隐藏的任务进度工具时，说明前面的思考也已经结束，不再找前一个可见块。
 */
export function findLiveBlockIndex(blocks: readonly unknown[], isStreaming: boolean | undefined): number {
  if (!isStreaming || blocks.length === 0) return -1
  return blocks.length - 1
}
