import { expect, test } from 'bun:test'
import { parseRelayTarget } from './mobile-remote-relay'

test('解析中转服务器地址', () => {
  expect(parseRelayTarget('lzx@122.225.39.134:2222')).toEqual({ user: 'lzx', host: '122.225.39.134', port: 2222 })
  expect(parseRelayTarget('root@relay.example.com')).toEqual({ user: 'root', host: 'relay.example.com', port: 22 })
  for (const bad of ['', 'host:22', 'a@b:99999', 'a b@c', 'a@b;rm -rf /']) expect(parseRelayTarget(bad)).toBeUndefined()
})
