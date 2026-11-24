## 本人に判断してもらうこと

### 🔴 2026-08-03 に新規発生（優先）

1. **本番未適用の migration が3本ある。main へマージする前に `supabase db push` が必要。**
   `20260730000001`（REQ-292 認可修正）／ `20260803000001`（REQ-298: protect_official_flag を本番へ追随）／ `20260803000002`（REQ-298: 関数 EXECUTE を PUBLIC から剥奪）。
   **REQ-298 FR-298-04 で `migration-gate` を `deploy` の `needs` に入れたため、この3本を適用するまで main push で本番デプロイが実行されない**（意図した挙動）。手順は `docs/runbooks/migration-deploy-order.md`。

2. **関数 EXECUTE の PUBLIC 開放をどう扱うか（新規REQ起票の要否）。**
   `schema.sql:27` の `ALTER DEFAULT PRIVILEGES` が no-op のため、**本番で anon から直接呼べる SECURITY DEFINER 関数が43本**ある（2026-08-03 実測。トリガ関数を除く）。多くは本体に admin ゲートを持つが、`call_lifecycle_edge_function(p_fn, p_payload)` / `call_send_push` / `call_notify_survey_request` は **Vault の service_role キーを使って任意の Edge Function を起動できる**ため、ゲートの有無を個別に確認する必要がある。
   REQ-298 では要件が指定した4本だけ是正した。残りは「正当に anon から呼ばれる公開 RPC の洗い出し」が前提になるため一括 REVOKE していない（無条件に閉じるとブラウザからの呼び出しが壊れる）。

3. **CI で migration-gate を実発火させるには secrets 登録が必要。**
   GitHub Actions に `SUPABASE_ACCESS_TOKEN`/`SUPABASE_PROJECT_REF` が未登録のため、`migration-gate` と `edge-functions-deploy-lag` は **CI 上では skip（exit 0）で素通り**している（2026-08-03 実測。AC-09 の安全側挙動）。ゲートのロジックはローカル本番接続で実証済みだが、**CI で赤くなる効果は secrets 登録後**。本番トークンを GitHub に置く判断なので保留中。「CI 緑＝順序ゲートが効いている」と読まないこと。

4. **`_shared/` を触ったら全関数デプロイが必要になった。**
   REQ-298 FR-298-01/02 により、`_shared/` の最終コミットより古い本番バンドルがあると main の CI が赤くなる（24h 猶予あり）。現状は差が約2分なので赤くならないが、次に `_shared/` を変更したときは `docs/runbooks/edge-function-deploy.md` の B（全関数デプロイ）を実施すること。

### 2026-07-31 時点からの継続

前回からの「資格情報の失効」「webhook_secret 登録」「Vercel の Node バージョン確認」「REQ-292 の本番適用」（→ 上の運用タスク節）に加えて、**新たに2つの意思決定待ちがある**。

1. **REQ-312 FR-312-07: 多言語SEO（hreflang / `/[locale]`）を取りに行くか。**
   4言語1277キーの翻訳は既に完全一致で揃っているのに、**固有URLが無いため en/zh/ko は検索エンジンにインデックスされない**＝翻訳コストが検索流入に一切結びついていない。取りに行くなら `/[locale]` ルーティング・`alternates.languages`・`x-default`・sitemap の言語別エントリで**別REQ起票**が必要（canonical / sitemap / middleware / OG生成すべてに波及する）。取りに行かないなら現状維持で追加作業ゼロ。
   *部分案*: 研究者向けの `/dataset`（オープンデータ配布ページ）だけ英語で持つなら、全ページのルーティング変更よりはるかに小さい。

2. **REQ-298 FR-298-04: 「本番未適用の migration があるとき本番デプロイを止めるか」。**
   止める設計にすると**運用フローが変わる**（main へマージする前に手動 `supabase db push` を済ませる必要が出る）。止めないと現状どおり「新しいカラムを読むフロントが先に本番へ出て、migration は手動待ち」という順序事故を機械的に防ぐ層がゼロのまま。REQ-298 の着手前に決める必要がある。
