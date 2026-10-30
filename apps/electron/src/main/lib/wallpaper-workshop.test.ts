/**
 * 创意工坊壁纸扫描的封面/视频选择逻辑。
 *
 * 这里测的是纯函数 `pickPreviewName`——它替代了原来「每张壁纸最多 15 次
 * existsSync」的探测方式。重构的约束是**行为必须完全一致**：封面优先级、
 * 无扩展名补全、大小写不敏感，一条都不能变，否则用户会突然看不到封面。
 */

import { describe, expect, test } from 'bun:test'
import { pickPreviewName } from './wallpaper-workshop'

describe('pickPreviewName', () => {
  test('Given project.json 声明了带扩展名的 preview When 目录里有它 Then 直接用它', () => {
    expect(pickPreviewName(['preview.jpg', 'scene.pkg'], 'preview.jpg')).toBe('preview.jpg')
  })

  test('Given 声明值大小写与磁盘不一致 When 查找 Then 返回磁盘上的真实文件名', () => {
    // Windows 上大小写不敏感，但返回的名字必须是真实存在的那个
    expect(pickPreviewName(['Preview.JPG', 'scene.pkg'], 'preview.jpg')).toBe('Preview.JPG')
  })

  test('Given 声明值没有扩展名 When 目录里有 preview.png Then 补全扩展名', () => {
    expect(pickPreviewName(['preview.png'], 'preview')).toBe('preview.png')
  })

  test('Given 声明值没有扩展名 When 多种扩展名都在 Then 按 jpg → jpeg → png → gif → webp 优先', () => {
    expect(pickPreviewName(['preview.webp', 'preview.png', 'preview.jpg'], 'preview')).toBe('preview.jpg')
    expect(pickPreviewName(['preview.webp', 'preview.png'], 'preview')).toBe('preview.png')
  })

  test('Given 声明值指向不存在的文件 When 查找 Then 回退到常见文件名', () => {
    // 用户可能删掉了 project.json 里写的那张，但目录里还有 preview.jpg
    expect(pickPreviewName(['preview.jpg'], 'missing.png')).toBe('preview.jpg')
  })

  test('Given 没有声明 When 目录里有 preview/Preview/thumbnail Then 按这个顺序找', () => {
    expect(pickPreviewName(['thumbnail.png', 'preview.jpg'], undefined)).toBe('preview.jpg')
    expect(pickPreviewName(['thumbnail.png', 'Preview.jpg'], undefined)).toBe('Preview.jpg')
    expect(pickPreviewName(['thumbnail.png'], undefined)).toBe('thumbnail.png')
  })

  test('Given 目录里没有任何封面 When 查找 Then 返回空串', () => {
    expect(pickPreviewName(['scene.pkg', 'project.json'], undefined)).toBe('')
    expect(pickPreviewName([], undefined)).toBe('')
  })

  test('Given 只有无关的图片 When 查找 Then 不误认成封面', () => {
    // 场景壁纸里常有一堆贴图，不能随便挑一张当封面
    expect(pickPreviewName(['particles.png', 'texture1.jpg', 'scene.pkg'], undefined)).toBe('')
  })

  test('Given 声明值带子目录 When 目录项里没有该路径 Then 回退到常见文件名', () => {
    // 目录项是扁平的，子目录里的图不在这个集合里
    expect(pickPreviewName(['preview.jpg'], 'assets/cover.png')).toBe('preview.jpg')
  })
})
