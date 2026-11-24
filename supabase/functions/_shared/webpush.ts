/**
 * REQ-237 FR-237-02/05: 依存ゼロの Web Push 送信ユーティリティ（Deno / Web Crypto のみ）。
 *
 * 外部 npm/esm の web-push ライブラリを使わず Deno 標準の crypto.subtle だけで実装する。
 * 理由: supabase/functions/deno.lock を汚さない（既存 Edge Function の依存解決を壊さない）ため。
 *
 * 実装する仕様:
 *   - VAPID（RFC 8292）: ES256 で署名した JWT を Authorization: vapid で送る。
 *   - メッセージ暗号化（RFC 8291 / aes128gcm）: P-256 ECDH → HKDF → AES-128-GCM。
 *     Content-Encoding: aes128gcm。本文（JSON）を購読の p256dh/auth で暗号化する。
 *
 * セキュリティ（NFR-237-01 / REQ-211）:
 *   - VAPID 秘密鍵はサーバー専用。呼び出し側（send-push Edge Function）が Deno.env から読む。
 *     このモジュールは鍵を保持・ログ出力しない。
 *
 * 鍵フォーマット:
 *   - publicKey:  base64url の生 P-256 公開鍵（65 byte・0x04 + X + Y）。Web Push 標準。
 *   - privateKey: base64url の生 P-256 秘密鍵スカラ（32 byte の d 値）。`web-push generate-vapid-keys`
 *     や `openssl` で得た値をそのまま入れられるよう raw d を採用する（runbook 参照）。
 */

// ── base64url ────────────────────────────────────────────────────────────────
export function b64urlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/')
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4))
  const bin = atob(b64 + pad)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

export function bytesToB64url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const enc = new TextEncoder()

// 新しい TS DOM lib では BufferSource = ArrayBufferView<ArrayBuffer> | ArrayBuffer。
// crypto.getRandomValues / deriveBits 等が返す Uint8Array は <ArrayBufferLike> 型で
// SharedArrayBuffer 可能性が残り BufferSource に直接代入できない。WebCrypto/fetch の
// 境界でのみ非共有 ArrayBuffer ビューであることを明示する薄いキャスト（実体は不変）。
const bs = (u: Uint8Array): BufferSource => u as unknown as BufferSource

function concat(...arrs: Uint8Array[]): Uint8Array {
  const total = arrs.reduce((n, a) => n + a.length, 0)
  const out = new Uint8Array(total)
  let off = 0
  for (const a of arrs) { out.set(a, off); off += a.length }
  return out
}

// ── VAPID JWT（ES256 / RFC 8292）─────────────────────────────────────────────
/**
 * VAPID の Authorization ヘッダ値を生成する。
 * `vapid t=<jwt>, k=<publicKey base64url>`
 */
export async function buildVapidAuthHeader(args: {
  audience: string          // push endpoint の origin（例 https://fcm.googleapis.com）
  subject: string           // mailto: または https: の連絡先
  publicKey: string         // base64url raw P-256 公開鍵
  privateKey: string        // base64url raw P-256 秘密鍵スカラ（d）
  expSeconds?: number       // JWT 有効期限（既定 12h・最大 24h 未満に収める）
}): Promise<string> {
  const { audience, subject, publicKey, privateKey } = args
  const exp = Math.floor(Date.now() / 1000) + (args.expSeconds ?? 12 * 60 * 60)

  const header = { typ: 'JWT', alg: 'ES256' }
  const payload = { aud: audience, exp, sub: subject }
  const signingInput =
    bytesToB64url(enc.encode(JSON.stringify(header))) + '.' +
    bytesToB64url(enc.encode(JSON.stringify(payload)))

  const key = await importEcdsaPrivateKey(publicKey, privateKey)
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    bs(enc.encode(signingInput)),
  )
  // WebCrypto ECDSA は raw r||s（64 byte）を返す。JWS もこの形式（JOSE）なのでそのまま使える。
  const jwt = signingInput + '.' + bytesToB64url(new Uint8Array(sig))
  return `vapid t=${jwt}, k=${publicKey}`
}

/** raw d（32byte 秘密鍵スカラ）+ raw 公開鍵から JWK を組み立てて CryptoKey を得る。 */
async function importEcdsaPrivateKey(publicKeyB64url: string, privateKeyB64url: string): Promise<CryptoKey> {
  const pub = b64urlToBytes(publicKeyB64url)
  // pub = 0x04 || X(32) || Y(32)
  const x = bytesToB64url(pub.slice(1, 33))
  const y = bytesToB64url(pub.slice(33, 65))
  const d = privateKeyB64url // 既に base64url の d 値
  const jwk: JsonWebKey = { kty: 'EC', crv: 'P-256', x, y, d, ext: true }
  return await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
}

