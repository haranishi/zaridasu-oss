import { describe, it, expect, vi, afterEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { clientIp, isLocalIp, proxy } from '@/proxy'
import { privateNoStore } from '@/lib/serverRuntime'

vi.mock('@/lib/supabase/middleware', () => ({
  updateSession: vi.fn(async () => NextResponse.next()),
}))
afterEach(() => vi.unstubAllEnvs())

// REQ-212 / セキュリティ: clientIp() の X-Forwarded-For 偽装耐性とローカル fail-open の単体テスト。
//
// 攻撃シナリオ: 末尾に loopback を付けてレート制限をスキップさせる
//   `X-Forwarded-For: <公開IP>, 127.0.0.1`
// → 修正前は末尾 127.0.0.1 を採用して isLocalIp で除外 → レート制限回避。
// → 修正後は末尾から遡り「ローカルでない最初のアドレス」＝手前の公開 IP を採用する。

function req(headers: Record<string, string>): NextRequest {
  return new NextRequest(new URL('http://localhost/admin/login'), {
    headers: new Headers(headers),
  })
}

describe('isLocalIp', () => {
  it.each([
    'unknown',
    'localhost',
    '127.0.0.1',
    '127.0.0.53',
    '::1',
    '::ffff:127.0.0.1',
    '10.0.0.5',
    '192.168.1.10',
    '172.16.0.1',
    '172.31.255.254',
    '169.254.1.1',
    'fc00::1',
    'fd12:3456::1',
    'fe80::1',
    '::ffff:10.1.2.3',
    '::ffff:192.168.0.1',
    '::ffff:172.16.0.1',
  ])('ローカル/プライベート判定: %s -> true', ip => {
    expect(isLocalIp(ip)).toBe(true)
  })

  it.each([
    '203.0.113.7',
    '198.51.100.42',
    '8.8.8.8',
    '172.15.0.1', // 172.16.0.0/12 の範囲外 → 公開扱い
    '172.32.0.1', // 範囲外
    '2001:db8::1', // ドキュメント用だが ULA/loopback ではない → 公開扱い
  ])('公開 IP 判定: %s -> false', ip => {
    expect(isLocalIp(ip)).toBe(false)
  })
})

describe('clientIp', () => {
  it('XFF 偽装（手前に公開IP + 末尾 loopback）でも手前の公開 IP を採用する', () => {
    // これがレート制限回避の本丸。末尾 127.0.0.1 を盲信しない。
    expect(clientIp(req({ 'x-forwarded-for': '203.0.113.7, 127.0.0.1' }))).toBe('203.0.113.7')
  })

  it('XFF 偽装（末尾に複数のローカルを連結）でも遡って公開 IP を採用する', () => {
    expect(
      clientIp(req({ 'x-forwarded-for': '198.51.100.42, 10.0.0.1, 127.0.0.1' })),
    ).toBe('198.51.100.42')
  })

  it('正当なローカル単独（next start / E2E の 127.0.0.1）は unknown を返す（レート制限スキップ）', () => {
    expect(clientIp(req({ 'x-forwarded-for': '127.0.0.1' }))).toBe('unknown')
  })

  it('XFF が全部ローカル/プライベートのときは unknown を返す', () => {
    expect(
      clientIp(req({ 'x-forwarded-for': '10.0.0.1, 192.168.1.1, 127.0.0.1' })),
    ).toBe('unknown')
  })

  it('ヘッダが全く無いときは unknown を返す（直アクセス）', () => {
    expect(clientIp(req({}))).toBe('unknown')
  })

  it('複数プロキシ経由の正規 XFF は最も外側（末尾側）の公開 IP を採用する', () => {
    // client -> proxy1(公開) -> proxy2(公開) のような連結。末尾から遡って最初の公開 IP。
    expect(
      clientIp(req({ 'x-forwarded-for': '203.0.113.7, 198.51.100.42' })),
    ).toBe('198.51.100.42')
  })

  it('x-vercel-forwarded-for を最優先で採用する（プラットフォーム信頼ヘッダ）', () => {
    // 攻撃者が XFF を偽装しても、Vercel が付ける実 IP を優先するため影響しない。
    expect(
      clientIp(
        req({
          'x-vercel-forwarded-for': '203.0.113.7',
          'x-forwarded-for': '1.2.3.4, 127.0.0.1',
        }),
      ),
    ).toBe('203.0.113.7')
  })

  it('cf-connecting-ip を XFF より優先で採用する（Cloudflare 信頼ヘッダ）', () => {
    expect(
      clientIp(
        req({
          'cf-connecting-ip': '198.51.100.42',
          'x-forwarded-for': '1.2.3.4, 127.0.0.1',
        }),
      ),
    ).toBe('198.51.100.42')
  })

  it('信頼ヘッダがローカルなら無視して XFF の公開 IP にフォールバックする', () => {
    // ローカル開発で x-vercel-forwarded-for に 127.0.0.1 が入るような状況でも、
    // XFF 内の公開 IP を拾えること。
    expect(
      clientIp(
        req({
          'x-vercel-forwarded-for': '127.0.0.1',
          'x-forwarded-for': '203.0.113.7',
        }),
      ),
    ).toBe('203.0.113.7')
  })

  it('XFF が無く x-real-ip のみのときは x-real-ip（公開）を採用する', () => {
    expect(clientIp(req({ 'x-real-ip': '203.0.113.7' }))).toBe('203.0.113.7')
  })

  it('x-real-ip がローカルなら unknown（レート制限スキップ）', () => {
    expect(clientIp(req({ 'x-real-ip': '127.0.0.1' }))).toBe('unknown')
  })
})


describe('Cloudflare trusted deployment configuration (9.3)', () => {
  it('ignores all visitor forwarding headers when the server selects Cloudflare', () => {
    vi.stubEnv('ZARIDASU_RUNTIME', 'cloudflare')
    expect(clientIp(req({
      'cf-connecting-ip': '198.51.100.90',
      'x-vercel-forwarded-for': '203.0.113.99',
      'x-forwarded-for': '8.8.8.8', 'x-real-ip': '1.1.1.1',
    }))).toBe('198.51.100.90')
  })

  it.each(['', 'invalid', '198.51.100.9, 8.8.8.8', '198.51.100.9:123', 'unknown'])('does not fall back from invalid CF IP %s', value => {
    vi.stubEnv('ZARIDASU_RUNTIME', 'cloudflare')
    expect(clientIp(req({ 'cf-connecting-ip': value,
      'x-vercel-forwarded-for': '203.0.113.99', 'x-forwarded-for': '8.8.8.8',
      'x-real-ip': '1.1.1.1' }))).toBe('unknown')
  })

  it('canonicalizes IPv6 so spelling variants share a bucket', () => {
    vi.stubEnv('ZARIDASU_RUNTIME', 'cloudflare')
    expect(clientIp(req({ 'cf-connecting-ip': '2001:0DB8:0:0:0:0:0:1' }))).toBe('2001:db8::1')
  })

  it('does not select Cloudflare from CF-Worker or visitor headers', () => {
    vi.stubEnv('ZARIDASU_RUNTIME', '')
    expect(clientIp(req({ 'cf-worker': 'untrusted.example',
      'cf-connecting-ip': '198.51.100.9', 'x-vercel-forwarded-for': '203.0.113.99' }))).toBe('203.0.113.99')
  })

  it.each(['', 'invalid', '127.0.0.1', '10.0.0.1', '::1', '::ffff:127.0.0.1'])(
    'counts a Cloudflare burst with missing/invalid/private/loopback IP %s', async value => {
      vi.stubEnv('ZARIDASU_RUNTIME', 'cloudflare')
      let response
      for (let i = 0; i < 61; i++) {
        response = await proxy(req({ 'cf-connecting-ip': value,
          'x-vercel-forwarded-for': `203.0.113.${i + 1}`,
          'x-forwarded-for': `198.51.100.${i + 1}`, 'x-real-ip': '127.0.0.1' }))
      }
      expect(response?.status).toBe(429)
      expect(response?.headers.get('cache-control')).toMatch(/private.*no-store/)
    },
  )
})


it('adds Cookie Vary without overwriting Next router variants or duplicating Cookie', () => {
  const response = new NextResponse(null, { headers: { Vary: 'RSC, Next-Router-State-Tree' } })
  privateNoStore(response, true)
  privateNoStore(response, true)
  expect(response.headers.get('vary')).toBe('RSC, Next-Router-State-Tree, Cookie')
})
