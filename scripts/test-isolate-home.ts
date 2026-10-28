/**
 * 测试统一预加载：把用户主目录指到临时目录。
 *
 * 不少模块用 homedir() 拼 ~/.roy；Windows 上 homedir() 读 USERPROFILE，只改 HOME 不够。
 * 以前有测试直接读写开发者真实的 ~/.roy / ~/.roy-dev（日志里能看到「配置目录: ~/.roy/（正式版本）」），
 * 这里在所有测试开始前统一隔离；个别测试自己再设 HOME/USERPROFILE 也不受影响。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const home = mkdtempSync(join(tmpdir(), 'roy-test-home-'))
process.env.HOME = home
process.env.USERPROFILE = home
process.env.ROY_TEST_HOME = home
// 本机装的程序（如 Cua Driver 在 %LOCALAPPDATA%\\Programs 下）也不能影响测试结果
process.env.LOCALAPPDATA = join(home, 'AppData', 'Local')
process.env.APPDATA = join(home, 'AppData', 'Roaming')
