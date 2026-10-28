import type { SDKContentBlock, SDKTextBlock } from '@roy/shared'
/** 只对独立行起始的思考标签做兼容，代码围栏和行内代码原样保留。输入为累计文本，可跨流片段重算。 */
export function parseThinkTagsFromText(text: string): Array<{ type: 'text'; text: string } | { type: 'thinking'; thinking: string }> {
  const blocks: Array<{ type: 'text'; text: string } | { type: 'thinking'; thinking: string }> = []
  let mode: 'text' | 'thinking' = 'text'
  let buffer = ''
  let fence = ''
  let protocol = false
  const flush = () => { if (buffer) blocks.push(mode === 'text' ? { type: 'text', text: buffer } : { type: 'thinking', thinking: buffer }); buffer = '' }
  for (const line of text.split(/(?<=\n)/)) {
    const marker = line.match(/^\s*(`{3,}|~{3,})/)
    if (mode === 'text' && marker) {
      if (!fence) fence = marker[1]![0]!
      else if (marker[1]![0] === fence) fence = ''
      buffer += line; continue
    }
    if (fence) { buffer += line; continue }
    let rest = line
    // 仅隔离独立行起始的原始工具协议，代码围栏中的示例保留。
    if (protocol || /^\s*<\s*[|｜]\s*DSML\s*[|｜]/i.test(rest)) {
      protocol = true
      const end = rest.match(/<\/\s*[|｜]\s*DSML\s*[|｜]\s*calls\s*>/i)
      if (!end) continue
      rest = rest.slice(end.index! + end[0].length)
      protocol = false
    }
    if (mode === 'text') {
      const open = rest.match(/^\s*<(thinking|think)>/i)
      if (!open) { buffer += rest.replace(/^\s*<\/(?:thinking|think)>/i, ''); continue }
      flush(); mode = 'thinking'; rest = rest.slice(open[0].length)
    }
    const close = rest.match(/<\/(thinking|think)>/i)
    if (close) {
      buffer += rest.slice(0, close.index); flush(); mode = 'text'; buffer += rest.slice(close.index! + close[0].length)
    } else buffer += rest
  }
  // 流式尚未收齐的起始标签暂不显示，下一片到来时从累计文本重新解析。
  if (mode === 'text') buffer = buffer.replace(/(^|\n)\s*<(?:t(?:h(?:i(?:n(?:k(?:i(?:n(?:g)?)?)?)?)?)?)?)?$/i, '$1')
  if (mode === 'text') buffer = buffer.replace(/(^|\n)\s*<[|｜](?:D(?:S(?:M(?:L)?)?)?)?(?:[|｜])?$/i, '$1')
  flush()
  return blocks
}

export function splitThinkTagsInTextBlock(block: SDKTextBlock): SDKContentBlock[] {
  return parseThinkTagsFromText(block.text)
}
export function normalizeThinkTagsInContentBlocks(blocks: SDKContentBlock[]): SDKContentBlock[] {
  return blocks.flatMap(block => {
    if (block.type === 'text') return splitThinkTagsInTextBlock(block as SDKTextBlock)
    if (block.type === 'thinking' && 'thinking' in block && typeof block.thinking === 'string') {
      const thinking = parseThinkTagsFromText(block.thinking).map(part => part.type === 'text' ? part.text : part.thinking).join('')
      return thinking ? [{ ...block, thinking }] : []
    }
    return [block]
  })
}
