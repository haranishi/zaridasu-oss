## 目的

1. 本番から `admin_all_audit_logs` policy を確実に削除する
2. `supabase/schema.sql` 側の drift 源（L343）を削除し、`admin_read_audit_logs` / `admin_insert_audit_logs` の 2 本だけが残る状態に統一
3. CI で「`admin_all_audit_logs` が `pg_policies` に存在しないこと」を恒久的に assert する

## 要件

### 機能要件

- [ ] **FR-134-01: drift 修正 migration の追加**
  ファイル: `supabase/migrations/20260513000006_drop_admin_all_audit_logs.sql`
  ```sql
  BEGIN;

  -- REQ-020 / REQ-134: audit_logs は append-only。admin であっても UPDATE/DELETE 不可。
  DROP POLICY IF EXISTS "admin_all_audit_logs" ON public.audit_logs;

  -- 念のため、想定される 2 本以外も列挙して削除し、最終的に 2 本だけが残るよう冪等化
  DROP POLICY IF EXISTS "audit_logs_admin_all" ON public.audit_logs;
  DROP POLICY IF EXISTS "audit_logs_admin_write" ON public.audit_logs;

  -- 想定 2 本を CREATE OR REPLACE 相当で再作成（既存なら NOOP）
  DO $$ BEGIN
    CREATE POLICY "admin_read_audit_logs" ON public.audit_logs FOR SELECT TO authenticated
      USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  DO $$ BEGIN
    CREATE POLICY "admin_insert_audit_logs" ON public.audit_logs FOR INSERT TO authenticated
      WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  COMMENT ON TABLE public.audit_logs IS
    '管理者操作の監査ログ。整合性保護のため UPDATE/DELETE 不可 (REQ-020 / REQ-134)';

  COMMIT;
  ```

- [ ] **FR-134-02: `supabase/schema.sql` の drift 源削除**
  L343-346 の `CREATE POLICY "admin_all_audit_logs"` ブロックを削除し、代わりに以下を挿入（migration と同等の 2 本のみ）:
  ```sql
  DO $$ BEGIN CREATE POLICY "admin_read_audit_logs" ON audit_logs FOR SELECT TO authenticated
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  DO $$ BEGIN CREATE POLICY "admin_insert_audit_logs" ON audit_logs FOR INSERT TO authenticated
    WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  ```
  これにより `supabase db reset` でも `admin_all_audit_logs` は再生成されなくなる。

- [ ] **FR-134-03: コメント整合**
  `supabase/schema.sql:348` の `COMMENT ON TABLE audit_logs IS '管理者操作の監査ログ';` を `COMMENT ON TABLE audit_logs IS '管理者操作の監査ログ。整合性保護のため UPDATE/DELETE 不可 (REQ-020)';` に揃える。

