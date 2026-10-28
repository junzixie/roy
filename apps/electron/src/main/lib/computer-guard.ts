/**
 * 电脑控制的安全与经验辅助（不依赖 Electron，便于单测）
 *
 * 1. 画面过期拦截：前台坐标操作（点击 / 拖动 / 滚动 / 移动）用的是「最近一次截图」上的坐标。
 *    截图之后前台窗口换了、挪了或者截图太旧，坐标就可能对不上，这时拒绝执行，让 AI 先重新截图。
 * 2. 错误翻译：把输入助手 / 系统的原始报错翻成中文原因和下一步建议。
 * 3. App 操作经验：按软件记录「怎么操作最顺」，下次操作同一个软件先读。
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// ---------- 1. 画面过期拦截 ----------

export interface ForegroundInfo { h: number; t?: string; x?: number; y?: number; w?: number; hh?: number }
export interface ScreenSnapshot { at: number; fg: ForegroundInfo | null }

/** 截图超过这个时间就不再信任上面的坐标 */
export const SCREEN_MAX_AGE_MS = 3 * 60_000
/** 窗口位置 / 大小变化超过这么多像素就算挪过 */
const MOVE_TOLERANCE_PX = 8

const title = (fg: ForegroundInfo | null | undefined): string => (fg?.t?.trim() ? fg.t.trim().slice(0, 40) : '无标题窗口')

/**
 * 返回拒绝执行的原因；可以执行时返回 null。
 * current 读不到（助手异常）时不拦，避免因为检查本身出错而完全不能操作。
 */
export function staleScreenReason(prev: ScreenSnapshot | undefined, current: ForegroundInfo | null, now = Date.now()): string | null {
  const redo = '先用 computer_screenshot 重新看一眼，再按新截图上的位置操作。'
  if (!prev) return `还没有截过屏，不知道该点哪里。${redo}`
  const age = now - prev.at
  if (age > SCREEN_MAX_AGE_MS) return `上一张截图已经是 ${Math.round(age / 60_000)} 分钟前的了，屏幕可能已经变了。${redo}`
  if (!prev.fg || !current || !prev.fg.h || !current.h) return null
  if (prev.fg.h !== current.h) return `截图之后前台窗口从「${title(prev.fg)}」变成了「${title(current)}」，截图上的位置可能对不上了。${redo}`
  const moved = ['x', 'y', 'w', 'hh'].some((k) => {
    const a = prev.fg![k as keyof ForegroundInfo], b = current[k as keyof ForegroundInfo]
    return typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) > MOVE_TOLERANCE_PX
  })
  if (moved) return `截图之后窗口「${title(current)}」移动或改变了大小，截图上的位置可能对不上了。${redo}`
  return null
}

// ---------- 2. 错误翻译 ----------

const ERROR_RULES: Array<[RegExp, string]> = [
  [/SendInput failed|higher-privilege|UIPI|0x80070005|access.?is.?denied|拒绝访问/i,
    '目标窗口的权限比 Roy 高（通常是以管理员身份运行的程序），Windows 不允许 Roy 操作它。可以让用户以管理员身份运行 Roy，或者用普通方式打开目标程序。'],
  [/输入助手退出了/,
    '电脑控制助手意外退出了，下一次操作会自动重新启动它；如果反复出现，请用户重启 Roy。'],
  [/输入助手没有响应|timed?.?out|timeout/i,
    '操作超时：目标程序可能卡住了，或者弹出了需要处理的对话框。先截图看看现在是什么状态，不要重复同一个操作。'],
  [/截不到屏幕|screen_locked|session.?0|desktop.*unavailable/i,
    '截不到屏幕：电脑可能锁屏了，或者远程桌面断开了。请用户解锁屏幕后再试。'],
  [/window gone|stale|window_id_not_found|invalid window/i,
    '目标窗口已经关闭、重新打开，或者控件列表已过期。先用 computer_windows 重新找到窗口，再操作。'],
  [/UIA unavailable|novalue/i,
    '这个窗口读不到可操作的控件（或控件不支持直接填写），改用截图加坐标的方式操作。'],
]

