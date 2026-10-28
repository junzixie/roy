/**
 * Roy 应用设置类型定义
 *
 * 新增：agentMode 快速模式/企业模式切换
 */

export interface RoySettings {
  // ===== Agent 运行模式（新增） =====

  /**
   * Agent 运行模式
   *
   * - 'fast': 快速模式（默认）- 个人使用，极速响应，像 Claude Desktop
   * - 'enterprise': 企业模式（付费功能，暂时开放）- 多人协作、权限控制、审计日志
   */
  agentMode: 'slim' | 'fast' | 'enterprise'

  /**
   * 快速模式的显示设置
   *
   * - 'silent': 静默模式（像 Claude Desktop，只显示 "Waiting for Claude..."）
   * - 'standard': 标准模式（流式显示内容，隐藏工具调用）
   * - 'detailed': 详细模式（显示所有工具调用过程）
   */
  fastModeView: 'silent' | 'standard' | 'detailed'

  // ===== 原有设置 =====

  theme: 'light' | 'dark' | 'system'
  language: string

  // ... 其他设置
}

export const DEFAULT_SETTINGS: RoySettings = {
  // 默认使用快速模式
  agentMode: 'fast',
  fastModeView: 'standard',

  theme: 'system',
  language: 'zh-CN'
}
