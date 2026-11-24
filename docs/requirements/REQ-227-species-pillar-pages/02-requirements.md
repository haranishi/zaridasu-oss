## 要件

### 機能要件

- [ ] FR-227-01: **種別ピラーページのルートを新設する。** `src/app/species/[species]/page.tsx` を Server Component として作成し、`generateStaticParams()` で `SPECIES`（`src/lib/constants.ts:77-80`）から `american` / `bullfrog` の 2 パスを静的生成する（`src/app/area/[municipality]/page.tsx:12-14` の `MUNICIPALITY_DATA.map(...)` と同形）。`params.species` が `SPECIES` の `value` に一致しない場合は `notFound()`（`area` ページ:64 と同じ防御）。再生成は地域ページに合わせ `export const revalidate = 86400`（日次。`area` ページ:19 / `sitemap.ts:6` と整合）。種ラベル・色・画像・絵文字は `SPECIES` から引く（`speciesLabel()` 等の既存ヘルパ＝`constants.ts:252` も利用可）。

- [ ] FR-227-02: **1 ページ 1 メインキーワードで `generateMetadata` を実装する。** `src/app/area/[municipality]/page.tsx:21-59` を範として、種ごとに以下を返す：
  - `title`: 種名を主役にした文字列（root template `'%s | ザリダス'`〔`src/app/layout.tsx`、REQ-199 背景参照〕で `| ザリダス` が後置される前提。二重ブランドにしない）。例: `アメリカザリガニとは｜秋田での目撃・見分け方・駆除と法律`。メインキーワードを 1 つに保ち、種をまたがない。
  - `description`: 種の特徴＋秋田での観察状況＋法的扱いを 120 字程度で要約（`species_info.desc` / `law_info` を素材に）。コピーは LP ブランディング方針（大学名・卒研の語を使わない／「秋田の市民が集めた観察データ」等）に従う。
  - `alternates.canonical: \`/species/${species}\``（`area`:45 と同形）。
  - `openGraph`（`type: 'website'`、`url`、`images: [{ url: '/og-image.png', width: 1200, height: 630 }]`）と `twitter`（`summary_large_image`）。OG 画像は当面 `/og-image.png` を流用（種別 OG 画像の自動生成は REQ-225 ブランド資産/REQ-181 等の範囲とし本 REQ では必須化しない＝推測で枠だけ用意）。
  description 用に「その種の承認済み投稿件数」を出す場合は、`area` ページ:30-34 と同じ **head-count クエリ**（`select('id', { count: 'exact', head: true }).eq('status','approved').eq('species', value)`）でデータ転送ゼロに抑える。

- [ ] FR-227-03: **ピラー本文を「既存 i18n の種テキスト再利用＋拡充」で構成する。** 最低限、次のセクションを持つ（1 ページに種の情報を集約＝ピラーの網羅性）：
  - **見出し階層**: `<h1>` に種名（1 ページ 1 個）。配下に `<h2>`（「どんな生き物？」「見分け方」「なぜ問題か（生態系・農業被害）」「法律上の扱い・やってはいけないこと」「秋田での観察状況」「観察したら投稿しよう」等）。`area` ページの見出し運用（`AreaPageClient` の h1/h2、`grep` で確認）に倣う。
  - **再利用するテキスト**: `species_info.{species}.status` / `.desc`（`translation.json:497-506`）、`law_info.{species}`（:507-524、禁止事項・罰則・環境省リンク）、学名（FAQ :488-491 の `Procambarus clarkii` / `Lithobates catesbeianus`）。**新規ライティングは最小限**にし、既存辞書を正本として参照する。`/about` が静的辞書から JSON-LD を組む手法（`src/app/about/page.tsx:19,33-44`）と同様に、SSR 時点で日本語テキストを確実に出力する。
  - **「秋田での観察状況」**: その種の承認済み投稿の件数や直近の報告を軽く提示してよい（地域ページ:68-82 のクエリパターンを流用）。ただし本 REQ の主目的は地図機能ではなくテキスト権威ページなので、地図埋め込みは任意（推測: 軽量なリンク誘導で十分）。
  - コピー全体で大学名・卒研の語を使わず、「秋田の市民が集めた観察データ」「みんなの目撃情報」等の表現に統一する（memory: LP branding policy）。

