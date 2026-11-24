# REQ-270: Webhook認証チェーンの整合性修復（送出側secret欠落＋未保護2関数＋情報露出）

優先度: **P0** ／ 深刻度: **High** ／ 種別: セキュリティ（バックエンド）

## 背景

REQ-240 は「pg_cron / Database Webhook から呼ばれ副作用・課金を伴う」Edge Function 10本に `requireWebhookSecret()`（`x-webhook-secret` ヘッダ検証）を導入し、運用手順として「①Supabase secrets に `WEBHOOK_SECRET` を設定 → ②Database Webhook / pg_cron に `x-webhook-secret` を付与 → ③`WEBHOOK_SECRET_ENFORCE` を有効化」を定めた（`supabase/functions/_shared/webhookAuth.ts:18-20`）。

しかし監査の結果、このチェーンに3つの穴が実在する。

### 問題A: pg_net 送出側（SQLラッパ）が `x-webhook-secret` を送る手段を持たない — High

`grep 'x-webhook-secret' supabase/migrations/*.sql` は **0件**。migrations 内の全 pg_net ラッパは `Authorization: Bearer <service_role_key>`（Vault `edge_function_service_role_key`）のみをヘッダに載せる:

- `call_lifecycle_edge_function`（`20260615000006_lifecycle_notifications.sql:559-566`）→ notify-weekly-digest / notify-dormant-reengage
- `call_notify_research_adopted`（同ファイル）
- `20260425000004_notify_survey_request.sql:38-41` → notify-survey-request
- `20260615000007_web_push_subscriptions.sql:171-174` → send-push
- `20260616000003_ai_anomaly_detection.sql:219-222` → notify-ai-anomaly
- `20260615000004_reverse_geocoding_place_enrichment.sql:233-236` → enrich-place
- `20260421000001_ai_analysis_webhooks.sql:50-53` → analyze-image / analyze-audio

Dashboard設定のDatabase WebhookならUIでヘッダ追加できるが、**SQLラッパはmigrationを変えない限りヘッダを足せない**。つまり運用手順①（secret設定）を実行した瞬間、`requireWebhookSecret` を持つ10関数への pg_net 起動が全て401になり、**週次ダイジェスト・休眠復帰・調査依頼通知・Web Push・逆ジオコーディング・AI解析（webhook経路）が無言停止する**（ラッパは fail-soft＝`EXCEPTION WHEN OTHERS THEN NULL` でエラーも残らない）。

実質的に REQ-240 のハードニングは「完遂すると自壊する」状態で、`WEBHOOK_SECRET` を恒久的に未設定（grace period のまま）にする以外の運用ができない。

### 問題B: 監視系2関数だけ webhook 認証が無い ＋ 内部メトリクス返却 — Medium

`requireWebhookSecret` 呼び出しが有るのは10関数のみで、同じ pg_cron 起動系の
- `supabase/functions/notify-ai-anomaly/index.ts`
- `supabase/functions/notify-gemini-key-failure/index.ts`

は webhook 検証も JWT 検証も無い（`supabase/config.toml` に `verify_jwt` 指定なし＝プラットフォーム既定の anon JWT のみで、anon キーは公開情報）。さらに `notify-ai-anomaly` は応答ボディに `metrics`（`top_user_id`＝ユーザーUUID、`max_user_calls`、`auto_approve_rate` 等）を返す（`index.ts:187-194, 394-398`）。誰でも (1) 内部運用メトリクス＋ユーザーUUIDを取得、(2) 管理者宛アラートの誘発、(3) 重い集計RPCのオンデマンド実行ができる。

### 問題C: 無認証到達可能な関数の500応答が内部エラー文言を返す — Low

`notify-gemini-key-failure/index.ts:288-290` は `{ error: e.message }` を素で返す（`notify-ai-anomaly` は redact 済みと非対称）。

## 機能要件

- **FR-270-01（送出側）**: 新規migrationで、上記の全 pg_net SQLラッパに `x-webhook-secret` ヘッダを追加する。値は Vault の新シークレット `webhook_secret` から取得し、**未設定時は現行どおりヘッダ無しで送る**（後方互換・grace period 維持。Vault読み取りは既存の `edge_function_service_role_key` と同じ `BEGIN…EXCEPTION` パターン）。
- **FR-270-02（検証側）**: `notify-ai-anomaly` / `notify-gemini-key-failure` の serve 冒頭に `requireWebhookSecret(req)` を追加し、`WebhookAuthError` を401に変換する（既存10関数と同型）。
- **FR-270-03（情報露出）**: `notify-ai-anomaly` の応答から `metrics`・`signals` を除去する（値はログ/メールのみに閉じる）。`notify-gemini-key-failure` の catch 応答を `{ error: 'internal_error' }` に一般化する。
- **FR-270-04（運用手順）**: runbook（本ファイル）に更新後の手順を明記する: ①Vault に `webhook_secret` を登録（`select vault.create_secret('<値>', 'webhook_secret')`）②Supabase secrets（Edge Function env）に同値の `WEBHOOK_SECRET` を設定 ③Dashboard設定のDatabase Webhookにも `x-webhook-secret` ヘッダを追加 ④動作確認後 `WEBHOOK_SECRET_ENFORCE=true`。

## 受入基準

- **AC-01**: `WEBHOOK_SECRET` と Vault `webhook_secret` を両方設定した環境で、pg_net 起動の通知系が401にならず動作する（送出→検証が一致）。
- **AC-02**: どちらも未設定の環境（CI/ローカル）で現行と同じく grace period で動作し、既存 pgTAP / Deno テストが全てパスする。
- **AC-03**: `notify-ai-anomaly` / `notify-gemini-key-failure` に secret 不一致でアクセスすると 401 が返る（secret設定時）。
- **AC-04**: `notify-ai-anomaly` の200応答に `metrics` / `top_user_id` が含まれない。
- **AC-05**: 既存の `webhookAuth.test.ts` がパスし、新規関数側のハンドラテスト（最低: 401変換）が追加される。

## 対象外

- 本番 Supabase への secret 登録・enforce 有効化（人手の運用タスク。FR-270-04 の手順に従う）。
- Dashboard 設定の Database Webhook の実設定変更。
