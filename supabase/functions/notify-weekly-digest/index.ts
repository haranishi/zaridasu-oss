/**
 * notify-weekly-digest Edge Function (REQ-234 FR-234-07)
 *
 * opt-in ユーザへ、そのユーザの市区町村における直近 1 週間の新着投稿件数・種別内訳を週 1 回送る。
 * migration 20260615000006 の pg_cron（週次）→ run_weekly_digest_batch() → pg_net で起動される
 * （payload は空）。対象抽出は RPC get_weekly_digest_recipients（opt-in・市区町村あり・直近週未送信）。
 * 集計は RPC get_municipality_weekly_digest（市区町村粒度のみ・座標/PII を返さない / NFR-234-03）。
 *
 * 設計:
 *   - 全件転送やメール本文への座標掲載はしない（市区町村粒度の集計のみ / NFR-234-03・AC-06）。
 *   - 週 1 回保証は get_weekly_digest_recipients 側の「直近 6 日未送信」で担保（pg_cron 二重発火対策 / NFR-234-02）。
 *   - 新着 0 件の市区町村はスキップ（虚無メールを送らない＝配信頻度の自律抑制 / FR-234-10 思想）。
 *   - fail-soft: 個別宛先の送信失敗は続行（NFR-234-01）。
 *
 * 【必要な環境変数】RESEND_API_KEY / SITE_URL / NOTIFY_FROM_EMAIL / WEBHOOK_SECRET / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
 *   任意: WEEKLY_BATCH_LIMIT（既定 500）
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
const INFO_TYPE_LABELS: Record<string, string> = {
  sighting: '目撃',
  capture: '捕獲',
  trace: '痕跡',
  damage: '農業被害',
  absence: '不在',
}

interface Recipient {
  user_id: string
  municipality: string | null
}
interface Digest {
  municipality: string
  total: number
  by_species: Record<string, number>
  by_info_type: Record<string, number>
}

const num = (name: string, fallback: number): number => {
  const v = Number(Deno.env.get(name))
  return Number.isFinite(v) && v > 0 ? v : fallback
}

/** 集計 jsonb をテーブル行 HTML に整形（市区町村粒度のみ）。 */
function renderBreakdown(map: Record<string, number>, labels: Record<string, string>): string {
  const rows = Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 14px; color:#6b7280; font-size:13px; border-bottom:1px solid #e5e7eb;">${escapeHtml(labels[k] ?? k)}</td><td style="padding:6px 14px; font-size:13px; font-weight:600; border-bottom:1px solid #e5e7eb;">${v}</td></tr>`,
    )
    .join('')
  return rows
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    requireWebhookSecret(req)
  } catch (e) {
    if (e instanceof WebhookAuthError) {
      console.warn('[notify-weekly-digest] webhook secret mismatch')
      return jsonFail({ error: 'unauthorized' }, 401)
    }
    throw e
  }

  try {
    const supabase = createServiceClient()
    const apiKey = Deno.env.get('RESEND_API_KEY')

    const { data: recips, error } = await supabase.rpc('get_weekly_digest_recipients', {
      p_limit: num('WEEKLY_BATCH_LIMIT', 500),
    })
    if (error) return jsonFail({ error: error.message })

    const recipients = (recips ?? []) as Recipient[]

    // 市区町村ごとに集計をキャッシュ（同一市区町村の複数ユーザで RPC を再利用）。
    const digestCache = new Map<string, Digest>()
    let sent = 0
    let skipped = 0

    for (const r of recipients) {
      try {
        if (!r.municipality) {
          skipped += 1
          continue
        }
        let digest = digestCache.get(r.municipality)
        if (!digest) {
          const { data } = await supabase.rpc('get_municipality_weekly_digest', {
            p_municipality: r.municipality,
          })
          digest = (data as Digest | null) ?? {
            municipality: r.municipality,
            total: 0,
            by_species: {},
            by_info_type: {},
          }
          digestCache.set(r.municipality, digest)
        }

        // 新着 0 件はスキップ（虚無メールを送らない / 配信頻度の自律抑制）。
        if (!digest.total || digest.total <= 0) {
          skipped += 1
          continue
        }

        const speciesRows = renderBreakdown(digest.by_species ?? {}, SPECIES_LABELS)
        const infoRows = renderBreakdown(digest.by_info_type ?? {}, INFO_TYPE_LABELS)

        // REQ-251 FR-251-04: 進捗（貢献レベル/XP）の穏やかな一行を添える。
        //   既存の週次オプトイン（notify_weekly_digest）と「週 1 回」上限をそのまま尊重し、新しい配信経路や
        //   通知トリガーは作らない（軽量・過剰通知回避 / NFR-251-04）。本人自身の進捗のみを本人に見せる＝PII 安全
        //   （REQ-211）。fail-soft: 取得失敗/未設定なら行を省く（本文は必ず送る）。
        //   xp_for_level(L)=25*(L-1)*L（schema.sql と同式）。次レベルまで = xp_for_level(level+1) - xp。
        let progressHtml = ''
        try {
          const { data: prog } = await supabase
            .from('user_progress')
            .select('xp, level')
            .eq('user_id', r.user_id)
            .maybeSingle()
          if (prog && typeof prog.level === 'number' && typeof prog.xp === 'number') {
            const remaining = Math.max(0, 25 * prog.level * (prog.level + 1) - prog.xp)
            progressHtml = `<p style="color:#374151; font-size:14px; margin-top:16px;">あなたの貢献レベルは <strong>Lv ${prog.level}</strong>（累計 ${prog.xp} XP）です。次のレベルまであと <strong>${remaining}</strong> XP です。</p>`
          }
        } catch {
          progressHtml = ''
        }

        const bodyHtml = `
          <h2 style="color: #2563eb; margin-bottom: 4px;">🗺️ ザリダス 週刊ダイジェスト</h2>
          <p style="color: #374151;"><strong>${escapeHtml(r.municipality)}</strong> のこの 1 週間の観察まとめです。</p>
          <p style="color: #374151; font-size: 14px;">新しい観察：<strong>${digest.total}</strong> 件</p>
          ${speciesRows ? `<p style="font-size:13px; color:#6b7280; margin:12px 0 4px;">種類別</p><table style="width:100%; border-collapse:collapse; background:#eff6ff; border-radius:8px; overflow:hidden;">${speciesRows}</table>` : ''}
          ${infoRows ? `<p style="font-size:13px; color:#6b7280; margin:12px 0 4px;">種別</p><table style="width:100%; border-collapse:collapse; background:#eff6ff; border-radius:8px; overflow:hidden;">${infoRows}</table>` : ''}
          ${progressHtml}
          <a href="${siteUrl}/" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; margin-top: 16px;">マップで見る</a>
        `

        const result = await sendLifecycleEmail({
          supabase,
          apiKey,
          userId: r.user_id,
          category: 'weekly_digest',
          subject: `🗺️ ${r.municipality}の週刊ダイジェスト`,
          bodyHtml,
        })

        if (result.sent) {
          await recordLifecycleEmail(supabase, 'weekly_digest', r.user_id)
          sent += 1
        } else {
          skipped += 1
        }
      } catch (e) {
        console.error('[notify-weekly-digest] send failed:', e)
        skipped += 1
      }
    }

    return jsonOk({ attempted: recipients.length, sent, skipped })
  } catch (e) {
    console.error('[notify-weekly-digest] エラー:', e)
    return jsonFail({ error: String(e) })
  }
})
