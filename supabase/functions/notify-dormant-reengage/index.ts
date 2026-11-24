/**
 * notify-dormant-reengage Edge Function (REQ-234 FR-234-06)
 *
 * 直近 14 日に投稿・コメント・サインインが無いユーザ（休眠）へ、価値提示型の復帰メールを送る。
 * migration 20260615000006 の pg_cron（日次）→ run_dormant_reengage_batch() → pg_net で起動される
 * （payload は空）。対象抽出は RPC get_dormant_users（14 日無活動 + opt-in + 再送下限 30 日）。
 *
 * 設計（先回り介入 / 04_デジタルマーケ L181、ただし L70 のベイト/強制は避け穏当に）:
 *   - 本文は「お久しぶりです。あなたの地域で新しい観察が増えています」など価値提示型。
 *   - 地域情報は市区町村粒度の集計のみ（個別投稿の位置は出さない / NFR-234-03）。
 *   - 再送間隔の下限（30 日）は get_dormant_users 側で担保（しつこい再送防止 / NFR-234-02）。
 *   - fail-soft: 個別宛先の送信失敗は続行（NFR-234-01）。冪等: 送信済みは lifecycle_email_log で記録。
 *
 * 【必要な環境変数】RESEND_API_KEY / SITE_URL / NOTIFY_FROM_EMAIL / WEBHOOK_SECRET / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
 *   任意: DORMANT_DAYS（既定 14）/ DORMANT_RESEND_MIN_DAYS（既定 30）/ DORMANT_BATCH_LIMIT（既定 200）
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

const num = (name: string, fallback: number): number => {
  const v = Number(Deno.env.get(name))
  return Number.isFinite(v) && v > 0 ? v : fallback
}

interface DormantUser {
  user_id: string
  last_active_at: string
  municipality: string | null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    requireWebhookSecret(req)
  } catch (e) {
    if (e instanceof WebhookAuthError) {
      console.warn('[notify-dormant-reengage] webhook secret mismatch')
      return jsonFail({ error: 'unauthorized' }, 401)
    }
    throw e
  }

  try {
    const supabase = createServiceClient()
    const apiKey = Deno.env.get('RESEND_API_KEY')

    const { data: targets, error } = await supabase.rpc('get_dormant_users', {
      p_dormant_days: num('DORMANT_DAYS', 14),
      p_resend_min_days: num('DORMANT_RESEND_MIN_DAYS', 30),
      p_limit: num('DORMANT_BATCH_LIMIT', 200),
    })
    if (error) return jsonFail({ error: error.message })

    const users = (targets ?? []) as DormantUser[]
    let sent = 0
    let skipped = 0

    for (const u of users) {
      try {
        // 市区町村粒度の「新着件数」を価値提示（座標・個別投稿は出さない）。
        let newCount = 0
        if (u.municipality) {
          const { data: digest } = await supabase.rpc('get_municipality_weekly_digest', {
            p_municipality: u.municipality,
          })
          newCount = Number((digest as { total?: number } | null)?.total ?? 0)
        }

        const areaLine = u.municipality
          ? `あなたの地域 <strong>${escapeHtml(u.municipality)}</strong> では、この 1 週間で <strong>${newCount}</strong> 件の新しい観察が記録されました。`
          : 'あなたの地域でも、新しい観察が日々記録されています。'

        const bodyHtml = `
          <h2 style="color: #dc2626; margin-bottom: 4px;">🦞 ザリダス</h2>
          <p style="color: #374151;">お久しぶりです。</p>
          <p style="color: #374151; font-size: 14px;">${areaLine}</p>
          <p style="color: #374151; font-size: 14px;">あなたの観察も、外来生物の分布を知る大切な手がかりになります。お散歩のついでに、見かけた生きものを記録してみませんか。</p>
          <a href="${siteUrl}/" style="display: inline-block; background: #dc2626; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; margin-top: 8px;">マップを見る</a>
        `

        const result = await sendLifecycleEmail({
          supabase,
          apiKey,
          userId: u.user_id,
          category: 'dormant_reengage',
          subject: '🦞 お久しぶりです。あなたの地域の新着観察',
          bodyHtml,
        })

        if (result.sent) {
          await recordLifecycleEmail(supabase, 'dormant_reengage', u.user_id)
          sent += 1
        } else {
          skipped += 1
        }
      } catch (e) {
        // fail-soft: 個別失敗は続行（NFR-234-01）。
        console.error('[notify-dormant-reengage] send failed:', e)
        skipped += 1
      }
    }

    return jsonOk({ attempted: users.length, sent, skipped })
  } catch (e) {
    console.error('[notify-dormant-reengage] エラー:', e)
    return jsonFail({ error: String(e) })
  }
})
