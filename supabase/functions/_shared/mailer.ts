/**
 * REQ-234 FR-234-01: ライフサイクルメール共通送信ユーティリティ
 *
 * 既存 _shared/aiCache.ts 等と同列の共有モジュール。研究採用通知・休眠復帰・週次ダイジェストの
 * 3 関数が共通で使う。一元化するもの:
 *   (a) List-Unsubscribe ヘッダの付与（ワンクリック配信停止 / FR-234-01a・AC-01）
 *   (b) 宛先ユーザの購読フラグ確認（opt-out なら送らない / FR-234-01b・AC-01）
 *   (c) RESEND_API_KEY 未設定時の fail-soft（送信スキップ / FR-234-01c・NFR-234-01）
 *   (d) メール本文の i18n（ja/en/ko/zh / FR-234-09）
 *
 * 配信停止トークンは user_profiles.unsubscribe_token（auth.users.id を直載せしない不透明な
 * ランダム UUID / NFR-234-03）を使い、List-Unsubscribe / 本文リンクを組み立てる。
 *
 * 宛先言語の決定（FR-234-09 の選択）: 当面は既定言語（ja）で送る（(b) 案）。
 *   理由: user_profiles に locale 列が無く（現状の問題 7）、本 REQ では purchase/UX を最小化するため
 *   locale 列追加は見送り、まず ja で配信して効果を測る。en/ko/zh のテンプレは用意済みなので、
 *   将来 locale 列を足せば lang を切り替えるだけで多言語配信できる（後続 REQ）。
 *   呼び出し側は任意で lang を渡せる（テスト・将来拡張用）。
 *
 * 到達性（SPF/DKIM/DMARC）は REQ-219 が主管（本 REQ のスコープ外）。List-Unsubscribe の付与は
 * 苦情率の改善・受信箱到達に資するが、DNS 認証そのものは別途設定する（runbook 参照）。
 */

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export type LifecycleCategory = 'research_adopted' | 'dormant_reengage' | 'weekly_digest'
export type Lang = 'ja' | 'en' | 'ko' | 'zh'

const DEFAULT_LANG: Lang = 'ja'

const siteUrl = (Deno.env.get('SITE_URL') ?? 'https://zaridasu.com').replace(/\/$/, '')
// REQ-219 FR-219-05: ライフサイクルメール 3 関数（research-adopted / dormant-reengage / weekly-digest）の
// 送信元 From を NOTIFY_FROM_EMAIL で一元化（既定は認証済みドメイン）。送信ドメイン変更時は DNS の
// SPF/DKIM/DMARC と一括で整合させる（docs/runbooks/email-authentication.md）。
const fromEmail = Deno.env.get('NOTIFY_FROM_EMAIL') ?? 'ザリダス <noreply@zarigani-das.com>'

/** XSS 防止: メール本文に差し込む動的値をエスケープする（既存 notify-* と同一実装）。 */
export const escapeHtml = (str: string): string =>
  str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

/** user_profiles の購読フラグ列名（カテゴリ → 列）。 */
const OPT_IN_COLUMN: Record<LifecycleCategory, string> = {
  research_adopted: 'notify_research_adopted',
  dormant_reengage: 'notify_dormant_reengage',
  weekly_digest: 'notify_weekly_digest',
}

/**
 * service-role の Supabase クライアントを 1 つ生成する。
 *
 * REQ-287 FR-287-01: 実装は `_shared/supabaseAdmin.ts` に集約した。ここは既存の
 * import 元（notify-dormant-reengage / notify-research-adopted / notify-weekly-digest /
 * send-push）を壊さないための再エクスポートであり、キーの選択ロジックは持たない。
 */
export { createServiceClient } from './supabaseAdmin.ts'

interface SendArgs {
  supabase: SupabaseClient
  apiKey: string | undefined
  userId: string
  category: LifecycleCategory
  subject: string
  /** 本文 HTML 本体（フッタ/配信停止リンクは本ユーティリティが付与する）。 */
  bodyHtml: string
  /** 任意。省略時は DEFAULT_LANG（ja）。フッタ文言の言語に使う。 */
  lang?: Lang
}

export interface SendResult {
  sent: boolean
  reason?: 'no_resend_key' | 'no_email' | 'opt_out' | 'no_profile'
  email?: string
}

/**
 * sendLifecycleEmail が user_profiles から取得する行の形。
 * 購読フラグ列はカテゴリ依存で列名が動的（OPT_IN_COLUMN[category]）なため、index signature で
 * 表す（値は明示的に絞れないので unknown。読み出し側で `=== false` 判定するだけ）。
 * unsubscribe_token は固定列なので明示型を付ける（NULL のとき null が返る）。
 */
interface ProfileRow {
  unsubscribe_token: string | null
  [optInColumn: string]: unknown
}

