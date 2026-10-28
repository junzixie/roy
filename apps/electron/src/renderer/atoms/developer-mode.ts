/**
 * 本机来源 / 在线来源：技能和 MCP 市场直接展示这些页，不再藏在开发者选项后面。
 * 保留 atom 是为了兼容旧配置，默认开启。
 */
import { atomWithStorage } from 'jotai/utils'

export const developerModeAtom = atomWithStorage<boolean>('roy:developer-mode', true)
