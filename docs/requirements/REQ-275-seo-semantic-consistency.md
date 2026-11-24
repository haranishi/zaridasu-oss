# REQ-275: SEO・セマンティクス整合（sitemap×noindex矛盾・canonical・h1・main入れ子）

優先度: **P1** ／ 深刻度: **High**（問題A）〜Low ／ 種別: SEO・アクセシビリティ

## 背景

### 問題A: `/privacy`・`/terms` が noindex なのに sitemap 掲載 — High
`src/app/sitemap.ts:40-41` に掲載しつつ、`privacy/page.tsx:10`・`terms/page.tsx:10` で `robots: { index:false, follow:false }`。指示が真逆で、Search Console が「送信されたURLにnoindexタグが追加されています」エラーを出す。REQ-199/228 で確立した「noindex なら sitemap から除外」原則に法務ページだけ違反。
**判断**: 利用規約・プライバシーポリシーは一般に公開・インデックス可能であるべき正当ページ（サイトの信頼性シグナル）。**noindex 側を撤去**して sitemap 掲載を維持する。

### 問題B: `/requests` に canonical が無い — Medium
`src/app/requests/page.tsx:3-7`。index対象・sitemap掲載なのに自己参照 canonical 無し（他の一覧ページは全て有り）。絞り込みクエリURLの重複インデックスリスク。openGraph.url も親の `/` を継承。

### 問題C: 見出し階層の欠落 — Medium
- ホーム `/`（`src/views/HomePage.tsx`）: h1 皆無（Headerにも無し）。最重要URL（priority 1.0）なのに主題見出しが無い。
- `/ranking`（`src/views/RankingPage.tsx`）: h1〜h6 が0個。タイトルは `<p class="font-bold">`。
- `/trends`（`src/views/TrendsPage.tsx:61,69,104,135`）: h1 無しで h2 始まり。

### 問題D: `/dataset` が `<main>` 二重入れ子 — Medium
`src/components/layout/RootMain.tsx:24-28` の除外リストが `/lp` のみ。`/dataset` は自前の `<header>/<main>/<Footer>` を持つフルページ（`dataset/page.tsx:117,128,283`）のため、`<main>` 入れ子＋内側 header/footer の banner/contentinfo ロール喪失が発生（RootMain のコメントが /lp で警告するのと同一問題）。

### 問題E（Low まとめ）
- robots.ts が `/api/` を disallow していない（`src/app/robots.ts:12`。`/api/og` は画像なので許可のまま）
- OG画像に `alt` 未指定（`layout.tsx:30,36` ほか。`lp/page.tsx:30` のみ有り）
- 404ページの `<title>` がルート既定のまま（`app/not-found.tsx` にmetadata無し）
- `/u/unsubscribe` が noindex なのに canonical 自己指定（不要・無害）

## 機能要件

- **FR-275-01**: `/privacy`・`/terms` の `robots: { index:false, follow:false }` を撤去し、インデックス可能にする（sitemap 掲載は維持）。
- **FR-275-02**: `/requests` に `alternates.canonical: '/requests'` と `openGraph.url` を追加する。
- **FR-275-03**: RankingPage・TrendsPage に `<h1>` を1つ置き、既存見出しを配下に整理する。ホームは SSR で出力される `<h1>`（視覚上は sr-only 可）＋短い紹介文を追加する。
- **FR-275-04**: RootMain の自己完結ルート判定に `/dataset` を追加し、`/dataset` 側の `<main>` に `id="main-content"`（スキップリンク先）を付ける。
- **FR-275-05**: robots.ts の disallow に `/api/` を追加し、`/api/og` は allow で除外する。
- **FR-275-06**: ルート・post・area・species・request の OG images に `alt` を追加する。
- **FR-275-07**: 404 の `<title>` を「ページが見つかりません | ザリダス」にする（not-found をサーバーコンポーネント化して metadata export）。

## 受入基準

- **AC-01**: `/privacy`・`/terms` のレンダリング結果に noindex メタが無く、sitemap.xml に両URLが残る。
- **AC-02**: `/requests` のheadに自己参照 canonical が出る。
- **AC-03**: ホーム・ランキング・トレンドのDOMに h1 がちょうど1個ずつ存在する。
- **AC-04**: `/dataset` のDOMで main が1個・トップレベルに header/main/footer が並ぶ。
- **AC-05**: `lint`（jsx-a11y含む）/ `type-check` / 既存テスト / `next build` パス。

## 対象外

- hreflang・言語別URL設計（REQ-277 の Phase 2 検討事項）。
- 動的OG画像の配線（REQ-276）。
