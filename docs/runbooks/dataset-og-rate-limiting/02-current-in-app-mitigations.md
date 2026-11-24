## 現状のアプリ内緩和策（すでに実装済み）

| 対策 | 内容 | 実装 |
|---|---|---|
| CDN キャッシュ | `Cache-Control: public, max-age=0, s-maxage=86400, stale-while-revalidate=86400`（日次）。同一クエリはエッジキャッシュで DB / 生成に到達しない | `src/app/dataset/zaridasu.csv/route.ts`・`zaridasu.geojson/route.ts`・`revalidate = 86400` |
| 入力の許可リスト化 | `from`/`to`/`species`/`municipality` を既知値でのみ受理（未知値は無視＝全件）。ユニークなクエリ空間を絞りキャッシュ効率を上げる | `parseDatasetFilters()` |
| 承認済みのみ・PII 非含有・座標粗化 | `status='approved'` 限定・生 lat/lng 非公開・約 111m グリッド粗化 | REQ-230 / REQ-243 |
| **データセット絶対行数上限（REQ-245 FR-245-02/03）** | ページネーションで全件返しつつ **`DATASET_MAX_ROWS = 100_000` を絶対上限**とし、無制限ページングによる関数実行時間・メモリ・DB 到達コストの暴発を防ぐ。到達時は **silent truncation にせず `logError` で警告**（Sentry / console） | `fetchPublicDataset()`（`src/app/dataset/zaridasu.csv/route.ts`） |
| OG 入力サイズ上限 | タイトル 80 / エリア 40 文字に切り詰め、species は既知値のみ | `sanitizeOgParams()`（`src/app/api/og/route.tsx`） |

> ⚠️ キャッシュミス経路（`from`/`to` を細かく変えたユニークなクエリ）は都度 DB に到達し得る。
> 絶対行数上限は 1 リクエストのコスト上限にはなるが、**リクエスト頻度そのものの上限にはならない**。
> 頻度の上限はプラットフォーム側で敷く（下記）。

---
