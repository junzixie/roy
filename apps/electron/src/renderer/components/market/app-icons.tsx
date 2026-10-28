/**
 * 市场 / 伙伴共用的图标（照 ZCode 插件页：圆角方块 + 品牌色）
 *
 * 匹配顺序：
 * 1. 品牌图形（simple-icons 抽出来的，见 brand-icons.ts）
 * 2. 没收录图形的国内服务：品牌色方块 + 一个字（钉钉、飞书、腾讯会议…）
 * 3. 文档类型：Word 蓝、Excel 绿、PPT 橙、PDF 红
 * 4. 都认不出：按分类的彩色方块 + 线条图标
 *
 * 只按名字 / 标识匹配，不扫长说明（说明里常顺带提到 GitHub 之类，会认错）。
 */

import React from 'react'
import {
  BarChart3, Bot, Box, BrainCircuit, Clapperboard, Code2, FileText, Globe, GraduationCap, Landmark,
  Megaphone, Palette, PenLine, PlugZap, Presentation, Search, Shield, Sheet, Sparkles, Wrench, Workflow,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { BRAND_ICONS } from './brand-icons'

const TEXT_BRANDS: Array<{ re: RegExp; text: string; hex: string; title: string }> = [
  { re: /dingtalk|钉钉/i, text: '钉', hex: '3296FA', title: '钉钉' },
  { re: /\blark\b|feishu|飞书/i, text: '飞', hex: '3370FF', title: '飞书' },
  { re: /tencent[- ]?meeting|腾讯会议|wemeet/i, text: '会', hex: '006EFF', title: '腾讯会议' },
  { re: /tencent[- ]?docs|腾讯文档/i, text: '文', hex: '1E6FFF', title: '腾讯文档' },
  { re: /tencent[- ]?survey|腾讯问卷/i, text: '问', hex: '0052D9', title: '腾讯问卷' },
  { re: /weiyun|微云/i, text: '云', hex: '2E88FF', title: '微云' },
  { re: /cloudbase|tencent[- ]?cloud|腾讯云|edgeone/i, text: '腾', hex: '006EFF', title: '腾讯云' },
  { re: /kdocs|\bwps\b|金山文档/i, text: 'W', hex: 'E54D42', title: '金山文档' },
  { re: /\bima\b|ima[- ]mcp/i, text: 'ima', hex: '2F6BFF', title: 'ima' },
  { re: /lexiang|乐享/i, text: '乐', hex: '00A870', title: '乐享' },
  { re: /jinshuju|金数据/i, text: '金', hex: '1DA57A', title: '金数据' },
  { re: /mastergo/i, text: 'M', hex: '1F1F1F', title: 'MasterGo' },
  { re: /\bwind\b|万得/i, text: 'W', hex: 'C8102E', title: 'Wind 万得' },
  { re: /hexin|同花顺/i, text: '同', hex: 'E60012', title: '同花顺' },
  { re: /tianyancha|天眼查|\btyc\b/i, text: '天', hex: '0084FF', title: '天眼查' },
  { re: /\bqcc\b|企查查/i, text: '企', hex: '1677FF', title: '企查查' },
  { re: /pkulaw|北大法宝/i, text: '法', hex: '9E1F24', title: '北大法宝' },
  { re: /hyper3d|rodin/i, text: 'R', hex: '111111', title: 'Hyper3D Rodin' },
  { re: /tripo/i, text: 'T', hex: '5B4BFF', title: 'Tripo' },
  { re: /\bzcode\b|zcode[- ]/i, text: 'Z', hex: '1F1F1F', title: 'ZCode' },
  { re: /\broy\b/i, text: 'R', hex: '30A46C', title: 'Roy' },
]

const DOC_TILES: Array<{ re: RegExp; Icon?: LucideIcon; text?: string; hex: string }> = [
  { re: /\bdocx\b|\bword\b|word ?文档|wordcraft|\bdocuments?\b/i, Icon: FileText, hex: '2B579A' },
  { re: /\bxlsx\b|\bexcel\b|spreadsheets?|电子表格|gridcraft/i, Icon: Sheet, hex: '217346' },
  { re: /\bpptx\b|powerpoint|presentations?|演示|deckcraft|\bslides?\b/i, Icon: Presentation, hex: 'D24726' },
  { re: /\bpdf\b|pdfcraft/i, text: 'PDF', hex: 'E5252A' },
]

const CATEGORY_TILES: Record<string, { Icon: LucideIcon; hex: string }> = {
  视频制作: { Icon: Clapperboard, hex: 'E5484D' },
  设计创作: { Icon: Palette, hex: '8E4EC6' },
  写代码: { Icon: Code2, hex: '3E63DD' },
  工程流程: { Icon: Workflow, hex: '0090FF' },
  文档办公: { Icon: FileText, hex: '2B579A' },
  内容写作: { Icon: PenLine, hex: 'F76B15' },
  数据分析: { Icon: BarChart3, hex: '12A594' },
  浏览器与自动化: { Icon: Globe, hex: '0091FF' },
  知识与学习: { Icon: GraduationCap, hex: '6E56CF' },
  'Roy 平台': { Icon: Bot, hex: '30A46C' },
  自媒体: { Icon: Megaphone, hex: 'E93D82' },
  金融: { Icon: Landmark, hex: 'B08A3E' },
  '3D': { Icon: Box, hex: '1F1F1F' },
  安全: { Icon: Shield, hex: 'D6409F' },
  研究: { Icon: Search, hex: '0D74CE' },
  实用工具: { Icon: Wrench, hex: '6F6E77' },
  AI: { Icon: BrainCircuit, hex: '6E56CF' },
  MCP: { Icon: PlugZap, hex: '5B5BD6' },
}

function isLight(hex: string): boolean {
  const n = parseInt(hex, 16)
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.72
}

type Resolved =
  | { kind: 'brand'; hex: string; path: string; title: string }
  | { kind: 'text'; hex: string; text: string; title?: string }
  | { kind: 'icon'; hex: string; Icon: LucideIcon }

const cache = new Map<string, Resolved>()

export function resolveAppIcon(name: string, category = ''): Resolved {
  const key = `${name}\u0000${category}`
  const hit = cache.get(key)
  if (hit) return hit
  const text = name.trim()
  let r: Resolved | undefined
  const tb = TEXT_BRANDS.find((x) => x.re.test(text))
  const b = tb ? undefined : BRAND_ICONS.find((x) => x.re.test(text))
  if (b) r = { kind: 'brand', hex: b.hex, path: b.path, title: b.title }
  else if (tb) r = { kind: 'text', hex: tb.hex, text: tb.text, title: tb.title }
  else {
    const d = DOC_TILES.find((x) => x.re.test(text))
    if (d) r = d.Icon ? { kind: 'icon', hex: d.hex, Icon: d.Icon } : { kind: 'text', hex: d.hex, text: d.text ?? '' }
  }
  if (!r) {
    const c = CATEGORY_TILES[category] ?? CATEGORY_TILES[category.replace(/精选$/, '')]
    r = c ? { kind: 'icon', hex: c.hex, Icon: c.Icon } : { kind: 'icon', hex: '6F6E77', Icon: Sparkles }
  }
  if (cache.size > 4000) cache.clear()
  cache.set(key, r)
  return r
}

/**
 * 圆角方块图标。
 * name：名字 + 标识（可以拼在一起传）；category：认不出品牌时按它选颜色。
 */
export function AppIcon({ name = '', category = '', size = 36, className }: { name?: string; category?: string; size?: number; className?: string }): React.ReactElement {
  const r = resolveAppIcon(name, category)
  const light = isLight(r.hex)
  const fg = light ? '#1f1f1f' : '#ffffff'
  const bg = r.kind === 'brand' ? `#${r.hex}` : `linear-gradient(135deg, #${r.hex}, color-mix(in srgb, #${r.hex} 78%, black))`
  const glyph = Math.round(size * 0.52)
  return (
    <span
      aria-hidden
      title={r.kind !== 'icon' ? r.title : undefined}
      className={cn('grid shrink-0 place-items-center overflow-hidden shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]', light && 'ring-1 ring-border', className)}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.28), background: bg, color: fg }}
    >
      {r.kind === 'brand' ? (
        <svg viewBox="0 0 24 24" width={glyph} height={glyph} fill="currentColor"><path d={r.path} /></svg>
      ) : r.kind === 'text' ? (
        <span className="font-semibold leading-none tracking-tight" style={{ fontSize: Math.round(size * (r.text.length > 2 ? 0.3 : r.text.length === 2 ? 0.36 : 0.46)) }}>{r.text}</span>
      ) : (
        React.createElement(r.Icon, { size: glyph, strokeWidth: 1.9 })
      )}
    </span>
  )
}
