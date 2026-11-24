# REQ-112: Migration ファイル名の順序バグ解消

> 親 REQ: REQ-092
> 関連 REQ: REQ-060（test-schema-types-drift）

## 背景
`supabase/migrations/` に **異なる命名規則のマイグレーションが混在** している：

```
001_rls_and_audit_triggers.sql
002_dashboard_stats_rpc.sql
20240101000000_initial_schema.sql
20260320000001_data_patches.sql
20260321000001_fix_new_user_trigger.sql
...
```

`001_*.sql` / `002_*.sql` がファイル名の **辞書順で先**に並ぶため、Supabase CLI で実行すると `001_*` → `002_*` → `20240101000000_*` の順になり、**初期スキーマ（initial_schema）より先に RLS トリガーや RPC が走る**バグが発生する。

`.github/workflows/ci.yml` に既にコメントが書かれており、CI では `schema.sql` を直接適用して回避している。**本番 Supabase に CLI で適用する瞬間に事故る**。

## 現状の問題
- マイグレーション順序：`001_rls_and_audit_triggers.sql` → `002_dashboard_stats_rpc.sql` → `20240101000000_initial_schema.sql` → ...
- `001_*` / `002_*` は initial_schema より「後」に走るべきトリガー / RPC を含むのに、辞書順では先に並ぶ
- 本番に Supabase CLI で適用すると、テーブルが存在しないので `001_rls_and_audit_triggers.sql` が落ちる

## 目的
マイグレーションファイル名の命名規則をタイムスタンプ形式に統一し、CLI による本番マイグレーションを安全に実行可能にする。

## 要件

### 機能要件
- [ ] FR-112-01: `001_rls_and_audit_triggers.sql` を `20240101000001_rls_and_audit_triggers.sql` にリネーム（initial_schema より「後」になるタイムスタンプ）
- [ ] FR-112-02: `002_dashboard_stats_rpc.sql` を `20240101000002_dashboard_stats_rpc.sql` にリネーム
- [ ] FR-112-03: リネーム後、Supabase CLI のローカル実行で全マイグレーションが順序通りに走ることを確認
- [ ] FR-112-04: 本番 Supabase の `supabase_migrations` テーブルとの整合性を取る（既に適用済の migration はリネームしても再実行されないようにする）：
  - 案 A: 本番側にも同じくリネームを反映するため、SQL で `UPDATE supabase_migrations.schema_migrations SET version = '20240101000001' WHERE version = '001'` 等を実行
  - 案 B: リネーム前後で同じハッシュ判定がされる場合は何もしなくてよい（CLI 仕様確認）
- [ ] FR-112-05: CI の `schema-drift` ジョブが pass（既存の `psql -f supabase/schema.sql` 直接適用が引き続き動作）
- [ ] FR-112-06: README / runbook にマイグレーション運用ガイドを追記

### 非機能要件
- [ ] NFR-112-01: 本番 Supabase の状態に変化がないこと（リネームによる再実行が起きない）
- [ ] NFR-112-02: 既存テスト（pg-tap / vitest）が pass

## 受入条件
- [ ] AC-01: `supabase/migrations/` 内の全ファイルがタイムスタンプ命名規則
- [ ] AC-02: ローカルで `supabase db reset` 実行時に全 migration が順序通りに走り、エラー無し
- [ ] AC-03: CI の `rls-tests` / `schema-drift` ジョブが pass
- [ ] AC-04: 本番 Supabase の migrations テーブルが整合（手動確認）
- [ ] AC-05: `docs/runbooks/supabase-migrations.md`（新規）に運用ガイドが記載される

## 影響範囲
- `supabase/migrations/001_rls_and_audit_triggers.sql` → リネーム
- `supabase/migrations/002_dashboard_stats_rpc.sql` → リネーム
- 本番 Supabase の `supabase_migrations.schema_migrations` テーブル
- `docs/runbooks/supabase-migrations.md`（新規）
- `.github/workflows/ci.yml` のコメント更新

## 優先度
- **緊急度**: Medium
- **重要度**: High
- **理由**: 本番マイグレーションの事故リスクを潰す。S 規模（半日）だが、本番 DB への影響評価が必要なため独立 PR + dry-run 必須。

## 実装メモ
- まずローカル環境で `supabase db reset` を実行し、リネーム後の挙動を確認
- 本番への適用は **リードオンリー時間帯** に dry-run + 確認 + 本番反映の流れ
- Supabase CLI の version 整合性は `supabase migration list` で確認
- CI コメントの記述：「001_, 002_ がファイル名接頭辞の辞書順で 20240101000000_initial_schema.sql より先に走ってしまう順序バグ」を解消した旨を更新
- リネーム後は `supabase db diff` で差分が無いことを確認
