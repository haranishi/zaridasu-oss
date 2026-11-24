// REQ-211: Sentry PII スクラブ共通関数のユニットテスト。
//
// 検証する受入条件:
//   AC-02: メール / IPv4 / IPv6 / JWT / Bearer を含むダミー例外がスクラブされる
//   AC-03: user.email / user.ip_address / request.cookies / request.headers.authorization が残らない
//   AC-04: beforeSendTransaction（scrubTransaction）が transaction 名・request・span をスクラブ
//   AC-07: 欠損フィールドに対して例外を投げない（NFR-211-01）
//   NFR-211-04: 長大文字列でも線形に処理し、ReDoS を起こさない
//   AC-01: 3 ランタイムの Sentry.init が自動収集を止めている（v11 以降は dataCollection で表す）

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, it, expect, vi } from 'vitest'
import type { Event } from '@sentry/nextjs'
import { SENTRY_DATA_COLLECTION, scrubString, scrubEvent, scrubTransaction } from '../sentryScrub'

const { init } = vi.hoisted(() => ({ init: vi.fn() }))
vi.mock('@sentry/nextjs', () => ({ init }))

const REDACTED = '[REDACTED]'

describe('scrubString', () => {
  it('メールアドレスを除去する', () => {
    expect(scrubString('user alice@example.com reported')).toBe(`user ${REDACTED} reported`)
  })

  it('IPv4 を除去する', () => {
    expect(scrubString('ip=192.168.10.255 done')).toContain(REDACTED)
    expect(scrubString('ip=192.168.10.255 done')).not.toContain('192.168.10.255')
  })

  it('IPv6 を除去する', () => {
    const out = scrubString('addr 2001:0db8:85a3:0000:0000:8a2e:0370:7334 end')
    expect(out).not.toContain('2001:0db8:85a3')
    expect(out).toContain(REDACTED)
  })

  it('JWT を除去する', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N'
    const out = scrubString(`token ${jwt}`)
    expect(out).toBe(`token ${REDACTED}`)
  })

  it('Bearer トークンを除去する', () => {
    const out = scrubString('Authorization header was Bearer abc.def-ghi_123')
    expect(out).toContain(`Bearer ${REDACTED}`)
    expect(out).not.toContain('abc.def-ghi_123')
  })

  it('apikey=... / token=... の値を除去する', () => {
    expect(scrubString('?apikey=SECRET123&x=1')).not.toContain('SECRET123')
    expect(scrubString('token=abcDEF.ghi')).not.toContain('abcDEF.ghi')
  })

  it('非 PII の文字列はそのまま保持する（過剰スクラブしない）', () => {
    const s = 'TypeError: cannot read property foo of undefined at PostForm.tsx:42'
    expect(scrubString(s)).toBe(s)
  })

  it('空文字・非文字列を安全に扱う', () => {
    expect(scrubString('')).toBe('')
    // @ts-expect-error 故意に非文字列を渡す（ランタイム安全性の確認）
    expect(scrubString(undefined)).toBe(undefined)
    // @ts-expect-error 故意に非文字列を渡す
    expect(scrubString(12345)).toBe(12345)
  })

  it('NFR-211-04: 長大文字列でも線形時間（タイムアウトしない）かつ truncate される', () => {
    const huge = 'a'.repeat(50000) + ' bob@example.com'
    const start = Date.now()
    const out = scrubString(huge)
    expect(Date.now() - start).toBeLessThan(1000)
    expect(out).toContain('[truncated]')
  })

  it('NFR-211-04: ReDoS 攻撃的入力（@ の連続など）でも即座に返る', () => {
    const evil = '@'.repeat(40000)
    const start = Date.now()
    scrubString(evil)
    expect(Date.now() - start).toBeLessThan(1000)
  })
})

