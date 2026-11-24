- [ ] **FR-138-03: Admin posts の `.ilike()` 修正**
  `src/views/admin/AdminPostsPage.tsx:74` / `:257` を以下に書き換え:
  ```ts
  if (filters.keyword) {
    const safePattern = escapeIlikePattern(filters.keyword)
    query = query.ilike('comment', `%${safePattern}%`)
  }
  ```
  `.ilike()` API（メソッドチェーン形式）に直接値を渡すケースでは `%` `_` のエスケープのみで十分（カラム injection は起きない）。

- [ ] **FR-138-04: Admin comments の `.ilike()` 修正**
  `src/views/admin/AdminCommentsPage.tsx:79` も同様にエスケープを適用。

- [ ] **FR-138-05: 入力長制限**
  `filters.search` / `filters.keyword` の長さを **100 文字**でクライアント側でも切る（既にある場合はそのまま）。`escapeIlikePattern` の最初で `input.slice(0, 100)` を行う defense in depth とする。

- [ ] **FR-138-06: 中期改善のメモ（実装対象外、コメントで記録）**
  `usePostList.ts` の修正箇所に以下の TODO コメントを残す:
  ```ts
  // TODO(REQ-138): 中期的には textSearch('comment', input, { type: 'websearch' })
  // へ移行し、.or() の文字列連結を撤廃する。tsvector 列 + GIN index が必要。
  ```

### 非機能要件

- [ ] **NFR-138-01: 後方互換性**
  通常の日本語キーワード（漢字・ひらがな・カタカナ・英数字・スペース）は従来と同じ検索結果を返すこと。エスケープによって検索ヒットが減らないよう、`%` `_` を含まない一般的な検索語では挙動不変。

- [ ] **NFR-138-02: パフォーマンス**
  エスケープ関数は O(n) で input 1 回スキャンで完了させる。100 文字制限下で 1ms 未満を目標。

- [ ] **NFR-138-03: セキュリティ**
  本要件で escapePostgrestValue / escapeIlikePattern を経由しない `.or()` / `.ilike()` 呼び出しを `src/` 全体で禁止する。eslint custom rule までは不要だが、PR レビューチェックリストに「PostgREST 文字列連結禁止」を明文化する（`docs/security-checklist.md` を更新、なければ新設）。
