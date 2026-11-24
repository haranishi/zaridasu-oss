## 要件

### 機能要件

- [ ] FR-228-01: **種スラッグの定義を確定する。** `/area/[municipality]/[species]` の `[species]` に使う値を `american`/`bullfrog`（`src/lib/constants.ts:77-80` の `value`）に固定する。実装方針は (a) `SpeciesOption` に `slug` を追加せず `value` をそのまま URL スラッグとして使う、または (b) 明示の `slug` フィールドを追加する、のいずれかを選ぶ。`getSpeciesBySlug(slug)` 相当のヘルパ（`getMunicipalityBySlug`＝`src/lib/constants.ts:141-143` に倣う）を `src/lib/constants.ts` に追加し、未知のスラッグは `notFound()` で 404 にする。

- [ ] FR-228-02: **`generateStaticParams` で 48 通り（2 種 × 24 市町村）を生成する。** 新規ファイル `src/app/area/[municipality]/[species]/page.tsx` を作り、`generateStaticParams` で `MUNICIPALITY_DATA`（24 件）× `SPECIES`（2 件）の直積＝48 件の `{ municipality, species }` を返す。`revalidate` は既存地域ページと揃えて `86400`（`src/app/area/[municipality]/page.tsx:19`）にする。

- [ ] FR-228-03: **種で絞ったデータ取得＋種別件数の head-count を実装する。** 本体一覧は既存地域ページのクエリ（`src/app/area/[municipality]/page.tsx:68-74`）に `.eq('species', speciesValue)` を 1 つ足した形（`status='approved'` AND `municipality=muni.name` AND `species=…`、`order created_at desc`、`limit(50)`）。件数は head-count（`page.tsx:30-34` パターンに `.eq('species', …)` を足す）で取得し、description と空ページ判定の双方に使う。

- [ ] FR-228-04: **件数に応じて canonical / robots を出し分ける（薄いページ対策の中核）。** `generateMetadata` で head-count の結果を見て分岐する：
  - **件数 > 0（しきい値は FR-228-05 で決定）**: 自分自身を canonical にする（`alternates: { canonical: \`/area/${slug}/${species}\` }`、`src/app/area/[municipality]/page.tsx:45` と同形）。robots は index 許可（指定なし＝既定）。
  - **件数 0（または極小しきい値未満）**: `robots: { index: false }`（`src/app/profile/[userId]/page.tsx:37` と同形）を返す、**かつ** canonical を親の地域ページ `/area/${slug}` へ向ける（重複・薄さを親へ集約する）。**noindex と canonical（親向き）の両指定**で「このページは独立した index 対象ではなく、親の一部」という意図を明確化する。
  > 注: noindex と「他ページへの canonical」の併用は Google 公式には推奨されない組み合わせという議論があるため、最終的に **(i) 0 件は noindex のみ（canonical は自分）**、**(ii) 0 件は親へ 301/308 リダイレクト（ページを作らない）**、**(iii) noindex + 親 canonical** のどれを採るかは実装時に SEO 実務ガイドと整合させて 1 つに決める（推測: ザリダスの規模では「0 件は noindex のみ、十分な件数で index 解禁」が運用が単純で安全）。本 FR の必須要件は「**0 件の薄いページを index 対象にしない**」ことであり、隔離手段の選択は明記して 1 本化する。

- [ ] FR-228-05: **index 解禁のしきい値を定義する。** 「投稿 0 件」を最低ラインとしつつ、薄さ回避のため**最小件数しきい値**（例: 1 件以上で index、または品質を上げるなら 3 件以上）を定数として `src/lib/constants.ts` に置く（例: `AREA_SPECIES_INDEX_MIN_POSTS`）。しきい値未満は FR-228-04 の隔離（noindex/親 canonical）に回す。卒研 PF の初期はデータが少ないため、まずは `1` 件以上を index とし、運用で引き上げ可能にする（推測: 値は要調整）。

