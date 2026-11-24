## ワークストリームC: マイグレーション整理

### 現状と前提

- 58本すべてタイムスタンプ命名で、うち6本が `fix_` 系ホットフィックス。`supabase/schema.sql`（3,515行）と**手動二重管理**。
- `migrations/README.md` の運用ルールどおり、**適用済みmigrationの統合・改名・squashは行わない**（`schema_migrations` 台帳と不整合になり `db push` が壊れる）。→ 本REQの「整理」は**ファイルを動かさず、索引・検証・自動化で秩序を回復する**方針とする。

### 機能要件

- **FR-282-C1**: 空DBに `migrations/` を辞書順で全適用するローカル検証を1回実施し、「順序バグが現存するか」を実測で確定する（B-2のコメント書き換えの根拠）。成功すれば REQ-281 FR-281-01（CIジョブ化＋schema.sqlとのpg_dump正規化diff）へ引き継ぐ。
- **FR-282-C2**: rls-tests がGRANT順序の都合で手動再適用している4本のmigrationリスト（`ci.yml:259-272`）を、`supabase/ci/` 配下の宣言ファイル（例: `reapply-after-grants.txt`）に外出しし、CIはそれを読む形にする（追加漏れをレビューで発見しやすくする）。
- **FR-282-C3**: `migrations/README.md` に「新規migration追加時のチェックリスト」（README索引更新・schema.sql同期・rls-tests再適用リスト要否・`db push` 実施記録）を追記する。
- **FR-282-C4**: 将来の baseline squash（初期化統合）について「やらない」または「やる場合の安全手順（新環境向けbaselineのみ・本番履歴は不変）」を判断記録として残す。

---
