## 背景

ザリダス（秋田県の外来生物=アメリカザリガニ/ウシガエルの市民科学情報マップ）は Next.js 15 App Router + Supabase SSR + Vercel + TypeScript の構成で、公開動的ページは現状 `/area/[municipality]`（地域ランディング・24 自治体ぶん）と `/post/[id]`（投稿詳細）の 2 系統しかない。対象種は `american`（アメリカザリガニ）/ `bullfrog`（ウシガエル）の 2 種で、`src/lib/constants.ts:77-80` の `SPECIES` 配列にラベル・色・画像・絵文字が定義されている。

検索流入の観点で見ると、現状サイトには **「種そのものを軸にしたページ」が存在しない**。`/area/akita-shi` のような地域ページや `/post/{id}` の個別報告ページはあるが、「アメリカザリガニ 見分け方」「アメリカザリガニ 駆除」「ウシガエル 鳴き声」「ウシガエル 秋田」といった、種に紐づく **情報収集型（informational）のロングテール需要**を受け止める受け皿がゼロである。これらは検索ボリュームが安定して存在し、かつ既存の地域/投稿ページとはユーザー意図が異なる（「いま秋田のどこに出たか」ではなく「この生き物は何で、何が問題で、どうすればいいか」）。

Obsidian の SEO 実務ガイド `02_notes/SEO実務ガイド/01_SEO基礎とキーワード戦略.md`・`02_オンページ・テクニカルSEO.md`（参照: SEO 実務ガイド一式）が説く **トピッククラスター／ピラーページ戦略**を、ザリダスのドメイン（外来種 2 種 × 秋田 24 自治体）に当てはめると役割分担は次のようになる：

- **ピラーページ（本 REQ-227）＝ 種別ページ `/species/[species]`**：1 種を網羅的に解説する権威ページ。1 ページ 1 メインキーワード（例: アメリカザリガニ＝「アメリカザリガニ 秋田」「アメリカザリガニ 見分け方／駆除」）。クラスター群をまとめるハブとして内部リンクの起点になる。
- **クラスターページ（別 REQ-228）＝ 種 × 地域 `/species/[species]/area/[municipality]`（または等価な組み合わせ URL）**：種別ピラー配下に、種×自治体の組み合わせ（最大 2×24=48）を programmatic に量産し、ピラーへ内部リンクを集約する。**本 REQ では作らない**（背景でのみ役割を明示し、URL 設計の前提だけ揃える）。
- **構造化データ（Dataset / 学名エンティティ）の拡充は別 REQ-229**：種別ページに付与する JSON-LD のうち、観測データを `Dataset` として記述する／学名（`Procambarus clarkii`・`Lithobates catesbeianus`）を `sameAs` で Wikidata 等の正規エンティティに結びつける高度化は REQ-229 に委ねる。**本 REQ は最低限の `BreadcrumbList`＋`about`（種を指す `Thing`）程度に留める**（重複回避。詳細は「影響範囲」「優先度」）。

既存の SEO 系 REQ との非重複は次のとおり。REQ-027（投稿の動的メタデータ）・REQ-199（タイトル二重ブランドや sitemap 整合などの小粒修正、`docs/requirements/REQ-199-seo-metadata-small-fixes.md` 確認済み）・REQ-177（sitemap/robots 整理）はいずれも「既存ページのメタ/配信の是正」であって、**新しいページ群の新設ではない**。本 REQ-227 は「種別ピラーという新規ページタイプを 0→1 で立ち上げる」要件であり、それらと守備範囲が重ならない。

なお、ピラーページのコピーは memory の LP ブランディング方針に従い、**「大学名」「卒業研究」「卒研」といった語を本文に出さない**。「秋田の市民が集めた観察データ」「みんなで集めた目撃情報」のような、やさしくベネジット主導の言い回しに統一する（確定 LP コピーは `docs/lp-copy.md`）。

幸い、種ごとの説明テキストは既に i18n 辞書に存在し再利用できる：

