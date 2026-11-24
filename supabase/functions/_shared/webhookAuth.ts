/**
 * REQ-131 Phase 1 / REQ-240: Edge Function webhook 共有秘密の検証ヘルパ。
 *
 * これらの関数は Database Webhook / pg_cron (pg_net) から `service_role` で呼ばれ、
 * メール送信・Web Push・逆ジオコーディング（従量課金）・SNS 自動投稿など副作用と課金を
 * 伴う。`WEBHOOK_SECRET`（`x-webhook-secret` ヘッダー）が唯一のアプリ層防御なので、
 * 未設定＝無認証で叩ける状態を恒久化させない。
 *
 * 設計判断:
 * - 通常時 (`WEBHOOK_SECRET` 設定済み): `x-webhook-secret` ヘッダーと単純一致比較し、
 *   不一致なら `WebhookAuthError` を throw する。呼び出し側は catch して 401 に変換する。
 * - `WEBHOOK_SECRET` 未設定時の扱いは REQ-240 で fail-closed 寄りへ変更した:
 *     - `WEBHOOK_SECRET_ENFORCE` が有効 ('true' / '1') → 未設定は **拒否**（WebhookAuthError
 *       を throw）。本番はこの状態を目標とする。設定漏れで無認証呼び出しを許さない。
 *     - `WEBHOOK_SECRET_ENFORCE` が無効/未設定 → 移行期の grace period として通過するが、
 *       「本番で無防備な呼び出しが起きている」ことを検知できるよう **必ず可観測な警告** を
 *       出す（FR-240-02）。既定を「黙って通過」にはしない。
 *   運用手順（Supabase secrets へ `WEBHOOK_SECRET` を設定 → Database Webhook / pg_cron へ
 *   `x-webhook-secret` を付与 → `WEBHOOK_SECRET_ENFORCE` を有効化して grace period を閉じる）は
 *   FR-240-04 / runbook 側の人手タスク。ここ（コード）はそれを支えるだけ。
 * - `analyze-image` / `analyze-audio` の reanalysis 経路（フロントから直接
 *   `supabase.functions.invoke` で呼ばれ webhook secret を持たない）では、呼び出し側が
 *   `if (!reanalysis) requireWebhookSecret(req)` で skip する。fail-closed 化しても
 *   この経路は helper を呼ばないため壊れない（FR-240-03 / AC-03）。
 * - PII・secret 値はログに出さない（REQ-211）。比較値やヘッダー値は例外メッセージにも
 *   ログにも載せない。
 */

export class WebhookAuthError extends Error {
  constructor(msg: string) {
    super(msg)
    this.name = 'WebhookAuthError'
  }
}

/**
 * REQ-240 FR-240-01: 本番相当の fail-closed を明示フラグで有効化する。
 *
 * - env `WEBHOOK_SECRET_ENFORCE` が 'true' / '1'（前後空白・大小文字無視）→ true（enforce）。
 * - それ以外（未設定・空文字含む）→ false（移行期の grace period を許容）。
 *
 * 既定を false に置くのは移行期の後方互換のため（secret 未設定のまま enforce すると
 * 本番が即 401 になる）。ただし false 時でも未設定通過は可観測にする（下記
 * `requireWebhookSecret` の警告）ことで「黙って fail-open」にはしない。
 */
export function isWebhookSecretEnforced(): boolean {
  const raw = Deno.env.get('WEBHOOK_SECRET_ENFORCE')
  if (raw === undefined || raw === null) return false
  const v = raw.trim().toLowerCase()
  return v === 'true' || v === '1'
}

/**
 * `x-webhook-secret` ヘッダーが `WEBHOOK_SECRET` env と一致するかを検証する。
 *
 * - env 未設定 + enforce 有効 → WebhookAuthError throw（fail-closed / REQ-240）
 * - env 未設定 + enforce 無効 → grace period として通過（可観測な警告付き）
 * - env 設定済み + ヘッダー不一致（または未送信）→ WebhookAuthError throw
 * - env 設定済み + ヘッダー一致 → 正常 return
 */
export function requireWebhookSecret(req: Request): void {
  const expected = Deno.env.get('WEBHOOK_SECRET')
  if (!expected) {
    if (isWebhookSecretEnforced()) {
      // REQ-240 FR-240-01: enforce 有効なのに secret 未設定＝設定漏れ。
      // 素通りさせず fail-closed に倒す。呼び出し側（10 関数）が既存の
      // `catch (e instanceof WebhookAuthError)` で 401 に変換する（AC-01）。
      throw new WebhookAuthError(
        'WEBHOOK_SECRET is not configured while WEBHOOK_SECRET_ENFORCE is enabled (fail-closed)',
      )
    }
    // REQ-240 FR-240-02: 移行期の grace period。通過はさせるが必ず可観測にする。
    // secret を設定し WEBHOOK_SECRET_ENFORCE を有効化すれば本番で fail-closed になる。
    //
    // NOTE(監視フック / follow-up): _shared に汎用 Sentry / メトリクスヘルパが無く
    //   （aiLogging.logAiCall は Supabase クライアント必須かつ ai_call_logs / AI 関数専用の
    //   型なので webhook 認証イベントには不適）、現状は安定した event タグ付き
    //   console.warn で代替する。Supabase Edge のログドリブンなアラートがこの行
    //   （`event=webhook_secret_unset_passthrough`）を拾い、「未保護の webhook 呼び出しが
    //   本番で発生している」ことを検知できる。将来 _shared に Sentry 等を導入したら、
    //   ここに captureMessage / メトリクス計上を足すこと。
    //   PII・secret 値は載せない（REQ-211）。
    console.warn(
      '[webhookAuth] SECURITY event=webhook_secret_unset_passthrough: ' +
        'WEBHOOK_SECRET is unset and enforcement is OFF; request passed WITHOUT verification (grace period). ' +
        'Set WEBHOOK_SECRET in Supabase secrets and enable WEBHOOK_SECRET_ENFORCE to fail-closed.',
    )
    return
  }
  // NFR-240-01: secret は十分長いランダム値のため単純一致で可。将来必要なら
  // 定数時間比較へ拡張できるよう、比較はこのヘルパに集約している。
  const provided = req.headers.get('x-webhook-secret') ?? ''
  if (provided !== expected) {
    throw new WebhookAuthError('webhook secret mismatch')
  }
}
