export interface MobileRemoteDevice {
  id: string
  name: string
  pairedAt: number
  lastSeenAt: number
}
export interface MobileRemoteStatus {
  enabled: boolean
  running: boolean
  addresses: string[]
  devices: MobileRemoteDevice[]
  error?: string
  /** 公网模式的 SSH 反向隧道状态 */
  relay?: {
    state: 'off' | 'connecting' | 'connected' | 'error'
    target?: string
    message?: string
    /** Roy 专用中转密钥的公钥，需加到服务器 ~/.ssh/authorized_keys */
    publicKey?: string
  }
}
export interface MobileRemotePairing {
  url: string
  qr: string
  expiresAt: number
}