/** カテゴリ別のフッタ（配信停止リンク）文言。1 メッセージ 1 ゴールを崩さない最小フッタ。 */
const FOOTER_TEXT: Record<Lang, { why: string; unsub: string; auto: string }> = {
  ja: {
    why: 'このメールはザリダスの観察を続けている方にお送りしています。',
    unsub: 'この種類のメールの配信を停止する',
    auto: 'このメールは自動送信です。心当たりがない場合は無視してください。',
  },
  en: {
    why: 'You are receiving this because you contribute observations to Zaridasu.',
    unsub: 'Unsubscribe from this type of email',
    auto: 'This is an automated message. If this was unexpected, you can ignore it.',
  },
  ko: {
    why: '자리다스에 관찰 정보를 제공하고 계셔서 보내드립니다.',
    unsub: '이 유형의 메일 수신 거부',
    auto: '자동 발송 메일입니다. 모르는 내용이면 무시하셔도 됩니다.',
  },
  zh: {
    why: '您收到此邮件是因为您在 Zaridasu 提交了观察记录。',
    unsub: '退订此类邮件',
    auto: '这是一封自动发送的邮件。如非本人操作可忽略。',
  },
}

/**
 * 1 通送る。購読フラグ確認 → List-Unsubscribe 付与 → Resend 送信。
 * - opt-out / メール無し / RESEND_API_KEY 無しは fail-soft（sent:false + reason）で返す（例外は投げない）。
 * - 送信成功時は record_lifecycle_email を呼ばず、呼び出し側が記録する（研究採用の notified_at セットと
 *   1 トランザクションにまとめたいケースがあるため。本ユーティリティは送信のみに責務を絞る）。
 */
export async function sendLifecycleEmail(args: SendArgs): Promise<SendResult> {
  const { supabase, apiKey, userId, category, subject, bodyHtml } = args
  const lang: Lang = args.lang && FOOTER_TEXT[args.lang] ? args.lang : DEFAULT_LANG

  // (b) 購読フラグ + 配信停止トークンを取得（opt-out なら送らない）。
  const optInCol = OPT_IN_COLUMN[category]
  const { data: profile } = await supabase
    .from('user_profiles')
    .select(`${optInCol}, unsubscribe_token`)
    .eq('id', userId)
    .maybeSingle<ProfileRow>()

  if (!profile) return { sent: false, reason: 'no_profile' }
  if (profile[optInCol] === false) {
    return { sent: false, reason: 'opt_out' }
  }
  const token = profile.unsubscribe_token

  // 宛先メールは auth.users から service-role で取得（user_profiles には保持しない）。
  const { data: userData } = await supabase.auth.admin.getUserById(userId)
  const email = userData?.user?.email
  if (!email) return { sent: false, reason: 'no_email' }

  // (c) RESEND_API_KEY 未設定なら fail-soft（dev/CI）。
  if (!apiKey) return { sent: false, reason: 'no_resend_key', email }

  // (a) List-Unsubscribe。トークンが無い場合は設定ページにフォールバック（PII を載せない）。
  const unsubUrl = token
    ? `${siteUrl}/u/unsubscribe?t=${encodeURIComponent(token)}&c=${encodeURIComponent(category)}`
    : `${siteUrl}/dashboard`
  const footer = FOOTER_TEXT[lang]
  const fullHtml = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      ${bodyHtml}
      <hr style="border:none; border-top:1px solid #e5e7eb; margin: 24px 0 12px;" />
      <p style="font-size: 12px; color: #9ca3af; margin: 4px 0;">${escapeHtml(footer.why)}</p>
      <p style="font-size: 12px; margin: 4px 0;">
        <a href="${unsubUrl}" style="color:#6b7280; text-decoration: underline;">${escapeHtml(footer.unsub)}</a>
      </p>
      <p style="font-size: 11px; color: #c0c4cc; margin: 8px 0 0;">${escapeHtml(footer.auto)}</p>
    </div>
  `

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: fromEmail,
      to: [email],
      subject,
      html: fullHtml,
      headers: {
        'List-Unsubscribe': `<${unsubUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    }),
  })
  if (!res.ok) {
    const err = await res.text().catch(() => '')
    throw new Error(`Resend ${res.status}: ${err}`)
  }
  return { sent: true, email }
}

/**
 * 送信を lifecycle_email_log に記録（ガードレール計測 / FR-234-10）。
 * 研究採用は p_set_research_notified=true で posts.research_adopted_notified_at を 1 回セット（冪等）。
 */
export async function recordLifecycleEmail(
  supabase: SupabaseClient,
  category: LifecycleCategory,
  userId: string,
  postId?: string,
  setResearchNotified = false,
): Promise<void> {
  try {
    await supabase.rpc('record_lifecycle_email', {
      p_category: category,
      p_user_id: userId,
      p_post_id: postId ?? null,
      p_set_research_notified: setResearchNotified,
    })
  } catch (e) {
    // 記録失敗は本処理を止めない（fail-soft）。
    console.error('[mailer] recordLifecycleEmail failed:', e)
  }
}

/** JSON 200/エラー応答ヘルパ（既存 notify-survey-request と同形）。 */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
export const jsonOk = (body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
export const jsonFail = (body: Record<string, unknown>, status = 500) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
export { corsHeaders }
