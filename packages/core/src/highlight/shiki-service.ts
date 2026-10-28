/**
 * Shiki 语法高亮服务
 *
 * 提供懒加载的 Shiki 高亮器单例，支持按需加载语言。
 * 纯逻辑层，不依赖 React。
 *
 * 三套 API：
 * - highlightCode()      异步 HTML，首次初始化 + 按需加载语言
 * - highlightCodeSync()  同步 HTML，初始化完成后零延迟
 * - highlightToTokens()  同步 token 结构，适合逐行 React 渲染（流式最优）
 */

import { ensureLanguage, hasLanguageLoader, normalizeLanguage } from './language-loaders'
import type { HighlighterGeneric, BundledLanguage, BundledTheme } from 'shiki/types'

/** Shiki 高亮器实例类型 */
type ShikiHighlighter = HighlighterGeneric<BundledLanguage, BundledTheme>

/** 默认加载的主题 */
/** 常见语言别名映射 */
const LANGUAGE_ALIASES: Record<string, string> = {
  sh: 'shellscript',
  bash: 'shellscript',
  shell: 'shellscript',
  zsh: 'shellscript',
  js: 'javascript',
  ts: 'typescript',
  py: 'python',
  rb: 'ruby',
  yml: 'yaml',
  'c++': 'cpp',
  'c#': 'csharp',
  cs: 'csharp',
  kt: 'kotlin',
  rs: 'rust',
  md: 'markdown',
  tf: 'terraform',
  dockerfile: 'docker',
  plaintext: 'text',
  txt: 'text',
  plain: 'text',
}

/** 高亮选项 */
export interface HighlightOptions {
  /** 代码内容 */
  code: string
  /** 语言标识（如 'typescript'、'py'、'bash'） */
  language: string
  /** Shiki 主题名，默认 'github-dark' */
  theme?: string
}

/** 高亮结果（HTML 字符串） */
export interface HighlightResult {
  /** Shiki 渲染的 HTML 字符串 */
  html: string
  /** 实际使用的语言（经过别名解析和 fallback） */
  language: string
}

/** 不规则语言显示名称（无法通过首字母大写自动生成） */
const DISPLAY_NAMES: Record<string, string> = {
  js: 'JavaScript', javascript: 'JavaScript',
  ts: 'TypeScript', typescript: 'TypeScript',
  tsx: 'TSX', jsx: 'JSX',
  py: 'Python', rb: 'Ruby',
  cpp: 'C++', 'c++': 'C++',
  cs: 'C#', csharp: 'C#',
  kt: 'Kotlin', rs: 'Rust',
  sh: 'Shell', zsh: 'Shell',
  yml: 'YAML', md: 'Markdown',
  tf: 'Terraform',
  html: 'HTML', css: 'CSS', scss: 'SCSS', less: 'LESS',
  json: 'JSON', xml: 'XML', sql: 'SQL',
  graphql: 'GraphQL', php: 'PHP',
  plaintext: 'Text', text: 'Text',
}

/** 获取语言显示名称，未匹配的自动首字母大写 */
export function getDisplayName(lang: string): string {
  if (!lang) return 'Code'
  const key = lang.toLowerCase()
  return DISPLAY_NAMES[key] ?? key.charAt(0).toUpperCase() + key.slice(1)
}

/** 单个高亮 token */
export interface HighlightToken {
  /** 文本内容 */
  content: string
  /** CSS 颜色值 */
  color?: string
}

/** 按行组织的 token 高亮结果（适合 React 逐行渲染） */
export interface HighlightTokensResult {
  /** 每行的 token 列表 */
  lines: HighlightToken[][]
  /** 代码区域背景色 */
  bgColor: string
  /** 代码区域前景色 */
  fgColor: string
  /** 实际使用的语言 */
  language: string
}

/** 单例高亮器 Promise */
let highlighterPromise: Promise<ShikiHighlighter> | null = null

