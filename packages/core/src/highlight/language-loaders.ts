/**
 * Shiki 语言按需加载
 *
 * 只用显式导入的语言，避免 `bundledLanguages` / `loadLanguage(string)`
 * 把 shiki 全部 700+ 个语言包都静态拉进产物——那会让安装包多出几十 MB。
 *
 * 新增语言时在这里加一行即可，Vite 会为它切出独立的按需 chunk。
 */

import type { BundledLanguage } from 'shiki/types'

type LangLoader = () => Promise<unknown>

/** 需要支持的语言：按使用频率排序，冷门语言走纯文本回退 */
const LANG_LOADERS: Record<string, LangLoader> = {
  javascript: () => import('shiki/langs/javascript.mjs'),
  typescript: () => import('shiki/langs/typescript.mjs'),
  tsx: () => import('shiki/langs/tsx.mjs'),
  jsx: () => import('shiki/langs/jsx.mjs'),
  json: () => import('shiki/langs/json.mjs'),
  python: () => import('shiki/langs/python.mjs'),
  java: () => import('shiki/langs/java.mjs'),
  go: () => import('shiki/langs/go.mjs'),
  rust: () => import('shiki/langs/rust.mjs'),
  c: () => import('shiki/langs/c.mjs'),
  cpp: () => import('shiki/langs/cpp.mjs'),
  csharp: () => import('shiki/langs/csharp.mjs'),
  php: () => import('shiki/langs/php.mjs'),
  ruby: () => import('shiki/langs/ruby.mjs'),
  swift: () => import('shiki/langs/swift.mjs'),
  kotlin: () => import('shiki/langs/kotlin.mjs'),
  scala: () => import('shiki/langs/scala.mjs'),
  dart: () => import('shiki/langs/dart.mjs'),
  html: () => import('shiki/langs/html.mjs'),
  css: () => import('shiki/langs/css.mjs'),
  scss: () => import('shiki/langs/scss.mjs'),
  less: () => import('shiki/langs/less.mjs'),
  vue: () => import('shiki/langs/vue.mjs'),
  svelte: () => import('shiki/langs/svelte.mjs'),
  markdown: () => import('shiki/langs/markdown.mjs'),
  yaml: () => import('shiki/langs/yaml.mjs'),
  toml: () => import('shiki/langs/toml.mjs'),
  xml: () => import('shiki/langs/xml.mjs'),
  sql: () => import('shiki/langs/sql.mjs'),
  graphql: () => import('shiki/langs/graphql.mjs'),
  shellscript: () => import('shiki/langs/shellscript.mjs'),
  powershell: () => import('shiki/langs/powershell.mjs'),
  docker: () => import('shiki/langs/docker.mjs'),
  ini: () => import('shiki/langs/ini.mjs'),
  diff: () => import('shiki/langs/diff.mjs'),
  lua: () => import('shiki/langs/lua.mjs'),
  perl: () => import('shiki/langs/perl.mjs'),
  r: () => import('shiki/langs/r.mjs'),
  objectivec: () => import('shiki/langs/objective-c.mjs'),
  zig: () => import('shiki/langs/zig.mjs'),
  elixir: () => import('shiki/langs/elixir.mjs'),
  haskell: () => import('shiki/langs/haskell.mjs'),
  clojure: () => import('shiki/langs/clojure.mjs'),
  makefile: () => import('shiki/langs/make.mjs'),
  protobuf: () => import('shiki/langs/proto.mjs'),
}

/** 别名 → 规范语言名 */
const ALIASES: Record<string, string> = {
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  kt: 'kotlin',
  kts: 'kotlin',
  sh: 'shellscript',
  bash: 'shellscript',
  zsh: 'shellscript',
  shell: 'shellscript',
  ps1: 'powershell',
  pwsh: 'powershell',
  yml: 'yaml',
  md: 'markdown',
  mdx: 'markdown',
  'c++': 'cpp',
  cc: 'cpp',
  h: 'c',
  hpp: 'cpp',
  'c#': 'csharp',
  cs: 'csharp',
  objc: 'objectivec',
  proto: 'protobuf',
  make: 'makefile',
  dockerfile: 'docker',
  console: 'shellscript',
  text: 'text',
  txt: 'text',
}

/** 已注册到 highlighter 的语言名，避免重复加载 */
const loaded = new Set<string>()

/** 该语言是否有对应的按需 chunk */
export function hasLanguageLoader(lang: string): boolean {
  return normalizeLanguage(lang) in LANG_LOADERS
}

/** 把用户书写的语言名归一化为规范名；无法识别返回 null */
export function normalizeLanguage(lang: string): string {
  const key = lang.trim().toLowerCase()
  if (!key) return ''
  return ALIASES[key] ?? key
}

/**
 * 加载指定语言到 highlighter 实例。
 *
 * shiki 的 `loadLanguage` 支持传入语言定义对象，
 * 这里先用动态 import 拿到定义，再注册，避免走全量注册表。
 */
export async function ensureLanguage(
  highlighter: {
    loadLanguage: (input: never) => Promise<void>
    getLoadedLanguages: () => string[]
  },
  lang: string,
): Promise<string> {
  const canonical = normalizeLanguage(lang)
  if (!canonical) return 'text'
  if (canonical === 'text') return 'text'

  const loader = LANG_LOADERS[canonical]
  if (!loader) return 'text'

  if (loaded.has(canonical) || highlighter.getLoadedLanguages().includes(canonical)) {
    return canonical
  }

  try {
    const mod = await loader()
    // shiki 语言模块默认导出即为语言定义
    const definition = (mod as { default?: unknown }).default ?? mod
    await highlighter.loadLanguage(definition as never)
    loaded.add(canonical)
    return canonical
  } catch (error) {
    console.warn(`[shiki] 加载语言 "${canonical}" 失败，回退到 text`, error)
    return 'text'
  }
}

/** 预先加载一批语言（首屏默认语言），失败不抛错 */
export async function ensureLanguages(
  highlighter: {
    loadLanguage: (input: never) => Promise<void>
    getLoadedLanguages: () => string[]
  },
  langs: readonly string[],
): Promise<void> {
  await Promise.all(langs.map((lang) => ensureLanguage(highlighter, lang).catch(() => 'text')))
}

export type { BundledLanguage }