- [ ] FR-228-06: **title / description / 見出しを種×地域に最適化する（重複回避）。** 既存地域ページの文言（`src/app/area/[municipality]/page.tsx:36-40`）を流用しつつ種を主役にする：
  - title 例: `${muni.name}の${speciesLabel}情報`（`speciesLabel`＝`src/lib/constants.ts:252`／i18n は FR-228-10）。root template `%s | ザリダス`（`src/app/layout.tsx`、REQ-199 背景参照）が後置される前提で「ザリダス」を二重化しない。
  - description 例: `秋田県${muni.name}の${speciesLabel}の目撃・捕獲・痕跡情報。${count > 0 ? \`現在${count}件の報告があります。\` : ''}最新の出没マップと統計。`（地域ページ `:37-40` の postCountText パターンを踏襲）。
  - 同一市町村の 2 種ページ同士、および親地域ページとで title/description/H1 が**実質重複しない**こと（種名が主語として入る）。これにより「ページの細切れ＝scaled content abuse」と判定されないだけの差別化を担保する（`04_…:92`）。

- [ ] FR-228-07: **JSON-LD（Dataset + BreadcrumbList）を種×地域版にする。** 既存地域ページの JSON-LD（`src/app/area/[municipality]/page.tsx:95-126`）を流用し、`Dataset` の `name`/`description`/`keywords` に種名を含め、`BreadcrumbList` を **ホーム → 地域別(`/area`) → ${muni.name}(`/area/${slug}`) → ${speciesLabel}(`/area/${slug}/${species}`)** の 4 階層にする（現状は 3 階層）。シリアライズは `safeJsonLd`（`src/lib/seo.ts:15-17`）を使う。なお Dataset の精緻化（学名・DOI 等）は REQ-229/REQ-230 が主管のため、本 REQ では既存 Dataset 形を種で拡張する範囲に留め、深掘りはしない（相互参照）。

- [ ] FR-228-08: **親子の内部リンクを双方向に張る（クエリ・ファンアウト対応）。**
  - 子（種×地域）から親 `/area/${slug}`（地域総合）と、同一市町村の**もう一方の種**ページへのリンクを置く。
  - 親 `/area/[municipality]`（`AreaPageClient`）に、各種の `/area/${slug}/${species}` への導線を追加する（既存の `speciesCounts`〔`page.tsx:77-82`〕を使い、件数のある種だけ／件数 0 はリンクしないか弱める）。
  - これにより「地域クラスタ」の内部リンク構造を作り、ファンアウトする派生クエリ（`04_…:96,175`）をクラスタ内で受ける。リンク先は **index 対象（canonical が自分）のページのみ**にし、noindex の薄いページへ内部リンクを集中させない。

- [ ] FR-228-09: **サイトマップに種×地域 URL（index 対象のみ）を追加する。** `src/app/sitemap.ts` の `areaPages`（`:38-43`）に続けて、種×地域 URL を生成する処理を足す。ただし **canonical が自分自身であるページ（＝FR-228-05 のしきい値以上）だけ**を載せ、noindex/親 canonical の組み合わせは**除外**する。実装は、posts を `municipality, species` 別に集計（`status='approved'` の件数を group 相当で取得、または地域×種ごとに head-count）し、しきい値以上の組のみ URL 化する。サイトマップと robots/canonical の指示が矛盾しない状態（REQ-199 AC-03 と同じ原則）にする。上限管理は既存の `SITEMAP_LIMITS`／`warnIfTruncated`（`src/app/sitemap.ts:13-20`）と整合させる（48 件は小さいが、将来 種・地域増加時に備えてカテゴリ計が 50,000 を超えない設計を維持）。

- [ ] FR-228-10: **i18n を既存地域ページと同水準で提供する。** 種ラベル・見出し・パンくず文言は `src/locales/{ja,en,ko,zh}/translation.json` の翻訳キー（`speciesLabel` 相当）に揃え、メタデータ生成側でロケールに応じたラベルを使えるようにする。最低限、既存 `/area/[municipality]` が持つ i18n 水準（種名の多言語表示）を下回らないこと。種スラッグ（`american`/`bullfrog`）自体は全ロケール共通の URL とする（ロケール別 URL は作らない）。

