## ワークストリームB: ドキュメント整合

### 現状の問題

- **B-1: 実態より「危険」に見える stale 警告（最重要）** — `supabase/migrations/README.md`（最終更新 2026-06-17・「全51本」表記）が
  「⚠️ `20260616000005_fix_reporter_ip_column_protection.sql` は本番DB未適用。未適用の間は本番の `posts.reporter_ip`（PII）が anon/authenticated から読める状態のまま」
  と警告し続けている。しかし **2026-07-18 の `supabase migration list` で当該migrationは本番適用済みと確認済み**（`20260717000001` まで全适用）。PII露出は解消済みなのに、READMEだけが「本番が危険」と主張している。migration本数も実際は **58本**（README は51本）。
- **B-2: CIコメントが存在しないファイルを根拠にしている** — `.github/workflows/ci.yml:194-196` の「既存マイグレーション（`001_`/`002_`）は辞書順の順序バグを抱えるため schema.sql を直接適用する」という注記。現在 `supabase/migrations/` に非タイムスタンプのファイルは存在しない（`README.md` のみ）。schema.sql直接適用という設計判断の根拠が現存しない状態。
- **B-3: 進捗トラッカーの多重化と陳腐化** — 「どのREQがどこまで済んだか」を語る文書が少なくとも4系統あり、相互にずれている:
  - `docs/req-implementation-progress.md`（REQ-176前後の時代で停止）
  - `docs/security-implementation-progress.md`
  - `docs/planning/unimplemented-requirements-review-2026-07-07.md`（良質な棚卸しだが、その後 REQ-253/258/259/263/264/266/267/268/269〜275/277/278 が実装され陳腐化。REQ-238欠番・REQ-150同番号2ファイルの指摘は有効）
  - `docs/requirements/REQ-239-251-…-index.md` / `REQ-269-281-…-index.md`（監査ラウンドごとのインデックス）
- **B-4: `docs/requirements/` に旧世代の非REQ文書が9本混在** — `code-refactoring.md` / `issue-fixes.md` / `issue-fixes-v2.md` / `nextjs-migration.md` / `nextjs-migration-remaining.md` / `phase2-improvement.md` / `quality-improvement-v3.md` / `responsive-mobile.md`（REQ-268に統合済みと明記あり）/ `seo-optimization.md`。命名規約（`REQ-NNN-slug.md`）と混在し、現行有効性が不明。
- **B-5: `docs/planning/` が約40本の時代混在アーカイブ化** — React Router時代の `requirements-router-v7-migration.md` や 2026-03 のスプリント計画、apexインシデント文書等が、現役の `priority-backlog.md` と同列に並ぶ。現役文書の判別が不能。
- **B-6: `docs/` 直下の散在ファイル** — `verification-2026-05-13.md`（日付スナップショット）・`verification-checklist.md`・`lp-copy.md` 等の置き場が規約化されていない。

### 機能要件

- **FR-282-B1（最優先）**: `supabase/migrations/README.md` を現況に更新する — (a) 「未適用・PII露出」警告を削除し「全適用済み（2026-07-18 `supabase migration list` で確認）」に置換、(b) 本数 51→58、(c) `20260616000005`〜`20260717000001` の8本ぶん索引行を追記。既存の「運用ルール（適用済みmigrationは統合・改名・削除しない）」はそのまま維持する。
- **FR-282-B2**: `ci.yml` の `001_`/`002_` 言及を削除し、schema.sql直接適用を続ける理由を現在の事実（schema.sqlとmigrationsの二重管理を段階的に検証で担保する方針＝REQ-281 FR-281-01）で書き直す。
- **FR-282-B3**: 進捗トラッカーを一本化する — 「REQの現況台帳」は `docs/requirements/` のインデックス群＋各REQ文書の状態欄を唯一の正とし、`req-implementation-progress.md`・`security-implementation-progress.md`・`unimplemented-requirements-review-2026-07-07.md` は冒頭に「アーカイブ（YYYY-MM-DD時点のスナップショット・以後更新しない）」注記を付けて `docs/archive/` へ移す。
- **FR-282-B4**: `docs/archive/` を新設し、B-4の9本・B-5の非現役文書を移動する（**削除はしない**。git履歴と本文は保全）。各ファイル冒頭に「superseded by REQ-XXX」または「歴史的文書」の1行を付す。`docs/planning/` に残すのは現役運用文書（`priority-backlog.md` 等、トリアージで判定）のみ。
- **FR-282-B5**: `docs/README.md`（docs全体の台帳）を新設し、各サブディレクトリの役割（brand/philosophy/planning/requirements/runbooks/security/archive）と「どの文書が正か」を1枚で示す。
- **FR-282-B6**: ルート `README.md` の技術記述を現況確認する（軽微。虚偽があれば修正）。

---