describe('scrubEvent', () => {
  it('AC-02: 例外 value のメール / IP / JWT / Bearer を除去する', () => {
    const event: Event = {
      exception: {
        values: [
          {
            type: 'Error',
            value:
              'failed for bob@example.com from 10.0.0.1 token eyJhbGciOiJIUzI1NiJ9.eyJhIjoxfQ.sig Bearer secrettoken123',
          },
        ],
      },
    }
    const out = scrubEvent(event)
    const value = out.exception?.values?.[0]?.value ?? ''
    expect(value).not.toContain('bob@example.com')
    expect(value).not.toContain('10.0.0.1')
    expect(value).not.toContain('eyJhbGciOiJIUzI1NiJ9')
    expect(value).not.toContain('secrettoken123')
  })

  it('AC-03: user.email / user.ip_address / username / geo を除去し id は保持する', () => {
    const event: Event = {
      user: {
        id: 'user-123',
        email: 'alice@example.com',
        ip_address: '203.0.113.5',
        username: 'alice',
        geo: { city: 'Akita', country_code: 'JP' },
      },
    }
    const out = scrubEvent(event)
    expect(out.user).toEqual({ id: 'user-123' })
    expect(out.user?.email).toBeUndefined()
    expect(out.user?.ip_address).toBeUndefined()
    expect(out.user?.username).toBeUndefined()
    expect(out.user?.geo).toBeUndefined()
  })

  it('AC-03: request.cookies / 機微ヘッダ / query_string を除去する', () => {
    const event: Event = {
      request: {
        url: 'https://zaridasu.com/post?email=leak@example.com',
        cookies: { session: 'abc' },
        query_string: 'email=leak@example.com',
        headers: {
          authorization: 'Bearer xyz',
          cookie: 'session=abc',
          'x-forwarded-for': '198.51.100.7',
          'user-agent': 'Mozilla/5.0',
        },
      },
    }
    const out = scrubEvent(event)
    expect(out.request?.cookies).toBeUndefined()
    expect(out.request?.query_string).toBe(REDACTED)
    expect(out.request?.headers?.authorization).toBe(REDACTED)
    expect(out.request?.headers?.cookie).toBe(REDACTED)
    expect(out.request?.headers?.['x-forwarded-for']).toBe(REDACTED)
    // 非機微ヘッダは保持する（過剰スクラブしない）
    expect(out.request?.headers?.['user-agent']).toBe('Mozilla/5.0')
    // URL 内のメールも除去
    expect(out.request?.url).not.toContain('leak@example.com')
  })

  it('機微キー（reporter_ip / request_ip / email / token）の値を除去する', () => {
    const event: Event = {
      extra: {
        reporter_ip: '192.0.2.10',
        request_ip: '192.0.2.11',
        email: 'x@example.com',
        token: 'tok_123',
        note: 'harmless note',
      },
      tags: {
        email: 'tag@example.com',
        context: 'PostForm',
      },
      contexts: {
        custom: { ip: '192.0.2.99', label: 'ok' },
      },
    }
    const out = scrubEvent(event)
    const extra = out.extra as Record<string, unknown>
    expect(extra.reporter_ip).toBe(REDACTED)
    expect(extra.request_ip).toBe(REDACTED)
    expect(extra.email).toBe(REDACTED)
    expect(extra.token).toBe(REDACTED)
    expect(extra.note).toBe('harmless note')
    expect(out.tags?.email).toBe(REDACTED)
    // context タグ（発生箇所ラベル・非 PII）は保持
    expect(out.tags?.context).toBe('PostForm')
    const ctx = out.contexts?.custom as Record<string, unknown>
    expect(ctx.ip).toBe(REDACTED)
    expect(ctx.label).toBe('ok')
  })

  it('breadcrumbs / message / logentry のメール・IP を除去する', () => {
    const event: Event = {
      message: 'sent to carol@example.com',
      logentry: { message: 'login from 192.0.2.50' },
      breadcrumbs: [
        { message: 'POST /api with dave@example.com', data: { ip: '192.0.2.60' } },
      ],
    }
    const out = scrubEvent(event)
    expect(out.message).not.toContain('carol@example.com')
    expect(out.logentry?.message).not.toContain('192.0.2.50')
    expect(out.breadcrumbs?.[0]?.message).not.toContain('dave@example.com')
    expect((out.breadcrumbs?.[0]?.data as Record<string, unknown>)?.ip).toBe(REDACTED)
  })

  it('REQ-330: fetch / xhr のパンくずの URL から、座標入りのクエリ文字列（? 以降）を落とす', () => {
    const event: Event = {
      breadcrumbs: [
        {
          category: 'fetch',
          data: { method: 'GET', url: 'https://nominatim.openstreetmap.org/reverse?lat=39.72345&lon=140.10123&format=json', status_code: 200 },
        },
        {
          category: 'xhr',
          data: { method: 'GET', url: 'https://x.supabase.co/rest/v1/rare_sightings?select=id&lat=gte.39.71&lat=lte.39.73#frag', status_code: 200 },
        },
        { category: 'fetch', data: { method: 'GET', url: 'https://example.com/plain', status_code: 200 } },
      ],
    }
    const crumbs = scrubEvent(event).breadcrumbs!
    expect((crumbs[0]!.data as Record<string, unknown>).url).toBe('https://nominatim.openstreetmap.org/reverse')
    expect((crumbs[1]!.data as Record<string, unknown>).url).toBe('https://x.supabase.co/rest/v1/rare_sightings')
    expect((crumbs[2]!.data as Record<string, unknown>).url).toBe('https://example.com/plain')
    expect(JSON.stringify(crumbs)).not.toMatch(/39\.72|140\.10/)
    // 方法と状態は残す（調べるのに要る）
    expect(crumbs[0]!.data).toMatchObject({ method: 'GET', status_code: 200 })
  })

  it('REQ-330: トランザクションのパンくずでも同じく落とす（3 つのランタイムで同じ関数）', () => {
    const tx: Event = {
      type: 'transaction',
      breadcrumbs: [{ category: 'fetch', data: { url: 'https://nominatim.openstreetmap.org/reverse?lat=39.7&lon=140.1' } }],
    }
    expect((scrubTransaction(tx).breadcrumbs![0]!.data as Record<string, unknown>).url).toBe('https://nominatim.openstreetmap.org/reverse')
  })

  it('NFR-211-02: スタックフレームの filename / lineno は保持する', () => {
    const event: Event = {
      exception: {
        values: [
          {
            type: 'Error',
            value: 'boom for eve@example.com',
            stacktrace: {
              frames: [{ filename: 'PostForm.tsx', lineno: 42, function: 'submit' }],
            },
          },
        ],
      },
    }
    const out = scrubEvent(event)
    const frame = out.exception?.values?.[0]?.stacktrace?.frames?.[0]
    expect(frame?.filename).toBe('PostForm.tsx')
    expect(frame?.lineno).toBe(42)
    expect(frame?.function).toBe('submit')
    expect(out.exception?.values?.[0]?.value).not.toContain('eve@example.com')
  })

  it('AC-07: 欠損フィールド（空オブジェクト）でも例外を投げない', () => {
    expect(() => scrubEvent({})).not.toThrow()
    expect(scrubEvent({})).toEqual({})
  })

  it('AC-07: 部分的なイベント（exception だけ / request だけ / user だけ）でも安全', () => {
    expect(() => scrubEvent({ exception: { values: [] } })).not.toThrow()
    expect(() => scrubEvent({ request: {} })).not.toThrow()
    expect(() => scrubEvent({ user: {} })).not.toThrow()
    expect(() => scrubEvent({ exception: { values: [{ type: 'E' }] } })).not.toThrow()
  })

  it('AC-07: null / undefined 相当の入力でも落ちない', () => {
    // @ts-expect-error 故意に null を渡す
    expect(() => scrubEvent(null)).not.toThrow()
    // @ts-expect-error 故意に undefined を渡す
    expect(() => scrubEvent(undefined)).not.toThrow()
  })
})

