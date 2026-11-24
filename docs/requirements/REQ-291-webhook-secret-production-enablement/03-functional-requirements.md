## 機能要件

- **FR-291-01（人手・値の登録）**: Vault の `webhook_secret` と Edge Function env の `WEBHOOK_SECRET` を**同一値**で登録する。値は 32 バイト以上のランダム文字列（例: `openssl rand -base64 32`）とし、コミット・チャット・ノートに残さない。
  - Vault: `select vault.create_secret('<値>', 'webhook_secret');`
  - Edge: Supabase の Function Secrets に `WEBHOOK_SECRET` を設定し、**12 本を再デプロイして反映する**（Function Secrets の変更は再デプロイまで既存インスタンスに届かないため。REQ-128 / `docs/runbooks/edge-function-deploy.md`）
  - REQ-287 FR-287-02（`SUPABASE_SECRET_KEY` 登録）と同時に行えば再デプロイが 1 回で済む
- **FR-291-02（人手・ダッシュボード側）**: Supabase ダッシュボードで作成された Database Webhook が残っている場合、そのヘッダにも `x-webhook-secret` を追加する。**判断点**: REQ-287 FR-287-07 で「ダッシュボードの Database Webhooks を使わない」がルール化されているため、ヘッダ追加ではなく**当該 Webhook を削除して migration 管理の pg_net ラッパへ寄せる**方が方針に整合する。本番に残存する Webhook の有無を確認して決めること。
- **FR-291-03（人手・閉塞）**: FR-291-01/02 の疎通確認後、Edge Function env に `WEBHOOK_SECRET_ENFORCE=true` を設定して再デプロイし、grace period を閉じる。これで REQ-270 FR-270-04 の④が完了する。**この順序を逆にしないこと**（enforce を先に有効化すると `webhookAuth.ts:64-70` により全経路が即 401 になる）。
- **FR-291-04（コード変更・監視）**: `event=webhook_secret_unset_passthrough` の出現を検知するアラートを設ける。Supabase Edge のログベースアラート、または既存の Sentry 経路に載せる。**判断点**: `_shared` に汎用の Sentry / メトリクスヘルパが無い（`webhookAuth.ts:75-81` のコメントが明記）ため、(a) Supabase 側のログアラート設定のみで済ませる（コード変更ゼロ）か、(b) `_shared` に通知ヘルパを新設して `captureMessage` を足すかを選ぶ。**FR-291-03 完了後は本来 0 件になるログなので、(a) で足りると判断してよい**。ただし「enforce を有効にしたのに通過ログが出る」＝設定が巻き戻った合図なので、アラート自体は恒久的に残す。
- **FR-291-05（コード変更・情報露出）**: 問題C の 8 箇所の catch 応答を固定文言（`{ error: 'internal_error' }`）へ変更する。詳細は redact 済みログ／Sentry のみに残す。REQ-270 FR-270-03 と同じ形にそろえる。
