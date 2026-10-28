import { cpSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
const root = resolve(import.meta.dir, '..')
const source = resolve(root, 'resources')
if (!existsSync(resolve(source, 'roy-logos/tray-color.png'))) throw new Error('缺少彩色托盘图标，请先运行 build:icons')
cpSync(source, resolve(root, 'dist/resources'), { recursive: true })
console.log('Resources copied and tray icon verified')