- [ ] FR-227-04: **内部リンク（クラスター→ピラー、ピラー→関連）を張る。**
  - **ピラー → 地域**: 種ページから、その種の報告がある主要自治体（または `MUNICIPALITY_DATA` の代表）へ `/area/{slug}` リンクを並べ、地域ページへ送る。
  - **ピラー → 投稿**: 種ページに「その種の最新の報告」数件を `/post/{id}` でリンク（地域ページの投稿一覧リンク=`AreaPageClient` :180-219 のパターン）。
  - **地域 → ピラー**: `src/app/area/[municipality]/AreaPageClient.tsx` の種別カウント表示（:107-122）に、各種ラベルから `/species/{value}` へのリンクを追加し、地域ページ（クラスター的役割）からピラーへ集約する。
  - **投稿詳細 → ピラー**: `src/app/post/[id]/` の詳細表示で種ラベルから `/species/{species}` へリンクする（実装箇所は DetailPageClient 側。種ラベルは `generatePostSEO`〔`seo.ts:33,94`〕が解決済み）。
  - 各リンクは将来の REQ-228（種×地域クラスター）でも再利用できるよう、URL 生成を 1 か所（例: ヘルパ or 定数）に寄せることを検討する。

- [ ] FR-227-05: **sitemap に種別 URL を追加する。** `src/app/sitemap.ts` に、`areaPages`（:39-43）と同形で `SPECIES.map((s) => ({ url: \`${BASE_URL}/species/${s.value}\`, changeFrequency: 'weekly', priority: 0.7 }))` を生成し、戻り値配列（:91）へ含める。優先度は地域ページ（0.6）以上・トップ（1.0）未満を目安に、ピラーとしての重要度を反映（推測: 0.7 程度）。`SPECIES` は `src/lib/constants.ts` からインポート（`sitemap.ts:3` は既に `constants` から import 済み）。

- [ ] FR-227-06: **種ページ用の最小 JSON-LD を `src/lib/seo.ts` に追加する。** 投稿用 `generatePostSEO`（:22-95）と並ぶ形で、種を主題にした `BreadcrumbList`（ホーム → 種別〔または about〕→ 当該種）と、種を指す軽量な構造化データ（`@type: 'Thing'`／必要なら `Article` か `WebPage` の `about`）を返すヘルパを新設し、`page.tsx` から `safeJsonLd`（`seo.ts:15`）で出力する。**`Dataset` 化・学名 `sameAs`（Wikidata 等）・`taxon`/学名エンティティ連携は本 REQ では実装せず、REQ-229 に委ねる**（ここでは「種を主題化した最小限のパンくず＋about」までに留め、重複と過剰実装を避ける）。

- [ ] FR-227-07: **i18n の整合を保つ。** 種ページの新規見出し・導入文を追加する場合は、`src/locales/{ja,en,ko,zh}/translation.json` の 4 言語すべてに対応キーを追加する（プロジェクトの i18n 方針）。ただし FAQ JSON-LD と同様、**SEO 用 SSR テキストは日本語（ja 辞書）を正本**として出力してよい（`src/app/about/page.tsx:19` の注記と同方針）。既存の `species_info` / `law_info` は ja に存在するため、他言語が未整備な場合は ja フォールバックの挙動を壊さないこと（推測: 既存実装の i18n フォールバックに準拠）。

### 非機能要件（該当する場合のみ）

- [ ] NFR-227-01: **静的生成・キャッシュ整合。** 種ページは `generateStaticParams` による 2 パスの静的生成＋`revalidate = 86400`（日次 ISR）で、Vercel 関数実行と Supabase 読み取りを抑える（`area`:19 / `sitemap.ts:6` と同水準）。件数表示を入れる場合も head-count クエリ（転送ゼロ）に限定し、1 ページあたりのクエリ本数を最小化する。

- [ ] NFR-227-02: **既存パターンの踏襲（DRY）。** 新規ファイルは `area` ページ・`generatePostSEO`・`sitemap.ts` の既存実装に構造を合わせ、独自パターンを増やさない。JSON-LD は必ず `safeJsonLd`（`seo.ts:15`、`</script>` 注入対策）でシリアライズする。URL 生成・種解決は `SPECIES` / `speciesLabel`（`constants.ts:77-80,252`）を単一の真実とする。

- [ ] NFR-227-03: **アクセシビリティ／見出し構造。** `<h1>` はページに 1 つ（種名）。見出しは階層を飛ばさない（h1→h2→h3）。本文は装飾画像に頼らずテキストで意味が通ること（既存 a11y REQ 群と整合）。

- [ ] NFR-227-04: **ブランドガバナンス。** 本文・メタ description・OG テキストに「大学名」「卒業研究」「卒研」を含めない（memory: LP branding policy、`docs/lp-copy.md` のトーンに合わせる）。違反語の混入が無いことをレビューで確認する。

- [ ] NFR-227-05: **将来拡張への前方互換。** URL は `/species/[species]` を正とし、REQ-228（種×地域）が `/species/[species]/area/[municipality]` 等で拡張できる構造を壊さない。種別 OG 画像（REQ-181/REQ-225 系）・Dataset/学名構造化（REQ-229）を後から差し込める余地を残す（メタ生成・JSON-LD 生成を関数化）。
