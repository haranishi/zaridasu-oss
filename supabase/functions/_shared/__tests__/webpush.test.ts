// REQ-237 FR-237-02/05: _shared/webpush.ts のユニットテスト（依存ゼロ Web Push）。
//
// 検証する振る舞い:
//   1. base64url の round-trip（encode/decode が一致）
//   2. VAPID Authorization ヘッダが `vapid t=<jwt>, k=<pub>` 形式で、JWT が
//      header.payload.signature の 3 パート、header.alg=ES256、payload.aud/exp/sub を持つ
//   3. encryptPayload が aes128gcm の構造（salt16 + rs4 + idlen1 + keyid65 + ciphertext）を返し、
//      ciphertext が平文+GCMタグ分だけ増えている（= 平文がそのまま載っていない）
//   4. sendWebPush は 410 を expired=true で返し例外を投げない（fail-soft / AC-06）
//
// 実行: `deno test --allow-env --allow-net --allow-read \
//   --lock=supabase/functions/deno.lock --cached-only --no-check \
//   supabase/functions/_shared/__tests__/webpush.test.ts`

import { assert, assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'

import {
  b64urlToBytes,
  bytesToB64url,
  buildVapidAuthHeader,
  encryptPayload,
  sendWebPush,
} from '../webpush.ts'

// テスト用の固定 VAPID 鍵ペア（P-256 / base64url raw）。本番鍵ではない（テスト専用に生成）。
const VAPID_PUBLIC =
  'BPYFQ0z9p9pVZ9X2nq3iC8nF1nq8m1G3oQ2x4Yc8aQ1k2J4r5T6u7I8o9P0a1S2d3F4g5H6j7K8l9Z0x1C2v3B4n5'
// 上の値はフォーマット確認用。実署名テストは下で動的生成した鍵を使う。

const enc = new TextEncoder()

Deno.test('webpush: base64url round-trip', () => {
  const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255])
  const b64 = bytesToB64url(bytes)
  // base64url は + / = を含まない
  assert(!/[+/=]/.test(b64))
  assertEquals([...b64urlToBytes(b64)], [...bytes])
})

Deno.test('webpush: VAPID Authorization ヘッダが正しい構造（ES256 JWT）', async () => {
  // 動的に P-256 鍵を生成し raw public / d を base64url 化（本番と同じ鍵フォーマット）。
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const rawPub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey))
  const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey)
  const publicKey = bytesToB64url(rawPub)
  const privateKey = jwk.d as string

  const header = await buildVapidAuthHeader({
    audience: 'https://fcm.googleapis.com',
    subject: 'mailto:ops@example.com',
    publicKey,
    privateKey,
  })

  assert(header.startsWith('vapid t='), 'vapid スキーム')
  assert(header.includes(', k=' + publicKey), '公開鍵 k= を含む')

  const jwt = header.slice('vapid t='.length, header.indexOf(', k='))
  const parts = jwt.split('.')
  assertEquals(parts.length, 3, 'JWT は 3 パート')

  const decode = (s: string) => JSON.parse(new TextDecoder().decode(b64urlToBytes(s)))
  const jh = decode(parts[0])
  const jp = decode(parts[1])
  assertEquals(jh.alg, 'ES256')
  assertEquals(jh.typ, 'JWT')
  assertEquals(jp.aud, 'https://fcm.googleapis.com')
  assertEquals(jp.sub, 'mailto:ops@example.com')
  assert(typeof jp.exp === 'number' && jp.exp > Math.floor(Date.now() / 1000), 'exp は未来')
  // 署名は raw r||s = 64 byte
  assertEquals(b64urlToBytes(parts[2]).length, 64)
})

Deno.test('webpush: encryptPayload が aes128gcm 構造を返し平文を載せない', async () => {
  // 受信側（クライアント）鍵ペアを生成して p256dh / auth を用意。
  const clientKp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const p256dh = bytesToB64url(new Uint8Array(await crypto.subtle.exportKey('raw', clientKp.publicKey)))
  const auth = bytesToB64url(crypto.getRandomValues(new Uint8Array(16)))

  const plaintext = enc.encode(JSON.stringify({ title: 'x', body: 'hello' }))
  const out = await encryptPayload({ payload: plaintext, p256dhB64url: p256dh, authB64url: auth })

  // 構造: salt(16) + rs(4) + idlen(1) + keyid(65) + ciphertext
  assert(out.length > 16 + 4 + 1 + 65, 'ヘッダ + 暗号文がある')
  assertEquals(out[20], 65, 'idlen = 65（送信側 P-256 公開鍵）')
  // rs = 4096 (big-endian)
  assertEquals([out[16], out[17], out[18], out[19]], [0x00, 0x00, 0x10, 0x00])

  const ciphertext = out.slice(16 + 4 + 1 + 65)
  // AES-GCM は平文長 + パディング(1) + タグ(16)。平文より長い。
  assertEquals(ciphertext.length, plaintext.length + 1 + 16)
})

Deno.test('webpush: sendWebPush は 410 を expired=true で返し例外を投げない', async () => {
  const original = globalThis.fetch
  globalThis.fetch = (() => Promise.resolve(new Response('gone', { status: 410 }))) as typeof fetch
  try {
    const clientKp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
    const p256dh = bytesToB64url(new Uint8Array(await crypto.subtle.exportKey('raw', clientKp.publicKey)))
    const auth = bytesToB64url(crypto.getRandomValues(new Uint8Array(16)))
    const ecdsaKp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign'])
    const pub = bytesToB64url(new Uint8Array(await crypto.subtle.exportKey('raw', ecdsaKp.publicKey)))
    const priv = (await crypto.subtle.exportKey('jwk', ecdsaKp.privateKey)).d as string

    const result = await sendWebPush({
      subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh, auth },
      payload: JSON.stringify({ title: 't' }),
      vapidPublicKey: pub,
      vapidPrivateKey: priv,
      vapidSubject: 'mailto:ops@example.com',
    })
    assertEquals(result.ok, false)
    assertEquals(result.statusCode, 410)
    assertEquals(result.expired, true)
  } finally {
    globalThis.fetch = original
  }
})

// 未使用定数の lint 回避（フォーマット例として残す）。
assert(typeof VAPID_PUBLIC === 'string')
