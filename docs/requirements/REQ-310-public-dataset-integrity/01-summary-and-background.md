作成日: 2026-07-30
優先度: **P1** ／ 深刻度: **Medium** ／ 種別: データ品質
状態: **✅ 実装済み（2026-07-30。FR-310-01〜05 すべて対応。配布物の出力はリファクタ前と 1 バイトも変えていない）**
関連: REQ-230（オープンデータ / DOI。CSV・GeoJSON 配信の本体）, REQ-229（Dataset 構造化データ）, REQ-243（位置プライバシー。`display_lat/display_lng` 導入）, REQ-244（CSV インジェクション対策・既存テスト）, REQ-275（SEO の意味的整合）, REQ-231（字・水系の付与）

## 背景

公開しているのは研究利用を想定したオープンデータであり、**配布物が静かに壊れた場合の実害が大きく、かつ気づきにくい**。現状、CSV のヘッダと行が型で対応付けられておらず、JSON-LD は位置非公開の投稿に対して明確に誤った座標を出力している。

### 問題A: 公開データセットの列定義が 6 箇所に分散し、CSV ヘッダと行の対応が型で守られていない — Medium

同じ「公開列の並び」が独立した 6 箇所に書かれている。

| 場所 | 役割 |
|---|---|
| `src/app/dataset/zaridasu.csv/route.ts:79-80` | `SELECT_COLUMNS`（PostgREST の select 文字列） |
| `src/app/dataset/zaridasu.csv/route.ts:82-97` | `PublicDatasetRow`（行の型） |
| `src/app/dataset/zaridasu.csv/route.ts:233-248` | `CSV_HEADERS`（14 列のヘッダ配列） |
| `src/app/dataset/zaridasu.csv/route.ts:272-287` | `buildCsv` の行組み立て（`csvCell(...)` を 14 個**位置対応**で並べる） |
| `src/app/dataset/zaridasu.geojson/route.ts:50-63` | `buildGeoJson` の `properties`（12 キー。座標は `geometry` 側なので `lat_coarse`/`lng_coarse` を持たない） |
| `src/app/dataset/page.tsx:82-94` | 利用者向けの列説明表（11 行。code/label のペアを 1 行にまとめている） |

決定的な問題は `CSV_HEADERS`（`:233-248`）と `buildCsv` の `csvCell` 列挙（`:272-287`）が**独立した 2 つのリスト**であり、順序一致がコンパイル時に保証されていない点である。

```ts
lines.push(CSV_HEADERS.join(','))          // :269 ヘッダは配列から
for (const r of rows) {
  lines.push([ csvCell(r.id), csvCell(r.observed_at), /* …14 個を手書きで並べる… */ ].join(','))
}
```

片方だけに列を挿入すると、**公開済みのオープンデータがラベルと値がずれた状態で配布される**。CSV は形式的には正しい（列数が一致していれば読み込めてしまう）ため、ダウンロードした研究者側でも即座には気づかない。

現行テストの守備範囲は狭い。

- `src/app/dataset/zaridasu.csv/__tests__/route.test.ts:50-65` は **CSV インジェクション無害化のみ**を検証している（`=cmd|calc` / `=1+1` / `@evil` に前置アポストロフィが付くこと）。ヘッダと値の対応は見ていない。
- `zaridasu.geojson` 側には**テストが存在しない**（`src/app/dataset` 配下のテストは上記 1 ファイルのみ）。
- `dataset/page.tsx` の説明表も手書きで、実際の出力列と機械的に結びついていないため静かに陳腐化する。

### 問題B: 位置非公開（`location_disclosure='hidden'`）の投稿の JSON-LD が geo 0,0 を出力する — Medium

`src/lib/seo.ts:108-112`:

```ts
geo: {
  '@type': 'GeoCoordinates',
  latitude: Number(post.lat),
  longitude: Number(post.lng),
},
```

連鎖は以下のとおり。

1. `src/app/post/[id]/page.tsx:24` の `POST_DETAIL_COLUMNS` が `lat:display_lat, lng:display_lng` とエイリアスして取得する（REQ-243 により生 `lat`/`lng` は anon から列 GRANT で剥奪済み）
2. `supabase/schema.sql:119-127` の `display_lat` は `CASE location_disclosure WHEN 'hidden' THEN NULL …`
3. `src/types/database.types.ts:51` `display_lat: number | null`
4. `Number(null) === 0` → 出力は `{"latitude":0,"longitude":0}`（ギニア湾沖）

検索エンジンとリッチリザルト検証ツールが、秋田県の観測レポートに**明確に誤った座標**を取り込む。`Report.contentLocation` の信頼性が下がり、地域クエリの解釈を誤らせ、データセット消費側（LLM 含む）にも誤情報が伝播する。

**同じパターンがクライアント側にもある（監査 S-3 に記載のない追加箇所）**: `src/hooks/useDetailSEO.ts:101-104` が同一形の `Number(post.lat)` / `Number(post.lng)` で geo を出力している（`src/lib/seo.ts:25` のコメントどおり SSR と同形を意図した実装）。入力は同じ `display_lat` 由来のエイリアス値なので、**両方直さないと片方だけ 0,0 が残る**。

一方、**`area/[municipality]` は影響を受けないことを確認済み**: `src/app/area/[municipality]/page.tsx:152-158` の `spatialCoverage.geo` は `muni.lat` / `muni.lng`（`getMunicipalityBySlug` が返す `MUNICIPALITY_DATA` の静的マスタ値）を直接使い、`Number()` 変換も DB 由来の nullable 値も介在しない。`src/app/area/page.tsx:26` の `Number(row.post_count)` は件数であり座標ではない。したがって修正対象は `seo.ts` と `useDetailSEO.ts` の 2 箇所である。
