import { afterAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// 用临时目录当「用户主目录」，不碰真实的 ~/.roy
const home = mkdtempSync(join(tmpdir(), 'roy-users-'))
process.env.USERPROFILE = home
process.env.HOME = home
process.env.ROY_DEV = '1'

const users = await import('./local-users')
const paths = await import('./config-paths')

afterAll(() => rmSync(home, { recursive: true, force: true }))

describe('本地多用户', () => {
  test('没有名单时是单用户，不弹登录', () => {
    expect(users.getLocalUsersState().users).toEqual([])
    expect(users.needsLoginOnStartup()).toBe(false)
  })

  test('加第一个新用户时，原数据登记为第一个用户且目录不变', () => {
    const s = users.createLocalUser({ username: 'XiaoMing', displayName: '小明', password: 'abcd', primaryName: '老王' })
    expect(s.users.map((u) => u.username)).toEqual(['me', 'xiaoming'])
    const me = s.users[0]!
    expect(me.primary).toBe(true)
    expect(me.displayName).toBe('老王')
    expect(me.dataDir).toBe(join(home, '.roy-dev'))
    expect(s.users[1]!.dataDir).toBe(join(home, '.roy-dev-users', 'users', 'xiaoming'))
    expect(existsSync(s.users[1]!.dataDir)).toBe(true)
    expect(readFileSync(join(home, '.roy-dev-users', 'current.txt'), 'utf8')).toBe('me')
  })

  test('用户名不合法、重复会被拒绝', () => {
    expect(() => users.createLocalUser({ username: '../evil' })).toThrow()
    expect(() => users.createLocalUser({ username: 'xiaoming' })).toThrow('已经有了')
  })

  test('密码校验；错误密码不能切换', () => {
    expect(users.verifyLocalUserPassword('xiaoming', 'abcd')).toBe(true)
    expect(users.verifyLocalUserPassword('xiaoming', 'abce')).toBe(false)
    expect(users.verifyLocalUserPassword('me', '')).toBe(true)
    expect(() => users.selectLocalUser('xiaoming', 'wrong')).toThrow('密码不对')
    users.selectLocalUser('xiaoming', 'abcd')
    expect(readFileSync(join(home, '.roy-dev-users', 'current.txt'), 'utf8')).toBe('xiaoming')
  })

  test('改密码要原密码；留空去掉密码', () => {
    expect(() => users.changeLocalUserPassword('xiaoming', 'nope', 'x1234')).toThrow('原密码不对')
    const s = users.changeLocalUserPassword('xiaoming', 'abcd', '')
    expect(s.users.find((u) => u.username === 'xiaoming')!.hasPassword).toBe(false)
  })

  test('第一个用户不能删；删除只改名单不删数据', () => {
    expect(() => users.deleteLocalUser('me')).toThrow('第一个用户不能删')
    // 这次启动没有名单 = 用的是第一个用户
    expect(users.getLocalUsersState().active).toBe('me')
    const dir = join(home, '.roy-dev-users', 'users', 'xiaoming')
    const s = users.deleteLocalUser('xiaoming')
    expect(s.users.map((u) => u.username)).toEqual(['me'])
    expect(existsSync(dir)).toBe(true)
  })

  test('配置目录按「这次启动的用户」算', () => {
    // 这个进程里第一次算的时候，current.txt 已经写过；结果要落在某个用户的目录里
    const dir = paths.getConfigDir()
    expect([join(home, '.roy-dev'), join(home, '.roy-dev-users', 'users', 'xiaoming')]).toContain(dir)
  })
})