// ── RFC 8291 aes128gcm 暗号化 ────────────────────────────────────────────────
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', bs(ikm), { name: 'HKDF' }, false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: bs(salt), info: bs(info) },
    key,
    length * 8,
  )
  return new Uint8Array(bits)
}

/**
 * 本文（plaintext）を購読鍵で aes128gcm 暗号化し、送信ボディ（単一レコード）を返す。
 * 戻り値はそのまま push endpoint への body（Content-Encoding: aes128gcm）。
 */
export async function encryptPayload(args: {
  payload: Uint8Array       // 平文（JSON のバイト列）
  p256dhB64url: string      // 受信側公開鍵（subscription.keys.p256dh）
  authB64url: string        // 受信側 auth secret（subscription.keys.auth）
}): Promise<Uint8Array> {
  const clientPub = b64urlToBytes(args.p256dhB64url)   // 65 byte raw
  const authSecret = b64urlToBytes(args.authB64url)    // 16 byte

  // 送信側 ephemeral ECDH 鍵ペア（P-256）。
  const localKeys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const localPubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', localKeys.publicKey)) // 65 byte

  // 受信側公開鍵を import して ECDH 共有秘密を導出。
  const importedClientPub = await crypto.subtle.importKey(
    'raw', bs(clientPub), { name: 'ECDH', namedCurve: 'P-256' }, false, [],
  )
  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: importedClientPub }, localKeys.privateKey, 256,
  )
  const ecdhSecret = new Uint8Array(sharedBits) // 32 byte

  const salt = crypto.getRandomValues(new Uint8Array(16))

  // RFC 8291 §3.4: PRK_key = HKDF(auth, ecdh, "WebPush: info\0"||ua_pub||as_pub, 32)
  const keyInfo = concat(
    enc.encode('WebPush: info\0'),
    clientPub,     // user agent public key (ua)
    localPubRaw,   // application server public key (as)
  )
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32)

  // CEK と nonce を ikm + salt から導出。
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12)

  // パディング区切り 0x02（最終レコード）。
  const padded = concat(args.payload, new Uint8Array([0x02]))

  const aesKey = await crypto.subtle.importKey('raw', bs(cek), { name: 'AES-GCM' }, false, ['encrypt'])
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: bs(nonce) }, aesKey, bs(padded)))

  // aes128gcm ヘッダ: salt(16) || rs(4, big-endian) || idlen(1) || keyid(idlen) || ciphertext
  // keyid = 送信側公開鍵（65 byte）。rs はレコードサイズ（>= ct 長で十分。4096 を採用）。
  const rs = 4096
  const header = new Uint8Array(16 + 4 + 1 + localPubRaw.length)
  header.set(salt, 0)
  // rs を big-endian 32bit で。
  header[16] = (rs >>> 24) & 0xff
  header[17] = (rs >>> 16) & 0xff
  header[18] = (rs >>> 8) & 0xff
  header[19] = rs & 0xff
  header[20] = localPubRaw.length // idlen
  header.set(localPubRaw, 21)

  return concat(header, ct)
}

export interface PushSubscriptionKeys {
  endpoint: string
  p256dh: string
  auth: string
}

export interface SendWebPushResult {
  ok: boolean
  statusCode: number
  /** 410 Gone / 404 Not Found = 失効（呼び出し側で購読を無効化する / AC-06）。 */
  expired: boolean
  body?: string
}

/**
 * 1 件の購読へプッシュを送る。例外は投げず result を返す（呼び出し側 fail-soft / NFR-237-03）。
 */
export async function sendWebPush(args: {
  subscription: PushSubscriptionKeys
  payload: string            // JSON 文字列
  vapidPublicKey: string
  vapidPrivateKey: string
  vapidSubject: string       // mailto: 等
  ttl?: number               // 既定 2419200（28 日）。push service が保持する上限。
}): Promise<SendWebPushResult> {
  try {
    const url = new URL(args.subscription.endpoint)
    const audience = `${url.protocol}//${url.host}`

    const body = await encryptPayload({
      payload: enc.encode(args.payload),
      p256dhB64url: args.subscription.p256dh,
      authB64url: args.subscription.auth,
    })

    const auth = await buildVapidAuthHeader({
      audience,
      subject: args.vapidSubject,
      publicKey: args.vapidPublicKey,
      privateKey: args.vapidPrivateKey,
    })

    const res = await fetch(args.subscription.endpoint, {
      method: 'POST',
      headers: {
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        'TTL': String(args.ttl ?? 2419200),
        'Urgency': 'normal',
        'Authorization': auth,
      },
      body: bs(body),
    })

    const expired = res.status === 404 || res.status === 410
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { ok: false, statusCode: res.status, expired, body: text }
    }
    return { ok: true, statusCode: res.status, expired: false }
  } catch (e) {
    // 送信例外（ネットワーク等）は失効扱いにはしない（一時障害の可能性）。
    return { ok: false, statusCode: 0, expired: false, body: String(e) }
  }
}
