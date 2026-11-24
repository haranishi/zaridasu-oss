import { NextResponse, type NextRequest } from 'next/server'
import { isIP } from 'node:net'
import { isCloudflareRuntime, privateNoStore } from '@/lib/serverRuntime'
import { updateSession } from '@/lib/supabase/middleware'

// REQ-212 FR-212-01 / NFR-212-02: Proxy 層の軽量レート制限。
//
// 設計判断（一人運用の卒研 PF・外部 KV 無し）:
//   本 PF の公開書き込み（投稿/通報/コメント/いいね/調査依頼）はブラウザから Supabase PostgREST を
//   直接叩く構成で Next.js を経由しない。そのため公開書き込みの本丸の上限強制は **DB トリガー**
//   （reports/comments/likes/posts/survey_requests・最終防衛線）と **CAPTCHA**（認証系）で担保する。
//   middleware では外部 KV（Upstash 等）を追加せず（依存ゼロ方針）、Next.js を経由する経路＝
//   matcher 対象（/admin・/dashboard。特に /admin/login のブルートフォース到達面）に対して、
//   インメモリのトークンバケットで「同一インスタンスに来たバースト」を早期に間引く軽量な前段を置く。
//
//   制約と性質:
//     - Serverless はインスタンスごとにメモリが独立・揮発するため、これは「完全な上限」ではなく
//       バースト緩和（粗いふるい）。正確な上限・分散攻撃対策は DB 側（admin_login_* / 各トリガー）が担う。
//     - 認証必須経路（/admin・/dashboard）の書き込み的アクセスを守る方向なので、超過時は 429 を返す
//       （fail-closed 寄り）。閲覧系の公開ページは matcher 外＝この制限を一切受けない（fail-open / 可用性優先）。
//     - matcher は広げない（公開ページに余計なレイテンシ・誤検知を持ち込まない / NFR-212-02）。

interface Bucket {
  count: number
  resetAt: number
}

// インスタンスローカルなカウンタ。プロセス再起動・別インスタンスでリセットされる前提（粗いふるい）。
const ipBuckets = new Map<string, Bucket>()

// 固定ウィンドウ。/admin・/dashboard への正規アクセス頻度を十分上回る高めのしきい値にし、
// 正規ユーザーを巻き込まず明確なバーストのみ弾く。
const WINDOW_MS = 60_000
const MAX_REQUESTS_PER_WINDOW = 60
// Map の無制限増加を防ぐ素朴な上限（超えたら最古を捨てる）。
const MAX_TRACKED_IPS = 5_000

// Legacy Vercel/local classification. Cloudflare never uses this to skip a bucket.
export function isLocalIp(ip: string): boolean {
  if (
    ip === 'unknown' ||
    ip === 'localhost' ||
    ip === '::1' ||
    ip === '::ffff:127.0.0.1' ||
    ip.startsWith('127.') || // IPv4 loopback 127.0.0.0/8
    ip.startsWith('10.') || // private 10.0.0.0/8
    ip.startsWith('192.168.') || // private 192.168.0.0/16
    ip.startsWith('169.254.') || // link-local 169.254.0.0/16
    ip.startsWith('fc') || // IPv6 ULA fc00::/7
    ip.startsWith('fd') || // IPv6 ULA fd00::/8
    ip.startsWith('fe80:') || // IPv6 link-local
    ip.startsWith('::ffff:10.') || // IPv4-mapped private
    ip.startsWith('::ffff:192.168.') ||
    ip.startsWith('::ffff:127.')
  ) {
    return true
  }
  // private 172.16.0.0/12（172.16.* 〜 172.31.*）。IPv4-mapped (::ffff:172.x.y.z) も同様に扱う。
  const v4 = ip.startsWith('::ffff:') ? ip.slice('::ffff:'.length) : ip
  if (v4.startsWith('172.')) {
    const second = Number(v4.split('.')[1])
    if (Number.isInteger(second) && second >= 16 && second <= 31) return true
  }
  return false
}

// The deployment selects the trusted provider. CF-Worker and forwarding headers
// cannot select Cloudflare mode. This assumes the configured CF edge is the ingress;
// same-zone Workers can alter the source header, so this is burst mitigation only.
export function clientIp(request: NextRequest): string {
  if (isCloudflareRuntime()) {
    const ip = request.headers.get('cf-connecting-ip')?.trim() ?? ''
    const version = isIP(ip)
    if (!version) return 'unknown'
    // Canonicalize IPv6 variants to one key. Ports, lists and zone IDs are rejected.
    if (ip.includes('%')) return 'unknown'
    return version === 6 ? new URL(`http://[${ip}]`).hostname.slice(1, -1) : ip
  }

  // Retain the existing Vercel/local behavior outside configured Cloudflare deployments.
  // 1) Vercel が付与する信頼ヘッダ（本番のクライアント実 IP）。
  const vercel = request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim()
  if (vercel && !isLocalIp(vercel)) return vercel

  // 2) Existing fallback for Vercel/local deployments.
  const cf = request.headers.get('cf-connecting-ip')?.trim()
  if (cf && !isLocalIp(cf)) return cf

  // 3) x-forwarded-for: 末尾から遡り、ローカルでない最初のアドレスを採用（末尾盲信しない）。
  const xff = request.headers.get('x-forwarded-for')
  if (xff) {
    const parts = xff.split(',').map(p => p.trim()).filter(Boolean)
    for (let i = parts.length - 1; i >= 0; i--) {
      const ip = parts[i]
      if (ip && !isLocalIp(ip)) return ip
    }
    // XFF はあるが全部ローカル（ローカル開発・E2E の `127.0.0.1` 等）→ ローカル扱い。
  }

  // 4) x-real-ip フォールバック。
  const real = request.headers.get('x-real-ip')?.trim()
  if (real && !isLocalIp(real)) return real

  // すべて欠落 or 全部ローカル → 'unknown'（呼び出し側でレート制限スキップ）。
  return 'unknown'
}

// 超過していれば残り秒数を返す。未超過なら null。
function rateLimited(ip: string): number | null {
  const now = Date.now()
  let bucket = ipBuckets.get(ip)
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + WINDOW_MS }
    if (ipBuckets.size >= MAX_TRACKED_IPS) {
      const oldest = ipBuckets.keys().next().value
      if (oldest !== undefined) ipBuckets.delete(oldest)
    }
    ipBuckets.set(ip, bucket)
  }
  bucket.count += 1
  if (bucket.count > MAX_REQUESTS_PER_WINDOW) {
    return Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
  }
  return null
}

export async function proxy(request: NextRequest) {
  // Cloudflare counts missing/invalid/private/loopback sources too. Unknown
  // sources share a bucket; never fall back to visitor-controlled forwarding headers.
  const ip = clientIp(request)
  if (isCloudflareRuntime() || !isLocalIp(ip)) {
    const retryAfter = rateLimited(ip)
    if (retryAfter !== null) {
      return privateNoStore(new NextResponse(
        JSON.stringify({ error: 'rate_limit_exceeded', retry_after_seconds: retryAfter }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(retryAfter),
            'Cache-Control': 'no-store',
          },
        },
      ), true)
    }
  }

  return await updateSession(request)
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/admin/:path*',
  ],
}
