## 受入基準

- **AC-01（日本語依存の解消）**: 本番コードに DB メッセージの日本語部分文字列マッチが残っていない。
  ```bash
  grep -rn "includes('投稿上限')\|includes(\"投稿上限\")" src   # 期待: 0 件
  ```
- **AC-02（DB 側の機械可読化）**: `RAISE EXCEPTION` のうち業務例外（レートリミット・重複・状態不整合）が機械可読キーを持つ。
  ```bash
  # schema.sql と migrations の両方で、対象例外に ERRCODE / DETAIL が付いていることを確認
  grep -n "RAISE EXCEPTION" supabase/schema.sql | grep -v "ERRCODE\|USING"
  ```
  上記の出力に、レートリミット・重複通報・調査依頼上限が**含まれない**。
- **AC-03（翻訳が到達する）**: 英語 UI で投稿上限に到達させると `errors.rateLimitServer` の英語文言が表示され、日本語が出ない。zh / ko でも同様。
- **AC-04（`raw` 優先の撤廃）**: `src/lib/errorHandler.ts` に本番経路で `msg.raw` を無条件に返す分岐が残っていない。
- **AC-05（件数の一致検査）**: `SPAM_LIMIT_POSTS` を 5 以外に変えると `npm run schema:check` が fail する。
- **AC-06（通報の区別）**: 同一投稿を 2 回通報すると「既に通報済み」を示す文言が表示され、再送を促す文言が出ない。
- **AC-07（i18n 整合）**: 追加した `errors.*` / `report.*` キーが 4 言語すべてに存在し `npm run i18n:check` がパスする。
- **AC-08**: `lint` / `type-check` / 既存 652 テストがパスする。

## 対象外

- DB 例外メッセージそのものの英語化（DB 側で多言語を持つこと）は行わない。DB は機械可読キー＋開発者向け日本語文面を保持し、**利用者向け文言はクライアントの i18n が唯一の正本**とする方針を取る。
- レートリミットの閾値そのものの見直し（5 件 / 100 件 / 3 件が妥当かの議論）は本要件の範囲外。
- 管理画面の `error.message` 直表示（`AdminUsersPage.tsx:225,246` ほか）は管理者向けで診断情報としての価値があるため、本要件では変更しない。

## 要確認

- `PostgREST` 経由で `USING ERRCODE`（カスタム SQLSTATE）を返したときに、`supabase-js` のエラーオブジェクトの `code` / `details` / `hint` にどう載るかは実測が必要。`P0001` 以外の SQLSTATE を返す場合の HTTP ステータス変化（PostgREST が 4xx / 5xx をどう割り当てるか）も含めて、実装の最初に 1 ケースで確認すること。
- `errors.rateLimitServer` は「投稿が集中しています」という文面で、実際には投稿・コメント・いいね・通報・調査依頼の全種別に使い回されている。FR-299-03 で種別ごとにキーを分けるか、汎用 1 キーのままにするかは UX 判断（分ける場合は追加する翻訳キーが増える）。
- REQ-273 FR-273-03（survey 一覧のエラー統一）との実装重複。どちらで実装するかは未決。
