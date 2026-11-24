## 機能要件

- **FR-310-01（列定義の単一ソース化）**: 公開データセットの列を `{ key, header, select, get(row) }` 形の 1 本の配列で宣言し、`SELECT_COLUMNS` / `CSV_HEADERS` / `buildCsv` の行組み立て / `buildGeoJson` の `properties` / `dataset/page.tsx` の説明表を**すべてそこから導出**する。
  - ヘッダと値が同じ要素から出るため、位置ずれが構造的に起こり得なくなることを設計目標とする。
  - GeoJSON は座標を `geometry` に持つため `lat_coarse` / `lng_coarse` を `properties` から除く必要がある。列定義に「CSV のみ / 両方」を表す属性を持たせる等で表現する（現状の 14 列 vs 12 プロパティの差をコード上で説明可能にする）。
  - `dataset/page.tsx` の説明表は code/label のペアを 1 行にまとめている（11 行）。導出時に**表示のグルーピングは保ちつつ、説明の付いていない列が残らないこと**を保証する形にする。
- **FR-310-02（CSV の位置対応テスト）**: `buildCsv` に対し (a) ヘッダの列数とデータ行の列数が一致すること、(b) **各セル位置の値が期待どおりであること**（ヘッダ名 → 値のマッピングを 1 行分すべて検証）を確認するテストを追加する。列を 1 つ挿入・削除したときにこのテストが落ちることを、実装時に手元で確認する。
- **FR-310-03（GeoJSON のテスト新設）**: `buildGeoJson` のテストを新設する。最低限、(a) `geometry.coordinates` が `[lng, lat]` の順であること、(b) `properties` のキー集合が列定義から導出された期待集合と一致すること、(c) `properties` に生座標・PII・`accuracy` が含まれないこと（`zaridasu.geojson/route.ts:40` のコメントで宣言している不変条件）を検証する。
- **FR-310-04（geo の NULL ガード）**: `src/lib/seo.ts:108-112` と `src/hooks/useDetailSEO.ts:101-104` の `geo` を、`Number.isFinite` を満たすときだけ出力する形に変える（キー自体を出さない）。
  - `contentLocation.address` は市区町村があるので**残す**。位置非公開でも `addressRegion`（秋田県）と `addressLocality` は有効な情報である。
  - `location_disclosure='hidden'` の投稿で `"latitude":0` が出力に現れないことをテストで固定する。
- **FR-310-05（座標を出す他の JSON-LD の点検）**: `Number()` による座標変換が他の構造化データ生成箇所に無いか点検し、結果を本要件に追記する。**本監査での点検結果は問題B のとおり `area/[municipality]` は該当せず、対象は `seo.ts` と `useDetailSEO.ts` の 2 箇所**である。新たに JSON-LD へ座標を足す際の規約（nullable な DB 値を `Number()` に通さない）をコメントで明示する。

## 受入基準

- **AC-01（列定義の単一化）**: 公開列の並びを表すリストがリポジトリ内で 1 本になっている。列を 1 つ追加する変更を行ったとき、`SELECT_COLUMNS` / CSV ヘッダ / CSV 行 / GeoJSON properties / 説明表のすべてに**1 箇所の編集で反映される**。
- **AC-02（位置ずれの検知）**: `CSV_HEADERS` 相当の並びと行組み立ての並びを意図的にずらすと、追加したテストが fail する。
  ```bash
  npx vitest run src/app/dataset
  ```
- **AC-03（GeoJSON のテスト存在）**: `buildGeoJson` を対象とするテストファイルが存在し、パスする。
  ```bash
  find src/app/dataset -name "*.test.ts" | xargs grep -l buildGeoJson   # 期待: 1 件以上
  ```
- **AC-04（geo の NULL ガード）**: 位置非公開の投稿の詳細ページ HTML に `"latitude":0` / `"longitude":0` が現れない。SSR（`generatePostSEO`）とクライアント（`useDetailSEO`）の両経路で確認する。
  ```bash
  grep -rn "latitude: Number(" src/lib/seo.ts src/hooks/useDetailSEO.ts   # 期待: 0 件
  ```
- **AC-05（address は残る）**: 位置非公開の投稿でも `contentLocation.address.addressLocality` に市区町村が出力される（geo だけが落ちる）。
- **AC-06（既存の不変条件の維持）**: REQ-244 の CSV インジェクション無害化テスト（`route.test.ts:50-65`）が引き続きパスする。公開列に生 `lat`/`lng`・`photos`・PII が混入していない。
- **AC-07**: `lint` / `type-check` / 既存 652 テストがパスする。

## 対象外

- 公開列そのものの追加・削除（どの列を配布するかの方針変更）は本要件では行わない。**現状の 14 列 / 12 プロパティを 1 バイトも変えずにリファクタリングすること**を前提とする（配布物の互換性維持）。
- 座標の粗化桁数（`COORD_DECIMALS`）や粗化方式の見直しは REQ-243 の範囲。
- DOI 付与・データセットのバージョニングは REQ-230 の範囲。

## 要確認

- FR-310-01 の実装で `PublicDatasetRow` を列定義から生成型として導出できるか（`get(row)` の戻り値型から逆算するか、行の型は手書きのまま残すか）は設計判断。**型の複雑化がレビュー困難を招くなら、行の型は手書きのまま残し「ヘッダと値の位置対応」だけを構造的に保証する簡素な形でも AC-01/02 は満たせる**。
  - → **後者を採用**（実施状況 FR-310-01 参照）。`PublicDatasetRow` は手書きのまま残し、`get(row: PublicDatasetRow)` の引数型で結び付けた。
- 指示で示された関連要件のうち `REQ-147`（`REQ-147-postcard-image-unoptimized.md` = 画像最適化）は本件と無関係のため、実体に合わせて `REQ-230` / `REQ-229` / `REQ-244` に読み替えた。意図が別の要件だった場合は差し替えること。
- 位置非公開の投稿が現在の本番にどれだけ存在するか（＝ geo 0,0 が実際に何件の公開ページで出力されているか）は未計測。0 件であっても構造上の欠陥は残るため対応は必要。
