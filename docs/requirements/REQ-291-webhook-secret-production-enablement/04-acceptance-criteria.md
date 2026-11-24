## 受入基準

- **AC-01（無認可の閉塞）**: FR-291-03 完了後、公開 anon キーのみで secret ヘッダを付けずに呼ぶと **401** が返る。12 本すべてで確認する。
  ```bash
  curl -s -o /dev/null -w '%{http_code}\n' -X POST \
    "https://<project-ref>.supabase.co/functions/v1/notify-post-status" \
    -H "Authorization: Bearer <公開anonキー>" -H "Content-Type: application/json" \
    -d '{"record":{"id":"00000000-0000-0000-0000-000000000000"},"old_record":{"status":"pending"}}'
  # 期待: 401
  ```
- **AC-02（正規経路の維持）**: 本番の通知フローが実際に届く。最低限、(a) 投稿を 1 件承認して `notify-post-status` のメールが到達、(b) コメント 1 件で `notify-comment` が到達、(c) 調査依頼 1 件で `notify-survey-request` が到達、(d) 投稿 1 件で `analyze-image` が `ai_call_logs` に成功記録、(e) pg_cron 3 本の `net._http_response` が 200 であることを確認する。
- **AC-03（送出側にヘッダが乗っている）**: Vault 登録後に `select private.edge_webhook_headers('dummy') ? 'x-webhook-secret';` が **true** を返す（`service_role` / DB 管理者権限で実行。この関数は anon/authenticated から REVOKE 済み）。
- **AC-04（grace period が閉じている）**: `WEBHOOK_SECRET_ENFORCE=true` の設定後 24 時間、Edge Function ログに `event=webhook_secret_unset_passthrough` が **0 件**、かつ `net._http_response` の 4xx/5xx が 0 件。
- **AC-05（アラート）**: `event=webhook_secret_unset_passthrough` を含むログでアラートが発火する（設定直後にテスト発火で確認、または設定内容のスクリーンショット等で記録）。
- **AC-06（情報露出）**: 問題C の 8 箇所で `grep -rn "error: String(e)" supabase/functions --include=index.ts` が **0 件**（`notify-comment` は REQ-292 とは別に REQ-280 FR-280-02 / 監査 S-5 の対象。本要件で同時に直してもよい）。500 応答の本文に内部エラー文字列が含まれない。
- **AC-07**: `lint` / `type-check` / 既存 652 テストがパスする。Edge Function の Deno テスト（`webhookAuth.test.ts` を含む）もパスする。
