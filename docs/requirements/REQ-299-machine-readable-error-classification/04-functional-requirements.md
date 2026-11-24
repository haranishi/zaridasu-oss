## 機能要件

- **FR-299-01（順序の固定・最初に実施）**: `usePostForm.ts:387` の日本語部分文字列マッチ（`message?.includes('投稿上限')`）を機械可読キーによる判定へ置き換える。
  > [!important] **この置き換えを FR-299-02（DB 文言の変更）より先に完了させること。**
  > 順序を逆にすると、DB 文言を英語化・キー化した瞬間に `includes('投稿上限')` が静かに false になり、localStorage 上限同期が行われないまま「エラーは出るが以後もクライアントチェックを素通りする」状態になる。この退行はテストが無いため CI では検知されない。
- **FR-299-02（DB 側の機械可読化）**: 問題B に挙げた業務例外に `USING ERRCODE`（または `DETAIL` に機械可読キー）を付与し、種別を文面から独立させる。命名は `RATE_LIMIT_POST` / `RATE_LIMIT_COMMENT` / `RATE_LIMIT_LIKE` / `RATE_LIMIT_REPORT` / `RATE_LIMIT_SURVEY_REQUEST` / `REPORT_ALREADY_EXISTS` / `SURVEY_REQUEST_CLOSED` 等の安定キーとする。
  - `schema.sql:1487` の `USING ERRCODE = '42501'` を作法の前例とする。**判断点**: PostgreSQL の ERRCODE はカスタム値を使えるが `SQLSTATE` の 5 文字制約があるため、種別名は `DETAIL` または `MESSAGE` のプレフィックスに載せ、ERRCODE は分類（レートリミット / 重複 / 状態不整合）レベルに留める設計も可。どちらを採るか実装時に決め、決めた根拠をコメントに残す。
  - `schema.sql` に無い migration 側 4 件（`20260425000003` / `20260425000005`）も同じ規約に揃える。**これらは `schema.sql` に載っていないため CI の rls-tests / schema-drift では実行されない**点に注意する。
- **FR-299-03（クライアントの変換層）**: `src/lib/errorHandler.ts` に「機械可読キー → `errors.*` 翻訳キー」の対応表を置き、`getErrorMessage` がキーを返すようにする。`resolveErrorMessage:54` の `raw` 優先分岐は撤廃する（または `process.env.NODE_ENV !== 'production'` 限定にし、本番は必ず翻訳キーを通す）。
  - 対応する `errors.*` キーを ja / en / zh / ko の 4 言語に追加する。
  - `errors.rateLimitServer` が実際に表示される状態にする。
- **FR-299-04（件数リテラルの単一化）**: メッセージ内の件数を `format('24時間以内の投稿上限（%s件）に達しました', <定数>)` 形に変え、判定リテラルと同じ 1 箇所から供給する。あわせて `scripts/check-schema-types-sync.ts` に「`constants.ts` の `SPAM_LIMIT_POSTS` と `schema.sql` の判定リテラルが一致すること」の検査を追加する（他の数値上限へ拡張する枠組みは REQ-297 / 別要件の範囲でよいが、本件で扱う値は必ず入れる）。
- **FR-299-05（通報モーダルのエラー分類）**: `ReportModal.tsx:76-78` を種別判定に変え、「既に通報済み」には再送を促さない文言（例 `report.alreadyReported`）、レート制限には `report.rateLimited` を表示する。4 言語に追加する。
- **FR-299-06（生メッセージ直表示の解消）**: 問題C に挙げた survey 系 3 フックの `setError(err.message)` を、FR-299-03 の変換層経由に変える。表示文言の統一自体は REQ-273 FR-273-03 と重複するため、**どちらの要件で実装するか着手時に決めて片方に寄せる**。