### 非機能要件（該当する場合のみ）

- [ ] NFR-228-01: **データ取得コストを増やしすぎない。** 1 ページあたり head-count（件数）＋ 本体 `limit(50)` の 2 本に収める（地域ページ `src/app/area/[municipality]/page.tsx` の 2 本構成を踏襲）。`revalidate=86400`（FR-228-02）で Vercel 関数実行回数と Supabase 読み取りを抑える。サイトマップ側の集計（FR-228-09）は地域×種ごとに head-count を 48 回叩く素朴実装だと重いため、可能なら 1 本の集計クエリ（`municipality, species` で group）にまとめる。

- [ ] NFR-228-02: **薄いページを index に出さない（品質ガード）。** ビルド/実行後、しきい値未満の種×地域ページが `<meta name="robots" content="noindex">` を持ち、かつサイトマップに含まれないこと。これにより scaled content abuse（`04_…:92,133`）の回避を機械的に担保する。

- [ ] NFR-228-03: **既存地域ページの非回帰。** `/area/[municipality]` 単体（2 種まとめ）の挙動・テスト（`src/app/area/[municipality]/__tests__/page.test.tsx`）が壊れないこと。下層追加は親の SSR/メタデータを変更しない（親への種リンク追加〔FR-228-08〕は機能追加であり既存テストの前提を壊さない範囲で行う）。

- [ ] NFR-228-04: **canonical / robots の自己矛盾ゼロ。** index 対象ページは「canonical=自分・robots=index 可」、隔離ページは「robots=noindex（＋親 canonical 採用時は親向き）」で一貫し、1 ページ内で index 可と noindex が同居しないこと（REQ-199 が解消した sitemap×robots 不整合と同種の事故を作らない）。

### カニバリゼーション回避（REQ-227 との境界・必須）

- [ ] FR-228-11: **REQ-227（種別ピラーページ `/species/[species]`）とのカニバリゼーションを防ぐ。** 役割を明確に分離する：
  - **REQ-227 = 種の総合（ピラー）**: `/species/american`・`/species/bullfrog`。「アメリカザリガニとは／生態／秋田県全体の分布・被害・駆除」という**種そのもの**の網羅的トピック。狙うクエリは「アメリカザリガニ 秋田」「ウシガエル 駆除」等の**種主軸**ビッグ〜ミドルワード。
  - **REQ-228 = 種×地域の各論（本 REQ）**: `/area/[municipality]/[species]`。「**特定市町村の**その種の出没情報」という**地域 × 種**の局所トピック。狙うクエリは「秋田市 アメリカザリガニ」等の**地域併記ロングテール**。
  - **同一クエリで両者が競合しないよう**、title/H1/description のキーワード設計をずらす：ピラーは「種名＋秋田県（全域）」、本 REQ は「種名＋市町村名」を主語にする。市町村名が入ることで検索意図（ローカル）が分かれる。
  - **内部リンクの方向**: ピラー（`/species/[species]`、REQ-227）→ 各地域の種×地域ページ（本 REQ、`/area/[municipality]/[species]`）へ「地域別に見る」リンクを張り、種×地域ページ → 種ピラー（`/species/[species]`）へ「この種について詳しく」リンクを返す（ハブ＆スポーク）。canonical は**それぞれ自分自身**に向け、種×地域ページを種ピラーへ canonical 統合しない（粒度・意図が異なるため別ページとして両立させる）。
  - 本 REQ は「**種×地域 48 ページの programmatic 生成＋空ページの noindex/canonical 運用＋サイトマップ整合**」に集中し、種の総合解説コンテンツ（生態・駆除手順等）の本文は REQ-227 が持つ（重複生成しない）。REQ-227 が未着手の場合でも本 REQ は `/area/[municipality]/[species]` 単独で成立し、ピラーへのリンクは REQ-227 実装後に有効化すればよい（その旨をコメントに残す）。
