#### B. webhook 共有秘密 (`x-webhook-secret`) の必須化

- [ ] **FR-131-02: `_shared/webhookAuth.ts` を新設**
  - `WEBHOOK_SECRET` env を読み、リクエストの `x-webhook-secret` ヘッダと**定数時間比較** (`timingSafeEqual` 相当)
  - 不一致または未設定なら 401 を返すヘルパ `assertWebhookSecret(req: Request): Response | null` を export
  - 開発環境（`Deno.env.get('SUPABASE_ENV') === 'local'`）では bypass 可能とし、テスト容易性を担保

- [ ] **FR-131-03: 各 webhook 関数の handler 冒頭で `assertWebhookSecret` を呼ぶ**
  対象:
  - `supabase/functions/notify-post-status/index.ts` (CORS preflight の直後)
  - `supabase/functions/analyze-image/index.ts:553` (handleRequest の冒頭、`reanalysis === true` 時は除外)
  - `supabase/functions/analyze-audio/index.ts:465` (同上)
  - `supabase/functions/notify-survey-request/index.ts:84`
  - 不一致時は 401 で即座に return（処理を進めない）

- [ ] **FR-131-04: Database Webhook 側にも同じ secret を設定**
  - Supabase Dashboard → Database → Webhooks の各エントリで `HTTP Headers` に `x-webhook-secret: <WEBHOOK_SECRET>` を追加
  - 設定手順を `docs/runbooks/edge-function-deploy.md` の「Webhook 登録手順」セクションに追記

- [ ] **FR-131-05: pg_net トリガー側にも同じ secret を設定**
  - `supabase/migrations/20260425000004_notify_survey_request.sql:38-41` の `headers` jsonb に `'x-webhook-secret', current_setting('app.settings.webhook_secret', true)` を追加するマイグレーションを新設
  - `app.settings.webhook_secret` は `ALTER DATABASE <db> SET app.settings.webhook_secret = '...'` で設定（または vault.decrypted_secrets 経由）
