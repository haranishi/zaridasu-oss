# REQ-095: Next.js キャッシュ戦略整備（Route Segment Config）

> 親 REQ: REQ-092（Web アプリ軽量化包括要件）

## 背景
Next.js 15 App Router では各 Route ごとに `revalidate` / `dynamic` / `fetchCache` を Route Segment Config で明示できる。

現状、ザリダスは Route Segment Config の指定がほとんどなく、Next.js のデフォルト挙動（fetch cache の自動推論）に任せている。結果として：
- 静的化できるはずのページ（`/about`, `/privacy`, `/terms`）が、Server Component 内に動的依存があると `dynamic` 扱いになる可能性
- ISR にできるはずのページ（`/trends`, `/area/[municipality]`, `/post/[id]`, `/requests`）が SSR 毎回実行
- `sitemap.ts` は REQ-043 で `revalidate = 3600` 化されているが、他は未整備

加えて、Vercel Edge Cache（CDN）のヒット率が観測されておらず、TTFB の改善余地が見えない。

## 現状の問題
- `src/app/(home)/page.tsx`：HomePageClient（`'use client'`）を返すだけで、ページ自体は Server Component だが Route Segment Config 無し
- `src/app/trends/page.tsx`、`src/app/area/[municipality]/page.tsx`、`src/app/post/[id]/page.tsx`、`src/app/requests/page.tsx` の `revalidate` / `dynamic` が未指定（要確認）
- `sitemap.ts` のみ `revalidate` 設定あり
- fetch cache タグ（`{ next: { tags: ['posts'] } }`）が使われていない → ピンポイント revalidation ができない

## 目的
全公開ルートに Route Segment Config を明示し、CDN / Vercel Edge のキャッシュヒット率を上げて TTFB を短縮する。

## 要件

### 機能要件
- [ ] FR-095-01: 静的ルート（`/about`, `/privacy`, `/terms`）に `export const dynamic = 'force-static'` を明示する。
- [ ] FR-095-02: ISR 候補ルートに `export const revalidate = N` を明示する：
  - `/trends`：60 秒（投稿数の伸びは 1 分単位で十分）
  - `/area/[municipality]`：60 秒
  - `/post/[id]`：120 秒（編集が稀）
  - `/requests`：60 秒
- [ ] FR-095-03: ユーザー固有ルート（`/dashboard`, `/profile`, `/admin/*`）に `export const dynamic = 'force-dynamic'` を明示する（誤キャッシュ防止）。
- [ ] FR-095-04: Server Component 側の Supabase クエリは PostgREST のため fetch cache 対象外だが、生 fetch（地理 API・Open-Meteo・nominatim）には `{ next: { revalidate: 86400, tags: [...] } }` を付ける。
- [ ] FR-095-05: 投稿作成・編集 / 削除の Server Action（または API Route）で `revalidatePath` または `revalidateTag` を呼び、ISR されたページを即時更新する。

### 非機能要件
- [ ] NFR-095-01: 公開ルートの TTFB（モバイル / 本番）が中央値で 100ms 以上短縮されること（web-vitals 計測 / REQ-097 で測る）。
- [ ] NFR-095-02: ユーザー固有ルートで、別ユーザーの情報がキャッシュ漏洩しないこと。

## 受入条件
- [ ] AC-01: `grep -rn "export const dynamic" src/app/` で全主要ルートにヒットする。
- [ ] AC-02: `grep -rn "export const revalidate" src/app/` で ISR 対象ルートにヒットする。
- [ ] AC-03: 投稿の Create / Update / Delete 後に `/trends`, `/area/*`, `/post/[id]` が正しく更新される（Playwright で観測）。
- [ ] AC-04: Vercel ダッシュボードで該当ルートが `STATIC` または `ISR` ラベルになっている。
- [ ] AC-05: 管理者ページがキャッシュ対象になっていない（`force-dynamic` ラベル）。

## 影響範囲
- `src/app/about/page.tsx`
- `src/app/privacy/page.tsx`
- `src/app/terms/page.tsx`
- `src/app/trends/page.tsx`
- `src/app/area/[municipality]/page.tsx`
- `src/app/post/[id]/page.tsx`
- `src/app/requests/page.tsx`
- `src/app/dashboard/page.tsx`
- `src/app/profile/page.tsx`
- `src/app/admin/**/page.tsx`
- 投稿 / コメント Server Action（`revalidatePath` 呼び出し追加）

## 優先度
- **緊急度**: Medium
- **重要度**: High
- **理由**: 設定 1 行で TTFB を CDN ヒット時 50ms 以下に落とせる効果が大きい。誤適用による情報漏洩リスクは管理者ルートを `force-dynamic` で明示することで防げる。

## 実装メモ
- `revalidate` 値は「ユーザーが古いデータに耐えられる秒数」で決める。投稿は鮮度が重要なので 60 秒〜120 秒。
- `revalidateTag` を使うなら、Supabase の Realtime や Webhook と組み合わせて投稿変更時に発火させる構成も検討余地あり（本 REQ ではスコープ外）。
- `unstable_cache` は本 REQ では使わない（Server Component の Supabase fetch を素直に SSR + Edge cache に任せる）。

## リスク
- **キャッシュ漏洩**：認証必須ページに ISR を適用すると別ユーザーのデータが見える。対策 → ユーザー固有ルートは必ず `force-dynamic` を明示する。
- **古いデータ表示**：60 秒のラグはユーザー報告で問題化する可能性あり。対策 → 投稿後の `revalidatePath` をペアで実装する。
