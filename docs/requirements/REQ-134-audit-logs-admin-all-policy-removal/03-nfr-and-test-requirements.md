### 非機能要件

- [ ] **NFR-134-01: 冪等性**
  migration を本番・staging・local に複数回適用しても副作用なし。

- [ ] **NFR-134-02: ロールバック容易性**
  万一 admin 削除フローで audit_logs を消す既存運用が見つかった場合、migration 1 本 revert で復旧可能。事前に `SELECT count(*) FROM audit_logs WHERE created_at < now() - interval '90 days'` 等を確認、運用ログ保全方針を変えるなら別 REQ で議論。

### テスト要件

- [ ] **FR-134-04: pg-tap テスト追加**
  ファイル: `supabase/tests/rls_audit_logs.sql`（新規、または既存があれば追記）
  以下のシナリオを実装:
  1. admin JWT で `SELECT * FROM audit_logs` → 成功
  2. authenticated（非 admin） JWT で `SELECT * FROM audit_logs` → 0 件（`is_empty`）
  3. admin JWT で `INSERT INTO audit_logs (admin_id, action, target_type, target_id) VALUES (...)` → 成功
  4. admin JWT で `UPDATE audit_logs SET action='approve_post' WHERE id = ...` → `0 rows affected`（policy で SELECT 不可ではないが、UPDATE policy が存在しないため RLS deny）。`is(rows_affected, 0)` で assert
  5. admin JWT で `DELETE FROM audit_logs WHERE id = ...` → `0 rows affected`
  6. **policy invariant**: `SELECT count(*) FROM pg_policies WHERE tablename='audit_logs' AND policyname='admin_all_audit_logs'` → **0**
  7. `SELECT count(*) FROM pg_policies WHERE tablename='audit_logs' AND cmd IN ('UPDATE','DELETE')` → **0**

- [ ] **FR-134-05: CI 統合**
  GitHub Actions の `supabase test db` ステップで上記が自動実行されること。`admin_all_audit_logs` 復活時にビルドが落ちる構造を保証。