- `src/locales/ja/translation.json:497-506` の `species_info`（種ごとの `status`〔条件付特定外来生物/特定外来生物〕と `desc`〔形態・生息・被害・指定年〕）
- 同 `:507-524` の `law_info`（外来生物法上の扱い・禁止事項・環境省リンク）
- 同 `:488-491`（FAQ 内の学名つき説明＝`Procambarus clarkii` / `Lithobates catesbeianus`）

このため、本 REQ は「既存の良質な種テキストを、独立した SEO ランディングとして再編・拡充し、種別 URL で公開する」という性格が強く、ゼロからのライティングコストは小さい。

## 現状の問題
（ファイルパス:行番号つき）

### 1. 種別ページ（ピラー）が物理的に存在しない
`src/app/` 配下のルート一覧は `(home) / about / admin / api / area / auth / dashboard / lp / post / privacy / profile / ranking / request / requests / terms / trends` で、**`species` ディレクトリは無い**（`find src/app -type d -name "species"` がヒットなし）。動的公開ページは `src/app/area/[municipality]/page.tsx` と `src/app/post/[id]/page.tsx` のみ。種を軸にしたランディングが 1 枚も無いため、種名ロングテール（informational）の受け皿が存在しない。

### 2. 種を解説する良質テキストが「種別ページ以外」に散在し、SEO 資産化されていない
種ごとの解説は実装済みだが、すべて `/about`（使い方・図鑑・法律をまとめた 1 ページ）か投稿詳細の文脈に埋もれており、**種単独の正規 URL を持たない**：
- `src/locales/ja/translation.json:497-506` `species_info.american/bullfrog`（`status`＋`desc`）
- `src/locales/ja/translation.json:507-524` `law_info`（禁止事項・罰則・環境省リンク）
- `src/locales/ja/translation.json:488-491` 学名つき FAQ（`Procambarus clarkii` / `Lithobates catesbeianus`）

`src/app/about/page.tsx:8-12` の `/about` は単一 canonical（`alternates: { canonical: '/about' }`）で、2 種をまとめて扱う。結果として「アメリカザリガニ」「ウシガエル」それぞれの検索意図に対し、Google に提示できる**専用ページが無い**（about 1 枚に 2 種が混在＝メインキーワードが分散）。

### 3. 内部リンク構造に「種ハブ」が無い（クラスター集約先が不在）
`/species/*` への内部リンクはコード全体で **0 件**（`grep -rn "/species" src/` ヒットなし）。一方、地域ページ `src/app/area/[municipality]/AreaPageClient.tsx` は種別カウント（`speciesCounts`、:107-122）を表示しているのに、その種をクリックして「その種の解説ハブ」へ飛ぶ導線が無い。投稿詳細 `src/app/post/[id]/page.tsx` も `generatePostSEO`（`src/lib/seo.ts:33` で `species` を解決）で種ラベルを使うが、種ページへリンクしていない。トピッククラスターでいう「クラスター→ピラー」「関連ページ→ピラー」のリンク集約先（ピラー）が存在しないため、内部リンクのオーソリティが種テーマに集まらない。

### 4. sitemap に種別 URL の枠が無い
`src/app/sitemap.ts:26-36` の `staticPages` と `:39-43` の `areaPages`（`MUNICIPALITY_DATA` 由来 24 件）には種別ページが含まれない。種別ページを作っても sitemap に載らなければクロール発見が遅れる。`areaPages` が `MUNICIPALITY_DATA.map(...)` で生成されているのと同様に、`SPECIES.map(...)` で種別 URL を生成する枠が必要だが未整備。

### 5. JSON-LD ヘルパに「種ページ用」の生成関数が無い
`src/lib/seo.ts` には投稿用の `generatePostSEO`（:22-95）はあるが、**種を主題にしたページ用の JSON-LD 生成（`BreadcrumbList`＋種の `about`/`mainEntity`）が無い**。地域ページ `src/app/area/[municipality]/page.tsx:95-126` は `Dataset`＋`BreadcrumbList` をインラインで組み立てており、種ページでも同様の構造が要るが、再利用できる関数が用意されていない（地域ページのパターンを踏襲して新設する余地）。
