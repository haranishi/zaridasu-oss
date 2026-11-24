## カバレッジ目標
- 4 ファイル合算で branch カバレッジ ≥ 80%、line カバレッジ ≥ 85%
- 特に `notFound()` 分岐 / `post == null` 分岐 / supabase エラー分岐の 3 箇所は必ず実行されること

## テストデータ / フィクスチャ
- 既知 slug: `'akita-shi'`（`MUNICIPALITY_DATA[0]`）
- 未知 slug: `'nonexistent-mura'`
- post 固定フィクスチャ: `src/app/post/[id]/__tests__/fixtures/post.ts` に `{ id:'1', species:'american', info_type:'sighting', municipality:'秋田市', photos:[...], comment:'...' }` を作成
- supabase fluent builder mock helper: `src/test-utils/mockSupabaseServer.ts` を新規作成し `mockQuery({ select: ..., single: ..., count: ... })` の形で各 select/eq/order/limit/single/head を chain モック化

## 受入条件
- [ ] AC-01: `npm test -- src/app/area src/app/post src/app/__tests__/sitemap.test.ts` で全 6 ケース通過
- [ ] AC-02: ネガティブ検証 — `src/app/area/[municipality]/page.tsx:61` の `if (!muni) notFound()` を削除すると TC-01 が失敗し、`src/app/sitemap.ts:32` で `.select('id, updated_at')` を `.select('id')` に変えて `post.updated_at` が undefined になると TC-05 で `lastModified` 検証が失敗し、`src/app/post/[id]/page.tsx:15` の早期 return を削除すると TC-03 で `title` が undefined になって失敗する
- [ ] AC-03: CI 上で 3 回連続成功

## 影響範囲
- 新規: 4 テストファイル + 1 フィクスチャ + 1 test-utils
- 参照のみ: `src/app/area/[municipality]/page.tsx`, `src/app/area/page.tsx`, `src/app/post/[id]/page.tsx`, `src/app/sitemap.ts`, `src/lib/supabase/server.ts`, `src/lib/constants.ts`, `src/lib/seo.ts`

## 優先度
- **緊急度**: High
- **重要度**: High
- **理由**: RSC の `notFound()` / `generateMetadata` は SEO と 404 の二重の要で、退行すると Google Search Console 上に即座に canonical 重複・404 消失として現れる。sitemap の列選択破壊は過去にも類似事例（REQ-043）があり、最小限の integration テストで防げるコストが著しく低い。
