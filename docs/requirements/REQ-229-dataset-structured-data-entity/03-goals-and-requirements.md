## 目的

- 既存の `Dataset` 構造化データ（`area/[municipality]`、将来は REQ-227/228 の種別/種×地域ページ）を、**実際に画面提示している集計の範囲で** `temporalCoverage`・`variableMeasured`・`about`（学名つき）・`license`・`creativeWorkStatus`・`isAccessibleForFree` まで拡充し、Google Dataset Search / AI 検索の引用対象としての質を上げる。
- 対象 2 種に**学名・分類階層・Wikidata/GBIF（必要に応じ ITIS）への `sameAs`** を付与し、検索エンジン/LLM が和名/英名/学名を同一エンティティとして認識できるようにする（AI 引用・関連検索の獲得）。
- そのために**学名・分類・権威 URI を `src/lib/constants.ts` の種マスタに一元化**し、Dataset / Report / 図鑑が同じ出どころを参照する状態にする（記述ズレと重複キャストの解消）。
- 「表示している集計値・実在するデータのみマークアップ」を厳守し、配布物（CSV/GeoJSON）の公開は本 REQ の範囲外（REQ-230）として `distribution` は実体が揃うまで出力しない。

## 要件

### 機能要件

- [ ] FR-229-01: **種マスタに学名・分類・権威 URI を一元追加する。** `src/lib/constants.ts` の `SpeciesOption`（`:69-75`）/`SPECIES`（`:77-80`）に、構造化データ用フィールドを追加する（命名は実装時確定、例）：
  - `scientificName`: `american` = `'Procambarus clarkii'` / `bullfrog` = `'Lithobates catesbeianus'`（既存ハードコード `src/views/AboutPage.tsx:23,32` と一致させ、以後はマスタを唯一の出どころにする）。
  - `sameAs`: Wikidata の種エンティティ URI（`https://www.wikidata.org/wiki/Q…`）と GBIF の taxon URI（`https://www.gbif.org/species/<taxonKey>`）の配列。**具体 Q 番号 / taxonKey は実装時に GBIF Species API（`39_Science & Math.md`）・Wikidata（`32_Open Data.md`）で確定し、誤同定を避けるためレビューで裏取りする**（推測: アメリカザリガニ＝Wikidata `Q133163`／ウシガエル＝`Q43152` 付近だが、本要件では確定値とせず実装時検証必須）。
  - （任意）`rank: 'species'` と上位分類（`kingdom`/`family` 等）— `Taxon` 拡張に使う場合のみ。
  あわせて `src/views/AboutPage.tsx:18-37` と `src/hooks/useDetailSEO.ts:20,107-108` を**新マスタ参照に置き換え**、ハードコード学名と重ねキャスト（`as SpeciesEntry & { scientific?: string }`）を解消する（REQ-209 と整合・非重複: REQ-209 は型定義の共通化、本 REQ は学名/`sameAs` データの追加と参照元統一）。

- [ ] FR-229-02: **`Dataset` に対象種を `about`（学名つき・`sameAs`）として追加する。** `src/app/area/[municipality]/page.tsx:95-116` の `Dataset` に `about` を追加する。当該自治体で**実際に報告のある種**（`speciesCounts` のキー＝`:77-82`）に限定し、各種を以下の形でマークアップする：
  ```jsonc
  about: [{
    '@type': ['Thing', 'Taxon'],          // Taxon は bioschemas 拡張。最低限 Thing で可
    name: '<和名>',
    alternateName: '<scientificName>',     // 学名
    sameAs: ['<Wikidata URI>', '<GBIF URI>']
  }, ...]
  ```
  学名・`sameAs` は FR-229-01 のマスタから引く。報告ゼロの種は `about` に含めない（提示していない事実を主張しない）。

- [ ] FR-229-03: **`Dataset` に `temporalCoverage` と `variableMeasured` を「表示済み集計」から付与する。**
  - `temporalCoverage`: 当該自治体の投稿 `created_at` の最小〜最大から ISO 8601 区間（`"<最古>/<最新>"`、または期間表記）を生成する。本体クエリ（`src/app/area/[municipality]/page.tsx:68-74`）は `limit(50)` で全件の最小日を保証できないため、**期間取得用に最古/最新の `created_at` を別途取得する**（head-count と同様に軽量クエリで。`order + limit(1)` ×2、または min/max を返す RPC）。データが無い自治体では `temporalCoverage` を出力しない。
  - `variableMeasured`: 画面で表示している集計を `PropertyValue` で表す。例として「総報告件数」（`count`＝`:30-34`、`AreaPageClient` 表示済み）、種別件数・情報種別件数（`speciesCounts`/`infoTypeCounts`＝`:77-82`、`AreaPageClient.tsx:107-160` 表示済み）を `[{ '@type': 'PropertyValue', name: '報告件数', value: <count> }, …]` の形で出力する。**画面に出していない値は載せない。**

