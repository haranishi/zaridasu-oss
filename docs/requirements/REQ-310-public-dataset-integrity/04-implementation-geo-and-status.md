### FR-310-04: geo の NULL ガード ✅（2 箇所とも）

`src/lib/seo.ts`（SSR）と `src/hooks/useDetailSEO.ts`（クライアント）の両方で、`Number.isFinite` を満たすときだけ `geo` を組み立て、満たさないときは `...(geo && { geo })` で**キー自体を出さない**。`contentLocation.address`（`addressRegion` / `addressLocality`）は残している。

- `lat` / `lng` の引数型を `number | null` に広げた（実態に合わせた。呼び出し側の `DetailPost` は `number` なので互換）。
- 「実在の観測値としての 0,0」と「NULL」を区別する（0 を一律に落とさない）ことをテストで固定した。
- テストが旧実装（`latitude: Number(post.lat)`）で fail することを、実装後に一時的に巻き戻して確認済み（7 テストが fail）。

### FR-310-05: 座標を出す他の JSON-LD の点検 ✅

`latitude` / `longitude` を出力する全箇所を実物で再確認した。

| 箇所 | 座標の出どころ | 判定 |
|---|---|---|
| `src/lib/seo.ts` | `display_lat` 由来（nullable） | **対象**（修正済み） |
| `src/hooks/useDetailSEO.ts` | 同上 | **対象**（修正済み） |
| `src/app/area/[municipality]/page.tsx:157-158` | `muni.lat` / `muni.lng`（`MUNICIPALITY_DATA` の静的マスタ。`MunicipalityInfo.lat` は非 null の `number`） | 対象外 |
| `src/app/area/[municipality]/[species]/page.tsx:183-184` | 同じ静的マスタ | 対象外（**本要件の起票時に列挙されていなかった追加箇所**。同じ理由で安全） |
| `src/app/area/page.tsx:26` の `Number(row.post_count)` | 件数であって座標ではない | 対象外 |
| `src/hooks/useWeather.ts` / `src/hooks/posts/usePostForm.ts` | 外部 API の URL / Geolocation API（`!= null` ガード済み）。JSON-LD ではない | 対象外 |

規約「**nullable な DB 値を `Number()` に通した結果をそのまま座標に入れない。JSON-LD に座標を足すときは `Number.isFinite` ガードを通す**」を両ファイルのコメントに明記した。

### 受入基準の達成状況

| AC | 状態 | 備考 |
|---|---|---|
| AC-01 列定義の単一化 | ✅ | 列の追加は `DATASET_COLUMNS` への 1 要素追記で 5 箇所すべてに反映される |
| AC-02 位置ずれの検知 | ✅ | 並べ替え・列挿入の 2 パターンで実際に fail することを確認 |
| AC-03 GeoJSON のテスト存在 | ✅ | `src/app/dataset/zaridasu.geojson/__tests__/route.test.ts` |
| AC-04 geo の NULL ガード | ✅ | `grep -rn "latitude: Number(" src/lib/seo.ts src/hooks/useDetailSEO.ts` → 0 件。両経路をテストで固定 |
| AC-05 address は残る | ✅ | 位置非公開でも `addressLocality` が出ることをテスト済み |
| AC-06 既存の不変条件の維持 | ✅ | REQ-244 の無害化テストは 1 行も変えずにパス。公開列に生 `lat`/`lng`・`photos`・PII なし |
| AC-07 lint / type-check / 既存テスト | ✅ | `type-check` / `lint --max-warnings 0` / `vitest run`（85 ファイル 749 件） / `next build` すべて green |

### 未実施 / 申し送り

- **`/dataset` ページのレンダリング結果は実ブラウザで目視していない**。説明表の内容（11 行・行名・説明文）はテストで旧実装と文字列一致を確認済みだが、表示崩れの確認は未実施。
- `PublicDatasetRow` を列定義から**型として生成**する案（`get` の戻り値型からの逆算）は採用しなかった。型の複雑化に見合う利点が薄く、`get(row: PublicDatasetRow)` の引数型で十分な結び付きが得られるため。将来 `get` の戻り値型を列ごとに厳密化したくなったら再検討する。