describe('scrubTransaction', () => {
  it('AC-04: transaction 名から IP / メールを除去する', () => {
    const event: Event = {
      type: 'transaction',
      transaction: 'GET /api/posts?email=frank@example.com',
    }
    const out = scrubTransaction(event)
    expect(out.transaction).not.toContain('frank@example.com')
  })

  it('AC-04: request / span の description・data から PII を除去する', () => {
    const event: Event = {
      type: 'transaction',
      request: {
        url: 'https://zaridasu.com/api?ip=192.0.2.123',
        headers: { authorization: 'Bearer t' },
      },
      spans: [
        {
          description: 'db query for grace@example.com',
          data: { 'http.url': 'https://x/?token=abc123' },
        },
        // span 型は最低限のフィールドのみ使う
      ] as unknown as Event['spans'],
    }
    const out = scrubTransaction(event)
    expect(out.request?.headers?.authorization).toBe(REDACTED)
    expect(out.request?.url).not.toContain('192.0.2.123')
    const span = out.spans?.[0] as { description?: string; data?: Record<string, unknown> }
    expect(span.description).not.toContain('grace@example.com')
    expect(String(span.data?.['http.url'])).not.toContain('abc123')
  })

  it('AC-07: 空トランザクションでも例外を投げない', () => {
    expect(() => scrubTransaction({ type: 'transaction' })).not.toThrow()
  })
})