- [ ] FR-229-04: **`Dataset` のメタ（ライセンス・状態・無料・配布）を整える。** `src/app/area/[municipality]/page.tsx` の `Dataset` に以下を追加する：
  - `isAccessibleForFree: true`、`inLanguage: 'ja'`、`creator`/`maintainer`（`Organization`＝既存 `publisher` と整合）。
  - `creativeWorkStatus`（暫定/市民科学データである旨。例 `'Draft'` または説明文での明示）— データの性質を正直に表す。
  - `license`: データ利用条件が確定していれば SPDX/URL を入れる。**未確定なら本 FR では `license` を出力しない**（誤ったライセンス表明を避ける）。確定先は REQ-230（オープンデータ公開/DOI）と整合させる。
  - `distribution`（`DataDownload`＝CSV/GeoJSON の URL・`encodingFormat`）は、**配布実体を REQ-230 が用意してから**出力する。本 REQ では `distribution` を出さず、出力する場合の形（`encodingFormat: 'text/csv' | 'application/geo+json'`・`contentUrl`）と「URL は REQ-230 の配布先と一致させる」ことだけ定義する（実在しない URL を書かない）。

- [ ] FR-229-05: **投稿詳細の `about`（種）に学名・`sameAs` を反映する。** `src/lib/seo.ts:68-71`（SSR の `generatePostSEO` の `Report.about`）と `src/hooks/useDetailSEO.ts:104-110`（クライアント）の双方で、`about` を FR-229-01 マスタ参照に統一し、`name`（和名）＋`alternateName`（学名）＋`sameAs`（Wikidata/GBIF）を持たせる。SSR とクライアントで JSON-LD の `about` 構造が一致すること（ドリフト防止）。`@type` は最低限 `Thing`、可能なら `['Thing','Taxon']`。

- [ ] FR-229-06: **将来の種ページ（REQ-227/228）への適用方針を定義する（接続のみ）。** REQ-227（種別ピラーページ `/species/[species]`）・REQ-228（種×地域ページ）が新設されたら、本 REQ の `Dataset`＋学名 `about`/`sameAs` のパターンを当該ページにも適用する。種別ピラーページが用意できた場合、各 `about`（種）の `sameAs` に**自サイトの種ページ URL（`/species/[species]`）を併記**してエンティティの内部ハブにする。**本 FR は方針記述にとどめ、ページ自体の実装は REQ-227/228 が主管**（種ページ未実装の現状＝`src/app/species/` 不在を前提に、本 REQ は `area/[municipality]` を主対象とする）。

### 非機能要件（該当する場合のみ）

- [ ] NFR-229-01: **捏造しない（データ整合）。** JSON-LD に出す数値・期間・座標・種は、当該ページが**実際に取得・表示している値**にのみ基づくこと。`limit(50)` で全件を表せない集計（総数・期間）は専用の軽量クエリで正しい値を取得してから載せる。報告ゼロの種・未提示の指標は出力しない。
- [ ] NFR-229-02: **XSS 安全（既存方針継承）。** 追加する JSON-LD はすべて既存の `safeJsonLd()`（`src/lib/seo.ts:15-17`、REQ-005）経由で `<script type="application/ld+json">` に出力し、生の `JSON.stringify` を直接 `dangerouslySetInnerHTML` に渡さないこと。
- [ ] NFR-229-03: **学名・URI の正確性。** `scientificName`・Wikidata Q番号・GBIF taxonKey は実装時に一次ソース（GBIF Species API＝`39_Science & Math.md`／Wikidata＝`32_Open Data.md`）で確認し、誤同定（同名異種・シノニム）が無いことをレビューで確認すること。学名は ICZN 表記（属＋種小名）に従う。
- [ ] NFR-229-04: **追加コスト最小・性能非劣化。** `area/[municipality]` の SSR で増える DB アクセス（期間取得など）は head-count 同様に軽量（転送最小）に抑え、`revalidate = 86400`（`src/app/area/[municipality]/page.tsx:19`）の ISR 前提を崩さないこと。クエリ本数の増分を要件記録に残す。
- [ ] NFR-229-05: **i18n 整合。** `inLanguage` は出力言語に合わせる（現行 area Dataset は ja 相当）。学名（ラテン語）は言語非依存でそのまま。和名 `name` は各ページの言語方針（about/lp は ja 静的辞書＝REQ-141 に倣う）と矛盾させないこと。
