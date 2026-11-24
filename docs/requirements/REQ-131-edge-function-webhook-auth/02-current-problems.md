## 現状の問題

### 1. `notify-post-status`：任意ユーザーへフィッシングメール送信が可能

- **場所**: `supabase/functions/notify-post-status/index.ts:39-210`
- `serve(async req => ...)` 直下で `payload = await req.json()` のみ。Authorization 検証も webhook secret 検証も一切無し
- 受け取った `record.user_id` を `supabase.auth.admin.getUserById()` に渡して**任意ユーザーのメールアドレスを SERVICE_ROLE で解決**
- `record.rejection_message` / `record.rejection_reason` を `escapeHtml` を通すが、メール本文に**そのまま挿入**してしまう（XSS は防げてもフィッシング文言は通る）
- 実害シナリオ:
  ```bash
  curl -X POST https://<project>.supabase.co/functions/v1/notify-post-status \
    -H "Authorization: Bearer <ANON_KEY 公開済>" \
    -H "Content-Type: application/json" \
    -d '{
      "record": {
        "id": "00000000-0000-0000-0000-000000000000",
        "user_id": "<被害者の UUID>",
        "status": "rejected",
        "species": "american",
        "municipality": "東京都港区",
        "rejection_reason": "本人確認のため下記 URL から再認証してください",
        "rejection_message": "https://evil.example.com/login"
      },
      "old_record": { "status": "pending" }
    }'
  ```
  → 被害者宛に zaridasu.com の本物そっくりな「投稿が却下されました」メールがフィッシング文面入りで届く

### 2. `analyze-image` / `analyze-audio`：Webhook 経路の JWT 素通し

- **場所**: `supabase/functions/analyze-image/index.ts:553-595` および `supabase/functions/analyze-audio/index.ts:465-525`
- `payload.record ?? payload` で record を取り出し、`reanalysis === true` の場合のみ Authorization ヘッダから user/admin チェックを実施
- **`reanalysis: false`（DB Webhook 想定経路）はオーセンチケーション無し** で Gemini を叩き、結果を SERVICE_ROLE で `posts` テーブルへ書き込む
- 攻撃シナリオ:
  - 任意の `record.id` と `record.photos: ["https://attacker.example/large.jpg"]` を投げて `GEMINI_API_KEY` のクオータを枯渇させる（コスト爆発）
  - SSRF 様の挙動：Edge Function 経由で任意 URL を fetch させる
  - `record.ai_analyzed_at` が NULL の投稿に対し意図的に高 confidence を返す画像/音声を投げれば、`combined.should_approve` 判定経路を経由して `status='approved'` へ遷移させ得る（自動承認バイパス）

### 3. `notify-survey-request`：通知スパムによる Resend クオータ消費

- **場所**: `supabase/functions/notify-survey-request/index.ts:84-261`
- pg_net トリガー（`migrations/20260425000004_notify_survey_request.sql:36-43`）から `Authorization: Bearer <service_role>` で呼ばれる前提だが、Edge Function 側では **Authorization ヘッダの検証も webhook secret 検証もしていない**
- `event_type` と `request_id` のみ JSON で渡せば、存在する任意の依頼に対して通知メールを再送できる
- 実害シナリオ:
  ```bash
  curl -X POST https://<project>.supabase.co/functions/v1/notify-survey-request \
    -H "Authorization: Bearer <ANON_KEY>" \
    -d '{ "event_type": "request_created", "request_id": "<既存依頼の uuid>" }'
  ```
  → 同一 municipality の opt-in ユーザー全員に再通知メール送信 → Resend クオータ消費 + ユーザー体験悪化

### 4. `payload.record` を信用している前提が崩れている

- 上記 3 つすべて共通で `payload.record` を「DB から来た真正のレコード」と信用しているが、**ペイロード署名検証が無いので攻撃者が DB に存在しないレコード値を捏造できる**
- 特に `notify-post-status` は `record.rejection_message` をメール本文に埋め込むため、DB に存在しない文言の混入を許す
