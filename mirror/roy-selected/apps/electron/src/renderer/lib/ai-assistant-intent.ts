/**
 * Roy AI 助理：从用户话里抽出「建项目 / 看项目」意图。
 * 只做启发式，不做假成功；解析失败则当作普通聊天。
 */

export type AiAssistantIntent =
  | { type: 'none' }
  | { type: 'create_project'; name: string }
  | { type: 'open_project'; name: string }

function cleanName(raw: string): string | null {
  let name = raw
    .replace(/[「」『』""']/g, '')
    .replace(/[。.!！?？]+$/u, '')
    .replace(/\s*的$/u, '')
    .trim()
  // 去掉末尾品类词，但保留「发票小工具」整名里的「小工具」——仅当整句是「…的项目/工程」时剥品类
  name = name.replace(/(?:\s*的)?(?:项目|工程)$/u, '').trim()
  if (!name || name.length > 40) return null
  if (/^(一个|这个|那个|新的|项目|工程|小工具|应用|app)$/iu.test(name)) return null
  return name
}

export function parseAiAssistantIntent(text: string): AiAssistantIntent {
  const trimmed = text.trim()
  if (!trimmed) return { type: 'none' }

  // 1) 打开 / 想看（先匹配，避免「打开」误伤创建）
  const openMatchers: RegExp[] = [
    /(?:想看|打开|进入|切到|看看|切换到)\s*项目\s*[「『""']?([^「」『』""'\n]{1,40})[」』""']?\s*$/u,
    /(?:想看|打开|进入|切到|看看|切换到)\s*[「『""']?([^「」『』""'\n]{1,40}?)[」』""']?\s*(?:这个|那个)?(?:项目|工程)\s*$/u,
  ]
  for (const re of openMatchers) {
    const m = trimmed.match(re)
    if (m?.[1]) {
      const name = cleanName(m[1])
      if (name) return { type: 'open_project', name }
    }
  }

  // 2) 创建
  const createMatchers: RegExp[] = [
    /(?:新建|创建)\s*项目\s*[「『""']?([^「」『』""'\n]{1,40})[」』""']?\s*$/u,
    /(?:开|新建|创建|做)(?:一个)?叫\s*[「『""']?([^「」『』""'\n]{1,40}?)[」』""']?\s*的?\s*(?:项目|工程)\s*$/u,
    /(?:帮我|请)?(?:开一个|建一个|搞一个)\s*[「『""']?([^「」『』""'\n]{1,40}?)[」』""']?\s*(?:项目|工程)\s*$/u,
    // 「我想做一个发票小工具」——名称吃到句末，再由 cleanName 去掉「项目/工程」
    /(?:我想|我要|帮我)(?:做|搞|弄)(?:一个|个)\s*[「『""']?([^「」『』""'\n]{1,40})[」』""']?\s*$/u,
    /项目(?:叫|名为|名字(?:叫|是))\s*[「『""']?([^「」『』""'\n]{1,40})[」』""']?\s*$/u,
  ]
  for (const re of createMatchers) {
    const m = trimmed.match(re)
    if (m?.[1]) {
      const name = cleanName(m[1])
      if (name) return { type: 'create_project', name }
    }
  }

  return { type: 'none' }
}

/** 在已有项目列表里按名称模糊匹配（忽略大小写、空白） */
export function findWorkspaceByName<T extends { id: string; name: string }>(
  workspaces: readonly T[],
  name: string,
): T | null {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, '')
  const target = norm(name)
  const exact = workspaces.find((w) => norm(w.name) === target)
  if (exact) return exact
  const partial = workspaces.find((w) => {
    const n = norm(w.name)
    return n.includes(target) || target.includes(n)
  })
  return partial ?? null
}
