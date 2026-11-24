## 実装メモ（コード側）

- `src/components/modals/AuthModal.tsx`
  - `TURNSTILE_SITE_KEY`（`process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY`）が空なら `captchaEnabled=false` で
    ウィジェットを一切描画せず token も付けない。
  - 有効時は `<script>` を 1 回ロード → `window.turnstile.render` で explicit 描画 → コールバックで token を
    保持 → `signInWithPassword` / `signUp` / `resetPasswordForEmail` の `options.captchaToken` に同梱。
  - token は**単回使用**のため、送信のたびに `window.turnstile.reset` でリフレッシュ。
  - 読み込み失敗時は `auth.errors.captchaUnavailable` を表示し、enabled なのに widget が出ないなら送信させない
    （fail-closed 寄り：bot 対策の趣旨を保つ）。
- **resend（確認メール再送）**: `useEmailResend` フック側にあり本 REQ のスコープ外。現状は
  `RESEND_COOLDOWN_MS`（localStorage クールダウン）＋ Supabase の `max_frequency` で抑制。Turnstile token を
  resend にも付ける場合は別途フックの拡張が必要（フォローアップ）。

## しきい値・調整ポイント（運用）

- Turnstile の難易度は Cloudflare 側（Managed / Non-interactive / Invisible）で調整。
- 段階適用（通常ログインは「失敗 N 回後だけ CAPTCHA」など UX 配慮）にしたい場合は、`AuthModal` 側で
  失敗回数に応じて `captchaEnabled` 相当を切り替える拡張が必要（現状は site key 設定時に全認証で表示）。
- ブルートフォースのアカウント単位計数は管理者ログインの `admin_login_*`（`schema.sql`）が既存。一般ログイン
  への拡張（email 単位バックオフ）は FR-212-05 の選択肢で、現状は「CAPTCHA＋エッジ IP 制限＋Supabase 組み込み」
  の組合せで代替。必要なら `admin_login_record` の (email_hash, ip) 設計を一般ログインへ転用する。
  - **【訂正 2026-07-30 / REQ-292 問題B】** `admin_login_*` は「既存の計数機構」として当てにできなかった。
    カウンタが増えるのは**フロントが失敗を自発的に申告したときだけ**で、攻撃者が
    `/auth/v1/token?grant_type=password` を直接叩く経路では一度も記録されず、**サーバー側ロックが発火しなかった**。
    REQ-292 で Password Verification Attempt Hook（`public.admin_login_password_attempt`）を新設し、
    直叩きも含む全試行をサーバー側で記録できるようにした（フックの有効化は人手・`supabase/config.toml` 参照）。
    なお同フックは `reject` を返さない（ペイロードに IP が無くメール単位ロックになるため管理者ロックアウト
    DoS を招く）。総当たりの上限は Supabase Auth 自身の `/auth/v1/token` レート制限が担う。
