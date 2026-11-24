import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
// 送信の失敗ログにはステータスだけを残し、本文・宛先は記録しない。
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

const escapeHtml = (str: string) =>
  str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

interface HandlerDeps {
  remoteAddr?: unknown
  createAnonClient?: typeof createClient
  createServiceClient?: typeof createServiceClient
  fetch?: typeof fetch
}

export async function handleRequest(req: Request, deps: HandlerDeps = {}): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // JWT 認証チェック: Authorization ヘッダーから呼び出し元ユーザーを検証
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabaseAnonClient = (deps.createAnonClient ?? createClient)(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  )
  const { data: { user: callerUser }, error: authError } = await supabaseAnonClient.auth.getUser()
  if (authError || !callerUser) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let releaseClaim: (() => Promise<void>) | null = null
  try {
    // REQ-132 Phase 1: payload は comment_id のみを受け取り、メール本文は
    // service-role で comments テーブルから取得した content を使う。
    // 旧クライアント互換のため post_id / comment_content も読むが、
    // 本文は DB の値しか信用しない。
    const body = await req.json().catch(() => ({}))
    const commentId = typeof body?.comment_id === 'string' ? body.comment_id : null
    if (!commentId) {
      return new Response(JSON.stringify({ error: 'invalid_payload' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = deps.createServiceClient ? deps.createServiceClient() : createServiceClient()

    // REQ-132 Phase 1: comments テーブルから本物のコメントを再取得
    const { data: comment, error: commentErr } = await supabase
      .from('comments')
      .select('id, post_id, user_id, content, created_at')
      .eq('id', commentId)
      .maybeSingle()
    if (commentErr || !comment) {
      // 存在確認攻撃を防ぐため 200 で skip
      return new Response(JSON.stringify({ skipped: 'not_found' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // REQ-132 Phase 1: callerUser と comment.user_id が一致しなければ拒否
    if (comment.user_id !== callerUser.id) {
      return new Response(JSON.stringify({ error: 'forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const post_id = comment.post_id as string
    const comment_content = comment.content as string

    // 投稿のオーナーを取得
    const { data: post } = await supabase
      .from('posts')
      .select('user_id')
      .eq('id', post_id)
      .single()

    if (!post?.user_id) {
      return new Response(JSON.stringify({ skipped: 'anonymous post' }), {
        status: 200,
        headers: corsHeaders,
      })
    }

    // 自分の投稿へのコメントは通知不要
    if (post.user_id === callerUser.id) {
      return new Response(JSON.stringify({ skipped: 'own post' }), {
        status: 200,
        headers: corsHeaders,
      })
    }

    // オーナーのメールアドレスを取得
    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(post.user_id)

    if (userError || !userData?.user?.email) {
      return new Response(JSON.stringify({ skipped: 'no email' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const user = userData.user

    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    if (!resendApiKey) {
      return new Response(JSON.stringify({ skipped: 'RESEND_API_KEY not set' }), {
        status: 200,
        headers: corsHeaders,
      })
    }

    // 主キーの一意制約で並行呼び出しも1通に制限する。
    let claimError
    try {
      const claim = await supabase.from('comment_notification_claims').insert({ comment_id: commentId })
      claimError = claim.error
    } catch {
      claimError = { code: 'exception' }
    }
    if (claimError) {
      const skipped = claimError.code === '23505' ? 'already_sent' : 'claim_failed'
      if (skipped === 'claim_failed') console.error('Notification claim failed:', claimError.code)
      return new Response(JSON.stringify({ skipped }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    releaseClaim = async () => {
      try {
        const { error } = await supabase.from('comment_notification_claims').delete().eq('comment_id', commentId)
        if (error) console.error('Notification claim release failed:', error.code)
      } catch {
        console.error('Notification claim release failed: exception')
      }
    }

    const res = await (deps.fetch ?? fetch)('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [user.email],
        subject: '🦞 あなたの投稿にコメントが届きました',
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
            <h2 style="color: #dc2626;">🦞 ザリダス</h2>
            <p>あなたの投稿にコメントが届きました。</p>
            <blockquote style="border-left: 4px solid #dc2626; margin: 16px 0; padding: 8px 16px; background: #fef2f2; border-radius: 4px;">
              ${escapeHtml(comment_content)}
            </blockquote>
            <a href="${siteUrl}/post/${post_id}"
               style="display: inline-block; background: #dc2626; color: white; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: bold;">
              投稿を確認する
            </a>
            <p style="margin-top: 24px; font-size: 12px; color: #9ca3af;">
              このメールは自動送信です。心当たりがない場合は無視してください。
            </p>
          </div>
        `,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      // ログはステータスのみ（レスポンス本体は従来どおり返す）。
      console.error('Resend error:', res.status)
      await releaseClaim()
      releaseClaim = null
      return new Response(JSON.stringify({ error: err }), { status: 500, headers: corsHeaders })
    }

    return new Response(JSON.stringify({ sent: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    if (releaseClaim) await releaseClaim()
    console.error('Comment notification failed')
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders })
  }
}

if (import.meta.main) {
  serve(handleRequest)
}
