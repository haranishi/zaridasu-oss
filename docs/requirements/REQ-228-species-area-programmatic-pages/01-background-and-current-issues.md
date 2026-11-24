## 背景

ザリダス（秋田県の外来生物＝アメリカザリガニ／ウシガエルの市民科学情報マップ、卒研 PF）は Next.js 15 App Router + Supabase SSR + Vercel、i18n（ja/en/ko/zh）の構成で、すでに地域別ランディングページ `/area/[municipality]` を 24 市町村分（`MUNICIPALITY_DATA`＝`src/lib/constants.ts:113-139`、24 件）静的生成している。しかしこの地域ページは「秋田市の外来生物情報（2 種まとめて）」という粒度で、**対象種 2 種（`american`/`bullfrog`＝`src/lib/constants.ts:77-80`）での分岐が無い**。つまり「秋田市 アメリカザリガニ」「能代市 ウシガエル」のような **種×地域の複合クエリ**に対して 1:1 で対応するページが存在しない。

検索流入の観点では、こうした複合クエリは典型的なロングテールであり、「1 ページ＝1 主要キーワード（検索意図）」で面（マトリクス）として刈り取るのが定石である。Obsidian の SEO 実務ガイド `02_notes/SEO実務ガイド/01_SEO基礎とキーワード戦略.md`（「Step 4. ロングテール戦略」`:124-127`、「検索意図の 4 分類」`:81-` ほか）は、ロングテール＝検索量は少ないが具体的な複合語であり、新規サイトはロングテールで実績を作り徐々にビッグワードへ向かう、と整理している。地域 × 種の組み合わせ（2 種 × 24 市町村＝48 通り）は、ザリダスにとってまさにこのロングテールの「面」に相当する。

加えて `02_notes/SEO実務ガイド/04_AI検索時代とローカルSEO.md` は、AI 検索が裏で関連クエリを同時生成する **クエリ・ファンアウト**（`:96`「AI は関連クエリを裏で同時生成。トピッククラスタ全体で派生クエリを網羅」、`:175`「トピッククラスタで派生クエリ（ファンアウト）を網羅」）への対応を求めている。「秋田市の外来生物」という親クエリの背後には「秋田市 アメリカザリガニ」「秋田市 ザリガニ 駆除」等の派生クエリが想定され、種×地域ページはこのファンアウトの受け皿になる。

ただし同ガイドは強い注意も与えている（`04_…:92`）：**「AI 専用に別コンテンツを書く／ページを細切れにする行為は scaled content abuse スパムに抵触しうる」**、`:133` でも March 2024 Core Update で「スケール濫用」がスパムポリシーに明記されたことに触れている。すなわち**中身の薄いページを機械的に量産すると逆効果（スパム判定・サイト全体の評価低下）になる**。本 REQ は「48 ページを programmatic に生成する」ことが目的ではなく、「**投稿実データが存在する種×地域だけを価値あるページとして公開し、データの無い組み合わせは noindex／親へ canonical で隔離する**」という品質ガード込みの設計を行う点に主眼を置く。

なお `/area/[municipality]`（`src/app/area/[municipality]/page.tsx`）の現行実装は維持し、その**下層**として種で分岐する階層（`/area/[municipality]/[species]`）を追加する。地域ページの実装パターン（`generateStaticParams`／`generateMetadata`／head-count による件数取得／`alternates.canonical`／JSON-LD Dataset・BreadcrumbList）を踏襲し、種で 1 段ぶん絞り込む。

## 現状の問題
（ファイルパス:行番号つき）

### 1. 種×地域の複合クエリに対応する URL が存在しない（ロングテールの取りこぼし）
- `src/app/area/[municipality]/page.tsx:12-14` の `generateStaticParams` は `MUNICIPALITY_DATA.map((m) => ({ municipality: m.slug }))` で、生成されるのは市町村 24 ページのみ。種のパラメータは無い。
- 同ページのデータ取得（`page.tsx:68-74`）は `eq('status','approved').eq('municipality', muni.name)` で**種で絞っていない**。種別件数はクライアントへ渡す `speciesCounts`（`page.tsx:77-82`）として集計するだけで、種単位の独立ページにはなっていない。
- 結果、「秋田市 アメリカザリガニ」のような検索意図に 1:1 で応える URL（と title/description/見出し/JSON-LD）が無く、ロングテール（`01_SEO基礎とキーワード戦略.md:124-127`）を面で取れていない。

### 2. サイトマップに種×地域 URL が無い
- `src/app/sitemap.ts:38-43` の `areaPages` は `MUNICIPALITY_DATA.map((m) => ({ url: \`${BASE_URL}/area/${m.slug}\`, ... }))` で市町村 24 件のみ。種×地域の `/area/{slug}/{species}` は 1 件も送信していない。
- サイトマップは URL 発見の主要 3 経路の 1 つ（`01_SEO基礎とキーワード戦略.md:42`「送信された XML サイトマップ」）であり、種×地域ページを作ってもサイトマップに載せなければ発見が遅れる。

### 3. 空の組み合わせを量産するとスパム（scaled content abuse）になる土台がある
- 2 種 × 24 市町村＝**48 通り**だが、卒研 PF の現時点では投稿が 0 件の組み合わせ（例：過疎地域 × ウシガエル）が多数想定される。投稿 0 件のページは「件数 0・地図に点なし・本文ほぼテンプレ」の薄いページになり、機械的に 48 件を index 投入すると `04_AI検索時代とローカルSEO.md:92`／`:133` の **scaled content abuse（スケール濫用）** に抵触するリスクがある。
- しかし**現状は種×地域ページ自体が無いため、空ページ判定・noindex・canonical の運用方針も存在しない**（=実装すると同時に品質ガードを設計する必要がある）。

### 4. 既存の noindex / canonical の付け方は整っているが、種×地域用の分岐ロジックが無い
- robots noindex の指定方法は確立済み：`src/app/profile/[userId]/page.tsx:37` が `robots: { index: false }` を返す前例がある（`generateMetadata` 内で条件なしに固定 noindex）。
- canonical の指定方法も確立済み：地域ページ `src/app/area/[municipality]/page.tsx:45` が `alternates: { canonical: \`/area/${slug}\` }` を返している。
- すなわち「件数に応じて canonical を親へ向ける／robots を noindex にする」**条件分岐つきの `generateMetadata`** を書くための部品は揃っているが、種×地域でそれを行う実装はまだ無い。
- 件数取得の軽量パターンも前例がある：`src/app/area/[municipality]/page.tsx:30-34` の head-count（`.select('id', { count: 'exact', head: true })`）。種×地域では `.eq('species', …)` を 1 つ足すだけで種別件数が取れる（データ転送ゼロで安価）。

### 5. 種ラベルの i18n / 種スラッグの正規化が未整理
- 種の値は `american`/`bullfrog`（`src/types/index.ts:13`、`src/lib/constants.ts:77-80`）で、URL スラッグとしてそのまま使える英字だが、`SPECIES` には URL 用の `slug` フィールドが無い（`value` を流用する想定／要決定）。
- 種の表示ラベルは `SPECIES[].label`（日本語固定）と `speciesLabel()`（`src/lib/constants.ts:252`）のみで、多言語ラベルは i18n 翻訳キー側にある（`src/locales/*/translation.json`）。種×地域ページの title/見出しで多言語ラベルをどう使うかは未設計。
