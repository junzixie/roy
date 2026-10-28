/**
 * Pro 激活弹窗状态
 *
 * 点到 Pro 功能时调用 ensureProFeature()：已激活直接放行；没激活就弹出「请输入激活码进行激活」，
 * 激活成功后执行 onActivated（比如继续切到 DeepSeek 优化）。
 */
import { atom, getDefaultStore } from 'jotai'

/** 与主进程 roy-account.ts 的 ProFeature 保持一致 */
export type ProFeatureKey = 'computer-control' | 'deepseek-mode' | 'mobile-remote-public' | 'cloud-sync' | 'unlimited-automation' | 'multi-agent' | 'long-memory'

export const PRO_FEATURE_NAMES: Record<ProFeatureKey, string> = {
  'computer-control': '电脑控制',
  'deepseek-mode': 'DeepSeek 优化',
  'mobile-remote-public': '公网手机遥控',
  'cloud-sync': '云同步',
  'unlimited-automation': '工作流和定时任务不限数量',
  'multi-agent': '多智能体并行',
  'long-memory': '全局长期记忆',
}

export interface ProActivationRequest {
  feature?: ProFeatureKey
  onActivated?: () => void
}

/** null = 弹窗关闭 */
export const proActivationAtom = atom<ProActivationRequest | null>(null)

/** 直接弹出激活窗 */
export function openProActivation(request: ProActivationRequest = {}): void {
  getDefaultStore().set(proActivationAtom, request)
}

/**
 * 检查某个 Pro 功能是否可用；不可用时弹激活窗并返回 false。
 * onActivated：激活成功且包含该功能后要继续做的事。
 */
export async function ensureProFeature(feature: ProFeatureKey, onActivated?: () => void): Promise<boolean> {
  const account = await window.electronAPI.accountGet().catch(() => null)
  if (account?.features.includes(feature)) return true
  openProActivation({ feature, onActivated })
  return false
}
