/**
 * Roy 内置模型点数 IPC 通道（余额以服务器为准）
 */

export const BALANCE_IPC_CHANNELS = {
  /** 查余额和最近账目 */
  GET_BALANCE: 'balance:get',
  /** 兑换激活码（Pro 码或点数码，服务端按码的类型处理） */
  REDEEM: 'balance:redeem',
  /** 内置模型价格标签（选模型时显示「Nx | X折」） */
  PRICING: 'balance:pricing',
} as const
