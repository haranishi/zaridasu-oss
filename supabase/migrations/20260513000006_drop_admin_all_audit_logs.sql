-- REQ-134: audit_logs.admin_all_audit_logs (drift policy) の完全削除
--
-- 背景:
--   REQ-020 で「audit_logs は append-only（INSERT のみ）」と決定済みだが、
--   本番 pg_policies には `admin_all_audit_logs` (FOR ALL TO authenticated) が
--   ドリフトで残っており、admin の JWT 漏洩や内部不正による証跡改竄が可能な状態。
--   schema.sql:343 もこの policy を作る DO ブロックを残しており、`supabase db reset` で
--   恒常的に復活していた。本 migration でドリフトを清算し、admin_read / admin_insert の
--   2 本のみが残るよう再定義する。schema.sql の drift 源は同 PR 内で別途削除する。

BEGIN;

-- REQ-020 / REQ-134: admin であっても UPDATE/DELETE 不可。
DROP POLICY IF EXISTS "admin_all_audit_logs"   ON public.audit_logs;
-- 念のため、過去の命名揺れも掃除（idempotent）
DROP POLICY IF EXISTS "audit_logs_admin_all"   ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_admin_write" ON public.audit_logs;

-- 想定 2 本を idempotent に再作成（既存なら NOOP）
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
