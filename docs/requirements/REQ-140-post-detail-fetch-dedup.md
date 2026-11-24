# REQ-140: 投稿詳細ページの 3 回 fetch を 1 回に集約

> 関連 REQ: REQ-032（データ取得効率化）/ REQ-103（select-star 全廃）/ REQ-113（PostgREST embeds N+1 解消）/ REQ-037（RSC Supabase client 統一）

## 背景
投稿詳細ページ `/post/[id]` では、同一の投稿レコードに対して 1 リクエスト中に **3 回** Supabase へ取りに行く構造になっている。
REQ-103 で列を絞り、REQ-113 で comments / likes を embed 化したことで個別の N+1 は解消したが、「同じ post を複数のレンダーフェーズで重複取得している」課題は残っており、TTFB / LCP / Supabase egress に悪影響を与えている。

## 現状の問題
- `src/app/post/[id]/page.tsx:16` — `generateMetadata()` 内で 1 回目の fetch：
  ```ts
  await supabase.from('posts').select(POST_SEO_COLUMNS).eq('id', id).single()
  ```
- `src/app/post/[id]/page.tsx:59` — RSC 本体（`PostDetailPage`）で **同じクエリ** を再実行（JSON-LD 生成のみのために再取得）。
- `src/views/DetailPage.tsx:83-87` — Client 側 `useEffect` で 3 回目の fetch：
  ```ts
  supabase.from('posts')
    .select('id, created_at, ..., comments(*), likes(id, user_id)')
    .eq('id', id).single()
  ```
- いずれも未認証ユーザーでも走るため、1 PV につき Supabase に最大 3 リクエスト + ネットワーク往復 ×3 が発生する。
- `generateMetadata` と `PostDetailPage` 本体は同一 request scope だが、現在は `cache()` 等で de-dup されていない。
- DetailPage の `useEffect` で fetch している間 `loading` 状態となり、ヘッダー以外の本文（JSON-LD 以外）はクライアント描画になり LCP が遅延する。

## 目的
- 同一リクエスト内では post レコードを **1 回だけ** 取得する。
- comments / likes を含む initial データを RSC で取得して `DetailPageClient` へ props で渡し、Client 側の初回 fetch を撤廃する。
- `generateMetadata` と RSC の重複呼び出しを React `cache()` で de-dup する。

## 要件

### 機能要件
- [ ] FR-140-01: `src/app/post/[id]/page.tsx` で post を取得する処理を 1 つの関数に抽出し、React の `cache()`（または Next.js の `unstable_cache` ではなく **request-scoped な** `cache`）でラップする。
  - 例：`const getPostForDetail = cache(async (id: string) => supabase.from('posts').select(POST_FULL_COLUMNS_WITH_EMBEDS).eq('id', id).single())`
  - `generateMetadata` と `PostDetailPage` 本体の両方からこの関数を呼び、Next.js のリクエストスコープ de-dup を効かせる。
- [ ] FR-140-02: 取得列は SEO / JSON-LD / Client 表示すべてをカバーする「詳細ページ最大セット」を 1 回のクエリで取得する：
  ```ts
  select(`
    id, created_at, lat, lng, species, info_type, municipality, comment, photos,
    user_id, is_anonymous, is_official, count, observed_at, status, rejection_message,
    weather, temperature, humidity, audio_url, audio_duration_ms, ai_result,
    comments(*), likes(id, user_id)
  `)
  ```
- [ ] FR-140-03: `DetailPageClient` / `DetailPage` に `initialPost` / `initialComments` / `initialLikes` を props で渡す経路を新設する。
  - `DetailPageClient.tsx` 経由で `DetailPage` に伝搬。
  - `DetailPage` の `useState<DetailPost | null>(null)` 初期値を `initialPost ?? null` に置き換える。
- [ ] FR-140-04: `DetailPage` の `useEffect` での post fetch を「`initialPost` が無い場合のみ」のフォールバックに縮退する。通常経路では fetch せず `loading=false` 初期化する。
- [ ] FR-140-05: `generateMetadata` の戻り値（title / description / og:image）と RSC 側の JSON-LD は、同じ `cache()` から取った post を使う。`null` の場合の分岐は維持する。
- [ ] FR-140-06: `revalidate` / キャッシュ戦略は現状の挙動（dynamic）を変えない。`cache()` は request-scoped であり cross-request キャッシュではないことを README コメントで明記する。

