-- REQ-214: set_user_admin_role の freshness / 自己操作禁止の自動テスト (pg-tap)
--
-- 背景: 権限昇格・剥奪のような高リスク操作は、JWT 内クレーム (app_metadata.role) ではなく
--       DB 側 (auth.users.raw_app_meta_data) の role を都度 SELECT して検証する必要がある。
--       JWT クレームはトークン更新までスナップショットが残るため、admin を剥奪された直後でも
--       旧トークンには role=admin が残り得る (freshness ギャップ)。set_user_admin_role は
--       schema.sql で auth.uid() が示す DB 行から role を読むため、設計意図としては freshness を
--       満たすはずである。
--
-- !!! 重要な発見 (REQ-214 監査) → REQ-221 で修正済み !!!
--   旧 schema.sql の `IF caller_role != 'admin' THEN RAISE EXCEPTION` は、呼び出し元の
--   raw_app_meta_data に role キーが無い (= NULL) 場合に「NULL != 'admin' は NULL (偽)」
--   となり例外が発火しなかった。すなわち:
--     (1) role を持たない通常ユーザー (role IS NULL) が他ユーザーを admin に昇格できてしまう
--     (2) admin を剥奪された旧管理者は role キーが除去され NULL になるため、
--         freshness チェックを素通りして昇格を続行できてしまう (freshness 保護の破れ)
--   修正 (REQ-221): `IF caller_role IS DISTINCT FROM 'admin' THEN ...` に変更し、NULL も非 admin
--   として弾くようにした (schema.sql + supabase/migrations/20260616000001_supabase_hardening.sql)。
--   これに伴い INV-01 / INV-02 の todo() を解除し、通常アサーションに戻している。詳細は
--   docs/security/server-auth-audit.md / docs/runbooks/supabase-hardening-checklist.md。
--
-- 検証観点:
--   INV-01: (freshness) DB は非 admin だが JWT に role=admin を載せた呼び出し元は昇格不可
--   INV-02: role を持たない非 admin は昇格不可
--   INV-03: 自分自身の昇格は禁止 (schema.sql 自己操作ガード) — 現状 PASS
--   INV-04: 自分自身の剥奪も禁止 — 現状 PASS
--   INV-05: 正規 admin (DB 行が admin) は他ユーザーを昇格でき DB に反映される (正常系) — 現状 PASS
--
-- 実行方法: `supabase test db` もしくは CI の pg_prove (.github/workflows/ci.yml rls-tests)。
-- 各テストは BEGIN / ROLLBACK で isolation。副作用は残さない。

BEGIN;
SELECT plan(5);

-- ===================================================
-- セットアップ: 正規 admin / 非 admin / 昇格対象 の 3 ユーザー
-- ===================================================
-- a... = DB 上 admin、b... = DB 上 非 admin (role キー無し)、c... = 昇格/剥奪の対象
INSERT INTO auth.users (id, email, raw_app_meta_data)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'role-admin@test.local',    '{"role":"admin"}'::jsonb),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'role-nonadmin@test.local', '{}'::jsonb),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'role-target@test.local',   '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- JWT クレームを設定するヘルパー (既存 rls_posts.sql と同書式)
CREATE OR REPLACE FUNCTION _set_jwt(claims jsonb) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', claims::text, true);
END;$$;
-- 関数の EXECUTE は既定で閉じている（REQ-316）。この補助関数は、ログイン済み・匿名の権限に切り替えた後でも
-- 呼ぶので、明示で許可する。
GRANT EXECUTE ON FUNCTION _set_jwt(jsonb) TO PUBLIC;

-- ===================================================
-- INV-01: freshness — DB は非 admin だが JWT クレームに role=admin を偽装した
--         呼び出し元 (b...) は昇格 RPC で EXCEPTION になるべき
--         (set_user_admin_role が JWT ではなく DB 行を見ている証拠)
--   ※ 現状コードは caller_role が NULL のとき `NULL != 'admin'` が偽になり例外を出さない欠陥が
--     あるため TODO でマーク。schema.sql を `IS DISTINCT FROM` 修正すれば ok に変わる。
-- ===================================================
SELECT _set_jwt(
  '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated","app_metadata":{"role":"admin"}}'::jsonb
);

-- REQ-221 で schema.sql / migration を `IS DISTINCT FROM 'admin'` に修正済み。todo() を解除。
SELECT throws_ok(
  $$SELECT set_user_admin_role('cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, true)$$,
  NULL,
  '管理者権限が必要です',
  'INV-01: JWT に role=admin を載せても DB が非 admin なら昇格不可 (freshness)'
);

-- ===================================================
-- INV-02: role を持たない非 admin (b...) は昇格できないべき
--   ※ 同じ NULL 比較欠陥に該当するため TODO でマーク。
-- ===================================================
SELECT _set_jwt(
  '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated","app_metadata":{}}'::jsonb
);

-- REQ-221 修正後は role IS NULL の非 admin も弾かれる。todo() を解除。
SELECT throws_ok(
  $$SELECT set_user_admin_role('cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, true)$$,
  NULL,
  '管理者権限が必要です',
  'INV-02: 非 admin は昇格 RPC を実行できない'
);

-- ===================================================
-- INV-03: 自分自身の昇格は禁止 (正規 admin a... が自分を target にする) — 現状 PASS
-- ===================================================
SELECT _set_jwt(
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated","app_metadata":{"role":"admin"}}'::jsonb
);

SELECT throws_ok(
  $$SELECT set_user_admin_role('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, true)$$,
  NULL,
  '自分自身の管理者権限は変更できません',
  'INV-03: admin でも自分自身の昇格はできない'
);

-- ===================================================
-- INV-04: 自分自身の剥奪も禁止 (grant=false でも self は弾かれる) — 現状 PASS
-- ===================================================
SELECT throws_ok(
  $$SELECT set_user_admin_role('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, false)$$,
  NULL,
  '自分自身の管理者権限は変更できません',
  'INV-04: admin でも自分自身の剥奪はできない'
);

-- ===================================================
-- INV-05: 正常系 — DB 上 admin の a... は他ユーザー c... を昇格でき DB に反映される — 現状 PASS
-- ===================================================
SELECT _set_jwt(
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated","app_metadata":{"role":"admin"}}'::jsonb
);
SELECT set_user_admin_role('cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, true);

SELECT is(
  (SELECT raw_app_meta_data->>'role'
     FROM auth.users
    WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
  'admin',
  'INV-05: 正規 admin は他ユーザーを admin に昇格でき、DB に反映される (正常系)'
);

SELECT * FROM finish();
ROLLBACK;
