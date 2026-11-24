// REQ-234 FR-234-01: _shared/mailer.ts のユニットテスト。
//
// 検証する主な振る舞い（AC-01）:
//   1. opt-out（購読フラグ false）なら送らない（reason: 'opt_out'・fetch されない）
//   2. RESEND_API_KEY 未設定なら fail-soft（reason: 'no_resend_key'・fetch されない）
//   3. opt-in + apiKey ありなら Resend を叩き、List-Unsubscribe / List-Unsubscribe-Post ヘッダと
//      配信停止トークン（auth.users.id を直載せしない）を含む（FR-234-01a / NFR-234-03）
//   4. escapeHtml が XSS 文字をエスケープする
//
// 実行: `deno test --allow-env --allow-net --allow-read \
//   --lock=supabase/functions/deno.lock --cached-only --no-check \
//   supabase/functions/_shared/__tests__/mailer.test.ts`

import { assert, assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'

import { escapeHtml, sendLifecycleEmail, type LifecycleCategory } from '../mailer.ts'

Deno.env.set('SITE_URL', 'https://zaridasu.com')
Deno.env.set('SUPABASE_URL', 'https://example.supabase.co')
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'svc-test')

// ── モック Supabase クライアント ───────────────────────────────────────────────
interface ProfileRow {
  notify_research_adopted?: boolean
  notify_dormant_reengage?: boolean
  notify_weekly_digest?: boolean
  unsubscribe_token?: string
}

function makeSupabase(profile: ProfileRow | null, email: string | null) {
  return {
    from(_table: string) {
      return {
        select(_cols: string) {
          return {
            eq(_c: string, _v: string) {
              return {
                maybeSingle() {
                  return Promise.resolve({ data: profile, error: null })
                },
              }
            },
          }
        },
      }
    },
    auth: {
      admin: {
        getUserById(_id: string) {
          return Promise.resolve({ data: email ? { user: { email } } : null, error: null })
        },
      },
    },
    // deno-lint-ignore no-explicit-any
  } as any
}

// global fetch をモックして送信ボディを捕捉する。
function withMockFetch<T>(fn: (captured: { url?: string; body?: Record<string, unknown> }) => Promise<T>) {
  const original = globalThis.fetch
  const captured: { url?: string; body?: Record<string, unknown> } = {}
  globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) => {
    captured.url = String(url)
    captured.body = init?.body ? JSON.parse(init.body as string) : undefined
    return Promise.resolve(new Response('{"id":"mock"}', { status: 200 }))
  }) as typeof fetch
  return fn(captured).finally(() => {
    globalThis.fetch = original
  })
}

const TOKEN = '11111111-2222-3333-4444-555555555555'
const cat: LifecycleCategory = 'research_adopted'

Deno.test('mailer: escapeHtml が XSS 文字をエスケープする', () => {
  assertEquals(escapeHtml(`<script>"&'`), '&lt;script&gt;&quot;&amp;&#39;')
})

Deno.test('mailer: opt-out なら送らない（fetch されない）', async () => {
  await withMockFetch(async (captured) => {
    const supabase = makeSupabase({ notify_research_adopted: false, unsubscribe_token: TOKEN }, 'u@example.com')
    const result = await sendLifecycleEmail({
      supabase,
      apiKey: 'resend-key',
      userId: 'user-1',
      category: cat,
      subject: 's',
      bodyHtml: '<p>x</p>',
    })
    assertEquals(result.sent, false)
    assertEquals(result.reason, 'opt_out')
    assertEquals(captured.url, undefined) // 送信されていない
  })
})

Deno.test('mailer: RESEND_API_KEY 未設定なら fail-soft', async () => {
  await withMockFetch(async (captured) => {
    const supabase = makeSupabase({ notify_research_adopted: true, unsubscribe_token: TOKEN }, 'u@example.com')
    const result = await sendLifecycleEmail({
      supabase,
      apiKey: undefined,
      userId: 'user-1',
      category: cat,
      subject: 's',
      bodyHtml: '<p>x</p>',
    })
    assertEquals(result.sent, false)
    assertEquals(result.reason, 'no_resend_key')
    assertEquals(captured.url, undefined)
  })
})

Deno.test('mailer: opt-in + apiKey で List-Unsubscribe ヘッダ + 不透明トークンを付与して送信', async () => {
  await withMockFetch(async (captured) => {
    const supabase = makeSupabase({ notify_research_adopted: true, unsubscribe_token: TOKEN }, 'u@example.com')
    const result = await sendLifecycleEmail({
      supabase,
      apiKey: 'resend-key',
      userId: 'secret-user-id-should-not-leak',
      category: cat,
      subject: 's',
      bodyHtml: '<p>body</p>',
    })
    assertEquals(result.sent, true)
    assertEquals(captured.url, 'https://api.resend.com/emails')
    const headers = (captured.body?.headers ?? {}) as Record<string, string>
    // List-Unsubscribe にトークンが入り、user_id は載らない（NFR-234-03）
    assert(headers['List-Unsubscribe']?.includes(TOKEN), 'List-Unsubscribe にトークンが含まれる')
    assert(!headers['List-Unsubscribe']?.includes('secret-user-id-should-not-leak'), 'user_id は載らない')
    assertEquals(headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click')
    // 本文に配信停止リンクが含まれる
    assert(String(captured.body?.html).includes('/u/unsubscribe?t='), '本文に配信停止リンクがある')
  })
})

Deno.test('mailer: 宛先メールが無ければ送らない', async () => {
  await withMockFetch(async (captured) => {
    const supabase = makeSupabase({ notify_research_adopted: true, unsubscribe_token: TOKEN }, null)
    const result = await sendLifecycleEmail({
      supabase,
      apiKey: 'resend-key',
      userId: 'user-1',
      category: cat,
      subject: 's',
      bodyHtml: '<p>x</p>',
    })
    assertEquals(result.sent, false)
    assertEquals(result.reason, 'no_email')
    assertEquals(captured.url, undefined)
  })
})
