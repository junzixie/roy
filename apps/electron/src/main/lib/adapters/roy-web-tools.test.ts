import { describe, expect, test } from 'bun:test'
import { htmlToReadableText, isBlockedFetchHost, parseBingResults, parseDuckDuckGoResults } from './roy-web-tools'

describe('Roy web tools', () => {
  test('parses Bing result blocks', () => {
    const html = '<ol><li class="b_algo"><h2><a href="https://example.com/a?x=1&amp;y=2">Hello <strong>World</strong></a></h2><div class="b_caption"><p>Snippet &amp; more</p></div></li></ol>'
    expect(parseBingResults(html)).toEqual([{ title: 'Hello World', url: 'https://example.com/a?x=1&y=2', snippet: 'Snippet & more' }])
  })
  test('parses DuckDuckGo redirect links', () => {
    const html = '<a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.org%2Fdoc&amp;rut=1">Doc</a><a class="result__snippet" href="#">Body text</a>'
    expect(parseDuckDuckGoResults(html)).toEqual([{ title: 'Doc', url: 'https://example.org/doc', snippet: 'Body text' }])
  })
  test('extracts readable text without scripts', () => {
    const r = htmlToReadableText('<html><title>T &amp; X</title><script>evil()</script><p>Line 1</p><p>Line&nbsp;2</p></html>')
    expect(r.title).toBe('T & X')
    expect(r.text).not.toContain('evil')
    expect(r.text).toContain('Line 1')
    expect(r.text).toContain('Line 2')
  })
  test('blocks local and private hosts', () => {
    for (const h of ['localhost', '127.0.0.1', '10.0.0.5', '192.168.1.1', '172.20.0.1', '169.254.169.254', '[::1]', 'printer.local']) expect(isBlockedFetchHost(h)).toBe(true)
    for (const h of ['example.com', '8.8.8.8', '172.32.0.1', 'github.com']) expect(isBlockedFetchHost(h)).toBe(false)
  })
})
