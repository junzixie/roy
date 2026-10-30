/**
 * Roy 使用体验一键校准
 *
 * 用法：先关掉 Roy，再 node scripts/apply-performance-optimization.js
 *
 * 只处理真正生效的 autoCompactPercent，并清掉旧版本写入的无效字段。
 *
 * 注意：当前 UI（CompactionExperienceCard / ContextUsageBadge）会把
 * autoCompactPercent 强制归一到 90%，所以这个脚本的实际作用只剩「清理无效字段」。
 * 保留它是因为老用户的 settings.json 里可能还留着
 * compactionThresholdPercent / keepRecentTokens 这类从未接到运行时的键，
 * 留着会让人误以为它们有效。
 */

import fs from 'fs'
import path from 'path'
import os from 'os'

const SETTINGS_PATH = path.join(os.homedir(), '.roy', 'settings.json')

/** 与 UI 一致的锁定值，避免脚本写进去的值下次打开设置就被改回来。 */
const LOCKED_PERCENT = 90

/** 从未接到运行时的历史字段，读到就清掉。 */
const DEAD_KEYS = ['compactionThresholdPercent', 'keepRecentTokens']

console.log('Roy 使用体验校准')
console.log('='.repeat(50))

console.log('\n[1/3] 备份当前设置...')
if (fs.existsSync(SETTINGS_PATH)) {
  const backupPath = SETTINGS_PATH + '.backup.' + Date.now()
  fs.copyFileSync(SETTINGS_PATH, backupPath)
  console.log('已备份到: ' + backupPath)
} else {
  console.log('设置文件不存在，无需清理')
  process.exit(0)
}

console.log('\n[2/3] 读取并清理...')
let settings
try {
  settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'))
} catch (error) {
  console.error('设置文件不是合法 JSON，已中止（原文件未改动）:', error.message)
  console.error('建议：先手动修复，或删掉该文件让 Roy 重新生成。')
  process.exit(1)
}

let changed = false
for (const key of DEAD_KEYS) {
  if (Object.prototype.hasOwnProperty.call(settings, key)) {
    delete settings[key]
    console.log(`  已移除无效字段 ${key}（从未接到运行时）`)
    changed = true
  }
}

const currentPercent = settings.autoCompactPercent
if (currentPercent !== LOCKED_PERCENT) {
  settings.autoCompactPercent = LOCKED_PERCENT
  console.log(`  autoCompactPercent: ${currentPercent ?? '(未设置)'} -> ${LOCKED_PERCENT}`)
  changed = true
}

if (!changed) {
  console.log('  无需改动')
  process.exit(0)
}

console.log('\n[3/3] 写入...')
try {
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8')
  console.log('配置已写入。请重新打开 Roy。')
  console.log('提示：压缩阈值现在固定在「设置 → 使用体验」里，不用手改配置文件。')
} catch (error) {
  console.error('写入失败:', error.message)
  process.exit(1)
}
