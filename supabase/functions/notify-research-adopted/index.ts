/**
 * notify-research-adopted Edge Function (REQ-234 FR-234-05)
 *
 * 「あなたの観察が研究の集計に採用されました」という研究採用通知を投稿者本人へ 1 回だけ送る。
 * migration 20260615000006 の adopt_post_research() → call_notify_research_adopted() → pg_net で
 * 起動される（payload は { post_id }）。
 *
 * 既存 notify-post-status と同じ防御パターン:
 *   (a) webhook 共有秘密検証（_shared/webhookAuth.ts・grace period 含む）
 *   (b) payload は post_id のみ信用し posts を service-role で再 fetch（フィッシング文面混入防止）
 *   (c) escapeHtml で本文をエスケープ（_shared/mailer.ts）
 *   (d) 共通 mailer で notify_research_adopted opt-in を確認して送る + List-Unsubscribe 付与
 *   (e) 多重送信防止: research_adopted_notified_at が既にセット済みならスキップ（NFR-234-02）
 *
 * PII（REQ-211 / NFR-234-03）: 本文に lat/lng・reporter_ip・個人特定情報は載せない。
 * 地域は市区町村粒度まで。1 メッセージ 1 ゴール（マイページ/該当投稿への CTA を 1 つ）。
 *
 * 【必要な環境変数（Supabase Dashboard → Edge Functions → Secrets）】
 *   RESEND_API_KEY / SITE_URL / NOTIFY_FROM_EMAIL / WEBHOOK_SECRET / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { requireWebhookSecret, WebhookAuthError } from '../_shared/webhookAuth.ts'
import {
  createServiceClient,
  sendLifecycleEmail,
  recordLifecycleEmail,
  escapeHtml,
  jsonOk,
  jsonFail,
  corsHeaders,
} from '../_shared/mailer.ts'

const siteUrl = (Deno.env.get('SITE_URL') ?? 'https://zaridasu.com').replace(/\/$/, '')

const SPECIES_LABELS: Record<string, string> = {
  american: 'アメリカザリガニ',
  bullfrog: 'ウシガエル',
}

interface PostRow {
  id: string
  user_id: string | null
  species: string | null
  municipality: string | null
  research_adopted_at: string | null
  research_adopted_notified_at: string | null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // (a) webhook 共有秘密。未設定なら grace period として通過。
  try {
    requireWebhookSecret(req)
  } catch (e) {
    if (e instanceof WebhookAuthError) {
      console.warn('[notify-research-adopted] webhook secret mismatch')
      return jsonFail({ error: 'unauthorized' }, 401)
    }
    throw e
  }

  try {
    const payload = await req.json().catch(() => ({}))
    const postId = payload?.post_id as string | undefined
    if (!postId) return jsonFail({ error: 'invalid_payload' }, 400)

    const supabase = createServiceClient()

    // (b) post_id のみ信用して再 fetch（payload を信用しない）。
    const { data: post, error: fetchErr } = await supabase
      .from('posts')
      .select('id, user_id, species, municipality, research_adopted_at, research_adopted_notified_at')
      .eq('id', postId)
      .maybeSingle<PostRow>()
    if (fetchErr || !post) return jsonOk({ skipped: 'not_found' })

    // 採用されていない / 既に通知済み（多重送信防止 / NFR-234-02）。
    if (!post.research_adopted_at) return jsonOk({ skipped: 'not_adopted' })
    if (post.research_adopted_notified_at) return jsonOk({ skipped: 'already_notified' })

    // 匿名投稿は対象外（既存 notify-post-status と同じ扱い）。
    if (!post.user_id) return jsonOk({ skipped: 'anonymous_post' })

    const apiKey = Deno.env.get('RESEND_API_KEY')
    const speciesLabel = SPECIES_LABELS[post.species ?? ''] ?? post.species ?? '生きもの'
    const municipality = post.municipality ?? null
    const postUrl = `${siteUrl}/post/${post.id}`

    // 本文（PII を載せない・市区町村粒度まで・1 メッセージ 1 ゴール）。
    const bodyHtml = `
      <h2 style="color: #16a34a; margin-bottom: 4px;">🔬 ザリダス</h2>
      <p style="color: #374151;">あなたの観察が<strong>研究の集計に採用</strong>されました。</p>
      <p style="color: #374151; font-size: 14px;">あなたの一件一件の観察が、外来生物の分布を明らかにする本物の研究データになっています。ご協力ありがとうございます。</p>
      <table style="width:100%; border-collapse:collapse; margin: 16px 0; background:#f0fdf4; border-radius:8px; overflow:hidden;">
        <tr><td style="padding:10px 14px; color:#6b7280; font-size:13px; width:40%; border-bottom:1px solid #dcfce7;">対象</td><td style="padding:10px 14px; font-size:13px; font-weight:600; border-bottom:1px solid #dcfce7;">${escapeHtml(speciesLabel)}</td></tr>
        ${municipality ? `<tr><td style="padding:10px 14px; color:#6b7280; font-size:13px;">地域</td><td style="padding:10px 14px; font-size:13px;">${escapeHtml(municipality)}</td></tr>` : ''}
      </table>
      <a href="${postUrl}" style="display: inline-block; background: #16a34a; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; margin-top: 8px;">採用された観察を見る</a>
    `

    const result = await sendLifecycleEmail({
      supabase,
      apiKey,
      userId: post.user_id,
      category: 'research_adopted',
      subject: '🔬 あなたの観察が研究に採用されました',
      bodyHtml,
    })

    if (!result.sent) {
      // opt-out / メール無しでも notified_at は立てない（採用が再通知できる状態を保つため）。
      // ただし RESEND_API_KEY 無し（dev）は記録もしない。
      return jsonOk({ skipped: result.reason, post_id: post.id })
    }

    // 送信成功 → 記録 + notified_at を 1 回セット（冪等 / 多重送信防止）。
    await recordLifecycleEmail(supabase, 'research_adopted', post.user_id, post.id, true)
    console.log(`[notify-research-adopted] post ${post.id} 採用通知送信`)
    return jsonOk({ sent: true, post_id: post.id })
  } catch (e) {
    console.error('[notify-research-adopted] エラー:', e)
    return jsonFail({ error: String(e) })
  }
})
