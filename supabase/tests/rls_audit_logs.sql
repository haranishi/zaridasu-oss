-- REQ-134: audit_logs append-only invariant の自動テスト (pg-tap)
--
-- 検証観点:
--   1) admin JWT で SELECT 可
--   2) 非 admin (authenticated) JWT で SELECT は 0 件
--   3) admin JWT で INSERT 可
--   4) admin JWT で UPDATE は 0 rows affected (UPDATE policy 不在で deny)
--   5) admin JWT で DELETE は 0 rows affected
--   6) pg_policies に admin_all_audit_logs (drift) が存在しない
--   7) pg_policies に UPDATE / DELETE policy が存在しない

BEGIN;
SELECT plan(7);

-- ===================================================
-- セットアップ: admin / authenticated ユーザー + 1 audit log
-- ===================================================
INSERT INTO auth.users (id, email, raw_app_meta_data)
VALUES
  ('44444444-4444-4444-4444-444444444444', 'audit-admin@test.local',       '{"role":"admin"}'::jsonb),
  ('55555555-5555-5555-5555-555555555555', 'audit-authuser@test.local',    '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- 1 件 audit log を投入 (service_role で bypass)
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
INSERT INTO audit_logs (admin_id, action, target_type, target_id, details)
VALUES ('44444444-4444-4444-4444-444444444444', 'delete_post', 'post', '00000000-0000-0000-0000-000000000099', '{}'::jsonb)
RETURNING id \gset

-- ===================================================
-- INV-01: admin JWT で SELECT 可
-- ===================================================
SELECT set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated","app_metadata":{"role":"admin"}}', true);
SET LOCAL ROLE authenticated;

SELECT ok(
  (SELECT COUNT(*) FROM audit_logs WHERE id = :'id') = 1,
  'INV-01: admin JWT で audit_logs を SELECT 可'
);

-- ===================================================
-- INV-02: 非 admin (authenticated) JWT は 0 件
-- ===================================================
SELECT set_config('request.jwt.claims', '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated","app_metadata":{}}', true);

SELECT is_empty(
  format($q$SELECT id FROM audit_logs WHERE id = %L$q$, :'id'),
  'INV-02: 非 admin authenticated は audit_logs を SELECT 不可'
);

-- ===================================================
-- INV-03: admin JWT で INSERT 可
-- ===================================================
SELECT set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated","app_metadata":{"role":"admin"}}', true);

SELECT lives_ok(
  $$INSERT INTO audit_logs (admin_id, action, target_type, target_id, details)
    VALUES ('44444444-4444-4444-4444-444444444444', 'approve_post', 'post', '00000000-0000-0000-0000-0000000000aa', '{}'::jsonb)$$,
  'INV-03: admin JWT で audit_logs に INSERT 可'
);

-- ===================================================
-- INV-04: admin JWT で UPDATE は 0 rows affected (RLS deny)
-- ===================================================
WITH u AS (
  UPDATE audit_logs SET action = 'approve_post' WHERE id = :'id'::uuid RETURNING 1
)
SELECT is((SELECT COUNT(*)::int FROM u), 0, 'INV-04: admin JWT でも UPDATE は 0 rows (UPDATE policy なし)');

-- ===================================================
-- INV-05: admin JWT で DELETE は 0 rows affected (RLS deny)
-- ===================================================
WITH d AS (
  DELETE FROM audit_logs WHERE id = :'id'::uuid RETURNING 1
)
SELECT is((SELECT COUNT(*)::int FROM d), 0, 'INV-05: admin JWT でも DELETE は 0 rows (DELETE policy なし)');

-- ===================================================
-- INV-06: admin_all_audit_logs (drift) が存在しない
-- ===================================================
RESET ROLE;
SELECT is(
  (SELECT COUNT(*)::int FROM pg_policies WHERE schemaname='public' AND tablename='audit_logs' AND policyname='admin_all_audit_logs'),
  0,
  'INV-06: admin_all_audit_logs policy は復活していない (drift invariant)'
);

-- ===================================================
-- INV-07: UPDATE / DELETE policy が存在しない (append-only invariant)
-- ===================================================
SELECT is(
  (SELECT COUNT(*)::int FROM pg_policies WHERE schemaname='public' AND tablename='audit_logs' AND cmd IN ('UPDATE','DELETE')),
  0,
  'INV-07: audit_logs に UPDATE / DELETE policy は存在しない (append-only)'
);

SELECT * FROM finish();
ROLLBACK;