describe('AC-01: SDK の自動収集を止める設定（@sentry/nextjs 11 の dataCollection）', () => {
  const PROJECT_ROOT = resolve(import.meta.dirname, '../../..')
  const INIT_FILES = ['sentry.server.config.ts', 'sentry.edge.config.ts', 'src/instrumentation-client.ts', 'cloudflare/sentry.ts']

  it('個人情報になりうる項目をすべて集めない', () => {
    // v11 の既定はすべて「集める」。1 項目でも緩むと座標や IP が外部へ出るので、全項目を値で固定する。
    expect(SENTRY_DATA_COLLECTION).toEqual({
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      mcp: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
      frameContextLines: 5,
    })
  })

  it.each(INIT_FILES)('%s の Sentry.init がこの設定を使い、廃止された sendDefaultPii を残していない', (file) => {
    const source = readFileSync(resolve(PROJECT_ROOT, file), 'utf8')
    expect(source).toContain('dataCollection: SENTRY_DATA_COLLECTION')
    // v11 は sendDefaultPii を読まない。残っていると「止めたつもり」で既定の全収集に戻る。
    expect(source).not.toMatch(/sendDefaultPii\s*:/)
  })
})

describe('AC-04 / AC-08: actual init configuration wiring', () => {
  const INIT_FILES = ['../../../sentry.server.config', '../../../sentry.edge.config', '../../instrumentation-client']

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it.each(INIT_FILES)('%s keeps the privacy hooks active with static traces', async (file) => {
    vi.resetModules()
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://public@example.invalid/1')
    await import(file)

    expect(init).toHaveBeenCalledTimes(1)
    const options = init.mock.calls[0]![0] as NonNullable<Parameters<typeof import('@sentry/nextjs').init>[0]>
    expect(options).toMatchObject({
      traceLifecycle: 'static',
      tracesSampleRate: 0.1,
      dataCollection: SENTRY_DATA_COLLECTION,
      maxValueLength: 8192,
    })
    const tx = { type: 'transaction' as const, transaction: 'lookup fixture@example.invalid' }
    expect(options.beforeSendTransaction?.(tx, {})).toMatchObject({ transaction: 'lookup [REDACTED]' })
    expect(options.beforeSend?.({ type: undefined, exception: { values: [{ value: 'ValidationError' }] } }, {})).toBeNull()
    expect(options.beforeSend?.({ type: undefined, message: 'fixture@example.invalid' }, {})).toMatchObject({ message: '[REDACTED]' })
  })

  it.each(INIT_FILES)('%s still requires both production and a DSN', async (file) => {
    for (const [nodeEnv, dsn] of [['development', 'https://public@example.invalid/1'], ['production', '']]) {
      vi.resetModules()
      vi.stubEnv('NODE_ENV', nodeEnv)
      vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', dsn)
      await import(file)
      expect(init).not.toHaveBeenCalled()
    }
  })
})
