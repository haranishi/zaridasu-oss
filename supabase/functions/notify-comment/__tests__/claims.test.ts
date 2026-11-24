import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { handleRequest } from '../index.ts'

function mock() {
  const claims = new Set<string>()
  let sends = 0; let failSend = false; let throwSend = false; let failClaim = false; let caller = 'writer'
  const service = {
    auth: { admin: { getUserById: () => ({ data: { user: { email: 'owner@example.invalid' } } }) } },
    from(table: string) {
      if (table === 'comment_notification_claims') return {
        insert({ comment_id }: { comment_id: string }) {
          if (failClaim) return { error: { code: '42P01' } }
          if (claims.has(comment_id)) return { error: { code: '23505' } }
          claims.add(comment_id); return { error: null }
        },
        delete() { return { eq(_col: string, id: string) { claims.delete(id); return { error: null } } } },
      }
      return { select() { return { eq() { return {
        maybeSingle: () => ({ data: { id: 'c1', post_id: 'p1', user_id: 'writer', content: 'comment' } }),
        single: () => ({ data: { user_id: 'owner' } }),
      } } } } }
    },
  }
  const deps = {
    createAnonClient: () => ({ auth: { getUser: () => ({ data: { user: { id: caller } } }) } }),
    createServiceClient: () => service,
    fetch: () => { sends++; if (throwSend) throw new Error('network failed'); return Promise.resolve(new Response('', { status: failSend ? 500 : 200 })) },
  }
  const request = () => new Request('http://localhost/notify-comment', { method: 'POST', headers: { Authorization: 'Bearer test' }, body: JSON.stringify({ comment_id: 'c1' }) })
  return {
    claims, get sends() { return sends },
    set failSend(v: boolean) { failSend = v }, set throwSend(v: boolean) { throwSend = v },
    set failClaim(v: boolean) { failClaim = v }, set caller(v: string) { caller = v },
    // クライアントの必要な操作だけを模擬する。
    run: () => handleRequest(request(), deps as unknown as Parameters<typeof handleRequest>[1]),
  }
}
Deno.test('通知: 同じコメントは1通のみ、送信失敗・例外は再送可、claim失敗は送信しない', async () => {
  const before = Deno.env.get('RESEND_API_KEY'); Deno.env.set('RESEND_API_KEY', 'test')
  try {
    const m = mock()
    assertEquals(await (await m.run()).json(), { sent: true })
    assertEquals(await (await m.run()).json(), { skipped: 'already_sent' })
    assertEquals(m.sends, 1)
    for (const mode of ['failSend', 'throwSend'] as const) {
      const retry = mock(); retry[mode] = true
      assertEquals((await retry.run()).status, 500); assertEquals(retry.claims.size, 0)
      retry[mode] = false
      assertEquals(await (await retry.run()).json(), { sent: true }); assertEquals(retry.sends, 2)
    }
    const closed = mock(); closed.failClaim = true
    assertEquals(await (await closed.run()).json(), { skipped: 'claim_failed' }); assertEquals(closed.sends, 0)
    const forbidden = mock(); forbidden.caller = 'attacker'
    assertEquals((await forbidden.run()).status, 403); assertEquals(forbidden.sends, 0); assertEquals(forbidden.claims.size, 0)
  } finally { if (before === undefined) Deno.env.delete('RESEND_API_KEY'); else Deno.env.set('RESEND_API_KEY', before) }
})
