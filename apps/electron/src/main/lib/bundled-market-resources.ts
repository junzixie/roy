/**
 * 内置技能库（resources/roy-library）：Roy 自己写的技能和专家，体积很小，随安装包直接放目录，不再打包解压。
 *
 * 以前这里是 WorkBuddy 的 80MB 压缩包（1.5 万个文件），首次使用要整包解压；那些内容来自第三方产品，
 * 已从安装包里拿掉，更多技能改为在技能市场的「在线合集」里按需获取。
 * 旧版本解压在用户数据目录 bundled-market/ 下的缓存（每份 80MB 以上）在启动后后台清掉。
 *
 * 函数名沿用旧名，调用方不用改。
 */

import { app } from 'electron'
import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'

function libraryRoot(): string {
  return app.isPackaged ? join(process.resourcesPath, 'roy-library') : join(__dirname, 'resources/roy-library')
}

/** 内置技能库目录 */
export function bundledWorkbuddyRoot(): string {
  return libraryRoot()
}

export function ensureBundledWorkbuddy(): Promise<string> {
  return Promise.resolve(libraryRoot())
}

/** 启动后空闲时删掉旧版本留下的 WorkBuddy 解压缓存 */
export function warmBundledWorkbuddy(delayMs = 15_000): void {
  setTimeout(() => {
    const legacy = join(app.getPath('userData'), 'bundled-market')
    if (!existsSync(legacy)) return
    void rm(legacy, { recursive: true, force: true }).catch(error => console.warn('[内置技能库] 清理旧市场缓存失败:', error))
  }, delayMs)
}
