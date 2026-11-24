## 背景

ザリダス（秋田県の外来生物=アメリカザリガニ/ウシガエル の市民科学情報マップ。Next.js 15 App Router + Supabase SSR、i18n ja/en/ko/zh）は、検索・AI 検索からの流入を意図して JSON-LD 構造化データを各ページに出力している。共通シリアライザ `safeJsonLd()`（`src/lib/seo.ts:15-17`、`</script>` 注入対策＝REQ-005）を通じて以下を埋め込み済み：

- `src/app/layout.tsx:83-128`（`@graph` に `WebSite`＋`SearchAction`、`Organization`、`WebApplication`）
- `src/app/about/page.tsx:21-32`（`FAQPage`、ja 静的辞書から SSG 出力＝REQ-141）
- `src/app/lp/page.tsx:53-77`（`WebPage`＋`FAQPage`）
- `src/app/area/page.tsx:31-41`（`BreadcrumbList`）
- `src/app/area/[municipality]/page.tsx:95-116`（**`Dataset`**）＋ `:118-126`（`BreadcrumbList`）
- `src/app/post/[id]/page.tsx:105-113` が `generatePostSEO()`（`src/lib/seo.ts:50-94`）の `Report`＋`Place`/`GeoCoordinates`＋`BreadcrumbList` を SSR 出力。クライアント側は `src/hooks/useDetailSEO.ts:95-131` が同等の `Report` を生成。

本 REQ の下敷きは Obsidian ノート：
- `02_notes/SEO実務ガイド/02_オンページ・テクニカルSEO.md`（構造化データ＝schema.org / JSON-LD の実装、エンティティの明示）
- `02_notes/SEO実務ガイド/04_AI検索時代とローカルSEO.md`（AI 検索＝AI Overviews / Perplexity 等に引用されるための「事実の明示・出典になりやすい構造化」、エンティティとして認識させる重要性）
- `02_notes/公開API一覧/39_Science & Math.md`（**GBIF** Species / Occurrence API、**ITIS** 分類学 API。学名・分類階層・タクソン ID の権威ソース）
- `02_notes/公開API一覧/32_Open Data.md`（**Wikidata** ＝エンティティ URI（Q番号）と `sameAs` 連携先）

### この REQ が解こうとしている「機会」

1. **`Dataset` 型は既に存在するが最小限**で、Google Dataset Search / AI 検索が「データセットとして」引用するうえで価値の高いプロパティ（`temporalCoverage`・`variableMeasured`・`distribution`・`about`＋学名・`license`・`creativeWorkStatus`）が**未記載**。市民科学データは Dataset 構造化と相性が良く、地域 × 外来種という切り口は競合が薄い（`04_AI検索時代とローカルSEO.md`）。
2. **学名（`Procambarus clarkii` / `Lithobates catesbeianus`）と分類階層・Wikidata/GBIF への `sameAs` が JSON-LD に一切無い**。学名を併記し権威 URI に紐付けると、検索エンジン/LLM が当該種を**エンティティ**として認識し、AI 引用・関連検索（同義の和名/英名/学名クエリ）に乗りやすくなる（`02/04` SEO ノート）。
3. しかし**学名はコード内で重複・分散して保持**されており、構造化データの単一の出どころが無い（→「現状の問題」）。
