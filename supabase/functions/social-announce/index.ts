/**
 * social-announce Edge Function (REQ-236 FR-236-06)
 *
 * 注目投稿（AI 高精度同定・珍しい種・新地域の初観察）やマイルストーンを、運営アカウントから
 * 集約 API（Late 等）へ **サーバー側 fetch** で OGP 付き告知する。継続的なオーガニック流入を作る。
 *
 * 起動: 他の notify-* と同様に webhook secret 保護（pg_cron→pg_net もしくは運営の手動 POST）。
 *
 * 設計（本 REQ スコープ＝最小実装＋設定外出し。ユーザーシェア強化が主、自動告知は土台）:
 *   - 候補選定しきい値は環境変数で外出し（コード改変なしに運営が調整可能）。
 *   - 冪等性: 同一投稿を二重告知しない。本 REQ では schema 変更（マイグレーション）を伴わない方針のため、
 *     プライベート Storage バケット（SOCIAL_ANNOUNCE_BUCKET / 既定 'social-announce-state'）に
 *     marker オブジェクト `posts/<id>.json` を「無ければ作成（upsert:false）」で書き込み、
 *     既に存在＝告知済みとして skip する（NFR-236-02 冪等性 / AC-06 二重投稿防止）。
 *     ※将来 posts に announced_at 列 or social_announce_log テーブルを足す場合は後続 REQ で置換可能。
 *   - リトライ上限・レート制限・fail-soft（個別投稿の失敗は続行 / 全体は止めない）。
 *   - dry-run（SOCIAL_ANNOUNCE_DRY_RUN 既定 'true'）= 運営確認モード:
 *     候補抽出と marker は行うが**実投稿はしない**。全自動にするには運営が DRY_RUN=false を設定する
 *     （承認フロー。暴走防止の詳細＝REQ-218 は本スコープ外＝前提）。
 *   - 投稿先 URL には UTM を付与（utm_source=auto / utm_medium=social / utm_campaign=auto_announce）。
 *   - OGP は canonical URL（/post/<id>）を集約 API に渡し、リンクカードとして展開させる
 *     （OG タグ自体は Next 側で実装済み。動的 OG 最適化は REQ-027 に依存）。
 *
 * 【必要な環境変数（すべてサーバー専用・NEXT_PUBLIC_ 厳禁 / NFR-236-01）】
 *   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / WEBHOOK_SECRET
 *   LATE_API_URL（集約 API のエンドポイント）/ LATE_API_KEY（Bearer トークン）
 *   任意: SITE_URL（既定 https://zaridasu.com）
 *         SOCIAL_ANNOUNCE_DRY_RUN（既定 'true'）
 *         SOCIAL_ANNOUNCE_BUCKET（既定 'social-announce-state'）
 *         SOCIAL_ANNOUNCE_CONFIDENCE_MIN（AI 同定の最低信頼度・既定 0.85）
 *         SOCIAL_ANNOUNCE_RARE_SPECIES（カンマ区切り・例 'bullfrog'）
 *         SOCIAL_ANNOUNCE_BATCH_LIMIT（1 回の最大告知件数＝レート制限・既定 5）
 *         SOCIAL_ANNOUNCE_LOOKBACK_HOURS（候補の対象期間・既定 24）
 *         SOCIAL_ANNOUNCE_MAX_RETRIES（API 投稿のリトライ上限・既定 2）
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireWebhookSecret, WebhookAuthError } from '../_shared/webhookAuth.ts'
import { jsonOk, jsonFail, corsHeaders } from '../_shared/mailer.ts'
import { createServiceClient } from '../_shared/supabaseAdmin.ts'

const siteUrl = (Deno.env.get('SITE_URL') ?? 'https://zaridasu.com').replace(/\/$/, '')

const SPECIES_LABELS: Record<string, string> = {
  american: 'アメリカザリガニ',
  bullfrog: 'ウシガエル',
}
const INFO_TYPE_LABELS: Record<string, string> = {
  sighting: '目撃',
  capture: '捕獲',
  trace: '痕跡',
  damage: '農業被害',
  absence: '不在',
}

const numEnv = (name: string, fallback: number): number => {
  const v = Number(Deno.env.get(name))
  return Number.isFinite(v) && v > 0 ? v : fallback
}
const boolEnv = (name: string, fallback: boolean): boolean => {
  const v = Deno.env.get(name)
  if (v == null) return fallback
  return v.toLowerCase() === 'true' || v === '1'
}

interface PostRow {
  id: string
  created_at: string
  species: string
  info_type: string
  municipality: string | null
  status: string
  ai_result: { confidence?: number | null; species_match?: boolean | null } | null
}

/** UTM 付きの canonical 投稿 URL。 */
function announceUrl(postId: string): string {
  const u = new URL(`${siteUrl}/post/${postId}`)
  u.searchParams.set('utm_source', 'auto')
  u.searchParams.set('utm_medium', 'social')
  u.searchParams.set('utm_campaign', 'auto_announce')
  return u.toString()
}

