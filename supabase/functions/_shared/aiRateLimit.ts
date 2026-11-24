// REQ-079 Phase 4: reanalysis 経路の日次呼び出し回数制限（post_id 単位・DB 集計）。
// REQ-212 FR-212-06: 上記に加え caller（user_id）/ IP 単位のスロットルを足し、横断的な
//   reanalysis 連打（多数の異なる post への呼び出し）による LLM コスト膨張を抑える（AC-06）。

// deno-lint-ignore no-explicit-any
type SupabaseLike = any

const REANALYSIS_DAILY_LIMIT = Number(Deno.env.get('AI_REANALYSIS_DAILY_LIMIT') ?? '3')

// REQ-212: caller（user_id）/ IP 単位の reanalysis 上限（既定 20 回 / 24h）。AI_REANALYSIS_* と同様に
//   環境変数で調整可能。post_id 単位（既定 3）より高めにし、「多数 post への横断連打」のみ頭打ちにする。
//   getMaxOutputTokens 等と同様に呼び出しごとに env を読む（module ロード順に依存せず、運用で
//   AI_REANALYSIS_CALLER_DAILY_LIMIT を切り替えやすくするため）。既定値 20・上限の意味は不変。
function getReanalysisCallerDailyLimit(): number {
  const raw = Deno.env.get('AI_REANALYSIS_CALLER_DAILY_LIMIT')
  const n = raw ? Number(raw) : NaN
  return Number.isFinite(n) && n > 0 ? n : 20
}
const CALLER_WINDOW_MS = 24 * 3600_000

export interface RateLimitCheckResult {
  allowed: boolean
  current: number
  limit: number
  retryAfterSeconds: number
}

export async function checkReanalysisRateLimit(
  supabase: SupabaseLike,
  postId: string,
  functionName: 'analyze-audio' | 'analyze-image',
): Promise<RateLimitCheckResult> {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString()
  try {
    const { count, error } = await supabase
      .from('ai_call_logs')
      .select('id', { head: true, count: 'exact' })
      .eq('post_id', postId)
      .eq('function_name', functionName)
      .eq('reanalysis', true)
      .gte('created_at', since)
    if (error) throw error
    const current = count ?? 0
    return {
      allowed: current < REANALYSIS_DAILY_LIMIT,
      current,
      limit: REANALYSIS_DAILY_LIMIT,
      retryAfterSeconds: 86400,
    }
  } catch (e) {
    // fail-closed: 取得失敗時は上限に達したものとして扱う（安全側）
    console.warn('[rate_limit] failed to count, fail-closed:', e)
    return {
      allowed: false,
      current: REANALYSIS_DAILY_LIMIT,
      limit: REANALYSIS_DAILY_LIMIT,
      retryAfterSeconds: 86400,
    }
  }
}

// REQ-212 FR-212-06: caller（user_id）/ IP 単位の reanalysis スロットル。
//
// 設計判断（schema 変更なし・依存ゼロ）:
//   ai_call_logs には caller/IP 列が無く、本 REQ のスコープ（公開エンドポイントのレート制限）では
//   AI ログテーブルへの列追加は行わない。そこで Edge Function ランタイムの **インメモリ** スライディング
//   ウィンドウで caller 単位の連打を間引く。Edge はワーカーごとにメモリが独立・揮発するため、これは
//   post_id 単位の DB 集計（checkReanalysisRateLimit・正確で永続）の上に重ねる「粗いふるい（バースト緩和）」。
//   横断的連打（多数 post への呼び出し）に対する caller 次元の頭打ちを、コストゼロで足すのが狙い。
//
//   fail-closed の方針: 既存の post_id 集計は取得失敗時 fail-closed。本 caller チェックはインメモリで
//   失敗経路が無い（例外を投げない）が、呼び出し側は post_id 集計（fail-closed）と AND で判定するため、
//   全体としての fail-closed 性は維持される。
const callerHits = new Map<string, number[]>()
const MAX_TRACKED_CALLERS = 10_000

export function checkReanalysisCallerRateLimit(callerKey: string): RateLimitCheckResult {
  const now = Date.now()
  const since = now - CALLER_WINDOW_MS
  const limit = getReanalysisCallerDailyLimit()

  // 簡易 LRU: 追跡数が上限を超えたら最古キーを 1 件捨てる（メモリ無制限増加の防止）。
  if (!callerHits.has(callerKey) && callerHits.size >= MAX_TRACKED_CALLERS) {
    const oldest = callerHits.keys().next().value
    if (oldest !== undefined) callerHits.delete(oldest)
  }

  const hits = (callerHits.get(callerKey) ?? []).filter((t) => t > since)
  const current = hits.length
  if (current >= limit) {
    // 最古のヒットがウィンドウから外れるまでの残り秒数（最低 1 秒）。
    const oldestHit = hits[0] ?? now
    const retryAfterSeconds = Math.max(1, Math.ceil((oldestHit + CALLER_WINDOW_MS - now) / 1000))
    callerHits.set(callerKey, hits)
    return { allowed: false, current, limit, retryAfterSeconds }
  }

  hits.push(now)
  callerHits.set(callerKey, hits)
  return {
    allowed: true,
    current: current + 1,
    limit,
    retryAfterSeconds: 0,
  }
}

// caller のキー: 認証ユーザーは user:<id>、未認証（token なし等）は ip:<ip> にフォールバック。
// IP は extract_request_ip と同優先順（cf-connecting-ip → x-forwarded-for 末尾 → x-real-ip）。
export function reanalysisCallerKey(userId: string | null | undefined, req: Request): string {
  if (userId) return `user:${userId}`
  const h = req.headers
  const cf = h.get('cf-connecting-ip')?.trim()
  if (cf) return `ip:${cf}`
  const xff = h.get('x-forwarded-for')
  if (xff) {
    const parts = xff.split(',')
    const last = parts[parts.length - 1]?.trim()
    if (last) return `ip:${last}`
  }
  const real = h.get('x-real-ip')?.trim()
  if (real) return `ip:${real}`
  return 'ip:unknown'
}