### 非機能要件
- [ ] NFR-140-01: `/post/[id]` 1 リクエストにつき Supabase への post クエリ数は **1 回** に削減される（DevTools Network / supabase ログで計測）。
- [ ] NFR-140-02: 初期表示で post 本文が SSR に乗り、`loading` スピナーが見えなくなる（JS 無効でも本文が表示される）。
- [ ] NFR-140-03: TTFB / LCP が悪化しない（むしろ改善方向）。Lighthouse モバイルの LCP が現状 +0%（同等）以下。
- [ ] NFR-140-04: RLS は変更しない。`approved` 以外（pending / rejected）の投稿の閲覧条件は現状維持。

## 受入条件
- [ ] AC-01: `/post/[id]` を一度開いた際、Supabase ログ上で posts テーブルへのクエリが **1 リクエスト** にまとまっている（before: 2〜3、after: 1）。
- [ ] AC-02: `view-source:/post/[id]` で post の comment / species がインライン HTML に含まれている（SSR でレンダリングされている）。
- [ ] AC-03: JS を無効化したブラウザでも `<h2>` の種名・コメントが描画される。
- [ ] AC-04: コメント投稿 → 反映、いいね → 反映の既存挙動が回帰しない（CommentSection / useLike の seed モードを維持）。
- [ ] AC-05: 存在しない id を叩いた場合の「投稿が見つかりません」表示（title / description / 本文）が現状どおり出る。
- [ ] AC-06: pending / rejected ステータスの投稿が、所有者以外には RLS で空になることを E2E で確認（既存テストの回帰がない）。
- [ ] AC-07: `npm run build` / `npm run typecheck` / `npm test` が pass。

## テスト要件
- [ ] T-140-01: Vitest（unit）: `getPostForDetail` 関数を 2 回呼んでも実際の Supabase 呼び出しは 1 回になることをモックで確認（`cache()` 効果の検証）。
- [ ] T-140-02: Vitest（component）: `DetailPage` に `initialPost`+`initialComments`+`initialLikes` を渡した場合、`supabase.from('posts').select(...).eq(...).single()` が **呼ばれない** ことを assert（モック spy）。
- [ ] T-140-03: Vitest（component）: `initialPost=null`（フォールバック）の場合は従来通り `useEffect` で fetch するパスが通ることを確認。
- [ ] T-140-04: Playwright（E2E）: `/post/<approved-id>` の初期 HTML レスポンスに種名と最初の photo URL が含まれている（`page.goto` 後 `await page.content()` で確認、JS 実行前のレスポンスは route handler で確認）。
- [ ] T-140-05: Playwright（E2E）: Supabase へのリクエスト数を `page.on('request')` で観測し、posts テーブルクエリが 1 回であることを確認（ネットワークインターセプト）。
- [ ] T-140-06: 既存の `CommentSection` / `useLike` のテストが pass（回帰防止）。

## 影響範囲
- `src/app/post/[id]/page.tsx`（cache 化、列の拡張、props 経由で initial を渡す）
- `src/app/post/[id]/DetailPageClient.tsx`（initial props の受け取り・伝搬）
- `src/views/DetailPage.tsx`（initialPost を受け取って初期 state にセット、useEffect をフォールバック化）
- `src/types/post.ts`（必要なら `DetailPost` の型コメントを更新）
- `src/hooks/useLike.ts` / `src/components/features/posts/CommentSection.tsx`（既存 seed モード維持。変更不要のはず）
- Tests: `src/__tests__/` 配下 + `tests/e2e/` 配下

## 優先度
- **緊急度**: High
- **重要度**: Critical
- **理由**: 詳細ページは流入ランディングになりやすく、LCP / TTFB がコアウェブバイタル & SEO に直結する。同一 post を 3 回叩いている構造は egress コスト・Supabase free tier 制限にも悪影響。REQ-113 で半歩進めた embed 化と統合すれば改修コストも限定的。

## 実装メモ
- React `cache()` は同一 request scope の dedupe にのみ効く。cross-request キャッシュが欲しい場合は別途 `unstable_cache` を検討するが、本 REQ では request-scoped で十分（既に Next.js の fetch dedupe は効いていない非 fetch API ＝ supabase-js のため `cache()` 採用）。
- `DetailPage` の `useEffect` ブランチを完全に消すと SPA 遷移時に古い post を表示するリスクがあるため、「`initialPost?.id !== id` のときだけ fetch」というガードを入れるのが安全。
- JSON-LD / OG 画像生成で参照する列が `POST_SEO_COLUMNS` を超えるなら、`POST_DETAIL_COLUMNS` 定数として `src/lib/seo.ts` 近辺に集約する。