/** 把原始报错翻成「原因 + 建议」，保留原始信息便于排查 */
export function friendlyComputerError(raw: string): string {
  const message = String(raw || '').trim() || '未知错误'
  for (const [re, hint] of ERROR_RULES) if (re.test(message)) return `${hint}（原始信息：${message.slice(0, 200)}）`
  return message
}

// ---------- 3. App 操作经验 ----------

export const APP_NOTES_MAX_CHARS = 16_000

/** 软件名 → 文件名：微信 / WeChat / weixin 都归到同一份 */
export function appNotesSlug(app: string): string {
  const raw = String(app || '').trim().toLowerCase()
  if (!raw) throw new Error('需要软件名，例如「微信」「Excel」')
  const alias: Record<string, string> = { 微信: 'wechat', weixin: 'wechat', 'wechat': 'wechat', 企业微信: 'wecom', wxwork: 'wecom', 钉钉: 'dingtalk', 飞书: 'feishu', lark: 'feishu' }
  const name = alias[raw] ?? raw
  const slug = name.replace(/[\\/:*?"<>|\s.]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
  if (!slug) throw new Error('软件名无效')
  return `${slug}-windows`
}

/** 内置的通用经验（随软件分发，未在用户电脑上验证过） */
const BUILTIN_NOTES: Record<string, string> = {
  'wechat-windows': [
    '## 搜索联系人 / 群 / 消息',
    '- 状态：内置经验（未在你的电脑上验证）',
    '- 路线：先确认微信窗口在前台 → 按 Ctrl+F 打开搜索 → 确认搜索框有光标后再输入关键词 → 用方向键上下选结果 → 核对高亮的联系人或群名 → 回车进入。',
    '- 不要反复点搜索框的坐标；搜索框里已有内容时先 Ctrl+A 再输入覆盖。',
    '- 进入后看会话标题确认找对了人，联系人结果不等于消息命中。',
    '',
    '## 查看更早的聊天记录',
    '- 先点一下聊天消息区域（不是输入框），再按 PageUp 往上翻；列表区域用滚轮。翻页后重新截图看。',
    '',
    '## 发送消息',
    '- 用户只说「看看消息」不等于可以回复；只要求草拟就停在输入框里不发送。',
    '- 发送前截图确认收件人和内容，确认后再按回车。',
    '',
    '## 注意',
    '- 个人微信的大部分界面读不到控件，以截图为准；企业微信是另一个软件。',
  ].join('\n'),
}

export interface AppNotesEntry { slug: string; chars: number; updatedAt: number }

export interface AppNotesStore {
  read(app: string): { slug: string; content: string; source: 'saved' | 'builtin' | 'none' }
  save(app: string, content: string): { slug: string; chars: number }
  /** 已保存的经验（设置页展示用），最近更新的在前 */
  list(): AppNotesEntry[]
}

export function createAppNotesStore(dir: string): AppNotesStore {
  const fileOf = (slug: string): string => join(dir, `${slug}.md`)
  return {
    list() {
      try {
        return readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => {
          const st = statSync(join(dir, f))
          return { slug: f.slice(0, -3), chars: readFileSync(join(dir, f), 'utf8').length, updatedAt: st.mtimeMs }
        }).sort((a, b) => b.updatedAt - a.updatedAt)
      } catch {
        return []
      }
    },
    read(app) {
      const slug = appNotesSlug(app)
      const file = fileOf(slug)
      if (existsSync(file)) return { slug, content: readFileSync(file, 'utf8'), source: 'saved' }
      if (BUILTIN_NOTES[slug]) return { slug, content: BUILTIN_NOTES[slug]!, source: 'builtin' }
      return { slug, content: '', source: 'none' }
    },
    save(app, content) {
      const slug = appNotesSlug(app)
      const text = String(content ?? '').trim()
      if (!text) throw new Error('内容不能为空')
      if (text.length > APP_NOTES_MAX_CHARS) throw new Error(`经验太长（${text.length} 字），请精简到 ${APP_NOTES_MAX_CHARS} 字以内，只保留会改变下次做法的内容`)
      mkdirSync(dir, { recursive: true })
      writeFileSync(fileOf(slug), text + '\n', 'utf8')
      return { slug, chars: text.length }
    },
  }
}
