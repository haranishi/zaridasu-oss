## 影響範囲

**本 REQ が新規追加/変更する範囲（オープンデータ公開＋DOI）:**
- `src/app/dataset/`（新規：公開ページ `page.tsx`＋配布用 Route Handler 例 `zaridasu.csv/route.ts`・`zaridasu.geojson/route.ts`、または静的/ジョブ生成の配布物）
- `src/app/sitemap.ts`（`/dataset` を `staticPages` に追加）
- 配布生成ロジック（粗化座標＋approved 限定。サーバー側 RPC もしくは Route Handler。既存 `useCsvExport` の列構成を参考にしつつ公開用に再構成）
- `src/views/TermsPage.tsx`（投稿者からのオープンデータ公開・再配布許諾の明文化）
- `src/views/PrivacyPage.tsx`（第三者提供＝匿名化・粗化済み・PII 非公開の明確化）
- `docs/runbooks/`（新規：配布物生成＋OSF/Zenodo スナップショット登録＋DOI 反映手順）
- 外部：OSF または Zenodo（データアーカイブ・DOI 発行）

**本 REQ が担わない範囲（既存 REQ との境界＝重複回避）:**
- **`Dataset` JSON-LD（構造化メタデータ）の出力自体は REQ-229 が主管**（`docs/requirements/REQ-229-dataset-structured-data-entity.md`）。本 REQ はその `distribution`（CSV/GeoJSON の実体 URL）と `license`/DOI を**供給する側**として接続する（REQ-229 の `distribution`/`license` は本 REQ の配布実体・確定ライセンスが揃うまで未出力＝`REQ-229-*.md:102-103`）。
- **CSV の PII 列除外は REQ-103**、**`survey_method` 列は REQ-174**、**位置精度 `accuracy` の意味づけは REQ-172** が主管。本 REQ は公開配布物でそれらの方針を踏襲する（`accuracy` は公開版では除外＝FR-230-03）。
- **`reporter_ip` の列保護は REQ-179**、**`posts_public` の reporter_ip マスクは REQ-025**。本 REQ は公開物に PII を含めないことを再確認するのみ（DB 防御は変更しない）。
- **バックアップ/復旧は REQ-217**（目的は復旧であり公開ではない）。配布物生成ジョブの基盤は相乗り可だが要件は別。
- LP/ブランディングの「大学名・卒業研究の語を出さない」方針は LP に対する制約。**学術アーカイブ（OSF/Zenodo）のメタデータでは適切に著者・文脈を記載してよい**（FR-230-05 で判断を記録）。

**他機能への影響リスク:**
- **最大のリスクは位置情報の漏洩**。粗化を誤って生座標を公開すると、投稿者の自宅・私有地や希少種の生息地点が機械可読で流出し回収不能（公開・キャッシュ・DOI スナップショットに残る）。粗化は不可逆な丸めで全形式に一貫適用し（NFR-230-02）、リリース前に実出力をサンプル検査する。
- ライセンス・規約の文言は法的効力を持つため、投稿者からの許諾範囲と公開ライセンスの整合（投稿者が許諾していない再配布を運営が CC BY で公開しない）を確認する。
- DOI スナップショットは**取り消せない**前提で、登録前に PII 非混入・粗化済みを必ず確認する（一度 DOI を振った版に PII があると恒久的事故）。