/** 已 resolve 的高亮器实例缓存（同步访问用） */
let cachedHighlighter: ShikiHighlighter | null = null

/** 高亮器就绪订阅者，初始化完成后一次性触发并清空 */
const readyListeners = new Set<() => void>()

/** 是否已完成首次初始化（同步查询用） */
export function isHighlighterReady(): boolean {
  return cachedHighlighter !== null
}

/**
 * 订阅高亮器就绪事件
 * - 已就绪时立即同步触发回调，返回 noop unsubscribe
 * - 未就绪时入队，初始化完成后触发一次后自动清理
 * 返回 unsubscribe 函数，组件卸载时应调用以避免泄漏
 */
export function onHighlighterReady(callback: () => void): () => void {
  if (cachedHighlighter) {
    callback()
    return () => {}
  }
  readyListeners.add(callback)
  // 触发初始化（如果还没启动）
  void getHighlighter()
  return () => readyListeners.delete(callback)
}

/**
 * 获取或创建 Shiki 高亮器单例
 * 首次调用时懒加载，resolve 后缓存实例供同步使用，并通知所有 ready 订阅者
 */
function getHighlighter(): Promise<ShikiHighlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createCoreHighlighter()
  }
  return highlighterPromise
}

/**
 * 用 shiki/core 建高亮器
 *
 * shiki 主入口（'shiki'）本身就是 full bundle，会把 700+ 语言和语法引擎
 * 全部静态打包；改用 core + 显式语言定义后，只有真正用到的语言进产物。
 */
async function createCoreHighlighter(): Promise<ShikiHighlighter> {
  const [{ createHighlighterCore }, { createJavaScriptRegexEngine }] = await Promise.all([
    import('shiki/core'),
    import('shiki/engine/javascript'),
  ])

  const themes = await Promise.all([
    import('shiki/themes/github-light.mjs').then((m) => m.default).catch(() => null),
    import('shiki/themes/github-dark.mjs').then((m) => m.default).catch(() => null),
  ])
  const langs = await Promise.all([
    import('shiki/langs/javascript.mjs').then((m) => m.default).catch(() => null),
    import('shiki/langs/typescript.mjs').then((m) => m.default).catch(() => null),
    import('shiki/langs/tsx.mjs').then((m) => m.default).catch(() => null),
    import('shiki/langs/jsx.mjs').then((m) => m.default).catch(() => null),
    import('shiki/langs/json.mjs').then((m) => m.default).catch(() => null),
    import('shiki/langs/python.mjs').then((m) => m.default).catch(() => null),
    import('shiki/langs/java.mjs').then((m) => m.default).catch(() => null),
    import('shiki/langs/markdown.mjs').then((m) => m.default).catch(() => null),
    import('shiki/langs/html.mjs').then((m) => m.default).catch(() => null),
    import('shiki/langs/css.mjs').then((m) => m.default).catch(() => null),
    import('shiki/langs/shellscript.mjs').then((m) => m.default).catch(() => null),
    import('shiki/langs/go.mjs').then((m) => m.default).catch(() => null),
    import('shiki/langs/rust.mjs').then((m) => m.default).catch(() => null),
    import('shiki/langs/sql.mjs').then((m) => m.default).catch(() => null),
    import('shiki/langs/yaml.mjs').then((m) => m.default).catch(() => null),
    import('shiki/langs/toml.mjs').then((m) => m.default).catch(() => null),
    import('shiki/langs/c.mjs').then((m) => m.default).catch(() => null),
    import('shiki/langs/cpp.mjs').then((m) => m.default).catch(() => null),
  ])

  const hl = (await createHighlighterCore({
    themes: themes.filter(Boolean) as never,
    langs: langs.filter(Boolean) as never,
    engine: createJavaScriptRegexEngine(),
  })) as ShikiHighlighter

  cachedHighlighter = hl
  const listeners = Array.from(readyListeners)
  readyListeners.clear()
  for (const listener of listeners) {
    try {
      listener()
    } catch (error) {
      console.error('[shiki-service] ready listener 抛错:', error)
    }
  }
  return hl
}

