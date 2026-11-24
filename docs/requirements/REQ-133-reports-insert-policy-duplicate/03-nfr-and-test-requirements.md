### 非機能要件

- [ ] **NFR-133-01: 冪等性**
  migration を 2 回適用してもエラーにならない（`DROP POLICY IF EXISTS` + `DROP CONSTRAINT IF EXISTS` で担保）。

- [ ] **NFR-133-02: 後方互換**
  正規クライアント（`UnifiedReportButton` 等）は `post_id`/`reason` を必ず送るため挙動変化なし。`comment > 500 chars` を送る正規クライアントは存在しない（フロント側は既に 500 文字制限の UI）。

### テスト要件

- [ ] **FR-133-04: pg-tap テスト追加**
  ファイル: `supabase/tests/rls_reports.sql`（新規）
  以下のシナリオを `BEGIN; SELECT plan(N); ... ROLLBACK;` で実装:
  1. anon が `INSERT INTO reports (post_id, reason) VALUES (<valid post>, 'spam')` → 成功
  2. anon が `INSERT INTO reports (post_id, reason) VALUES (NULL, 'spam')` → `policy violation` で失敗（`throws_ok`）
  3. anon が `INSERT INTO reports (post_id, reason) VALUES (<valid post>, 'invalid_reason')` → CHECK 違反で失敗
  4. anon が `INSERT INTO reports (post_id, reason, comment) VALUES (<valid post>, 'spam', repeat('x', 1000))` → CHECK 制約違反で失敗
  5. `pg_policies` テーブルから `tablename='reports' AND cmd='INSERT'` を select したとき、行数が **ちょうど 1**（重複していないこと）

- [ ] **FR-133-05: CI 統合**
  GitHub Actions の DB テストジョブ（既存の `supabase test db` 経路）で `rls_reports.sql` が自動実行されること。
