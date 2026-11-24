/**
 * notify-post-status Edge Function
 *
 * posts テーブルの status が変化したときに投稿者へメールで通知する。
 *
 * 【Supabase Dashboard での設定手順】
 * Database → Webhooks → "Create a new hook"
 *   - Name: notify-post-status-on-update
 *   - Table: posts
 *   - Events: UPDATE
 *   - Type: Supabase Edge Functions
 *   - Edge Function: notify-post-status
 *
 * 【必要な環境変数（Supabase Dashboard → Settings → Edge Functions → Secrets）】
 *   RESEND_API_KEY          : Resend API キー
 *   SITE_URL                : サイトURL（例: https://zaridasu.com）
 *   SUPABASE_URL            : 自動設定
 *   SUPABASE_SERVICE_ROLE_KEY : 自動設定
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { requireWebhookSecret, WebhookAuthError } from '../_shared/webhookAuth.ts'
// REQ-211 FR-211-06: ログに受信者メールを平文で残さないためマスクして出力する。
import { maskEmail } from '../_shared/aiLogging.ts'
import { createServiceClient } from '../_shared/supabaseAdmin.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const siteUrl = Deno.env.get('SITE_URL') ?? 'https://zaridasu.com'
// REQ-219 FR-219-05: 送信元 From は環境変数で一元化する（既定は認証済みドメイン）。
// 送信ドメイン（zarigani-das.com）変更時は DNS の SPF/DKIM/DMARC と一括で整合させる。
// 詳細は docs/runbooks/email-authentication.md を参照。
const fromEmail = Deno.env.get('NOTIFY_FROM_EMAIL') ?? 'ザリダス <noreply@zarigani-das.com>'

const SPECIES_LABELS: Record<string, string> = {
  american: 'アメリカザリガニ',
  bullfrog: 'ウシガエル',
}

const escapeHtml = (str: string) =>
  str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // REQ-131 Phase 1: webhook 共有秘密の検証
  // WEBHOOK_SECRET env が未設定なら grace period として通過する。
  try {
    requireWebhookSecret(req)
  } catch (e) {
    if (e instanceof WebhookAuthError) {
      console.warn('[notify-post-status] webhook secret mismatch')
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    throw e
  }

  try {
    const payload = await req.json()

    // DB Webhook 形式: { type: 'UPDATE', table: 'posts', record: newRecord, old_record: oldRecord }
    // REQ-131 Phase 1: payload.record は信用せず id のみ受け取り service-role で再 fetch する。
    // (rejection_message 等を payload に細工されてフィッシング文面が混入するのを防ぐ)
    const { record: payloadRecord, old_record } = payload

    // status 変化が無ければスキップ (この判定は payload を信用してよい: 変化したという情報だけ)
    if (!payloadRecord?.id || !old_record || payloadRecord.status === old_record.status) {
      return new Response(JSON.stringify({ skipped: 'no_status_change' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    if (!resendApiKey) {
      console.warn('[notify-post-status] RESEND_API_KEY が設定されていません')
      return new Response(JSON.stringify({ skipped: 'no_resend_key' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createServiceClient()

    // REQ-131 Phase 1: posts テーブルから service-role で再 fetch して payload を信用しない。
    // 見つからなければ 200 skipped (存在確認攻撃を防ぐ)
    const { data: freshRecord, error: fetchErr } = await supabase
      .from('posts')
      .select('id, user_id, status, species, municipality, rejection_reason, rejection_message, auto_approved')
      .eq('id', payloadRecord.id)
      .maybeSingle()
    if (fetchErr || !freshRecord) {
      return new Response(JSON.stringify({ skipped: 'not_found' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const record = freshRecord as {
      id: string
      user_id: string | null
      status: string
      species: string | null
      municipality: string | null
      rejection_reason: string | null
      rejection_message: string | null
      auto_approved: boolean | null
    }

    // 通知対象: approved または rejected のみ (DB 上の最新 status を見る)
    if (record.status !== 'approved' && record.status !== 'rejected') {
      return new Response(JSON.stringify({ skipped: 'irrelevant_status' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 匿名投稿はスキップ
    if (!record.user_id) {
      return new Response(JSON.stringify({ skipped: 'anonymous_post' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 投稿者のメールアドレスを取得
    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(record.user_id)
    if (userError || !userData?.user?.email) {
      return new Response(JSON.stringify({ skipped: 'no_email' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const email = userData.user.email
    const speciesLabel = SPECIES_LABELS[record.species ?? ''] ?? record.species ?? '不明'
    const postUrl = `${siteUrl}/post/${record.id}`

    let subject: string
    let html: string

    if (record.status === 'approved') {
      const isAutoApproved = record.auto_approved === true
      subject = '🦞 あなたの投稿が公開されました'
      html = `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #dc2626; margin-bottom: 4px;">🦞 ザリダス</h2>
          <p style="color: #374151;">あなたの投稿が<strong>公開承認</strong>されました。</p>
          <table style="width:100%; border-collapse:collapse; margin: 16px 0; background:#f9fafb; border-radius:8px; overflow:hidden;">
            <tr>
              <td style="padding:10px 14px; color:#6b7280; font-size:13px; width:40%; border-bottom:1px solid #e5e7eb;">種類</td>
              <td style="padding:10px 14px; font-size:13px; font-weight:600; border-bottom:1px solid #e5e7eb;">${escapeHtml(speciesLabel)}</td>
            </tr>
            ${record.municipality ? `
            <tr>
              <td style="padding:10px 14px; color:#6b7280; font-size:13px; width:40%; border-bottom:1px solid #e5e7eb;">場所</td>
              <td style="padding:10px 14px; font-size:13px; border-bottom:1px solid #e5e7eb;">${escapeHtml(record.municipality)}</td>
            </tr>` : ''}
            <tr>
              <td style="padding:10px 14px; color:#6b7280; font-size:13px; width:40%;">承認方法</td>
              <td style="padding:10px 14px; font-size:13px;">${isAutoApproved ? '🤖 AI自動承認' : '👤 管理者承認'}</td>
            </tr>
          </table>
          <a href="${postUrl}"
             style="display: inline-block; background: #dc2626; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; margin-top: 8px;">
            投稿を確認する
          </a>
          <p style="margin-top: 24px; font-size: 12px; color: #9ca3af;">
            このメールは自動送信です。心当たりがない場合は無視してください。
          </p>
        </div>
      `
    } else {
      // rejected
      subject = '🦞 あなたの投稿について'
      const reasonText = record.rejection_reason
        ? `<p style="margin: 12px 0; font-size: 14px;"><strong>却下理由:</strong> ${escapeHtml(record.rejection_reason)}</p>`
        : ''
      const messageText = record.rejection_message
        ? `<blockquote style="border-left: 4px solid #dc2626; margin: 12px 0; padding: 8px 16px; background: #fef2f2; border-radius: 4px; font-size: 13px; color: #374151;">${escapeHtml(record.rejection_message)}</blockquote>`
        : ''
      html = `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #dc2626; margin-bottom: 4px;">🦞 ザリダス</h2>
          <p style="color: #374151;">あなたの投稿が<strong>却下</strong>されました。</p>
          <table style="width:100%; border-collapse:collapse; margin: 16px 0; background:#f9fafb; border-radius:8px; overflow:hidden;">
            <tr>
              <td style="padding:10px 14px; color:#6b7280; font-size:13px; width:40%; border-bottom:1px solid #e5e7eb;">種類</td>
              <td style="padding:10px 14px; font-size:13px; font-weight:600; border-bottom:1px solid #e5e7eb;">${escapeHtml(speciesLabel)}</td>
            </tr>
            ${record.municipality ? `
            <tr>
              <td style="padding:10px 14px; color:#6b7280; font-size:13px; width:40%;">場所</td>
              <td style="padding:10px 14px; font-size:13px;">${escapeHtml(record.municipality)}</td>
            </tr>` : ''}
          </table>
          ${reasonText}
          ${messageText}
          <p style="font-size: 13px; color: #6b7280; margin-top: 12px;">
            内容を修正して再投稿いただくか、別の投稿をお試しください。
          </p>
          <a href="${siteUrl}"
             style="display: inline-block; background: #6b7280; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; margin-top: 8px;">
            ザリダスを開く
          </a>
          <p style="margin-top: 24px; font-size: 12px; color: #9ca3af;">
            このメールは自動送信です。心当たりがない場合は無視してください。
          </p>
        </div>
      `
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [email],
        subject,
        html,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('[notify-post-status] Resend エラー:', err)
      return new Response(JSON.stringify({ error: err }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // REQ-211 FR-211-06 / CWE-532: 受信者メールは maskEmail でマスクしてから出力する。
    console.log(`[notify-post-status] post ${record.id} → ${record.status} 通知送信 → ${maskEmail(email)}`)
    return new Response(JSON.stringify({ sent: true, status: record.status }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('[notify-post-status] エラー:', e)
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
