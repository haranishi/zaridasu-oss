## 影響範囲

### 変更対象ファイル

| ファイル | 変更内容 |
|---|---|
| `src/lib/postgrest.ts` | 新規。`escapePostgrestValue` / `escapeIlikePattern` を export |
| `src/hooks/usePostList.ts` | `.or()` 句で `escapeIlikePattern` / `escapePostgrestValue` を経由。中期 TODO コメント追加 |
| `src/views/admin/AdminPostsPage.tsx` | `.ilike()` 2 箇所（fetchPosts / handleExportCSV）で `escapeIlikePattern` 経由 |
| `src/views/admin/AdminCommentsPage.tsx` | `.ilike()` 1 箇所で `escapeIlikePattern` 経由 |
| `src/lib/__tests__/postgrest.test.ts` | 新規。FR-138-07 |
| `src/hooks/__tests__/usePostList.test.ts` | FR-138-08 追加（既存があれば追記） |
| `src/views/admin/__tests__/AdminPostsPage.test.tsx` | FR-138-09 追加 |
| `tests/e2e/search-injection.spec.ts` | 新規（任意）。FR-138-10 |
| `docs/security-checklist.md` | 新規 or 追記。PostgREST 文字列連結禁止ポリシー |

### 他機能への影響

- **RLS**: 本要件は RLS に依存しない。RLS が読み取り範囲を限定するとしても、それを根拠に injection を放置するのは不健全。
- **検索 UX**: 100 文字制限・ワイルドカード無効化により、通常ユーザーの検索体験は変わらない（既に 100 文字以上の検索キーワードはまれ）。`%` を含む検索意図のあるユーザーは事実上いない。
- **REQ-027 (SEO dynamic metadata)**: 検索結果ページのメタデータは影響なし。
- **REQ-032 (data fetching optimization)**: 中期 textSearch 移行時に再検討。本要件はあくまで応急対策。
- **REQ-007 (spam check)**: スパム判定とは独立。

## 優先度

- **緊急度**: High（公開検索の filter injection は誰でも触れるエンドポイントで、現状でも実行可能な攻撃）
- **重要度**: High（任意カラムフィルタ差し込みによる情報露出可能性。admin 側は影響限定的）
- **理由**: `.or()` の文字列連結に未エスケープ入力を流し込む構造は、PostgREST DSL の特性上「いつ実害化するか」のリスク管理問題。RLS で多くは救われているが、`reporter_ip` や `user_id` といったセンシティブ列が将来追加される度にリスクが拡大する。実装コストは低く（ユーティリティ 1 つ + 4 箇所修正）、Critical 化する前に潰すべき High。
