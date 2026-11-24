# REQ-162: area ページの revalidate とサイトマップ再生成コストの最適化

## 背景
ザリダスは Next.js 15 App Router の ISR（Incremental Static Regeneration）を利用し、地域別ランディングページ (`/area/[municipality]`) とサイトマップ (`/sitemap.xml`) を定期再生成している。これらは Supabase の `posts` などのテーブルを読み出してコンテンツを生成するため、再生成のたびに DB クエリが発行され、Vercel の関数実行・Supabase の読み取りコストに直結する。

## 現状の問題

### 1. area ページの revalidate
`src/app/area/[municipality]/page.tsx`:
- `export const revalidate = 3600`（`page.tsx:16`）。1 時間ごとに再生成。
- `generateStaticParams`（`page.tsx:12-14`）で `MUNICIPALITY_DATA` 全件を静的生成。
- 再生成のたびに 2 系統のクエリが走る:
  - `generateMetadata`（`page.tsx:25-29`）: `posts` を `count: 'exact', head: true` で件数取得（`status=approved` かつ `municipality=muni.name`）。
  - ページ本体（`page.tsx:63-69`）: `posts` から `id, species, info_type, municipality, lat, lng, photos, comment, created_at` を `limit(50)` 取得。
- 自治体数 ×（メタ件数クエリ + 本体クエリ）が 1 時間ごとに発生し、投稿頻度に対して過剰になりうる。地域別ページは投稿のない自治体でも一律 1 時間ごとに再生成される。

### 2. サイトマップの再生成コスト
`src/app/sitemap.ts`:
- `export const revalidate = 3600`（`sitemap.ts:5`）。1 時間ごとに全体を再生成。
- 1 回の再生成で以下のクエリが走る:
  - `posts`: `id, updated_at` を `status=approved`、`updated_at` 降順、`limit(1000)`（`sitemap.ts:29-34`）。
  - `survey_requests`: `id, created_at` を `status=open`、`created_at` 降順、`limit(500)`（`sitemap.ts:44-49`）。
  - `user_profiles`: `id, updated_at` を `is_public=true`、`limit(500)`（`sitemap.ts:59-63`）。
- 毎時、最大 1000 + 500 + 500 = 2000 行をフルスキャン的に取得して全 URL を作り直す。差分更新ではなく毎回全件再構築のため、データ量増加に比例してクエリ/転送コストが線形増加する。

## 目的
更新頻度の実態に対して過剰な再生成を抑え、サイトマップを差分（delta）ベースで効率化することで、Vercel 関数実行回数・Supabase 読み取り量を削減しつつ、検索エンジン向けの鮮度を維持する。

## 要件
### 機能要件
- [ ] FR-162-01: `src/app/area/[municipality]/page.tsx` の `revalidate` 値を、地域ページの実際の更新頻度に見合った値へ調整する（例: 3600 → 21600/86400 等）。値の根拠（投稿頻度・SEO 鮮度要件）をコメントで明記する。
- [ ] FR-162-02: `generateMetadata` の件数クエリ（`page.tsx:25-29`）とページ本体のクエリ（`page.tsx:63-69`）が同一リクエスト内で `posts` を二重に読む構造を見直し、件数を本体クエリから導出できないか検討する（本体は `limit(50)` のため正確な総件数は別途必要 → `count` を本体クエリに統合できるか含めて検討）。
- [ ] FR-162-03: `src/app/sitemap.ts` の `revalidate` を調整し、サイトマップ鮮度と再生成コストのバランスを取る（例: 3600 → 21600/86400）。
- [ ] FR-162-04: サイトマップの delta クエリ化を行う。`limit(1000)`/`limit(500)` で毎回全件を再構築する方式から、更新日時（`updated_at` / `created_at`）に基づき更新分のみを扱う、または件数増に耐えるページング/分割サイトマップ方式へ移行する設計を行う。最低限、全件取得が将来のデータ量で破綻しないこと（現状の固定 limit が新規 URL を取りこぼすリスクの解消）を要件に含める。

### 非機能要件（該当する場合）
- [ ] NFR-162-01: 改修後、area ページ 1 自治体あたりの再生成時 DB クエリ本数が現状（2 本）以下になること。
- [ ] NFR-162-02: サイトマップ 1 回の再生成あたりの取得行数・転送量が現状（最大 2000 行）から削減、または件数増に対してスケールする構造になること。
- [ ] NFR-162-03: サイトマップの URL 網羅性が低下しないこと（公開対象の post/request/profile が limit により欠落しない）。

## 受入条件
- [ ] AC-01: `src/app/area/[municipality]/page.tsx` の `revalidate` が見直され、根拠コメント付きで設定されている。
- [ ] AC-02: area ページ表示・メタデータ（動的 description の投稿件数表示）が改修前と同等に機能する。
- [ ] AC-03: `src/app/sitemap.ts` の `revalidate` が見直され、delta もしくはスケーラブルな取得方式に変更されている。
- [ ] AC-04: `/sitemap.xml` が改修前と同等以上の URL を網羅し、limit 起因の取りこぼしがない。
- [ ] AC-05: `next build` が成功し、ISR キャッシュが期待どおり機能する（再生成間隔が新しい値で動作）。
- [ ] AC-06: 改修前後で DB クエリ本数・取得行数の比較がレポートされている。

## 影響範囲
- `src/app/area/[municipality]/page.tsx`（`revalidate`、`generateMetadata` の件数クエリ、本体クエリ）
- `src/app/sitemap.ts`（`revalidate`、posts/survey_requests/user_profiles クエリ）
- Supabase 読み取りコスト・Vercel 関数実行コスト
- SEO（サイトマップ鮮度・URL 網羅性、area ページの再生成鮮度）

## 優先度
- **緊急度**: 低 / **重要度**: 中 / **理由**: 現状は機能的に正常だが、データ量増加に伴い固定 limit によるサイトマップの URL 取りこぼしと、過剰な再生成によるコスト増が顕在化する。早期に delta 化・revalidate 調整しておくことでスケール時の手戻りを防げる。