/** 告知文（運営アカウント想定・控えめ）。OGP リンクカードで詳細は補う。 */
function announceText(post: PostRow): string {
  const sp = SPECIES_LABELS[post.species] ?? post.species
  const info = INFO_TYPE_LABELS[post.info_type] ?? post.info_type
  const place = post.municipality ? `秋田県${post.municipality}` : '秋田県'
  return `【新着】${place}で${sp}の${info}情報が共有されました。地図で確認できます。`
}

/**
 * 注目投稿の判定（しきい値は env で外出し）。
 *   (a) AI 高精度同定（confidence >= MIN かつ species_match）
 *   (b) 珍しい種（SOCIAL_ANNOUNCE_RARE_SPECIES に含まれる）
 * 「新地域の初観察」はマイグレーションなしでの厳密判定が難しいため、本実装では (a)(b) を対象とする
 * （後続 REQ で集計 RPC を足せば拡張可能）。
 */
function isNotable(post: PostRow): boolean {
  const confMin = (() => {
    const v = Number(Deno.env.get('SOCIAL_ANNOUNCE_CONFIDENCE_MIN'))
    return Number.isFinite(v) && v > 0 && v <= 1 ? v : 0.85
  })()
  const rare = (Deno.env.get('SOCIAL_ANNOUNCE_RARE_SPECIES') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const conf = post.ai_result?.confidence
  const highConfidence = typeof conf === 'number' && conf >= confMin && post.ai_result?.species_match === true
  const isRare = rare.includes(post.species)
  return highConfidence || isRare
}

/**
 * Storage marker による冪等性チェック＆確保。
 * 既に marker があれば false（= 告知済み・skip）。無ければ作成して true（= 今回告知して良い）。
 * upsert:false なので競合（同時起動）でも二重投稿しない（先勝ち / NFR-236-02）。
 */
async function claimMarker(
  supabase: SupabaseClient,
  bucket: string,
  postId: string,
): Promise<boolean> {
  const path = `posts/${postId}.json`
  const body = new Blob([JSON.stringify({ post_id: postId, claimed_at: new Date().toISOString() })], {
    type: 'application/json',
  })
  const { error } = await supabase.storage.from(bucket).upload(path, body, {
    upsert: false,
    contentType: 'application/json',
  })
  if (!error) return true
  // 既に存在（Duplicate）＝告知済み。それ以外のエラーは安全側に倒して skip（fail-soft）。
  const msg = (error.message ?? '').toLowerCase()
  if (msg.includes('exist') || msg.includes('duplicate') || msg.includes('already')) return false
  console.warn('[social-announce] marker upload error (skip to be safe):', error.message)
  return false
}

/** marker を取り消す（投稿が結局失敗したとき再試行できるよう解放する）。失敗は無視。 */
async function releaseMarker(supabase: SupabaseClient, bucket: string, postId: string): Promise<void> {
  try {
    await supabase.storage.from(bucket).remove([`posts/${postId}.json`])
  } catch (e) {
    console.warn('[social-announce] marker release failed:', e)
  }
}

/** 集約 API へ 1 投稿を告知（リトライ上限つき）。成功で true。 */
async function postToAggregator(post: PostRow, maxRetries: number): Promise<boolean> {
  const apiUrl = Deno.env.get('LATE_API_URL')
  const apiKey = Deno.env.get('LATE_API_KEY')
  if (!apiUrl || !apiKey) {
    console.warn('[social-announce] LATE_API_URL / LATE_API_KEY 未設定。実投稿をスキップ（fail-soft）')
    return false
  }
  const payload = {
    content: announceText(post),
    // 集約 API は link を OGP 展開する想定。UTM 付き canonical を渡す。
    link: announceUrl(post.id),
  }
  let lastErr: unknown = null
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          // x-request-id（=投稿 ID）で集約 API 側でも冪等化（二重投稿防止 / FR-236-06）。
          'x-request-id': post.id,
          'Idempotency-Key': post.id,
        },
        body: JSON.stringify(payload),
      })
      if (res.ok) return true
      // 4xx は再試行しても無駄（リトライ上限以前に打ち切り）。5xx のみ再試行。
      if (res.status >= 400 && res.status < 500) {
        console.warn(`[social-announce] aggregator 4xx (${res.status}) post=${post.id}, no retry`)
        return false
      }
      lastErr = new Error(`aggregator ${res.status}`)
    } catch (e) {
      lastErr = e
    }
    // 簡易バックオフ（指数）。最後の試行後は待たない。
    if (attempt < maxRetries) {
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt))
    }
  }
  console.error(`[social-announce] aggregator post failed after retries post=${post.id}:`, lastErr)
  return false
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    requireWebhookSecret(req)
  } catch (e) {
    if (e instanceof WebhookAuthError) {
      console.warn('[social-announce] webhook secret mismatch')
      return jsonFail({ error: 'unauthorized' }, 401)
    }
    throw e
  }

  try {
    const supabase = createServiceClient()
    const dryRun = boolEnv('SOCIAL_ANNOUNCE_DRY_RUN', true)
    const bucket = Deno.env.get('SOCIAL_ANNOUNCE_BUCKET') ?? 'social-announce-state'
    const batchLimit = numEnv('SOCIAL_ANNOUNCE_BATCH_LIMIT', 5)
    const lookbackHours = numEnv('SOCIAL_ANNOUNCE_LOOKBACK_HOURS', 24)
    const maxRetries = Math.max(0, Math.floor(numEnv('SOCIAL_ANNOUNCE_MAX_RETRIES', 2)))
    const since = new Date(Date.now() - lookbackHours * 3600_000).toISOString()

    // 公開（approved）かつ対象期間の投稿を新しい順に取得。座標・PII 列は取得しない（NFR / 最小列）。
    const { data, error } = await supabase
      .from('posts')
      .select('id, created_at, species, info_type, municipality, status, ai_result')
      .eq('status', 'approved')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) return jsonFail({ error: error.message })

    const posts = (data ?? []) as PostRow[]
    const notable = posts.filter(isNotable)

    let announced = 0
    let skipped = 0
    let failed = 0
    const candidates: string[] = []

    for (const post of notable) {
      if (announced >= batchLimit) break // レート制限（1 回の最大告知件数）。
      try {
        // 冪等性: marker を先取り（既に告知済みなら skip）。
        const claimed = await claimMarker(supabase, bucket, post.id)
        if (!claimed) {
          skipped += 1
          continue
        }
        candidates.push(post.id)

        if (dryRun) {
          // 運営確認モード: 候補として記録するが実投稿はしない（承認フロー）。
          announced += 1
          continue
        }

        const ok = await postToAggregator(post, maxRetries)
        if (ok) {
          announced += 1
        } else {
          // 投稿失敗なら marker を解放して次回再試行できるようにする（fail-soft）。
          await releaseMarker(supabase, bucket, post.id)
          failed += 1
        }
      } catch (e) {
        console.error('[social-announce] candidate failed:', post.id, e)
        await releaseMarker(supabase, bucket, post.id)
        failed += 1
      }
    }

    return jsonOk({
      dry_run: dryRun,
      scanned: posts.length,
      notable: notable.length,
      announced,
      skipped,
      failed,
      candidates,
    })
  } catch (e) {
    console.error('[social-announce] エラー:', e)
    return jsonFail({ error: String(e) })
  }
})
