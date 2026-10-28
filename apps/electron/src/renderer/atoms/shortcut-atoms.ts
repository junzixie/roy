/**
 * Shortcut Atoms — 快捷键状态管理
 *
 * 管理用户自定义快捷键覆盖配置。
 * 通过 settings IPC 通道持久化到 settings.json。
 */

import { atom } from 'jotai'
import type { ShortcutOverrides } from '@/lib/shortcut-defaults'

/** 用户自定义快捷键覆盖（从 settings.json 加载） */
export const shortcutOverridesAtom = atom<ShortcutOverrides>({})

/** 发送消息快捷键模式：true = Cmd/Ctrl+Enter 发送，false = Enter 发送 */
export const sendWithCmdEnterAtom = atom(false)

/**
 * 仅点击发送：开启后输入框内 Enter 只换行，提交必须点击发送按钮。
 * 默认关闭：Enter 发送、Shift+Enter 换行；需要防误发的人可在快捷键设置里打开。
 */
export const sendWithClickOnlyAtom = atom(false)
