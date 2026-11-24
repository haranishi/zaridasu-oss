## 影響範囲

**DNS / 外部サービス設定（リポジトリ外・本要件の中心）:**
- `zarigani-das.com` の DNS ゾーン（SPF / DKIM / DMARC レコード）
- `zaridasu.com` の DNS ゾーン（なりすまし対策の SPF/DMARC、必要なら null-MX）
- Resend ダッシュボード（ドメイン検証）
- Supabase Dashboard > Authentication > SMTP（FR-219-06 (a) を採る場合）

**コード / 設定の変更（限定的）:**
- `supabase/functions/notify-post-status/index.ts`（From を `NOTIFY_FROM_EMAIL` 化）
- `supabase/functions/notify-comment/index.ts`（同上）
- `supabase/functions/notify-gemini-key-failure/index.ts`（同上）
- `supabase/config.toml`（FR-219-06 (a) を採る場合、`[auth.email.smtp]` のアンコメント／本番反映）
- `.env.example`（`NOTIFY_FROM_EMAIL`・`RESEND_SMTP_KEY` の変数名を記載。値は書かない）
- 運用ドキュメント（送信ドメイン一覧、DMARC 段階移行の判断基準・記録）

**機能への影響:**
- 正しく整備されればメール到達性が向上（迷惑メール振り分けの減少）。
- DMARC を `reject` に上げる際、認証漏れが残っていると正規メールが拒否されるリスクがあるため、段階移行（NFR-219-03）を厳守する。
- アプリ本体（投稿・地図・認証フロー）のロジックには影響しない（送信元設定のみ）。
