# REQ-054: Server Components（area / post / sitemap）の自動テスト追加

## これは何か

`generateMetadata` と RSC 本体、そして `sitemap.ts` に対する integration テストを新設する要件定義。SEO と 404 運用の要でありながら、現状これらには**テストが一切存在しない**。本文は下記の部品ファイルに逐語のまま分割してある。

## 目的・背景の要約

Next.js 15 App Router の Server Component は、`generateMetadata` と default export の両方で Supabase からデータを取得し、未知パラメータでは `notFound()` を呼び、sitemap では数百〜1000件規模の URL を生成する。対象は `area/[municipality]/page.tsx`・`area/page.tsx`・`post/[id]/page.tsx`・`sitemap.ts` の4ファイル。

`src/app/` 配下に `__tests__/` が存在しないことを Glob で確認済みで、`notFound()` 呼び出しの削除・canonical URL の変更・sitemap の列選択破壊・DB 失敗時の全面エラー化のいずれも CI で検出できない。

## 主要な決定事項の要点

- **RSC はサーバ関数として直接呼ぶ。** `await Component({ params })` と `await generateMetadata({ params })` を呼ぶ integration テストとし、レンダラを通さない。
- **不変条件を6つ立てる。** INV-01 未知 slug で `notFound()`、INV-02 canonical と `openGraph.url` が `/area/{slug}`、INV-03 **未知 id でも RSC は `DetailPageClient` を render する（後方互換）**が metadata は「投稿が見つかりません」を返す、INV-04 `generatePostSEO` の反映と OG 画像のフォールバック、INV-05 sitemap が static 7 + area 25 + posts を全て含む、INV-06 **posts クエリが失敗しても static + area の最低32件は返る（部分劣化）**。
- **`notFound()` は throw するモックにする**（`vitest.setup.ts` の既存定義を上書き）ことで呼び出しを検証可能にする。クライアントコンポーネントは `vi.mock` でダミー化し props を検証する。
- **supabase の fluent builder は共通ヘルパーに切り出す**（`src/test-utils/mockSupabaseServer.ts` を新規作成し、select/eq/order/limit/single/head を chain モック化）。
- **ネガティブ検証を受入条件に含める。** `if (!muni) notFound()` の削除・`.select('id, updated_at')` の列削減・post の早期 return 削除で、それぞれ対応するテストが落ちることを確認する。
- **カバレッジ目標は4ファイル合算で branch ≥ 80% / line ≥ 85%**、加えて `notFound()` 分岐・`post == null` 分岐・supabase エラー分岐の3箇所は必ず実行する。
- **緊急度・重要度とも High**。退行は Google Search Console 上に canonical 重複・404 消失として即座に現れ、sitemap の列選択破壊は過去に類似事例（REQ-043）がある。

## 各部品

| ファイル | 内容 |
|---|---|
| [01-background-and-invariants.md](REQ-054-test-rsc-metadata/01-background-and-invariants.md) | 背景と対象4ファイル（行番号つき）、守りたい不変条件 INV-01〜06、現状の検出可否 |
| [02-test-environment-and-cases.md](REQ-054-test-rsc-metadata/02-test-environment-and-cases.md) | テスト種別・フレームワーク・モックのセットアップ・配置先と、テストケース TC-01〜06（Given/When/Then） |
| [03-coverage-acceptance-and-impact.md](REQ-054-test-rsc-metadata/03-coverage-acceptance-and-impact.md) | カバレッジ目標、テストデータ/フィクスチャ、受入条件 AC-01〜03（ネガティブ検証を含む）、影響範囲、優先度 |
