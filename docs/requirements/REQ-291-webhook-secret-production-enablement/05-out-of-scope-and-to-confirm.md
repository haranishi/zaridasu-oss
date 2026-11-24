## 対象外

- 通知の冪等性そのもの（送信済みマーカー・レート制限）は REQ-280 の範囲。本要件は「無認可の到達を止める」ことに限る。両方揃って初めて多層防御になる。
- `notify-comment` の Resend エラー本文返却（監査 S-5 / REQ-280 FR-280-02）。同関数は webhook secret ではなく JWT ＋コメント所有者一致で守られており、本要件のチェーンとは別経路。

## 要確認

- 本番の `WEBHOOK_SECRET` / Vault `webhook_secret` の実値・設定有無は**読み取り専用監査では未検証**。問題A の判断は REQ-287 §2-C の実測記述と「設定済みなら既存通知が壊れているはず」という整合性からの推論である。作業の最初に `npx supabase secrets list` と `select name from vault.secrets;` で現状を確認すること。
- 本番に残存するダッシュボード作成の Database Webhook の有無（FR-291-02 の判断に必要）。
