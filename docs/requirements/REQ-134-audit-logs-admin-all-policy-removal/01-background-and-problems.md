## 背景

REQ-020 で「`audit_logs` は append-only（INSERT のみ、UPDATE/DELETE は admin であっても禁止）」と決定済み。これは監査証跡の整合性保証の要であり、admin の JWT が漏洩した場合でも証跡を改ざんできないようにする防御線。

repo 上は `supabase/migrations/20240101000001_rls_and_audit_triggers.sql:284` で `DROP POLICY IF EXISTS admin_all_audit_logs ON audit_logs` を実行し、`admin_read_audit_logs` (SELECT) と `admin_insert_audit_logs` (INSERT) の 2 本のみに分離している。

しかし本番 `pg_policies` を直接確認すると、いまだに `admin_all_audit_logs` (cmd=`ALL`, FOR ALL TO authenticated) が **共存** している。原因として以下のいずれかが疑われる:

1. 20240101000001 migration が本番に未適用（マイグレーション実行漏れ）
2. 適用後に手動で `CREATE POLICY admin_all_audit_logs` が再実行された（schema drift）
3. `supabase/schema.sql:343` の `CREATE POLICY admin_all_audit_logs` が `db reset` 系のオペレーションで再注入されている

`supabase/schema.sql:343-346` には:
```sql
DO $$ BEGIN CREATE POLICY "admin_all_audit_logs" ON audit_logs FOR ALL TO authenticated
  USING ( (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' )
  WITH CHECK ( (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
```
が残っており、schema.sql ベースで `supabase db reset` するたびに `admin_all_audit_logs` が復活する構造になっている。これが REQ-020 を恒常的に壊している真因。

## 現状の問題

### コード上の矛盾

- `supabase/schema.sql:343-346` — `admin_all_audit_logs` を作成（drift 源）
- `supabase/migrations/20240101000001_rls_and_audit_triggers.sql:284` — 同 policy を DROP
- 後段の `admin_read_audit_logs` (SELECT, L288) / `admin_insert_audit_logs` (INSERT, L296) は schema.sql に存在しない
- 結果として:
  - migration 順で適用すれば `admin_all_audit_logs` は消える
  - schema.sql ベースで一括適用すると最後に書かれた policy が共存

### 攻撃シナリオ

- admin の JWT を持つ攻撃者（admin 自身の悪意も含む）が `DELETE FROM audit_logs WHERE id = '<隠したい操作>'` を実行
- 現状の本番では `admin_all_audit_logs` が `FOR ALL ... USING role=admin` のため通る
- 監査ログ改ざんで「誰がいつ何を削除したか」が消える → REQ-020 の前提が破られる
- インシデント発生時の責任追跡不能

### 関連 REQ

- REQ-020: audit_logs の整合性保証（append-only） — 本 REQ がその実装ドリフトを修正
- REQ-025: RLS 整理（reports/posts/comments） — audit_logs には触れていない
