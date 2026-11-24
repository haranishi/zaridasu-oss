## トラブルシュート

| 症状 | 対処 |
|---|---|
| 手順 2-1 で座標に小数第4位が残る | 粗化漏れ。`src/app/dataset/zaridasu.csv/route.ts` の `coarsenCoord` / `COORD_DECIMALS` を確認。**直すまで公開しない**。 |
| 手順 2-2 で PII 列を検出 | `SELECT_COLUMNS` / `buildCsv` / `buildGeoJson` に PII 列が紛れている。除去してから再取得。 |
| `curl` が 0 件の CSV を返す | 本番 env（`NEXT_PUBLIC_SUPABASE_*`）未設定で fail-open。env を確認。 |
| Zenodo の DOI が解決しない | Publish 直後は反映に数分かかる。時間をおいて再確認。 |

## 関連

- 要件定義: [REQ-230](../requirements/REQ-230-open-data-doi.md) / 連携 [REQ-229](../requirements/REQ-229-dataset-structured-data-entity.md)
- 対象コード:
  - `src/app/dataset/page.tsx`（公開ページ・DOI 掲示）
  - `src/app/dataset/zaridasu.csv/route.ts`（CSV 配布・粗化/PII 除外の正本）
  - `src/app/dataset/zaridasu.geojson/route.ts`（GeoJSON 配布）
  - `src/views/TermsPage.tsx`（第4条 オープンデータ許諾）/ `src/views/PrivacyPage.tsx`（第三者提供・公開）
- 外部: Zenodo（`https://zenodo.org`）/ OSF（`https://osf.io`）
