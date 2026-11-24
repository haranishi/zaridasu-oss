## 受入基準

- **AC-01**: `supabase/functions/` 配下で `escapeHtml` のローカル定義が **0件**である（`_shared` の正本のみ）。任意の関数に `const escapeHtml = ...` を書き足すと、追加した不変条件テストが**落ちる**。
- **AC-02**: `SPECIES_LABELS` / `INFO_TYPE_LABELS` のローカル定義が Edge Function 側で **0件**である。`_shared/labels.ts` に `SPECIES_LABELS`（2値）と `SURVEY_SPECIES_LABELS`（`unknown` を含む3値）が別定数として存在し、`notify-survey-request` は後者を使う。
- **AC-03**: `src/lib/constants.ts` の `SPECIES` に新しい種コードを追加すると、`_shared/labels.ts` にラベルを追加しない限り機械検証（`schema:check` 相当）が**落ちる**。
- **AC-04**: 各 Edge Function が生成するメール本文で、利用者入力（コメント・通報内容・調査依頼理由）に `<script>` 等を含めても HTML としてエスケープされる。ハンドラテストでこの検証がある。
- **AC-05**: `WEBHOOK_SECRET` 未設定でリクエストを通した場合（`event=webhook_secret_unset_passthrough`）、Edge ログの目視以外の経路でアラートが届く。
- **AC-06**: Resend / Web Push / 集約SNS API の `fetch` すべてに `signal`（タイムアウト）が付いている。応答しないエンドポイントを模したテストで、既定タイムアウト内に呼び出しが中断される。
- **AC-07**: 500件規模のバッチで1件がハングしても、バッチ全体がデッドライン内に終了し、送信済み件数がログに残る。残件が「未送信」として区別できる（次回実行で先頭から重複送信しない設計であること。REQ-280 の冪等性対応と整合していること）。
- **AC-08**: `notify-post-status` の Resend 失敗時、Edge ログと HTTP 応答のいずれにも**宛先メールアドレスが含まれない**。応答は固定文言（`mail_send_failed` 等）である。
- **AC-09**: `analyze-image` の最終catch、および `_shared/mailer.ts` の throw が redact を通っている。ライフサイクルメール3関数の fail-soft catch のログに宛先メールが残らない。
- **AC-10**: `supabase/functions/deno.lock` の supabase-js が `package.json` のメジャー・マイナーと整合する（乖離が残る場合は理由が記録されている）。月次更新 workflow が存在し、手動実行で PR が作られる。
- **AC-11**: `backup.yml` の Supabase CLI バージョンが `ci.yml` と一致し、`latest` が残っていない。バックアップ失敗時にアラートが届く。
- **AC-12**: `cost:ai` が定期実行として配線され、secrets 未設定の環境では notice + exit 0 で終わる（CIを壊さない）。`eval:ai` の運用手順が `docs/runbooks/` に記載されている。
- **AC-13**: `deno test --lock=supabase/functions/deno.lock supabase/functions/` が通る（新規の不変条件テストとハンドラテストを含む）。
- **AC-14**: `lint` / `type-check` / 既存652テストがパスする。
