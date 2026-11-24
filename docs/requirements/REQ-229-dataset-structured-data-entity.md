# REQ-229: Dataset 構造化データ拡充＋学名エンティティ連携（GBIF / Wikidata / ITIS）

## これは何か

既存の `Dataset` JSON-LD を「画面に実際に出している集計」の範囲で拡充し、対象 2 種に学名と Wikidata/GBIF への `sameAs` を付けてエンティティとして認識させる要件。
本文は全文を下の部品ファイルへ逐語で移動してある（この入口の要約部分のみ新規記述）。

## 目的・背景の要約

JSON-LD は各ページに出力済みだが、`area/[municipality]` の `Dataset` は `name`/`description`/`url`/`spatialCoverage`/`publisher`/`keywords` の最小限に留まり、**同じハンドラ内で計算して画面に表示している集計値（総数・種別件数・情報種別件数）を JSON-LD に載せていない**。また学名・分類・権威 URI が JSON-LD に一切無く、検索エンジンや LLM が「アメリカザリガニ／American crayfish／Procambarus clarkii」を同一エンティティとして束ねる手がかりが無い。さらに学名はコード内で重複・分散しており、構造化データの単一の出どころが存在しない。

## 主要な決定事項の要点

- **捏造しない**が最上位の制約。JSON-LD に出す数値・期間・座標・種は、そのページが**実際に取得・表示している値**にのみ基づく。報告ゼロの種は `about` に含めず、未提示の指標も出さない。
- **`distribution` は出力しない** — 配布ファイルの実体がまだ無く、実在しない URL を書くと 404 を指す不正な Dataset になるため。実体は REQ-230 が用意し、URL はそちらと一致させる。同様に **`license` も未確定なら出力しない**。
- `limit(50)` のクエリでは全件の期間を表せないため、**`temporalCoverage` 用に最古/最新の `created_at` を別途軽量クエリで取得**する（head-count と同じ方針）。データが無い自治体では出力しない。
- **学名・`sameAs`・分類を `src/lib/constants.ts` の種マスタへ一元化**し、Dataset / Report / 図鑑が同じ出どころを参照する。これでハードコード学名と `as SpeciesEntry & { scientific?: string }` の重ねキャストも解消される（REQ-209 とは非重複 — REQ-209 は型定義の共通化、本 REQ はデータの追加と参照元統一）。
- **Wikidata Q 番号・GBIF taxonKey は本要件では確定値としない**。実装時に一次ソースで裏取りし、同名異種・シノニムによる**誤同定が最大のリスク**としてレビュー必須（ノート内の Q133163 / Q43152 はあくまで推測値）。
- SSR（`generatePostSEO`）とクライアント（`useDetailSEO`）の `Report.about` は**同一データ・同一構造に揃える**（ドリフト防止）。
- 追加する JSON-LD はすべて既存の **`safeJsonLd()` 経由**（REQ-005）。生の `JSON.stringify` を `dangerouslySetInnerHTML` に渡さない。
- 種ページ（REQ-227/228）への適用は**方針記述のみ**。本 REQ の主対象は `area/[municipality]`。種ページができたら `sameAs` に自サイトの種ページ URL を併記して内部ハブにする。
- 旧 Vite 時代の `docs/archive/planning/requirements-seo.md` の構造化データ計画は**設計参考にとどめ、現行コードの根拠として扱わない**。
- 優先度は**緊急度 Low / 重要度 Medium**。Dataset 型は既にあり拡充は数十行、学名も既存、競合が薄く差別化に効く。

## 部品ファイル

| ファイル | 内容 |
|---|---|
| [01-background.md](REQ-229-dataset-structured-data-entity/01-background.md) | 背景 — 既存 JSON-LD の出力箇所一覧、下敷きにした Obsidian ノート、この REQ が解こうとしている「機会」3 点 |
| [02-current-problems.md](REQ-229-dataset-structured-data-entity/02-current-problems.md) | 現状の問題 1〜3（行番号付き）— Dataset の未記載プロパティ、学名・`sameAs` の不在、学名の重複・分散 |
| [03-goals-and-requirements.md](REQ-229-dataset-structured-data-entity/03-goals-and-requirements.md) | 目的と機能要件 FR-229-01〜06（マスタ一元化、`about`、`temporalCoverage`/`variableMeasured`、メタ整備、投稿詳細、種ページ接続）、非機能要件 NFR-229-01〜05 |
| [04-acceptance-criteria.md](REQ-229-dataset-structured-data-entity/04-acceptance-criteria.md) | 受入条件 AC-01〜08 |
| [05-impact-and-priority.md](REQ-229-dataset-structured-data-entity/05-impact-and-priority.md) | 影響範囲（変更する範囲／担わない範囲／他機能への影響リスク）と優先度の判断理由 |
