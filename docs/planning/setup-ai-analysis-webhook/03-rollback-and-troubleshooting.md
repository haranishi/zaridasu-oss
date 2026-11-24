## ロールバック

Webhook 側で問題が出たら、以下のいずれかで元に戻せる。

- **Dashboard から Webhook を無効化**: Database → Webhooks → 該当 hook を `Disable`（削除不要）
- **クライアント invoke は残っている**ため、Webhook を無効化すれば従来の挙動に戻る

## よくある問題

### Q. Webhook が発火しているのに Edge Function のログに出ない
- Webhook の `Response Logs`（Dashboard → Database → Webhooks → 該当 hook → History）を確認
- 401 / 403 の場合は Authorization ヘッダが正しく service_role で署名されているか確認

### Q. `already_analyzed` ばかり出る
- クライアント invoke が先に走って解析を完了しているのが原因。想定通りの挙動。
- フェーズ 3 でクライアント invoke を削除すれば、Webhook 起動のみになる。

### Q. Edge Function が Webhook ペイロードを正しく読めているか不安
- 両 Edge Function は `payload.record ?? payload` で Webhook 形式 (`{type, table, record, old_record}`) とクライアント invoke 形式 (`{record, reanalysis}`) の両方を受け付けるため、そのまま動く。

