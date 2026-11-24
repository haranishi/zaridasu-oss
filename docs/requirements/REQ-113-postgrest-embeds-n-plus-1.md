# REQ-113: PostgREST embeds で N+1 解消（投稿詳細）

> 親 REQ: REQ-092
> 関連 REQ: REQ-032 / REQ-103（select-star 全廃）

## 背景
投稿詳細ページ `/post/[id]` では複数のテーブルから関連データを取得している可能性が高い：
- `posts`（メイン）
- `comments`（紐付くコメント）
- `likes`（いいね）
- `reports`（通報数）
- 関連投稿（同種別 / 近隣）

これらが個別の `from('xxx').eq('post_id', id)` で複数 round-trip 化していると典型的な N+1。PostgREST の **embeds**（`select('*, comments(*)')`）で 1 リクエストにまとめられる。

## 現状の問題
- 詳細ページの Supabase リクエスト数が（推定）3〜5 件
- `useDetail*` 系の hooks で個別に fetch しているとバンドルされない round-trip が発生
- bundle-analyzer / DevTools Network での実測が未実施
- REQ-103 で `select('*')` を列指定化する際に、ついでに embed 化する好機

## 目的
PostgREST の embeds を使い、投稿詳細の Supabase 通信を 1〜2 リクエストにまとめる。

## 要件

### 機能要件
- [ ] FR-113-01: `/post/[id]` の DevTools Network タブで Supabase リクエスト数を計測し、ベースライン記録
- [ ] FR-113-02: 関連 fetch（コメント / いいね / 関連投稿）を `posts` の embed として 1 つにまとめる：
  ```ts
  supabase.from('posts')
    .select(`
      id, species, info_type, ...,
      comments(id, body, created_at, user_id),
      likes(count)
    `)
    .eq('id', id)
    .single()
  ```
- [ ] FR-113-03: REQ-103 と統合して `select('*')` 排除と一緒に対応するのが推奨
- [ ] FR-113-04: RLS が embedded テーブルにも正しく効くことを確認（comments テーブルの RLS が有効）
- [ ] FR-113-05: コメント追加 / 削除時の即時 refresh が現状と同等の体験になるよう state 管理を維持

### 非機能要件
- [ ] NFR-113-01: 詳細ページの Supabase 通信回数が 1〜2 件に削減される
- [ ] NFR-113-02: TTFB / LCP が悪化しない（むしろ改善）
- [ ] NFR-113-03: RLS 違反による空データ取得が起きない

## 受入条件
- [ ] AC-01: `/post/[id]` の DevTools Network で Supabase リクエスト数が現状から 1〜3 件減
- [ ] AC-02: コメント表示・いいね数表示が回帰しない
- [ ] AC-03: 既存テスト（vitest / Playwright）が pass
- [ ] AC-04: 計測結果（before/after の通信回数 + サイズ）が PR に記録される
- [ ] AC-05: コメント投稿後に詳細ページに反映される

## 影響範囲
- `src/views/DetailPage.tsx`
- `src/components/features/posts/CommentSection.tsx`（投稿詳細から渡される props で済むなら個別 fetch 削除）
- `src/hooks/useLike.ts`（同上）
- `src/app/post/[id]/page.tsx`（Server Component 側で embed 取得する場合）

## 優先度
- **緊急度**: Low
- **重要度**: Medium
- **理由**: パフォーマンス改善の余地はあるが、REQ-103 と一緒に進めるのが効率的。M 規模。実測してから着手するのが筋。

## 実装メモ
- まず DevTools Network で実際の通信を観測してから embed 設計を決める
- PostgREST embed の RLS は埋め込み元・先のポリシー両方を満たす必要がある
- 1 リクエストにまとめると逆にレスポンスサイズが膨らむケース（コメント数 100+）もあるので、`limit` を埋め込み先にも設定可能：
  ```ts
  comments(id, body, created_at).order('created_at', { ascending: false }).limit(50)
  ```
- 関連投稿（近隣）は別クエリのままで OK（PostGIS distance クエリは embed しにくい）
