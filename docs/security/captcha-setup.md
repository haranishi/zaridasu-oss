# CAPTCHA セットアップ手順（Cloudflare Turnstile × Supabase Auth）

REQ-212 FR-212-04 / FR-212-05 / NFR-212-05 の人手運用ドキュメント。
ザリダスの認証フォーム（`AuthModal`：ログイン / 新規登録 / パスワードリセット）に bot 対策の
CAPTCHA を有効化するための設定手順をまとめる。**実際の site key / secret は本ファイルに書かない**
（環境変数・Supabase/Vercel ダッシュボード側に保持する）。

---

## 主要な決定事項（要点）

- **プロバイダは Cloudflare Turnstile**（無料・軽量・プライバシー配慮）。ウィジェット JS は動的ロードし、**npm 依存はゼロ**。
- **fail-open**: `NEXT_PUBLIC_TURNSTILE_SITE_KEY` が未設定なら CAPTCHA を完全に無効化する。「site key 設定」＋「Supabase Dashboard で CAPTCHA 有効化」の両方が揃って初めて強制される。
- **CAPTCHA 単体に依存しない**。頻度上限は DB トリガー（最終防衛線）、認証到達面のバースト緩和はエッジミドルウェアが担う多層防御。
- **⚠ Turnstile が効くのは `/auth/v1/*` の SDK 呼び出しだけ**。PostgREST の RPC・テーブル直 INSERT・Edge Function 直 invoke には介在しない。**これらの経路のリスクを「Turnstile があるから受容」と書いてはいけない**（REQ-241 で実際に誤った受容根拠が記録され、REQ-292 で経路を閉じた）。
- **secret key はアプリで一切扱わない**。Supabase Dashboard にのみ置き、検証は Supabase 側が行う。
- **`admin_login_*` は既存のブルートフォース計数機構として当てにできない**（フロントの自発申告のみで増えるため直叩きを記録しない）。REQ-292 で Password Verification Attempt Hook を新設。

## 各節

- [採用方針とカバー範囲](captcha-setup/01-policy-and-coverage.md): プロバイダ選定、fail-open、多層防御の位置づけ、Turnstile が掛からない経路の一覧
- [環境変数](captcha-setup/02-env-vars.md): site key と secret key の置き場所と公開/秘匿の区別
- [手順](captcha-setup/03-procedure.md): Turnstile のサイト作成 → Supabase Auth 有効化 → site key 配置 → 動作確認チェックリスト
- [実装メモと調整ポイント](captcha-setup/04-implementation-and-tuning.md): `AuthModal` 側の挙動、resend の扱い、難易度・段階適用の調整余地、REQ-292 の訂正
