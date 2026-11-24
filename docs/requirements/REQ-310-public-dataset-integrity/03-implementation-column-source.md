## 実施状況（2026-07-30）

### FR-310-01: 列定義の単一ソース化 ✅

`src/app/dataset/zaridasu.csv/route.ts` に **`DATASET_COLUMNS`（14 要素）を唯一の正本**として置き、5 箇所すべてをそこから導出した。

```ts
export interface DatasetColumn {
  header: string                                        // CSV ヘッダ名 兼 GeoJSON properties キー
  select: PostsColumn | null                            // PostgREST の列名（null = 導出列）
  get: (row: PublicDatasetRow) => string | number | null // 値の取り出し
  inGeoJson: boolean                                    // GeoJSON properties にも出すか
  doc: DatasetColumnDoc                                  // /dataset 説明表の行（同一参照で 1 行に集約）
}
```

| 導出先 | 導出のしかた |
|---|---|
| `SELECT_COLUMNS` | `map(c => c.select).filter(非null).join(', ')` |
| CSV ヘッダ | `map(c => c.header)` |
| CSV 行 | `DATASET_COLUMNS.map(c => csvCell(c.get(r))).join(',')` |
| GeoJSON `properties` | `Object.fromEntries(GEOJSON_PROPERTY_COLUMNS.map(c => [c.header, c.get(r)]))` |
| `/dataset` の説明表 | `datasetColumnDocs()`（`doc` の**参照が同じ列を 1 行に集約**し、行名は header を ' / ' で連結） |

設計上の要点。

- **ヘッダと値が同一オブジェクト（`header` / `get`）から出る**ため、列の挿入・並べ替えでラベルと値がずれることが起こり得ない。
- 14 列（CSV）と 12 プロパティ（GeoJSON）の差は `inGeoJson: false` の 2 列（`lat_coarse` / `lng_coarse`。座標は `geometry.coordinates` が持つ）**だけ**でコード上説明される。
- 説明表のグルーピングは**オブジェクト参照の同一性**で表現した（`species_code` と `species_label_ja` が同じ `DOC_SPECIES` を指す）。`description` は必須フィールドなので、**説明の付いていない列は型として作れない**。
- `PublicDatasetRow` は手書きのまま残した（要確認の判断どおり）。`get` の引数型で行の型と結び付いているため、存在しないフィールドを参照すればコンパイルエラーになる。
- `select` の型を `keyof Database['public']['Tables']['posts']['Row']` に縛った。SELECT がリテラル文字列だった頃に supabase-js の型推論が担っていた「実在する列名か」の検査を、導出後も型で維持している（**単一ソース化前より強い**）。
- 副作用: `SELECT_COLUMNS` がリテラル型でなくなり supabase-js が行の型を推論できなくなるため、`fetchPublicDataset` の 1 箇所を `data as unknown as Array<Record<string, unknown>>` にした。直後で各フィールドを個別に `as` で読み出しており元々 PostgREST の推論に依存していないので、実害はない（理由をコメントに明記）。

### FR-310-02: CSV の位置対応テスト ✅ / FR-310-03: GeoJSON のテスト新設 ✅

| ファイル | 内容 |
|---|---|
| `src/app/dataset/__tests__/fixtures.ts`（新規） | CSV / GeoJSON 共有のフィクスチャ 3 行（全項目あり／全 nullable が null／数式インジェクション・カンマ・引用符・改行）、**配布済みの契約として手書きした** 14 ヘッダ・12 プロパティキー・禁止キー、RFC 4180 相当の CSV パーサ |
| `src/app/dataset/zaridasu.csv/__tests__/route.test.ts`（追記） | ヘッダ列数＝行列数、**ヘッダ名 → 値の全セル対応**（3 行分）、`SELECT_COLUMNS` 完全一致、説明表 11 行、PII 非含有、リファクタ前と 1 バイト一致の golden |
| `src/app/dataset/zaridasu.geojson/__tests__/route.test.ts`（新規） | `[lng, lat]` 順、properties キー集合＝列定義由来、生座標・PII・accuracy 非含有、リファクタ前と一致の golden |

**AC-02 の実証**（実装時に手元で確認）。

1. `DATASET_COLUMNS` の `locality` と `water_body` を入れ替える → **10 テストが fail**
2. 途中に列を 1 つ挿入する → **14 テストが fail**（`各セル位置の値がヘッダ名どおりである` を含む）

**出力同一性の検証方法**: 単一ソース化の**前**に一時テストで `buildCsv` / `buildGeoJson` の全文をファイルへダンプし、リファクタ**後**に同じダンプを取って `diff` した（非決定な `Generated:` / `generated_at` のみ除外）。差分ゼロを確認したうえで、そのダンプ内容を上記 golden テストに固定した。
