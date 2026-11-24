// REQ-131 Phase 1 / REQ-240: webhookAuth.ts のユニットテスト。
//
// REQ-131 の 3 ケース:
//   1. WEBHOOK_SECRET 未設定 → 例外を投げない (grace period, enforce 無効時)
//   2. WEBHOOK_SECRET 設定済 + ヘッダー一致 → 例外を投げない
//   3. WEBHOOK_SECRET 設定済 + ヘッダー不一致 (or 未送信) → WebhookAuthError
//
// REQ-240 の追加ケース (fail-closed 化 / AC-05):
//   a. enforce 有効 + WEBHOOK_SECRET 未設定 → WebhookAuthError (fail-closed)
//   b. enforce 有効 + secret 設定済 + ヘッダー一致 → 通過
//   c. enforce 有効 + secret 設定済 + ヘッダー不一致 → WebhookAuthError
//   d. enforce 無効 + WEBHOOK_SECRET 未設定 → 通過 + 可観測な警告 (移行期挙動)
//   e. isWebhookSecretEnforced のフラグ解釈 ('true'/'1' のみ true)
//
// 各ケースは Deno.env を都度リセットする (WEBHOOK_SECRET / WEBHOOK_SECRET_ENFORCE の
// 両方を finally で削除し、ケース間で状態を残さない)。
//
// 実行: `deno test --allow-env --allow-net --allow-read \
//   --lock=supabase/functions/deno.lock --cached-only --no-check \
//   supabase/functions/_shared/__tests__/webhookAuth.test.ts`

import {
  assert,
  assertEquals,
  assertThrows,
} from 'https://deno.land/std@0.168.0/testing/asserts.ts'

import {
  isWebhookSecretEnforced,
  requireWebhookSecret,
  WebhookAuthError,
} from '../webhookAuth.ts'

function makeRequest(secret?: string): Request {
  const headers: Record<string, string> = {}
  if (typeof secret === 'string') headers['x-webhook-secret'] = secret
  return new Request('http://localhost/', { method: 'POST', headers })
}

Deno.test('webhookAuth: WEBHOOK_SECRET 未設定なら例外を投げない (grace period)', () => {
  Deno.env.delete('WEBHOOK_SECRET')
  // ヘッダー有無に関わらず通る
  requireWebhookSecret(makeRequest())
  requireWebhookSecret(makeRequest('anything'))
})

Deno.test('webhookAuth: WEBHOOK_SECRET 設定済 + ヘッダー一致 → 例外を投げない', () => {
  Deno.env.set('WEBHOOK_SECRET', 's3cr3t-value-abc')
  try {
    requireWebhookSecret(makeRequest('s3cr3t-value-abc'))
  } finally {
    Deno.env.delete('WEBHOOK_SECRET')
  }
})

Deno.test('webhookAuth: WEBHOOK_SECRET 設定済 + ヘッダー不一致 → WebhookAuthError', () => {
  Deno.env.set('WEBHOOK_SECRET', 's3cr3t-value-abc')
  try {
    const err = assertThrows(
      () => requireWebhookSecret(makeRequest('different-secret')),
      WebhookAuthError,
    )
    assertEquals(err.name, 'WebhookAuthError')
    assert(/mismatch/i.test(err.message))
  } finally {
    Deno.env.delete('WEBHOOK_SECRET')
  }
})

Deno.test('webhookAuth: WEBHOOK_SECRET 設定済 + ヘッダー未送信 → WebhookAuthError', () => {
  Deno.env.set('WEBHOOK_SECRET', 's3cr3t-value-abc')
  try {
    assertThrows(
      () => requireWebhookSecret(makeRequest(undefined)),
      WebhookAuthError,
    )
  } finally {
    Deno.env.delete('WEBHOOK_SECRET')
  }
})

// ===== REQ-240: fail-closed 化のテスト (AC-05) =====

// (a) enforce 有効 + WEBHOOK_SECRET 未設定 → WebhookAuthError (fail-closed / AC-01)
Deno.test('REQ-240: enforce 有効 + WEBHOOK_SECRET 未設定 → WebhookAuthError (fail-closed)', () => {
  Deno.env.delete('WEBHOOK_SECRET')
  Deno.env.set('WEBHOOK_SECRET_ENFORCE', '1')
  try {
    // ヘッダー未送信でも拒否
    const err = assertThrows(
      () => requireWebhookSecret(makeRequest()),
      WebhookAuthError,
    )
    assertEquals(err.name, 'WebhookAuthError')
    // secret 自体が無いので、ヘッダーを付けても素通りしない
    assertThrows(
      () => requireWebhookSecret(makeRequest('anything')),
      WebhookAuthError,
    )
  } finally {
    Deno.env.delete('WEBHOOK_SECRET_ENFORCE')
    Deno.env.delete('WEBHOOK_SECRET')
  }
})

