import { describe, expect, test } from 'bun:test'
import { rankLanHosts } from './lan-hosts'

describe('手机遥控地址', () => {
  test('跳过 Hyper-V 虚拟网卡，优先用 192.168', () => {
    const list = rankLanHosts({
      'vEthernet (Default Switch)': [{ family: 'IPv4', internal: false, address: '172.20.144.1' }],
      '以太网': [{ family: 'IPv4', internal: false, address: '192.168.31.252' }],
      'Loopback Pseudo-Interface 1': [{ family: 'IPv4', internal: true, address: '127.0.0.1' }],
    })
    expect(list).toEqual(['192.168.31.252'])
  })
  test('去掉 169.254，10 段排在 172 段前面', () => {
    const list = rankLanHosts({
      WLAN: [{ family: 'IPv4', internal: false, address: '169.254.3.4' }, { family: 'IPv4', internal: false, address: '172.16.0.8' }],
      Ethernet: [{ family: 4, internal: false, address: '10.0.0.5' }],
    })
    expect(list).toEqual(['10.0.0.5', '172.16.0.8'])
  })
})
