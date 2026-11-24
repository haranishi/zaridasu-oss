## 目的

現状、`analyze-image` / `analyze-audio` Edge Function は**クライアント側 (`usePostForm.ts:269-273`) から `supabase.functions.invoke()` で起動**している。以下の問題があるため、Supabase DB Webhook 起動に移行する。

- ネットワーク断・タブ閉じ・JS エラーで invoke が届かないと AI 判定が永久に走らない
- クライアントの anon セッションから呼ばれるため認証境界が要件書（REQ-072）想定とズレる
- 管理画面からの UPDATE 時の再判定など、将来的な拡張ができない

両 Edge Function には既に**冪等性ガード**（既に解析済みならスキップ）が実装済みのため、移行期間中に「Webhook とクライアント invoke が両方発火」しても二重判定は起きない。
