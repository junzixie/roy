#!/usr/bin/env bun
/**
 * 从 resources/icon-roy.png（优先）或 resources/icon-roy.svg 生成全套应用图标。
 *
 * 位图源要求：正方形、四周透明（不带白底），否则任务栏会出现白色方块。
 * 换图时直接覆盖 icon-roy.png 再跑本脚本即可。
 *
 * 产物：
 * - icon.png      1024x1024 （Linux / electron-builder buildResources）
 * - icon.ico      Windows 多尺寸（16/24/32/48/64/128/256）
 * - icon.icns     macOS（用 iconutil 在 macOS 上生成；其它平台跳过）
 * - 各尺寸 png    供运行时 Dock/托盘使用
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import sharp from 'sharp'

const appDir = resolve(import.meta.dir, '..')
const resourcesDir = join(appDir, 'resources')
const pngSource = join(resourcesDir, 'icon-roy.png')
const svgSource = join(resourcesDir, 'icon-roy.svg')
const source = existsSync(pngSource) ? pngSource : svgSource
const tmpDir = join(resourcesDir, '.icon-build')

if (!existsSync(source)) throw new Error(`缺少图标源文件: ${pngSource} 或 ${svgSource}`)
console.log('[icons] 源文件:', source.endsWith('.png') ? 'icon-roy.png' : 'icon-roy.svg')

rmSync(tmpDir, { recursive: true, force: true })
mkdirSync(tmpDir, { recursive: true })

const isPng = source.endsWith('.png')

const render = (size: number) => {
  // 位图源已经按 1024/1080 画好，直接降采样；矢量源则按目标尺寸提高渲染密度
  const pipeline = isPng
    ? sharp(source)
    : sharp(source, { density: Math.max(300, Math.round((size / 512) * 600)) })
  return pipeline
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
}

// 主图标
await render(1024).toFile(join(resourcesDir, 'icon.png'))
console.log('[icons] icon.png 1024')

// 多尺寸 png
// Windows 使用彩色品牌托盘图；macOS 仍保留模板图。
mkdirSync(join(resourcesDir, 'roy-logos'), { recursive: true })
await render(32).toFile(join(resourcesDir, 'roy-logos', 'tray-color.png'))
await render(64).toFile(join(resourcesDir, 'roy-logos', 'tray-color@2x.png'))
const PNG_SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024]
for (const size of PNG_SIZES) {
  await render(size).toFile(join(tmpDir, `icon-${size}.png`))
}

// ICO：手工组装 PNG 帧（Vista+ 支持 PNG 压缩帧）
function buildIco(sizes: number[], buffers: Map<number, Buffer>): Buffer {
  const count = sizes.length
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(count, 4)

  const entries = Buffer.alloc(16 * count)
  let offset = 6 + 16 * count
  const payloads: Buffer[] = []

  sizes.forEach((size, index) => {
    const data = buffers.get(size)!
    const base = index * 16
    entries.writeUInt8(size >= 256 ? 0 : size, base + 0)
    entries.writeUInt8(size >= 256 ? 0 : size, base + 1)
    entries.writeUInt8(0, base + 2)
    entries.writeUInt8(0, base + 3)
    entries.writeUInt16LE(1, base + 4)
    entries.writeUInt16LE(32, base + 6)
    entries.writeUInt32LE(data.length, base + 8)
    entries.writeUInt32LE(offset, base + 12)
    offset += data.length
    payloads.push(data)
  })

  return Buffer.concat([header, entries, ...payloads])
}

const icoSizes = [16, 24, 32, 48, 64, 128, 256]
const icoBuffers = new Map<number, Buffer>()
for (const size of icoSizes) {
  icoBuffers.set(size, await sharp(join(tmpDir, `icon-${size}.png`)).toBuffer())
}
writeFileSync(join(resourcesDir, 'icon.ico'), buildIco(icoSizes, icoBuffers))
console.log('[icons] icon.ico', icoSizes.join('/'))

// ICNS：仅在 macOS 上用系统工具生成
if (process.platform === 'darwin') {
  const iconset = join(tmpDir, 'icon.iconset')
  mkdirSync(iconset, { recursive: true })
  const pairs: Array<[number, string]> = [
    [16, 'icon_16x16.png'], [32, 'icon_16x16@2x.png'],
    [32, 'icon_32x32.png'], [64, 'icon_32x32@2x.png'],
    [128, 'icon_128x128.png'], [256, 'icon_128x128@2x.png'],
    [256, 'icon_256x256.png'], [512, 'icon_256x256@2x.png'],
    [512, 'icon_512x512.png'], [1024, 'icon_512x512@2x.png'],
  ]
  for (const [size, name] of pairs) {
    await render(size).toFile(join(iconset, name))
  }
  execFileSync('iconutil', ['-c', 'icns', iconset, '-o', join(resourcesDir, 'icon.icns')], { stdio: 'inherit' })
  console.log('[icons] icon.icns')
} else {
  console.log('[icons] icon.icns 跳过（非 macOS）')
}

// 品牌变体：保留一份圆角深底的 png，供应用内菜单/关于页使用
await render(512).toFile(join(resourcesDir, 'roy-logos', 'roy-star.png'))
console.log('[icons] roy-logos/roy-star.png')

rmSync(tmpDir, { recursive: true, force: true })
console.log('[icons] 完成')
