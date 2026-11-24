// REQ-072/073: analyze-audio Edge Function の Deno テスト
// 実行: `deno test --allow-env --allow-net --allow-read supabase/functions/analyze-audio/`

import { assert, assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'

Deno.env.set('GEMINI_API_KEY', '')
Deno.env.set('SUPABASE_URL', 'http://localhost:54321')
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-key')

const { handleRequest, combineDecision } = await import('./index.ts')

function post(body: unknown): Request {
  return new Request('http://localhost/functions/analyze-audio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

Deno.test('INV-01: audio_url が無い record は no_audio でスキップ', async () => {
  const res = await handleRequest(post({ record: { id: 'p1' } }))
  assertEquals(res.status, 200)
  const json = await res.json()
  assertEquals(json.skipped, 'no_audio')
})

Deno.test('INV-02: GEMINI_API_KEY 未設定時は no_api_key でスキップ', async () => {
  const res = await handleRequest(
    post({ record: { id: 'p2', audio_url: 'https://cdn/audio.webm', species: 'bullfrog' } }),
  )
  assertEquals(res.status, 200)
  const json = await res.json()
  assertEquals(json.skipped, 'no_api_key')
})

Deno.test('INV-03: OPTIONS で CORS 200', async () => {
  const res = await handleRequest(new Request('http://localhost/functions/analyze-audio', { method: 'OPTIONS' }))
  assertEquals(res.status, 200)
  assertEquals(res.headers.get('access-control-allow-origin'), '*')
})

// REQ-218 AC-02: AI_ANALYSIS_ENABLED=false の間は Gemini を呼ばず skipped: disabled を返す。
// キーが設定されていても kill switch が先に効く（コスト発生前に弾く）。
Deno.test('REQ-218 AC-02: AI_ANALYSIS_ENABLED=false なら skipped: disabled（キー有りでも停止）', async () => {
  Deno.env.set('GEMINI_API_KEY', 'AIzaSyTEST')
  Deno.env.set('AI_ANALYSIS_ENABLED', 'false')
  try {
    const res = await handleRequest(
      post({ record: { id: 'p-kill', audio_url: 'https://cdn/audio.webm', species: 'bullfrog' } }),
    )
    assertEquals(res.status, 200)
    const json = await res.json()
    assertEquals(json.skipped, 'disabled')
  } finally {
    Deno.env.delete('AI_ANALYSIS_ENABLED')
    Deno.env.set('GEMINI_API_KEY', '')
  }
})

// REQ-218 AC-08: 未設定なら従来どおり（kill switch を素通りして no_api_key 分岐へ＝後方互換）。
Deno.test('REQ-218 AC-08: AI_ANALYSIS_ENABLED 未設定なら従来どおり進む（後方互換）', async () => {
  Deno.env.delete('AI_ANALYSIS_ENABLED')
  const res = await handleRequest(
    post({ record: { id: 'p-default', audio_url: 'https://cdn/audio.webm', species: 'bullfrog' } }),
  )
  assertEquals(res.status, 200)
  const json = await res.json()
  // キーは空のままなので no_api_key に到達する（= kill switch で止まっていない）。
  assertEquals(json.skipped, 'no_api_key')
})

// combineDecision の 8 パターン
Deno.test('combine: 両方一致・高信頼度 → approve', () => {
  const d = combineDecision(
    { species_match: true, confidence: 0.9, is_appropriate: true, image_quality: 'good' },
    { species_match: true, confidence: 0.9, is_appropriate: true, audio_quality: 'good', analyzed_at: 't' },
    true,
  )
  assertEquals(d.should_approve, true)
  assertEquals(d.reason, 'both_modalities_match')
})

Deno.test('combine: 音声のみ・高信頼度 → approve', () => {
  const d = combineDecision(
    null,
    { species_match: true, confidence: 0.9, is_appropriate: true, audio_quality: 'good', analyzed_at: 't' },
    false,
  )
  assertEquals(d.should_approve, true)
  assertEquals(d.reason, 'audio_only_high_confidence')
})

Deno.test('combine: 音声のみ・低信頼度 → manual review', () => {
  const d = combineDecision(
    null,
    { species_match: true, confidence: 0.6, is_appropriate: true, audio_quality: 'good', analyzed_at: 't' },
    false,
  )
  assertEquals(d.should_approve, false)
  assertEquals(d.should_reject, false)
  assertEquals(d.reason, 'needs_manual_review')
})

Deno.test('combine: 画像 vs 音声 矛盾（両方高信頼）→ manual review', () => {
  const d = combineDecision(
    { species_match: true, confidence: 0.9, is_appropriate: true },
    { species_match: false, confidence: 0.9, is_appropriate: true, audio_quality: 'good', analyzed_at: 't' },
    true,
  )
  assertEquals(d.should_approve, false)
  assertEquals(d.reason, 'species_mismatch_modalities')
})

Deno.test('combine: 音声で不適切判定 → auto reject', () => {
  const d = combineDecision(
    null,
    { species_match: null, confidence: null, is_appropriate: false, audio_quality: 'poor', analyzed_at: 't' },
    false,
  )
  assertEquals(d.should_reject, true)
  assertEquals(d.reason, 'inappropriate_content')
})

Deno.test('combine: 音声で明らかに種不一致 → auto reject', () => {
  const d = combineDecision(
    null,
    { species_match: false, confidence: 0.8, is_appropriate: true, audio_quality: 'good', analyzed_at: 't' },
    false,
  )
  assertEquals(d.should_reject, true)
  assertEquals(d.reason, 'audio_species_mismatch')
})

// =============================================================================
// REQ-212 FR-212-06 (AC-06): caller（user_id / IP）単位の reanalysis スロットル配線。
//   analyze-image と同方針。caller 上限を超えると post_id 集計が未達でも 429 で弾かれ、
//   Gemini を呼ばず rate_limited を記録する。admin は両スロットルを bypass。
//   callerHits はプロセス内で永続するため、テストごとに一意な IP を使い汚染を避ける。
// =============================================================================

// reanalysis のフローを最小限で成立させる fetch mock。
//   - GET /posts(.single)  → current（audio_url / species / status / user_id 等）
//   - GET/HEAD /ai_call_logs → post_id 単位の count=0（= 未達。caller だけを効かせる）
//   - POST /ai_call_logs   → ログ捕捉
//   - PATCH /posts         → 更新捕捉
//   - audio fetch / Gemini → 正常応答
function mockAudioReanalysisFlow(dbRow: Record<string, unknown>) {
  const originalFetch = globalThis.fetch
  const aiLogs: Record<string, unknown>[] = []
  let geminiCalls = 0
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
      ? input.toString()
      : input.url
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET')

    // REQ-242: getUser(token) の GoTrue エンドポイント。所有者 = dbRow.user_id として
    //   検証済みユーザーを返し、再解析の所有者ゲートを通過させる（caller スロットルを検証する）。
    if (url.includes('/auth/v1/user')) {
      return new Response(
        JSON.stringify({ id: dbRow.user_id, app_metadata: {} }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }

    if (url.startsWith('http://localhost:54321/rest/v1/posts') && method === 'GET') {
      return new Response(JSON.stringify(dbRow), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    if (url.startsWith('http://localhost:54321/rest/v1/posts') && method === 'PATCH') {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    // post_id 単位 rate limit の count クエリ（head:true, count:exact）→ 0（未達）。
    if (
      url.startsWith('http://localhost:54321/rest/v1/ai_call_logs') &&
      (method === 'GET' || method === 'HEAD')
    ) {
      return new Response(null, { status: 200, headers: { 'Content-Range': '*/0' } })
    }
    if (url.startsWith('http://localhost:54321/rest/v1/ai_call_logs') && method === 'POST') {
      aiLogs.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>)
      return new Response(JSON.stringify([{}]), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    if (url.startsWith('http://localhost:54321/storage/v1/object/public/posts/audio.webm')) {
      return new Response('audio-bytes', {
        status: 200,
        headers: { 'Content-Type': 'audio/webm' },
      })
    }
    if (url.startsWith('https://generativelanguage.googleapis.com/')) {
      geminiCalls += 1
      return new Response(
        JSON.stringify({
          candidates: [{
            finishReason: 'STOP',
            content: {
              parts: [{
                text: JSON.stringify({
                  detected_species: 'bullfrog',
                  species_match: true,
                  confidence: 0.9,
                  audio_quality: 'good',
                  is_appropriate: true,
                  concerns: [],
                  notes: 'ok',
                }),
              }],
            },
          }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }
    return new Response(`unhandled fetch: ${method} ${url}`, { status: 500 })
  }) as typeof fetch
  return {
    aiLogs,
    get geminiCalls() {
      return geminiCalls
    },
    restore() {
      globalThis.fetch = originalFetch
    },
  }
}

function audioReanalysisFromIp(ip: string, id: string, token = 'owner-token'): Request {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'cf-connecting-ip': ip,
  }
  // REQ-242: 再解析は検証済みユーザーが必須になったため、既定で所有者トークンを付与する
  //   （認証ユーザーの caller キーは reanalysisCallerKey により user:<id> になる）。
  if (token) headers['authorization'] = `Bearer ${token}`
  return new Request('http://localhost/functions/analyze-audio', {
    method: 'POST',
    headers,
    body: JSON.stringify({ reanalysis: true, record: { id } }),
  })
}

Deno.test({
  name:
    'REQ-212 AC-06: caller 上限超過の reanalysis は post_id 未達でも 429 で弾かれ Gemini を呼ばない',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    Deno.env.set('AI_REANALYSIS_CALLER_DAILY_LIMIT', '1')
    // REQ-242: 所有者として認証すると caller キーは user:<id>。callerHits はプロセス共有・
    //   永続のため、他テストと衝突しないよう一意な owner id を使う（旧: 一意 IP と同趣旨）。
    const owner = `owner-${crypto.randomUUID()}`
    const ip = `198.51.100.${Math.floor(Math.random() * 250) + 1}`
    const mock = mockAudioReanalysisFlow({
      user_id: owner,
      ai_failure_count: 0,
      status: 'pending',
      species: 'bullfrog',
      audio_url: 'http://localhost:54321/storage/v1/object/public/posts/audio.webm',
      audio_hash: null,
      ai_result: {},
      photos: [],
    })
    Deno.env.set('GEMINI_API_KEY', 'AIzaSyTEST')
    try {
      // 1 回目: caller 未達 → 通常処理。
      const first = await handleRequest(audioReanalysisFromIp(ip, 'a-caller-1'))
      assertEquals(first.status, 200)
      const firstJson = await first.json()
      assertEquals(firstJson.analyzed, true)
      const callsAfterFirst = mock.geminiCalls
      assert(callsAfterFirst >= 1, '1 回目は Gemini が呼ばれるはず')

      // 2 回目: 同一 IP・別 post → caller 上限超過で 429。Gemini は増えない。
      const second = await handleRequest(audioReanalysisFromIp(ip, 'a-caller-2'))
      assertEquals(second.status, 429)
      const secondJson = await second.json()
      assertEquals(secondJson.error, 'rate_limit_exceeded')
      assertEquals(secondJson.limit, 1)
      assert(Number(second.headers.get('Retry-After')) > 0, 'Retry-After ヘッダが付くべき')
      assertEquals(
        mock.geminiCalls,
        callsAfterFirst,
        'caller 上限超過時は Gemini を呼ばない（コスト 0）',
      )
      const rl = mock.aiLogs.find((l) => l.status === 'rate_limited')
      assert(rl, 'rate_limited ログが記録されるべき')
      assertEquals(rl!.reanalysis, true)
    } finally {
      mock.restore()
      Deno.env.set('GEMINI_API_KEY', '')
      Deno.env.delete('AI_REANALYSIS_CALLER_DAILY_LIMIT')
    }
  },
})

Deno.test({
  name:
    'REQ-212 AC-06: admin の reanalysis は caller 上限を bypass する（正規フローを壊さない）',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    Deno.env.set('AI_REANALYSIS_CALLER_DAILY_LIMIT', '1')
    const originalFetch = globalThis.fetch
    let geminiCalls = 0
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL
        ? input.toString()
        : input.url
      const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
      if (url.includes('/auth/v1/user')) {
        return new Response(
          JSON.stringify({ id: 'admin-1', app_metadata: { role: 'admin' } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      if (url.startsWith('http://localhost:54321/rest/v1/posts') && method === 'GET') {
        return new Response(
          JSON.stringify({
            user_id: 'someone-else',
            ai_failure_count: 0,
            status: 'pending',
            species: 'bullfrog',
            audio_url: 'http://localhost:54321/storage/v1/object/public/posts/audio.webm',
            audio_hash: null,
            ai_result: {},
            photos: [],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      if (url.startsWith('http://localhost:54321/rest/v1/posts') && method === 'PATCH') {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url.startsWith('http://localhost:54321/rest/v1/ai_call_logs')) {
        return new Response(JSON.stringify([{}]), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url.startsWith('http://localhost:54321/storage/v1/object/public/posts/audio.webm')) {
        return new Response('audio-bytes', {
          status: 200,
          headers: { 'Content-Type': 'audio/webm' },
        })
      }
      if (url.startsWith('https://generativelanguage.googleapis.com/')) {
        geminiCalls += 1
        return new Response(
          JSON.stringify({
            candidates: [{
              finishReason: 'STOP',
              content: {
                parts: [{
                  text: JSON.stringify({
                    detected_species: 'bullfrog',
                    species_match: true,
                    confidence: 0.9,
                    audio_quality: 'good',
                    is_appropriate: true,
                    concerns: [],
                    notes: 'ok',
                  }),
                }],
              },
            }],
            usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      return new Response(`unhandled fetch: ${method} ${url}`, { status: 500 })
    }) as typeof fetch
    Deno.env.set('GEMINI_API_KEY', 'AIzaSyTEST')
    try {
      function adminReanalysis(id: string): Request {
        return new Request('http://localhost/functions/analyze-audio', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'authorization': 'Bearer admin-token',
            'cf-connecting-ip': '203.0.113.251',
          },
          body: JSON.stringify({ reanalysis: true, record: { id } }),
        })
      }
      const r1 = await handleRequest(adminReanalysis('a-admin-1'))
      assertEquals(r1.status, 200)
      const r2 = await handleRequest(adminReanalysis('a-admin-2'))
      assertEquals(r2.status, 200)
      assert(geminiCalls >= 2, 'admin は両 reanalysis で Gemini が呼ばれるべき')
    } finally {
      globalThis.fetch = originalFetch
      Deno.env.set('GEMINI_API_KEY', '')
      Deno.env.delete('AI_REANALYSIS_CALLER_DAILY_LIMIT')
    }
  },
})

// =============================================================================
// REQ-242: AI 再解析エンドポイントの認可バイパス修正。
//   旧実装は所有者チェックを if(user) の内側に置いていたため、anon キーだけを提示した
//   未認証リクエスト（getUser が user を返さない）ではチェックが丸ごと skip され、
//   他者の投稿を再解析（課金強制）・承認済み→pending 降格（検閲）できていた。
//   修正後は「検証済みユーザーが無ければ拒否（fail-closed）」に是正する。
//   - AC-01: anon キー（user なし）→ 401。Gemini 課金も status 変更も起きない。
//   - AC-02: 非所有者の認証ユーザー→ 403。所有者・admin は 200 で成功。
//   - AC-03: 承認済み→pending 降格は所有者/admin ゲート通過後にのみ到達する。
// =============================================================================

// postUpdates を捕捉し、認証（user / 401）を差し替えられる REQ-242 用の音声 reanalysis mock。
function mockAudioAuthFlow(options: {
  dbRow: Record<string, unknown>
  authUser?: Record<string, unknown>
  authUnauthorized?: boolean
}) {
  const originalFetch = globalThis.fetch
  const postUpdates: Record<string, unknown>[] = []
  const aiLogs: Record<string, unknown>[] = []
  let geminiCalls = 0
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
      ? input.toString()
      : input.url
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET')

    // REQ-242: getUser(token) を解決する GoTrue エンドポイント。
    if (url.includes('/auth/v1/user')) {
      if (options.authUnauthorized) {
        return new Response(JSON.stringify({ message: 'invalid token' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(
        JSON.stringify(options.authUser ?? { id: 'owner-1', app_metadata: {} }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }
    if (url.startsWith('http://localhost:54321/rest/v1/posts') && method === 'GET') {
      return new Response(JSON.stringify(options.dbRow), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    if (url.startsWith('http://localhost:54321/rest/v1/posts') && method === 'PATCH') {
      postUpdates.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>)
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    if (
      url.startsWith('http://localhost:54321/rest/v1/ai_call_logs') &&
      (method === 'GET' || method === 'HEAD')
    ) {
      return new Response(null, { status: 200, headers: { 'Content-Range': '*/0' } })
    }
    if (url.startsWith('http://localhost:54321/rest/v1/ai_call_logs') && method === 'POST') {
      aiLogs.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>)
      return new Response(JSON.stringify([{}]), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    if (url.startsWith('http://localhost:54321/storage/v1/object/public/posts/audio.webm')) {
      return new Response('audio-bytes', {
        status: 200,
        headers: { 'Content-Type': 'audio/webm' },
      })
    }
    if (url.startsWith('https://generativelanguage.googleapis.com/')) {
      geminiCalls += 1
      return new Response(
        JSON.stringify({
          candidates: [{
            finishReason: 'STOP',
            content: {
              parts: [{
                text: JSON.stringify({
                  detected_species: 'bullfrog',
                  species_match: true,
                  confidence: 0.9,
                  audio_quality: 'good',
                  is_appropriate: true,
                  concerns: [],
                  notes: 'ok',
                }),
              }],
            },
          }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }
    return new Response(`unhandled fetch: ${method} ${url}`, { status: 500 })
  }) as typeof fetch
  return {
    postUpdates,
    aiLogs,
    get geminiCalls() {
      return geminiCalls
    },
    restore() {
      globalThis.fetch = originalFetch
    },
  }
}

function audioReanalysisAuthed(id: string, token?: string): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['authorization'] = `Bearer ${token}`
  return new Request('http://localhost/functions/analyze-audio', {
    method: 'POST',
    headers,
    body: JSON.stringify({ reanalysis: true, record: { id } }),
  })
}

Deno.test({
  name:
    'REQ-242 AC-01: anon キー（user なし）の reanalysis は 401。Gemini も承認済み→pending 降格も起きない',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    // 攻撃シナリオ: Authorization: Bearer <anon キー> でも getUser は user を返さない。
    // 被害者の承認済み投稿を対象にしても 401 で即拒否され、課金も status 変更も起きないこと。
    const mock = mockAudioAuthFlow({
      dbRow: {
        user_id: 'victim-1',
        ai_failure_count: 0,
        status: 'approved', // 承認済み。降格（→pending）が起きないことを検証する。
        species: 'bullfrog',
        audio_url: 'http://localhost:54321/storage/v1/object/public/posts/audio.webm',
        audio_hash: null,
        ai_result: {},
        photos: [],
      },
      authUnauthorized: true, // /auth/v1/user → 401（anon キー相当・user なし）
    })
    Deno.env.set('GEMINI_API_KEY', 'AIzaSyTEST')
    try {
      const res = await handleRequest(audioReanalysisAuthed('victim-post', 'anon-public-key'))
      assertEquals(res.status, 401)
      assertEquals(mock.geminiCalls, 0)
      assertEquals(mock.postUpdates.length, 0)
      assertEquals(mock.aiLogs.length, 0)
    } finally {
      mock.restore()
      Deno.env.set('GEMINI_API_KEY', '')
    }
  },
})

Deno.test({
  name:
    'REQ-242 AC-02/03: 非所有者の認証ユーザーの reanalysis は 403。Gemini も降格も起きない',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const mock = mockAudioAuthFlow({
      dbRow: {
        user_id: 'victim-1',
        ai_failure_count: 0,
        status: 'approved',
        species: 'bullfrog',
        audio_url: 'http://localhost:54321/storage/v1/object/public/posts/audio.webm',
        audio_hash: null,
        ai_result: {},
        photos: [],
      },
      // 非所有者・非 admin として認証（getUser は attacker を返す）。
      authUser: { id: 'attacker-2', app_metadata: {} },
    })
    Deno.env.set('GEMINI_API_KEY', 'AIzaSyTEST')
    try {
      const res = await handleRequest(audioReanalysisAuthed('victim-post', 'attacker-token'))
      assertEquals(res.status, 403)
      assertEquals(mock.geminiCalls, 0)
      assertEquals(mock.postUpdates.length, 0)
    } finally {
      mock.restore()
      Deno.env.set('GEMINI_API_KEY', '')
    }
  },
})

Deno.test({
  name: 'REQ-242 AC-02: 所有者本人の reanalysis は 200 で成功する',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    // caller キー衝突を避けるため一意な owner id を使う（callerHits はプロセス共有）。
    const owner = `owner-${crypto.randomUUID()}`
    const mock = mockAudioAuthFlow({
      dbRow: {
        user_id: owner,
        ai_failure_count: 0,
        status: 'pending',
        species: 'bullfrog',
        audio_url: 'http://localhost:54321/storage/v1/object/public/posts/audio.webm',
        audio_hash: null,
        ai_result: {},
        photos: [],
      },
      authUser: { id: owner, app_metadata: {} },
    })
    Deno.env.set('GEMINI_API_KEY', 'AIzaSyTEST')
    try {
      const res = await handleRequest(audioReanalysisAuthed('own-post', 'owner-token'))
      assertEquals(res.status, 200)
      const json = await res.json()
      assertEquals(json.analyzed, true)
      assert(mock.geminiCalls >= 1, '所有者の再解析では Gemini が呼ばれる')
    } finally {
      mock.restore()
      Deno.env.set('GEMINI_API_KEY', '')
    }
  },
})

Deno.test({
  name: 'REQ-242 AC-02: admin は非所有者でも reanalysis が 200 で成功する',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const mock = mockAudioAuthFlow({
      dbRow: {
        user_id: 'someone-else',
        ai_failure_count: 0,
        status: 'pending',
        species: 'bullfrog',
        audio_url: 'http://localhost:54321/storage/v1/object/public/posts/audio.webm',
        audio_hash: null,
        ai_result: {},
        photos: [],
      },
      // admin ロールで認証（所有者でなくても通過する）。
      authUser: { id: 'admin-9', app_metadata: { role: 'admin' } },
    })
    Deno.env.set('GEMINI_API_KEY', 'AIzaSyTEST')
    try {
      const res = await handleRequest(audioReanalysisAuthed('any-post', 'admin-token'))
      assertEquals(res.status, 200)
      const json = await res.json()
      assertEquals(json.analyzed, true)
    } finally {
      mock.restore()
      Deno.env.set('GEMINI_API_KEY', '')
    }
  },
})

Deno.test({
  name: 'security: 音声流用も申告値を使わず実体SHA-256だけを照合する',
  sanitizeOps: false, sanitizeResources: false,
  fn: async () => {
    const { mediaSha256 } = await import('../_shared/mediaFetch.ts')
    const hash = await mediaSha256(new TextEncoder().encode('audio-bytes'))
    const original = globalThis.fetch
    Deno.env.set('GEMINI_API_KEY', 'test')
    try {
      for (const mode of ['hit', 'different', 'legacy']) {
        let gemini = 0; let media = 0
        const updates: Record<string, unknown>[] = []
        globalThis.fetch = (async (input, init) => {
          const url = decodeURIComponent(String(input instanceof Request ? input.url : input))
          const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
          const analysis = { detected_species: 'bullfrog', species_match: true, confidence: 0.99, audio_quality: 'good', is_appropriate: true, concerns: [] }
          const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })
          if (url.includes('/rest/v1/posts') && method === 'PATCH') { updates.push(JSON.parse(String(init?.body))); return json([]) }
          if (url.includes('ai_result->>audio_sha256=eq.')) {
            assert(url.includes(hash))
            return json([{ id: 'past', audio_hash: 'forged', ai_result: { audio_analysis: analysis, ...(mode === 'legacy' ? {} : { audio_sha256: mode === 'hit' ? hash : 'different' }) } }])
          }
          if (url.includes('/rest/v1/posts')) return json({ user_id: 'owner', status: 'pending', audio_hash: 'forged', ai_result: {}, photos: [] })
          if (url.includes('/rest/v1/ai_call_logs')) return json([{}])
          if (url.includes('/storage/v1/')) { media++; return new Response('audio-bytes', { headers: { 'Content-Type': 'audio/webm' } }) }
          if (url.startsWith('https://generativelanguage.googleapis.com/')) { gemini++; return json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(analysis) }] } }] }) }
          return new Response('', { status: 500 })
        }) as typeof fetch
        const res = await handleRequest(post({ record: { id: 'audio-security', species: 'bullfrog', audio_url: 'http://localhost:54321/storage/v1/object/public/posts/audio.webm', audio_hash: 'forged' } }))
        assertEquals(res.status, 200); assertEquals(media, 1); assertEquals(gemini, mode === 'hit' ? 0 : 1)
        const result = updates[0].ai_result as Record<string, unknown>
        assertEquals(result.audio_sha256, hash)
      }
    } finally { globalThis.fetch = original; Deno.env.set('GEMINI_API_KEY', '') }
  },
})
