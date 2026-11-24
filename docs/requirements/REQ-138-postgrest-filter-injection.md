# REQ-138: PostgREST filter injection 対策（`.or()` / `.ilike()` の入力エスケープ）

## これは何か

検索キーワードを PostgREST のフィルタ DSL に**文字列連結**で渡している 3 箇所
（公開検索の `.or()`、admin posts / admin comments の `.ilike()`）を、エスケープ経由に直す要件。
`.or()` の未エスケープは任意カラムのフィルタを差し込める**真の injection** に該当する。

## 主要な決定事項の要点

- **公開検索の `.or()` のみが「真の injection」**（カラム名・他フィルタの差し込みが可能）。
  admin の `.ilike()` 単体はワイルドカード DoS と意図しないマッチに限定されるが、最小限のエスケープは適用する。
- **エスケープは共通ユーティリティ `src/lib/postgrest.ts` に集約する**。
  `escapePostgrestValue`（`,` `(` `)` `"` `\` をクオートで閉じ込める）と
  `escapeIlikePattern`（`\\` → `%` → `_` の順に置換。バックスラッシュを先に処理して二重置換を避ける）。
- **`.or()` 内のワイルドカードは `%` ではなく `*` を使う**（PostgREST が `*` を `%` に変換する仕様）。
  値内部の `*` リテラルもエスケープ対象に追加する。
- **入力長は 100 文字で切る**（`escapeIlikePattern` の先頭で `slice(0, 100)`）＝defense in depth。
- **RLS を根拠に injection を放置しない**。RLS が読み取り範囲を限定するとしても不健全という判断。
- **textSearch（GIN index）への移行は本要件の対象外**。TODO コメントで記録し、`.or()` 連打の解消は中期課題とする。
- **PR レビューチェックリストに「PostgREST 文字列連結禁止」を明文化**する（`docs/security-checklist.md`）。
  eslint custom rule までは不要という判断。
- **緊急度 High / 重要度 High**。実装コストは低い（ユーティリティ 1 つ＋4 箇所修正）ので Critical 化する前に潰す。

## 目次（各部品）

- [01-background-and-attack-vectors.md](REQ-138-postgrest-filter-injection/01-background-and-attack-vectors.md)
  — 背景：文字列連結している 3 箇所、`.or()` の構文文字、攻撃例と成立する被害（他カラムフィルタ・プライバシー・DoS）、`.ilike()` のワイルドカード問題、admin の監査ログ汚染経路。
- [02-current-problems-in-code.md](REQ-138-postgrest-filter-injection/02-current-problems-in-code.md)
  — 現状の問題：`usePostList.ts` / `AdminPostsPage.tsx` / `AdminCommentsPage.tsx` の該当コード、影響の切り分け、既存テストの不足。
- [03-goals-and-fr-01-02-escaping-and-public-search.md](REQ-138-postgrest-filter-injection/03-goals-and-fr-01-02-escaping-and-public-search.md)
  — 目的 4 点と、FR-138-01（エスケープユーティリティの仕様）・FR-138-02（公開検索 `.or()` の修正コードと `*` を使う理由）。
- [04-fr-03-06-admin-and-nfr.md](REQ-138-postgrest-filter-injection/04-fr-03-06-admin-and-nfr.md)
  — FR-138-03〜06（admin posts / comments の修正、入力長制限、中期改善 TODO）と非機能要件 NFR-138-01〜03（後方互換・パフォーマンス・セキュリティ）。
- [05-test-requirements-and-acceptance.md](REQ-138-postgrest-filter-injection/05-test-requirements-and-acceptance.md)
  — テスト要件 FR-138-07〜10（ユニット・injection 防止 case A/B/C・ワイルドカード無効化・E2E）と受入条件 AC-138-01〜07。
- [06-impact-and-priority.md](REQ-138-postgrest-filter-injection/06-impact-and-priority.md)
  — 影響範囲（変更対象ファイル表・他機能への影響）と優先度（緊急度・重要度・理由）。
