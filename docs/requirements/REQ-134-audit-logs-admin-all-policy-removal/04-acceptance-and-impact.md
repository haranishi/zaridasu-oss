## 受入条件

- [ ] **AC-134-01**: **Given** 本 migration を本番に適用済み、**When** `SELECT policyname, cmd FROM pg_policies WHERE tablename='audit_logs' ORDER BY policyname`、**Then** 結果は **2 行のみ**: `admin_insert_audit_logs (INSERT)`, `admin_read_audit_logs (SELECT)`。`admin_all_audit_logs` は **無い**。
- [ ] **AC-134-02**: **Given** admin JWT セッション、**When** `DELETE FROM audit_logs WHERE id = <existing>`、**Then** `0 rows affected`（RLS deny、エラーにはならず単に削除されない PostgreSQL の仕様通り）。
- [ ] **AC-134-03**: **Given** admin JWT セッション、**When** `UPDATE audit_logs SET action='approve_post' WHERE id = <existing>`、**Then** `0 rows affected`。
- [ ] **AC-134-04**: **Given** admin JWT セッション、**When** 新規 audit log を INSERT、**Then** 成功（既存 admin オペレーションが壊れない）。
- [ ] **AC-134-05**: **Given** 非 admin（authenticated）セッション、**When** `SELECT * FROM audit_logs`、**Then** 0 件（管理画面ログ閲覧の admin gating が機能）。
- [ ] **AC-134-06**: **Given** `supabase db reset` で `supabase/schema.sql` を再注入、**When** 完了後の `pg_policies` 確認、**Then** `admin_all_audit_logs` が生成されないこと（drift 源が消えている確認）。
- [ ] **AC-134-07**: **Given** CI の pg-tap、**When** 誰かが `admin_all_audit_logs` を復活させる migration を追加、**Then** invariant テストが fail して PR がブロックされる。

## 影響範囲

### 変更対象ファイル

| ファイル | 変更内容 |
|---|---|
| `supabase/migrations/20260513000006_drop_admin_all_audit_logs.sql` | 新規。drift policy DROP + 想定 2 本 CREATE（idempotent） |
| `supabase/schema.sql` | L343-346 を `admin_read_audit_logs` + `admin_insert_audit_logs` の 2 本に置換、L348 のコメント揃え |
| `supabase/tests/rls_audit_logs.sql` | 新規。pg-tap 7 ケース（policy invariant 含む） |

### 他機能への影響

- `src/lib/auditLog.ts` の `writeAuditLog`（admin 用クライアント INSERT）: `admin_insert_audit_logs` で許可されたままなので変化なし
- DB トリガー由来の audit_logs INSERT（`audit_post_deletion` 等）: `SECURITY DEFINER` のため RLS バイパス、変化なし
- `get_audit_logs(...)` RPC（schema.sql:678）: `SECURITY DEFINER` のため変化なし
- 管理画面の audit log 一覧表示: `admin_read_audit_logs` で従来通り SELECT 可
