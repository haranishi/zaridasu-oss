## 影響範囲

### 変更対象ファイル

| ファイル | 変更内容 |
|---|---|
| `supabase/config.toml` | `[functions.*]` セクション追加、`verify_jwt = true` 明示 |
| `supabase/functions/_shared/webhookAuth.ts` | 新規（FR-131-02、`assertWebhookSecret` ヘルパ） |
| `supabase/functions/notify-post-status/index.ts` | secret 検証 + id 受領のみへ変更（FR-131-03, FR-131-06） |
| `supabase/functions/analyze-image/index.ts` | webhook 経路に secret 検証追加（FR-131-03, FR-131-07） |
| `supabase/functions/analyze-audio/index.ts` | 同上 |
| `supabase/functions/notify-survey-request/index.ts` | secret 検証追加（FR-131-03） |
| `supabase/functions/notify-comment/index.ts` | （REQ-132 と統合検討） |
| `supabase/migrations/<new>_webhook_secret_header.sql` | pg_net 経由トリガーに `x-webhook-secret` ヘッダ追加（FR-131-05） |
| `supabase/migrations/<new>_notification_log.sql` | 通知冪等性テーブル新設（FR-131-06） |
| `supabase/functions/notify-post-status/__tests__/auth.test.ts` | 新規 |
| `supabase/functions/analyze-image/__tests__/auth.test.ts` | 新規 |
| `supabase/functions/notify-survey-request/__tests__/auth.test.ts` | 新規 |
| `scripts/check-webhook-secret-sync.ts` | 新規（FR-131-11） |
| `.github/workflows/ci.yml` | `edge-function-auth-smoke` ジョブ追加（FR-131-10） |
| `docs/runbooks/edge-function-deploy.md` | webhook 登録 + secret 配布手順を追記（FR-131-04） |

### 他機能への影響

- **REQ-128 (Edge Function secret refresh)**: `WEBHOOK_SECRET` も同様の rotation 対象になるため、`scripts/secret-function-map.json` に `WEBHOOK_SECRET` を追加
- **REQ-125〜127 (AI 解析系)**: webhook 経路の handler 入口に secret 検証が追加されるが、既存の reanalysis JWT 検証ロジックは無変更
- **Database Webhook 設定**: Supabase Dashboard 側で人力設定が必要。runbook に手順を明記
- **既存通知**: payload.record → id 再 fetch への切替で、DB 更新と通知の間に race condition が出るリスクがあるが、`old_record.status` 等で「変化があった」判定は payload 側を信用し続けるため許容可
