/**
 * send-push Edge Function (REQ-237 FR-237-02/05)
 *
 * 1 ユーザの全有効購読へ Web Push を送る。メール（REQ-234）と相補的な「即時」チャネル。
 * 投稿承認/却下・コメント・周辺新着などのイベントから、DB の pg_net ラッパ call_send_push
 * （migration 20260615000007）または他 Edge Function から起動される。
 *
 * リクエスト（JSON）:
 *   {
 *     "user_id": "<uuid>",                       // 必須。送信先ユーザ
 *     "category": "post_status"|"comment"|"nearby", // 任意。指定時は対応する push opt-in を確認
 *     "notification": { "title": "...", "body": "...", "url": "/post/xxx", "tag": "..." }
 *   }
 *
 * 既存 notify-* と同じ防御:
 *   (a) webhook 共有秘密の検証（_shared/webhookAuth.ts・grace period 含む）。
 *   (b) payload は user_id / category / notification の最小限のみ使用。本文に PII を載せない
 *       （呼び出し側が市区町村粒度までに整形する想定 / NFR-237-01）。
 *   (c) category 指定時は user_profiles の notify_push_* を service-role で確認し opt-out なら送らない。
 *   (d) 送信は依存ゼロの _shared/webpush.ts（VAPID + RFC8291 aes128gcm）。
 *   (e) 410/404 が返った購読は deactivate_push_subscription で無効化（AC-06 / NFR-237-03）。
 *
 * 【必要な環境変数（Supabase Dashboard → Edge Functions → Secrets）】
 *   VAPID_PUBLIC_KEY        : base64url raw P-256 公開鍵（クライアントにも配るが、ここはサーバ用に保持）
 *   VAPID_PRIVATE_KEY       : base64url raw P-256 秘密鍵スカラ（★サーバー専用・NEXT_PUBLIC_ 厳禁 / NFR-237-01）
 *   VAPID_SUBJECT           : mailto:ops@example.com 等の連絡先
 *   WEBHOOK_SECRET          : webhook 共有秘密（任意・本番推奨）
 *   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY : 自動設定
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { requireWebhookSecret, WebhookAuthError } from '../_shared/webhookAuth.ts'
import { createServiceClient, jsonOk, jsonFail, corsHeaders } from '../_shared/mailer.ts'
import { sendWebPush, type PushSubscriptionKeys } from '../_shared/webpush.ts'

/** category → user_profiles の push opt-in 列名。未指定/未知は opt-in 確認しない（=送る）。 */
const PUSH_OPT_IN_COLUMN: Record<string, string> = {
  post_status: 'notify_push_post_status',
  comment: 'notify_push_comment',
  nearby: 'notify_push_nearby',
}

interface NotificationInput {
  title?: string
  body?: string
  url?: string
  tag?: string
  icon?: string
  badge?: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // (a) webhook 共有秘密。未設定なら grace period として通過。
  try {
    requireWebhookSecret(req)
  } catch (e) {
    if (e instanceof WebhookAuthError) {
      console.warn('[send-push] webhook secret mismatch')
      return jsonFail({ error: 'unauthorized' }, 401)
    }
    throw e
  }

  try {
    const payload = await req.json().catch(() => ({}))
    const userId = payload?.user_id as string | undefined
    const category = payload?.category as string | undefined
    const notification = (payload?.notification ?? {}) as NotificationInput
    if (!userId) return jsonFail({ error: 'invalid_payload' }, 400)

    // (d') VAPID 鍵が無ければ fail-soft（dev/未設定環境では送らない / NFR-237-04）。
    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')
    const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:ops@zaridasu.com'
    if (!vapidPublicKey || !vapidPrivateKey) {
      console.warn('[send-push] VAPID 鍵が未設定のため送信スキップ')
      return jsonOk({ skipped: 'no_vapid_keys' })
    }

    const supabase = createServiceClient()

    // (c) category 指定があれば push opt-in を確認（opt-out なら送らない / FR-237-06）。
    if (category && PUSH_OPT_IN_COLUMN[category]) {
      const col = PUSH_OPT_IN_COLUMN[category]
      const { data: profile } = await supabase
        .from('user_profiles')
        .select(col)
        .eq('id', userId)
        .maybeSingle()
      if (!profile || (profile as unknown as Record<string, unknown>)[col] === false) {
        return jsonOk({ skipped: 'push_opt_out', category })
      }
    }

    // 有効購読を service-role RPC で取得（FR-237-05）。
    const { data: subs, error } = await supabase.rpc('get_push_subscriptions_for_user', {
      p_user_id: userId,
    })
    if (error) return jsonFail({ error: error.message })
    const subscriptions = (subs ?? []) as PushSubscriptionKeys[]
    if (subscriptions.length === 0) return jsonOk({ skipped: 'no_subscriptions' })

    // 通知 JSON（SW の push ハンドラが解釈する形）。本文に PII を載せない。
    const body = JSON.stringify({
      title: notification.title ?? 'ザリダス',
      body: notification.body ?? '',
      url: notification.url ?? '/',
      tag: notification.tag,
      icon: notification.icon,
      badge: notification.badge,
    })

    let sent = 0
    let expired = 0
    let failed = 0

    // 逐次送信（バッチ上限 = 1 ユーザの端末数で十分小さい / NFR-237-03）。
    for (const sub of subscriptions) {
      const result = await sendWebPush({
        subscription: sub,
        payload: body,
        vapidPublicKey,
        vapidPrivateKey,
        vapidSubject,
      })
      if (result.ok) {
        sent += 1
      } else if (result.expired) {
        // (e) 失効購読を無効化（再送対象から外す / AC-06）。
        expired += 1
        try {
          await supabase.rpc('deactivate_push_subscription', { p_endpoint: sub.endpoint })
        } catch (e) {
          console.error('[send-push] deactivate failed:', e)
        }
      } else {
        // 一時障害（5xx/ネットワーク）。次回送信に委ねる（無効化しない）。
        failed += 1
        console.warn(`[send-push] send failed status=${result.statusCode}`)
      }
    }

    console.log(`[send-push] user ${userId} sent=${sent} expired=${expired} failed=${failed}`)
    return jsonOk({ attempted: subscriptions.length, sent, expired, failed })
  } catch (e) {
    console.error('[send-push] エラー:', e)
    return jsonFail({ error: String(e) })
  }
})
