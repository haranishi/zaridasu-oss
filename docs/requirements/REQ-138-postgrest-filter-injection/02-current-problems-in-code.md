## 現状の問題

### コード

- `src/hooks/usePostList.ts:50-66` — 公開検索の `or()` 句:
  ```ts
  if (filters.search) {
    const kw = filters.search.toLowerCase()
    // ...
    const orParts = [
      `comment.ilike.%${filters.search}%`,
      `municipality.ilike.%${filters.search}%`,
      ...(matchedSpecies.length ? [`species.in.(${matchedSpecies.join(',')})`] : []),
      ...(matchedInfoTypes.length ? [`info_type.in.(${matchedInfoTypes.join(',')})`] : []),
    ]
    query = query.or(orParts.join(','))
  }
  ```
  `filters.search` を一切エスケープせず埋め込み。カンマで `or()` 句を抜けて任意カラムフィルタの差し込みが可能。

- `src/views/admin/AdminPostsPage.tsx:74` / `:257` — admin posts の `ilike`:
  ```ts
  if (filters.keyword) query = query.ilike('comment', `%${filters.keyword}%`)
  ```
  `%` / `_` がエスケープされていない。`.ilike()` API は値をパラメータ扱いするため**カラム injection** は起きないが、ワイルドカードでの DoS と意図しないマッチが可能。

- `src/views/admin/AdminCommentsPage.tsx:79` — admin comments も同様。

### 影響

- **公開検索の `.or()` のみ "真の injection"**（カラム名・他フィルタの差し込み）
- **admin の `.ilike()` 単体は限定的**（ワイルドカード DoS と意図しないマッチのみ）

ただし、admin の filter UI から監査ログを通じて他者のコメントを意図せず引き出せる可能性があり、最小限のエスケープは admin 側も適用すべき。

### 既存テスト

- `usePostList` の検索クエリは `tests/unit/hooks/usePostList.test.ts` 系で query string の構築を verify している箇所があるが、悪意のある入力に対するテストはない。
