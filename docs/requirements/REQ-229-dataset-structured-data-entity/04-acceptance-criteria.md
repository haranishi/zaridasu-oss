## 受入条件

- [ ] AC-01: `src/lib/constants.ts` の `SPECIES` 各要素が `scientificName` と `sameAs`（Wikidata URI ＋ GBIF URI）を持ち、`american`=`Procambarus clarkii`／`bullfrog`=`Lithobates catesbeianus` である。`src/views/AboutPage.tsx` と `src/hooks/useDetailSEO.ts` がマスタを参照し、学名のハードコードと `as SpeciesEntry & { scientific?: string }` の重ねキャストが解消されている。
- [ ] AC-02: `/area/<slug>`（報告のある自治体）の `Dataset` JSON-LD に `about` が含まれ、各種が `alternateName`（学名）と `sameAs`（Wikidata/GBIF URI）を持つ。報告ゼロの種は `about` に含まれない。
- [ ] AC-03: 同 `Dataset` に `temporalCoverage`（実データの最古〜最新に基づく）と `variableMeasured`（総数・種別件数・情報種別件数のうち画面表示済みのもの）が含まれ、値が画面表示と一致する。データ無しの自治体では両プロパティが出力されない。
- [ ] AC-04: 同 `Dataset` に `isAccessibleForFree` と `creativeWorkStatus`（暫定データである旨）が含まれる。`license` は確定時のみ／未確定なら未出力。`distribution` は配布実体が無い現状では出力されていない（実在しない URL が無い）。
- [ ] AC-05: `/post/<id>` の `Report.about` が SSR（`generatePostSEO`）・クライアント（`useDetailSEO`）の双方で `name`（和名）＋`alternateName`（学名）＋`sameAs` を持ち、両者の構造が一致する。
- [ ] AC-06: 追加・変更した JSON-LD はすべて `safeJsonLd()` 経由で出力され、[Schema.org Validator / Google リッチリザルトテスト]相当で `Dataset` がエラーなく解釈される（学名・`sameAs`・`temporalCoverage`・`variableMeasured` が認識される）。
- [ ] AC-07: REQ-227/228（種ページ）への適用方針が本 REQ に明記され、種ページ新設時に同パターン（Dataset＋学名 `about`/`sameAs`、種ページ URL の `sameAs` 併記）を適用する接続が定義されている。`distribution` の URL を REQ-230 の配布先と一致させる旨が記録されている。
- [ ] AC-08: `npm run build`（または `next build`）/ 既存の area ページテスト（`src/app/area/[municipality]/__tests__/page.test.tsx`）/ 型チェックが green で、本 REQ 由来の回帰が無い。