// enforce フラグは 'true' でも有効（'1' 以外の受理値も fail-closed になることを確認）
Deno.test("REQ-240: enforce='true' + WEBHOOK_SECRET 未設定 → WebhookAuthError", () => {
  Deno.env.delete('WEBHOOK_SECRET')
  Deno.env.set('WEBHOOK_SECRET_ENFORCE', 'true')
  try {
    assertThrows(() => requireWebhookSecret(makeRequest()), WebhookAuthError)
  } finally {
    Deno.env.delete('WEBHOOK_SECRET_ENFORCE')
    Deno.env.delete('WEBHOOK_SECRET')
  }
})

// (b) enforce 有効 + secret 設定済 + ヘッダー一致 → 通過 (AC-02)
Deno.test('REQ-240: enforce 有効 + secret 設定済 + ヘッダー一致 → 例外を投げない', () => {
  Deno.env.set('WEBHOOK_SECRET', 's3cr3t-value-abc')
  Deno.env.set('WEBHOOK_SECRET_ENFORCE', '1')
  try {
    // 正規の webhook 呼び出しは enforce 有効でも通る
    requireWebhookSecret(makeRequest('s3cr3t-value-abc'))
  } finally {
    Deno.env.delete('WEBHOOK_SECRET_ENFORCE')
    Deno.env.delete('WEBHOOK_SECRET')
  }
})

// (c) enforce 有効 + secret 設定済 + ヘッダー不一致 → WebhookAuthError (AC-02)
Deno.test('REQ-240: enforce 有効 + secret 設定済 + ヘッダー不一致 → WebhookAuthError', () => {
  Deno.env.set('WEBHOOK_SECRET', 's3cr3t-value-abc')
  Deno.env.set('WEBHOOK_SECRET_ENFORCE', '1')
  try {
    const err = assertThrows(
      () => requireWebhookSecret(makeRequest('different-secret')),
      WebhookAuthError,
    )
    assert(/mismatch/i.test(err.message))
  } finally {
    Deno.env.delete('WEBHOOK_SECRET_ENFORCE')
    Deno.env.delete('WEBHOOK_SECRET')
  }
})

// (d) enforce 無効 + WEBHOOK_SECRET 未設定 → 通過 + 可観測な警告 (移行期挙動 / FR-240-02)
Deno.test('REQ-240: enforce 無効 + WEBHOOK_SECRET 未設定 → 通過 + 可観測な警告 (grace period)', () => {
  Deno.env.delete('WEBHOOK_SECRET')
  Deno.env.delete('WEBHOOK_SECRET_ENFORCE') // enforce 無効（未設定）

  const warnings: string[] = []
  const originalWarn = console.warn
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map((a) => String(a)).join(' '))
  }
  try {
    // grace period: 例外を投げずに通過する
    requireWebhookSecret(makeRequest())

    // FR-240-02: 未設定通過は必ず可観測（警告が 1 件以上）
    assert(warnings.length >= 1, 'grace period 通過時に警告を出すこと')
    // 監視/アラートが拾える安定した event タグを含む
    assert(
      warnings.some((w) => /webhook_secret_unset_passthrough/.test(w)),
      '安定した監視用 event タグを含む警告が出ること',
    )
    // REQ-211: secret 値や PII をログに載せない
    assert(
      !warnings.some((w) => /s3cr3t/.test(w)),
      '警告に secret 値を載せないこと',
    )
  } finally {
    console.warn = originalWarn
    Deno.env.delete('WEBHOOK_SECRET_ENFORCE')
    Deno.env.delete('WEBHOOK_SECRET')
  }
})

// (e) isWebhookSecretEnforced のフラグ解釈: 'true' / '1' のみ true
Deno.test("REQ-240: isWebhookSecretEnforced は 'true'/'1'（trim/大小文字無視）のみ true", () => {
  const cases: Array<[string | undefined, boolean]> = [
    ['1', true],
    ['true', true],
    ['TRUE', true],
    [' true ', true],
    ['0', false],
    ['false', false],
    ['', false],
    ['yes', false],
    ['on', false],
    [undefined, false],
  ]
  try {
    for (const [val, expected] of cases) {
      if (val === undefined) Deno.env.delete('WEBHOOK_SECRET_ENFORCE')
      else Deno.env.set('WEBHOOK_SECRET_ENFORCE', val)
      assertEquals(
        isWebhookSecretEnforced(),
        expected,
        `WEBHOOK_SECRET_ENFORCE=${JSON.stringify(val)}`,
      )
    }
  } finally {
    Deno.env.delete('WEBHOOK_SECRET_ENFORCE')
  }
})
