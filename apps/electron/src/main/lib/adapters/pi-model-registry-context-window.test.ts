import { describe, expect, test } from 'bun:test'
import { isTrustedPiContextWindow, resolvePiEffectiveContextWindow } from './pi-model-registry'

describe('Pi model context-window trust', () => {
  test('channel-only inflated windows stay untrusted and capped by resolve helper', () => {
    expect(isTrustedPiContextWindow({
      channelContextWindow: 1_000_000,
    })).toBe(false)
    expect(resolvePiEffectiveContextWindow({
      channelContextWindow: 1_000_000,
    })).toEqual({ contextWindow: 1_000_000, trusted: false })
  })

  test('verified Codex/catalog windows win over inflated channel fills', () => {
    expect(isTrustedPiContextWindow({
      channelContextWindow: 1_000_000,
      codexAlignedContextWindow: 372_000,
    })).toBe(true)
    expect(resolvePiEffectiveContextWindow({
      channelContextWindow: 1_000_000,
      codexAlignedContextWindow: 372_000,
    })).toEqual({ contextWindow: 372_000, trusted: true })
  })

  test('smaller manual channel fills stay respected when a verified window exists', () => {
    expect(resolvePiEffectiveContextWindow({
      channelContextWindow: 200_000,
      codexAlignedContextWindow: 372_000,
    })).toEqual({ contextWindow: 200_000, trusted: true })
  })

  test('catalog and known-model windows can use their actual size', () => {
    expect(isTrustedPiContextWindow({ catalogContextWindow: 372_000 })).toBe(true)
    expect(isTrustedPiContextWindow({ inferredContextWindow: 372_000 })).toBe(true)
  })

  test('unknown/default windows stay conservative', () => {
    expect(isTrustedPiContextWindow({ inferredContextWindow: 200_000 })).toBe(false)
    expect(isTrustedPiContextWindow({})).toBe(false)
  })
})
