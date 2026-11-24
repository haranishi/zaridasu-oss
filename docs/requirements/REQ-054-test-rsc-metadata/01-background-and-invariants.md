## 背景
Next.js 15 App Router の Server Component は、`generateMetadata` と default export（RSC）の両方で Supabase からデータ取得し、未知パラメータでは `notFound()` を呼び、sitemap では数百〜1000 件規模の URL を生成する。これらは SEO と 404 運用の要であるにもかかわらず、現状一切テストが存在しない。

対象:
- `src/app/area/[municipality]/page.tsx`（`generateMetadata` L20-56, RSC L58-140）
- `src/app/area/page.tsx`（`metadata` 静的 L9-13, RSC L15-52）
- `src/app/post/[id]/page.tsx`（`generateMetadata` L10-49, RSC L51-74）
- `src/app/sitemap.ts`（`sitemap()` L9-74）

## 守りたい不変条件
- INV-01: `src/app/area/[municipality]/page.tsx:61` の RSC は、`getMunicipalityBySlug(slug)` が `undefined` を返した場合に `notFound()` を呼ぶ
- INV-02: `src/app/area/[municipality]/page.tsx:42,47` の `generateMetadata` は `alternates.canonical === '/area/{slug}'` かつ `openGraph.url === '/area/{slug}'` を返す（既知 slug の場合）
- INV-03: `src/app/post/[id]/page.tsx:51-74` の RSC は、`supabase.from('posts').select(...).single()` が `{ data: null }` を返す未知 id の場合でも `DetailPageClient` を render する（後方互換）。一方 `generateMetadata` は `src/app/post/[id]/page.tsx:15-20` で `title: '投稿が見つかりません'` を返す
- INV-04: `src/app/post/[id]/page.tsx:31-48` の `generateMetadata` は、存在する post に対し `generatePostSEO(post)` の `seoTitle` を `title` に反映し、`openGraph.images[0].url` を post.photos[0] または DEFAULT_OG_IMAGE にフォールバックする
- INV-05: `src/app/sitemap.ts:9-74` は `MUNICIPALITY_DATA.length`（= 25）個の area URL と、取得できた approved posts の URL と、L13-21 の static ページ 7 件をすべて含む配列を返す
- INV-06: `src/app/sitemap.ts:31-36` の posts クエリが throw もしくは `{ data: null }` を返しても、static + area だけの Sitemap（最低 7 + 25 = 32 件）は返る（部分劣化）

## 現状の検出可否
- `src/app/area/`, `src/app/post/`, `src/app/` 直下に `__tests__/` が存在しない（Glob 確認済み、`src/app/__tests__/` 無し、`src/app/area/**/__tests__/` 無し、`src/app/post/**/__tests__/` 無し）
- ゆえに `notFound()` 呼び出し削除（INV-01, INV-03）、canonical URL 変更（INV-02）、sitemap の列選択破壊（INV-05）、DB 失敗時の全面エラー化（INV-06）のいずれも CI で検出できない
