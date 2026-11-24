-- REQ-133: reports INSERT ポリシー drift 解消の自動テスト (pg-tap)
--
-- 検証観点:
--   1) anon が valid な reports を INSERT できる (validated_insert_reports を通過)
--   2) post_id IS NULL は policy で deny
--   3) reason が enum 外は CHECK 制約で deny
--   4) comment が 500 文字超は CHECK 制約で deny
--   5) tablename='reports' AND cmd='INSERT' の pg_policies 行数は 1 (重複していない)

BEGIN;
SELECT plan(5);

-- ===================================================
-- セットアップ: 1 ユーザー + 1 承認済み投稿 (FK 制約満たすため)
-- ===================================================
INSERT INTO auth.users (id, email, raw_app_meta_data)
VALUES ('33333333-3333-3333-3333-333333333333', 'reports-fixture@test.local', '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- service_role 相当で投稿を入れて FK 用に使う
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
INSERT INTO posts (lat, lng, species, info_type, user_id, is_anonymous, status)
VALUES (39.7, 140.1, 'american', 'sighting', '33333333-3333-3333-3333-333333333333', false, 'approved')
RETURNING id \gset

-- anon ロールで挑戦
SELECT set_config('request.jwt.claims', '{}', true);
SET LOCAL ROLE anon;

-- ===================================================
-- INV-01: anon が valid な reports を INSERT できる
-- ===================================================
SELECT lives_ok(
  format($q$INSERT INTO reports (post_id, reason) VALUES (%L, 'spam')$q$, :'id'),
  'INV-01: anon が validated_insert_reports policy で INSERT 成功'
);

-- ===================================================
-- INV-02: post_id IS NULL は policy で deny
-- ===================================================
SELECT throws_ok(
  $$INSERT INTO reports (post_id, reason) VALUES (NULL, 'spam')$$,
  NULL,
  NULL,
  'INV-02: post_id NULL は INSERT 不可'
);

-- ===================================================
-- INV-03: 不正な reason は CHECK 制約で deny
-- ===================================================
SELECT throws_ok(
  format($q$INSERT INTO reports (post_id, reason) VALUES (%L, 'invalid_reason')$q$, :'id'),
  NULL,
  NULL,
  'INV-03: reason enum 外は CHECK 違反で deny'
);

-- ===================================================
-- INV-04: comment 500 文字超は CHECK 制約で deny
-- ===================================================
SELECT throws_ok(
  format($q$INSERT INTO reports (post_id, reason, comment) VALUES (%L, 'spam', repeat('x', 1000))$q$, :'id'),
  NULL,
  NULL,
  'INV-04: comment 1000 文字は reports_comment_length CHECK で deny'
);

-- ===================================================
-- INV-05: pg_policies に INSERT policy が 1 本だけ
-- ===================================================
RESET ROLE;
SELECT is(
  (SELECT COUNT(*)::int FROM pg_policies WHERE schemaname='public' AND tablename='reports' AND cmd='INSERT'),
  1,
  'INV-05: reports の INSERT policy はちょうど 1 本 (drift なし)'
);

SELECT * FROM finish();
ROLLBACK;
