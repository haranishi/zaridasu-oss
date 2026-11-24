## 現状の問題

（ファイルパス:行番号つき）

### 1. `Dataset` JSON-LD が最小限で、引用価値の高いプロパティが未記載

`src/app/area/[municipality]/page.tsx:95-116` の `Dataset` は以下のみを持つ：`name`・`description`・`url`・`spatialCoverage`（`Place`＋`GeoCoordinates`、`:101-109`）・`publisher`（`Organization`、`:110-114`）・`keywords`（`:115`）。一方、同じハンドラ内で**集計値を計算しているのに Dataset には反映していない**：

- `speciesCounts` / `infoTypeCounts`（`src/app/area/[municipality]/page.tsx:77-82`）= 種別・情報種別ごとの件数（画面側 `AreaPageClient.tsx:107-160` で実際に表示している）。
- 総報告件数 `count`（`:30-34`、head-count、`generateMetadata` の description に「現在◯件」と表示済み＝`:37-40`）。

これらは Dataset の `variableMeasured`（測定変数）や説明に使える「**画面に表示している集計値**」だが、現状 JSON-LD には載っていない。あわせて以下が未記載（リポジトリ全体で当該プロパティはゼロ件＝`grep -rni "temporalCoverage\|variableMeasured\|creativeWorkStatus\|isAccessibleForFree\|license\|distribution\|DataDownload" src` がヒットなし）：

- `temporalCoverage`（観測期間）— 投稿の `created_at` 範囲から導出可能だが未指定。
- `distribution`（`DataDownload`＝CSV/GeoJSON 等の配布物 URL）— 未指定。**実体（配布ファイル/エンドポイント）も未実装**（`grep -rni "geojson\|text/csv\|DataDownload\|export"` で配布用 route 該当なし）。
- `about`（対象種＝学名つきの `Thing`/`Taxon`）・`license`・`isAccessibleForFree`・`creativeWorkStatus`（暫定データである旨）・`creator`/`maintainer`。

> 注: `Dataset` は「実在し参照可能なデータの集合」を表す型である。**この自治体ページが実際に提示している集計（種別件数・情報種別件数・総数・期間・座標点）の範囲でのみマークアップする**こと（捏造しない・ポリシー遵守）。配布ファイルがまだ無い段階で実在しない `distribution` URL を書くと 404 を指し示す不正な Dataset になるため、`distribution` は実体が用意できるまで**出力しない**（FR-229-04 / REQ-230 連携）。

### 2. 学名・分類・権威 URI（`sameAs`）が JSON-LD に存在しない

種を指す構造化データは「和名ラベルのみ」または「和名＋（学名）を文字列連結した description」止まりで、`sameAs`（Wikidata/GBIF）も `Taxon` 的な分類情報も無い：

- `src/app/area/[municipality]/page.tsx` の `Dataset` には `about`（対象種）プロパティ自体が無い。種名は `keywords` 文字列（`:115`）に和名で含まれるのみ。
- `src/lib/seo.ts:68-71`（SSR の `Report.about`）は `{ '@type': 'Thing', name: speciesLabel }` で**和名のみ**。`sameAs`/学名なし。
- `src/hooks/useDetailSEO.ts:104-110`（クライアントの `Report.about`）は `description` に「和名（学名）」を入れる（`:107-109`）が、`name` は和名のみ・`sameAs` 無し・`@type` は汎用 `Thing`。

学名・分類・`sameAs` が無いため、検索エンジン/LLM が「アメリカザリガニ」「American crayfish」「Procambarus clarkii」を**同一エンティティ**として束ねる手がかりが構造化データから得られない（`02_オンページ・テクニカルSEO.md`／`04_AI検索時代とローカルSEO.md` のエンティティ確立の指摘）。

### 3. 学名がコード内で重複・分散しており、構造化データの単一の出どころが無い

学名は複数箇所にハードコードされ、`src/lib/constants.ts` の種マスタ（`SPECIES`、`:77-80`）には**存在しない**：

- `src/views/AboutPage.tsx:23` `scientific: 'Procambarus clarkii'` / `:32` `'Lithobates catesbeianus'`（図鑑表示 `:111` でイタリック表示）。
- `src/hooks/useDetailSEO.ts:20`（`SpeciesEntry.scientific?`）・`:107-108` で `(species as SpeciesEntry & { scientific?: string })` の重ねキャストにより参照（※この二段キャスト自体は REQ-209 `docs/requirements/REQ-209-code-quality-cleanup.md:24` が型整理対象として既出）。
- i18n 辞書（`src/locales/ja/translation.json:489,491` ほか ko/en/zh の同行）でも FAQ 本文に学名が登場。

`SPECIES`（`src/lib/constants.ts:77-80`）は `value/label/color/image/emoji` のみで学名・分類・`sameAs` の口座が無いため、構造化データ用の学名・Wikidata/GBIF URI を**一元的に**持てない。各所が個別に学名文字列を持つと、Dataset・Report・図鑑の三者で記述がズレるリスクがある。

> 補足: `docs/archive/planning/requirements-seo.md:245-275` に旧 Vite 時代の「構造化データ強化（Organization の `sameAs: []`）」計画が残るが、これは `import.meta.env` 前提の旧 SPA 設計（現行は App Router）なので**設計参考にとどめ、現行コードの根拠としては扱わない**。
