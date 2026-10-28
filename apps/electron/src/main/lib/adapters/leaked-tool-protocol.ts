/** Only detect leaked protocol; never interpret text as executable tool calls. */
const MARKER = /<\s*\/?\s*(?:[|｜]\s*)+DSML\s*(?:[|｜]\s*)+(?:calls|invoke|parameter)\b/i

/** Hide code examples from detection, including unfinished fenced code while streaming. */
function maskExamples(text: string): string {
  let fence: string | undefined
  return text.split('\n').map(line => {
    const match = /^\s*(`{3,}|~{3,})/.exec(line)
    if (fence) {
      if (match && match[1]![0] === fence[0] && match[1]!.length >= fence.length) fence = undefined
      return ' '.repeat(line.length)
    }
    if (match) { fence = match[1]; return ' '.repeat(line.length) }
    return line.replace(/(`+)([^`]*?)\1/g, m => ' '.repeat(m.length))
  }).join('\n')
}
export function leakedProtocolIndex(text: string): number {
  return maskExamples(text).search(MARKER)
}
export function hasLeakedProtocol(text: string): boolean { return leakedProtocolIndex(text) >= 0 }
export function stripProtocol(text: string): string {
  const index = leakedProtocolIndex(text)
  // Once an actual protocol starts, everything following is untrusted protocol payload.
  return index < 0 ? text : text.slice(0, index)
}
export const PROTOCOL_NOTICE = '工具调用格式异常：这段调用文本没有被执行。'
export function visibleProtocolText(text: string): string {
  return hasLeakedProtocol(text) ? stripProtocol(text).trimEnd() + '\n\n' + PROTOCOL_NOTICE : text
}
/** Buffer only potentially incomplete markup, so tokens split across network chunks cannot leak. */
export class ProtocolTextStream {
  private raw = ''
  private sent = ''
  push(chunk: string): string {
    this.raw += chunk
    let visible = stripProtocol(this.raw)
    if (!hasLeakedProtocol(this.raw)) {
      const masked = maskExamples(this.raw)
      const tail = /<\s*\/?\s*(?:(?:[|｜]\s*)+(?:D(?:S(?:M(?:L)?)?)?)?(?:\s*[|｜])*\s*(?:[a-z]*)?)?$/i.exec(masked)
      if (tail) visible = visible.slice(0, tail.index)
      // An unfinished inline code span must not temporarily look like an executable protocol.
      const line = this.raw.slice(this.raw.lastIndexOf('\n') + 1)
      if ((line.match(/`/g)?.length ?? 0) % 2) {
        const start = this.raw.lastIndexOf('`')
        if (start >= this.sent.length) visible = visible.slice(0, start)
      }
    }
    const delta = visible.startsWith(this.sent) ? visible.slice(this.sent.length) : ''
    this.sent += delta
    return delta
  }
  finish(text = this.raw): string { return visibleProtocolText(text) }
}
