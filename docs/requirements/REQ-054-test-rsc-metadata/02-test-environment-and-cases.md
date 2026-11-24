## テスト種別と環境
- **種別**: integration（RSC はサーバ関数なので `await Component({ params })` と `await generateMetadata({ params })` を直接呼ぶ）
- **フレームワーク**: Vitest（既存）
- **セットアップ**:
  - `vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))` で `createClient()` をモックし、`from().select().eq().single()` チェーンを fluent builder でスタブ
  - `vi.mock('next/navigation', () => ({ notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }) }))` で `notFound()` の呼び出しを検証可能にする（既存 `vitest.setup.ts:31-49` を上書き）
  - クライアントコンポーネント（`AreaPageClient`, `AreaListPageClient`, `DetailPageClient`）は `vi.mock` でダミー化し、props を検証可能にする
- **配置先**:
  - `src/app/area/[municipality]/__tests__/page.test.tsx`
  - `src/app/area/__tests__/page.test.tsx`
  - `src/app/post/[id]/__tests__/page.test.tsx`
  - `src/app/__tests__/sitemap.test.ts`

## テストケース（Given/When/Then）

### TC-01: area/[municipality] RSC は未知 slug で notFound() を呼ぶ（INV-01）
- **Given**: `params = Promise.resolve({ municipality: 'nonexistent-mura' })`、supabase モックはデフォルト（呼ばれない想定）
- **When**: `AreaPage({ params })` を await する
- **Then**: `notFound` モックが 1 回呼ばれ、`AreaPage` は throw（`NEXT_NOT_FOUND`）する

### TC-02: area/[municipality] generateMetadata が canonical を正しく返す（INV-02）
- **Given**: `params = Promise.resolve({ municipality: 'akita-shi' })`、supabase モックが `count: 42` を返す
- **When**: `generateMetadata({ params })` を await
- **Then**:
  - 戻り値の `alternates.canonical === '/area/akita-shi'`
  - `openGraph.url === '/area/akita-shi'`
  - `title === '秋田市の外来生物情報'`
  - `description` に `'現在42件の報告があります'` が含まれる

### TC-03: post/[id] generateMetadata は未知 id で「投稿が見つかりません」を返す（INV-03 の片側）
- **Given**: `params = Promise.resolve({ id: '99999' })`、supabase の `.single()` が `{ data: null }` を返す
- **When**: `generateMetadata({ params })` を await
- **Then**: `title === '投稿が見つかりません'`

### TC-04: post/[id] generateMetadata が post の species/info_type/municipality を反映（INV-04）
- **Given**: supabase の `.single()` が `{ data: { id:'1', species:'american', info_type:'sighting', municipality:'秋田市', photos:['https://cdn/1.jpg'], comment:'こめんと' } }` を返す
- **When**: `generateMetadata({ params: Promise.resolve({ id: '1' }) })`
- **Then**:
  - `title` に `generatePostSEO({ species:'american', ... }).seoTitle` と同じ文字列が含まれる（species/info_type/municipality の値が反映される）
  - `openGraph.images[0].url === 'https://cdn/1.jpg'`
  - `alternates.canonical === '/post/1'`

### TC-05: sitemap が MUNICIPALITY_DATA + posts + static の URL を全て含む（INV-05）
- **Given**: posts モックが `[{ id:'a', updated_at:'2026-01-01T00:00:00Z' }, { id:'b', updated_at:'2026-01-02T00:00:00Z' }]` を返す（survey_requests / user_profiles は空）
- **When**: `await sitemap()`
- **Then**:
  - 戻り値 URL 一覧に `BASE_URL + '/'`, `'/trends'`, `'/ranking'`, `'/area'`, `'/about'`, `'/terms'`, `'/privacy'` が全て含まれる
  - 戻り値に `MUNICIPALITY_DATA.length === 25` 個の `/area/{slug}` URL が全て含まれる
  - 戻り値に `/post/a`, `/post/b` が含まれる
  - 合計件数 = 7 + 25 + 2 = 34（survey / profile 空のため）

### TC-06: sitemap は posts クエリ失敗でも static + area を返す（INV-06）
- **Given**: posts チェーンが `{ data: null, error: { message: 'boom' } }` を返す（他 2 クエリも null）
- **When**: `await sitemap()`
- **Then**:
  - throw しない
  - 最低 32 件（static 7 + area 25）以上を返す
  - `/post/` で始まる URL が 0 件
