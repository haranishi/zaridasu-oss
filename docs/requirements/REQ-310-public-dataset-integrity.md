# REQ-310: 公開データセットの整合（CSV列定義の単一化と構造化データの座標誤出力）

これは何か: 公開オープンデータの CSV 列定義を単一ソース化し、位置非公開投稿の JSON-LD が geo 0,0 を出す不具合を塞いだ要件定義と実施記録（P1 / Medium / データ品質 / **✅ 実装済み 2026-07-30**）。本文は分割ファイルに逐語で保管し、ここは入口（索引）。

## 目的・背景（要約）

公開しているのは研究利用を想定したオープンデータであり、**配布物が静かに壊れた場合の実害が大きく、かつ気づきにくい**。同じ「公開列の並び」が独立した6箇所に書かれ、とくに `CSV_HEADERS` と `buildCsv` の行組み立てが別リストのため、片方だけに列を挿入すると**ラベルと値がずれた CSV が配布される**（列数さえ合えば読めるので受け手も気づかない）。加えて `location_disclosure='hidden'` の投稿は `display_lat` が NULL のまま `Number(null) === 0` となり、JSON-LD に**ギニア湾沖の座標**が出力されていた。

## 主要な決定事項（要点）

- **列定義を `DATASET_COLUMNS`（14要素）に単一化**（FR-310-01）。`SELECT_COLUMNS` / CSVヘッダ / CSV行 / GeoJSON properties / `/dataset` 説明表の5箇所すべてをそこから導出し、**ヘッダと値が同一オブジェクトから出る**ため位置ずれが構造的に起こり得ない。
- **CSV 14列と GeoJSON 12プロパティの差は `inGeoJson: false` の2列（`lat_coarse`/`lng_coarse`）だけ**でコード上説明される（座標は `geometry.coordinates` が持つ）。
- **`PublicDatasetRow` は手書きのまま残す**（要確認の判断どおり後者を採用）。型生成による複雑化を避け、`get(row: PublicDatasetRow)` の引数型で結び付ける。
- **geo は `Number.isFinite` を満たすときだけ出力**し、満たさなければキー自体を出さない（FR-310-04）。SSR（`src/lib/seo.ts`）とクライアント（`src/hooks/useDetailSEO.ts`）の**両方**を直す。`contentLocation.address` は残す。
- **座標を出す JSON-LD の点検結果**（FR-310-05）: 対象は上記2箇所のみ。`area/[municipality]` 系は静的マスタ由来のため対象外。規約「nullable な DB 値を `Number()` に通した結果を座標に入れない」をコメントで明記。
- **配布物の互換性維持が前提**。現状の14列 / 12プロパティを**1バイトも変えずに**リファクタする（公開列の追加・削除は対象外。粗化桁数は REQ-243、DOI は REQ-230 の範囲）。
- 出力同一性はリファクタ前後の全文ダンプ diff で検証し、その内容を golden テストに固定した。列の並べ替え・挿入で実際に10〜14テストが fail することも確認済み。

## 分割ファイル

- [01-summary-and-background.md](REQ-310-public-dataset-integrity/01-summary-and-background.md) — 作成日・優先度・状態・関連REQ ＋ 背景（問題A: 列定義6箇所分散とテストの守備範囲、問題B: geo 0,0 の連鎖と影響範囲の確認）
- [02-requirements-and-acceptance.md](REQ-310-public-dataset-integrity/02-requirements-and-acceptance.md) — 機能要件 FR-310-01〜05 ＋ 受入基準 AC-01〜07（検証コマンド付き）＋ 対象外 ＋ 要確認
- [03-implementation-column-source.md](REQ-310-public-dataset-integrity/03-implementation-column-source.md) — 実施状況: FR-310-01 の `DatasetColumn` 定義と導出表・設計上の要点、FR-310-02/03 のテスト構成と AC-02 の実証手順
- [04-implementation-geo-and-status.md](REQ-310-public-dataset-integrity/04-implementation-geo-and-status.md) — 実施状況: FR-310-04 の NULL ガード、FR-310-05 の全箇所点検表、受入基準の達成状況、未実施・申し送り
