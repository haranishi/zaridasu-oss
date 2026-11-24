import { describe, it, expect } from 'vitest'
import { maskIp } from '../maskIp'

// REQ-245 FR-245-05 / AC-05: 管理画面 IP 表示マスクの単体テスト。
// IPv4 の末尾オクテットに加え、IPv6 のホスト/インタフェース部もマスクされること。
describe('maskIp (REQ-245 IPv6-aware IP mask)', () => {
  it('IPv4 は末尾オクテットをマスクする（従来動作を維持）', () => {
    expect(maskIp('203.0.113.42')).toBe('203.0.113.xxx')
    expect(maskIp('10.0.0.1')).toBe('10.0.0.xxx')
    expect(maskIp('192.168.1.255')).toBe('192.168.1.xxx')
  })

  it('IPv6（フル表記）はプレフィックスを残しホスト/インタフェース部をマスクする', () => {
    expect(maskIp('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBe('2001:0db8:85a3:xxxx')
  })

  it('IPv6（:: 圧縮形）もマスクされる', () => {
    expect(maskIp('2001:db8::1')).toBe('2001:db8::xxxx')
  })

  it('IPv6 マスク後は下位（ホスト部）の値が残らない（PII 最小化）', () => {
    const masked = maskIp('2001:0db8:85a3:1234:5678:8a2e:0370:7334')
    expect(masked).not.toContain('7334')
    expect(masked).not.toContain('0370')
    expect(masked).not.toContain('5678')
    expect(masked.endsWith(':xxxx')).toBe(true)
  })

  it('IPv4-mapped IPv6（::ffff:a.b.c.d）は IPv6 として扱われマスクされる', () => {
    // ':' を含むため IPv6 分岐に入り、IPv4 部分まで含めて伏せる（より秘匿的で安全側）。
    expect(maskIp('::ffff:192.168.1.5')).toBe('::ffff:xxxx')
  })
})