/**
 * 解析语言别名，返回有效的 Shiki 语言标识
 * 未知语言返回 'text'
 */
function resolveLanguage(lang: string): string {
  const normalized = lang.toLowerCase().trim()
  const resolved = LANGUAGE_ALIASES[normalized] ?? normalized

  if (resolved === 'text') return 'text'
  // 不再用 bundledLanguages 判断（它会把全部语言包都拉进产物）。
  // 只有显式注册过 loader 的语言才参与高亮，其余退化成纯文本。
  const canonical = normalizeLanguage(resolved)
  return hasLanguageLoader(canonical) ? canonical : 'text'
}

/** 解析已加载的语言，未加载的 fallback 到 text */
function resolveLoadedLanguage(highlighter: ShikiHighlighter, lang: string): string {
  const resolved = resolveLanguage(lang)
  if (resolved === 'text') return 'text'
  return highlighter.getLoadedLanguages().includes(resolved) ? resolved : 'text'
}

/**
 * 解析语言别名并按需加载，返回可直接使用的语言标识
 * 未知语言自动 fallback 到 'text'
 */
async function resolveAndLoadLanguage(highlighter: ShikiHighlighter, lang: string): Promise<string> {
  const resolved = resolveLanguage(lang)

  if (resolved === 'text') return 'text'
  if (highlighter.getLoadedLanguages().includes(resolved)) return resolved

  // 走显式动态 import，避免 shiki 全量语言注册表被打进产物
  return ensureLanguage(highlighter as never, resolved)
}

/**
 * 异步高亮代码，返回 HTML 字符串（首次初始化 + 按需加载语言时使用）
 */
export async function highlightCode(options: HighlightOptions): Promise<HighlightResult> {
  const { code, language, theme = 'github-dark' } = options

  const highlighter = await getHighlighter()
  const resolvedLang = await resolveAndLoadLanguage(highlighter, language)

  const html = highlighter.codeToHtml(code, {
    lang: resolvedLang as BundledLanguage,
    theme: theme as BundledTheme,
  })

  return { html, language: resolvedLang }
}

/**
 * 同步高亮代码，返回 HTML 字符串
 * 返回 null 表示高亮器尚未初始化
 */
export function highlightCodeSync(options: HighlightOptions): HighlightResult | null {
  if (!cachedHighlighter) return null

  const { code, language, theme = 'github-dark' } = options
  const lang = resolveLoadedLanguage(cachedHighlighter, language)

  const html = cachedHighlighter.codeToHtml(code, {
    lang: lang as BundledLanguage,
    theme: theme as BundledTheme,
  })

  return { html, language: lang }
}

/**
 * 同步高亮代码，返回按行 token 结构（适合 React 逐行渲染，流式最优）
 *
 * 相比 highlightCodeSync 返回 HTML 字符串：
 * - 返回结构化 token 数据，由调用方渲染为 React 元素
 * - 配合稳定 key 实现增量 DOM 更新，流式输出只更新变化的行
 * - 返回 null 表示高亮器尚未初始化
 */
export function highlightToTokens(options: HighlightOptions): HighlightTokensResult | null {
  if (!cachedHighlighter) return null

  const { code, language, theme = 'github-dark' } = options
  const lang = resolveLoadedLanguage(cachedHighlighter, language)

  const result = cachedHighlighter.codeToTokens(code, {
    lang: lang as BundledLanguage,
    theme: theme as BundledTheme,
  })

  return {
    lines: result.tokens.map((line) =>
      line.map((token) => ({ content: token.content, color: token.color }))
    ),
    bgColor: result.bg ?? '#24292e',
    fgColor: result.fg ?? '#e1e4e8',
    language: lang,
  }
}
