/**
 * notify-survey-request Edge Function (REQ-088 Phase 4)
 *
 * 調査依頼まわりのイベント通知を Resend 経由で配信する。
 * pg_net 経由で migration 20260425000004_notify_survey_request.sql のトリガーから呼ばれる。
 *
 * 【受信ペイロード】
 *   { event_type: 'request_created' | 'request_responded' | 'request_closed' | 'comment_created',
 *     request_id: uuid, user_id: uuid (起点ユーザー), ...event 固有フィールド }
 *
 * 【必要な環境変数】
 *   RESEND_API_KEY              : Resend API キー
 *   SITE_URL                    : サイトURL（例: https://zaridasu.com）
 *   SUPABASE_URL                : 自動設定
 *   SUPABASE_SERVICE_ROLE_KEY   : 自動設定
 *   NOTIFY_FROM_EMAIL           : 任意。送信元（既定: ザリダス <noreply@zarigani-das.com>）
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { requireWebhookSecret, WebhookAuthError } from '../_shared/webhookAuth.ts'
// REQ-211 FR-211-06: Resend エラー本文に受信者メール等が含まれてもログに平文で残さない。
import { redactAiErrorMessage } from '../_shared/aiLogging.ts'
import { createServiceClient } from '../_shared/supabaseAdmin.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SPECIES_LABELS: Record<string, string> = {
  american: 'アメリカザリガニ',
  bullfrog: 'ウシガエル',
  unknown: '不明',
}

const URGENCY_LABELS: Record<string, string> = {
  normal: '通常',
  urgent: '緊急',
}

const escapeHtml = (str: string) =>
  str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const ok = (body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const fail = (body: Record<string, unknown>, status = 500) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

interface SurveyRequestRow {
  id: string
  user_id: string
  municipality: string | null
  species: string
  urgency: string
  reason: string | null
  status: string
}

interface UserProfileLite {
  id: string
  display_name: string | null
  notify_survey_request: boolean | null
}

const siteUrl = Deno.env.get('SITE_URL') ?? 'https://zaridasu.com'
// REQ-219 FR-219-05: 送信元 From は NOTIFY_FROM_EMAIL で一元化（既定は認証済みドメイン）。
// 送信ドメイン変更時は DNS の SPF/DKIM/DMARC と一括で整合させる（docs/runbooks/email-authentication.md）。
const fromEmail = Deno.env.get('NOTIFY_FROM_EMAIL') ?? 'ザリダス <noreply@zarigani-das.com>'

async function sendEmail(apiKey: string, to: string, subject: string, html: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: fromEmail, to: [to], subject, html }),
  })
  if (!res.ok) {
    const err = await res.text().catch(() => '')
    // REQ-211 FR-211-06: 投げる Error メッセージ時点でメール/トークンを除去（後段の console.error 漏洩防止）。
    throw new Error(`Resend ${res.status}: ${redactAiErrorMessage(err)}`)
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // REQ-131 Phase 1: pg_net トリガー経由のみ叩かれる前提なので webhook secret を必須化する。
  // WEBHOOK_SECRET env 未設定なら grace period として通過する。
  try {
    requireWebhookSecret(req)
  } catch (e) {
    if (e instanceof WebhookAuthError) {
      console.warn('[notify-survey-request] webhook secret mismatch')
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    throw e
  }

  try {
    const payload = await req.json().catch(() => ({}))
    const eventType = payload?.event_type as string | undefined
    const requestId = payload?.request_id as string | undefined
    const initiatorId = payload?.user_id as string | undefined
    if (!eventType || !requestId) return fail({ error: 'invalid_payload' }, 400)

    const apiKey = Deno.env.get('RESEND_API_KEY')
    const supabase = createServiceClient()

    // 依頼本体を取得
    const { data: request, error: reqErr } = await supabase
      .from('survey_requests')
      .select('id, user_id, municipality, species, urgency, reason, status')
      .eq('id', requestId)
      .maybeSingle<SurveyRequestRow>()
    if (reqErr || !request) return fail({ error: 'request_not_found' }, 404)

    const requestUrl = `${siteUrl}/request/${request.id}`
    const speciesLabel = SPECIES_LABELS[request.species] ?? request.species
    const urgencyLabel = URGENCY_LABELS[request.urgency] ?? request.urgency
    const municipality = request.municipality ?? '（市区町村未設定）'

    // RESEND_API_KEY 未設定なら fail-soft（テスト/開発環境）
    if (!apiKey) return ok({ skipped: 'no_resend_key', event_type: eventType })

    // 通知対象を決定
    const recipients: { email: string; subject: string; html: string }[] = []

    if (eventType === 'request_created') {
      // 同一 municipality かつ opt-in、起点ユーザー除外
      if (!request.municipality) return ok({ skipped: 'no_municipality' })
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('id, display_name, notify_survey_request')
        .eq('municipality', request.municipality)
        .eq('notify_survey_request', true)
        .neq('id', request.user_id)
      const targets = (profiles ?? []) as UserProfileLite[]
      for (const p of targets) {
        const { data: u } = await supabase.auth.admin.getUserById(p.id)
        const email = u?.user?.email
        if (!email) continue
        recipients.push({
          email,
          subject: `🔍 ${municipality}で新しい調査依頼があります`,
          html: `
            <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
              <h2 style="color: #d97706; margin-bottom: 4px;">🔍 ザリダス 調査依頼</h2>
              <p style="color: #374151;">あなたの地域 <strong>${escapeHtml(municipality)}</strong> で新しい調査依頼が立ちました。</p>
              <table style="width:100%; border-collapse:collapse; margin: 16px 0; background:#fffbeb; border-radius:8px; overflow:hidden;">
                <tr><td style="padding:10px 14px; color:#6b7280; width:40%; border-bottom:1px solid #fde68a;">対象種</td><td style="padding:10px 14px; font-weight:600; border-bottom:1px solid #fde68a;">${escapeHtml(speciesLabel)}</td></tr>
                <tr><td style="padding:10px 14px; color:#6b7280;">緊急度</td><td style="padding:10px 14px;">${escapeHtml(urgencyLabel)}</td></tr>
              </table>
              <a href="${requestUrl}" style="display: inline-block; background: #d97706; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">依頼を見る</a>
              <p style="margin-top: 24px; font-size: 12px; color: #9ca3af;">通知を停止するには、ザリダスのプロフィール設定をご確認ください。</p>
            </div>
          `,
        })
      }
    } else if (eventType === 'request_responded') {
      // 依頼者本人へ
      const { data: u } = await supabase.auth.admin.getUserById(request.user_id)
      const email = u?.user?.email
      if (!email) return ok({ skipped: 'no_email' })
      // opt-out 確認
      const { data: own } = await supabase
        .from('user_profiles')
        .select('notify_survey_request')
        .eq('id', request.user_id)
        .maybeSingle()
      if (own?.notify_survey_request === false) return ok({ skipped: 'opt_out' })
      recipients.push({
        email,
        subject: '🔍 あなたの調査依頼に結果投稿がありました',
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
            <h2 style="color: #2563eb;">🔍 結果投稿のお知らせ</h2>
            <p>あなたの依頼（${escapeHtml(speciesLabel)} / ${escapeHtml(municipality)}）に結果投稿がありました。</p>
            <a href="${requestUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">結果を確認する</a>
          </div>
        `,
      })
    } else if (eventType === 'request_closed') {
      // 応答者 + 結果投稿者
      const userIds = new Set<string>()
      const { data: responses } = await supabase
        .from('survey_request_responses')
        .select('user_id')
        .eq('request_id', request.id)
      ;(responses ?? []).forEach((r) => r?.user_id && userIds.add(r.user_id as string))
      const { data: posts } = await supabase
        .from('posts')
        .select('user_id')
        .eq('survey_request_id', request.id)
      ;(posts ?? []).forEach((p) => p?.user_id && userIds.add(p.user_id as string))
      userIds.delete(request.user_id) // 依頼者本人は除外（owner 操作のため）
      for (const uid of userIds) {
        const { data: prof } = await supabase
          .from('user_profiles')
          .select('notify_survey_request')
          .eq('id', uid)
          .maybeSingle()
        if (prof?.notify_survey_request === false) continue
        const { data: u } = await supabase.auth.admin.getUserById(uid)
        const email = u?.user?.email
        if (!email) continue
        recipients.push({
          email,
          subject: '🔍 協力していた調査依頼がクローズされました',
          html: `
            <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
              <h2 style="color: #6b7280;">🔍 依頼クローズのお知らせ</h2>
              <p>あなたが協力していた依頼（${escapeHtml(speciesLabel)} / ${escapeHtml(municipality)}）がクローズされました。</p>
              <a href="${requestUrl}" style="display: inline-block; background: #6b7280; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">結果まとめを見る</a>
            </div>
          `,
        })
      }
    } else if (eventType === 'comment_created') {
      // 依頼者本人 + コメントスレッド参加者（重複/起点ユーザー除外）
      const userIds = new Set<string>([request.user_id])
      const { data: prior } = await supabase
        .from('survey_request_comments')
        .select('user_id')
        .eq('request_id', request.id)
        .is('deleted_at', null)
      ;(prior ?? []).forEach((c) => c?.user_id && userIds.add(c.user_id as string))
      if (initiatorId) userIds.delete(initiatorId)
      for (const uid of userIds) {
        const { data: prof } = await supabase
          .from('user_profiles')
          .select('notify_survey_request')
          .eq('id', uid)
          .maybeSingle()
        if (prof?.notify_survey_request === false) continue
        const { data: u } = await supabase.auth.admin.getUserById(uid)
        const email = u?.user?.email
        if (!email) continue
        recipients.push({
          email,
          subject: '💬 調査依頼に新しいコメントがあります',
          html: `
            <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
              <h2 style="color: #d97706;">💬 コメント追加</h2>
              <p>調査依頼（${escapeHtml(speciesLabel)} / ${escapeHtml(municipality)}）に新しいコメントが追加されました。</p>
              <a href="${requestUrl}" style="display: inline-block; background: #d97706; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">スレッドを見る</a>
            </div>
          `,
        })
      }
    } else {
      return fail({ error: 'unknown_event_type', event_type: eventType }, 400)
    }

    // 配信（fail-soft: 個別失敗は続行）
    let sent = 0
    for (const r of recipients) {
      try {
        await sendEmail(apiKey, r.email, r.subject, r.html)
        sent += 1
      } catch (e) {
        console.error('[notify-survey-request] send failed:', e)
      }
    }

    return ok({ event_type: eventType, attempted: recipients.length, sent })
  } catch (e) {
    console.error('[notify-survey-request] エラー:', e)
    return fail({ error: String(e) })
  }
})
