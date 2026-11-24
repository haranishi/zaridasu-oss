-- REQ-292: anon GRANT された RPC の認可欠陥修復（回帰テスト）
--
-- 検証対象（migration 20260730000001_req292_authz_defects_anon_granted_rpc.sql / schema.sql 同期済み）:
--   public.admin_login_record(text, boolean)
--   public.admin_login_check(text)
--   public.check_email_exists(text)
--   public.admin_login_password_attempt(jsonb)   ← 新設（Password Verification Attempt Hook）
--   public._req292_is_server_caller()            ← 新設（内部ヘルパ）
--
-- 検証観点:
--   AC-01 / AC-06  anon から実行できない（GRANT 不在 ＋ 実行で 42501）
--   AC-02          anon が到達できないので audit_logs の行数が増えない
--   FR-292-03      login_success は auth.uid() 実在 ＆ メール一致のときのみ（他人のメールは 42501）
--   FR-292-01      失敗記録（p_success=false）はサーバー側呼び出し元専用（authenticated は 42501）
--   AC-03 相当     Auth Hook 経路で 5 回失敗が記録され locked_until が立つ（サーバー側記録の実在）
--   問題A の再来防止  Auth Hook 関数を PostgREST 経由（claims あり）で呼んでも副作用が起きない
--   GUARD          管理者ログインの正常系（authenticated による自分の login_success 記録）を壊さない
--
-- harness 前提（.github/workflows/ci.yml rls-tests）:
--   pg_prove は schema.sql 適用 → Supabase 既定の一括 GRANT
--   （`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role`）→ の順の
--   後に走る。すなわちテスト開始時点では schema.sql 内の REVOKE が既定 GRANT に上書きされている。
--   そこで本テストは grant_hardening_internal_tables.sql と同じ流儀で、**migration と同一の REVOKE を
--   トランザクション内で適用してから**、到達した最小権限の最終状態をアサートする
--   （live DB では migration が確定させる不変条件の検証）。BEGIN / ROLLBACK で隔離し副作用は残さない。
--   ※本番では REQ-221（20260616000001）の ALTER DEFAULT PRIVILEGES により既定 PUBLIC EXECUTE が
--     付かないため、この再適用は CI harness の都合であって本番の実態ではない。
--
-- 実行方法: `supabase test db` もしくは CI の pg_prove (.github/workflows/ci.yml rls-tests)

BEGIN;
SELECT plan(28);

-- ───────────────────────────────────────────────────────────────────────────
-- 0. セットアップ: 検証用ユーザー 2 名 ＋ 監査ログのベースライン件数
-- ───────────────────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email, raw_app_meta_data)
VALUES
  ('92920000-0000-0000-0000-000000000001', 'req292-admin@test.local', '{"role":"admin"}'::jsonb),
  ('92920000-0000-0000-0000-000000000002', 'req292-other@test.local', '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

CREATE TEMP TABLE req292_baseline AS
  SELECT count(*)::int AS audit_n FROM audit_logs;

-- 「攻撃者が消したい試行カウンタ」を 1 行仕込む（問題A の再来検知に使う）。
INSERT INTO admin_login_attempts (email_hash, ip, attempt_count, window_started_at, updated_at)
VALUES (md5('req292-admin@test.local'), '', 4, now(), now())
ON CONFLICT (email_hash, ip) DO UPDATE SET attempt_count = 4, locked_until = NULL;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. migration と同一の REVOKE / GRANT を適用（live DB の最終状態を再現）
-- ───────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.admin_login_check(text)             FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_login_record(text, boolean)   FROM anon;
GRANT  EXECUTE ON FUNCTION public.admin_login_record(text, boolean)   TO   authenticated;
REVOKE EXECUTE ON FUNCTION public.check_email_exists(TEXT)            FROM anon, authenticated;
REVOKE ALL     ON FUNCTION public.admin_login_password_attempt(jsonb) FROM anon, authenticated;
REVOKE ALL     ON FUNCTION public._req292_is_server_caller()          FROM anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. AC-01 / AC-06: GRANT の直接検査（db reset で既定 GRANT が復活しても検知できるようにする）
-- ───────────────────────────────────────────────────────────────────────────
SELECT ok(
  NOT has_function_privilege('anon', 'public.admin_login_record(text, boolean)', 'EXECUTE'),
  'AC-06: anon は admin_login_record に EXECUTE を持たない'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.admin_login_check(text)', 'EXECUTE'),
  'AC-06: anon は admin_login_check に EXECUTE を持たない'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.check_email_exists(text)', 'EXECUTE'),
  'AC-06: anon は check_email_exists に EXECUTE を持たない（メール存在確認オラクルの閉塞）'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.admin_login_password_attempt(jsonb)', 'EXECUTE'),
  'AC-06: anon は Auth Hook 関数 admin_login_password_attempt に EXECUTE を持たない'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public._req292_is_server_caller()', 'EXECUTE'),
  'anon は内部ヘルパ _req292_is_server_caller に EXECUTE を持たない'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.admin_login_check(text)', 'EXECUTE'),
  'FR-292-02: authenticated も admin_login_check を実行できない（任意メールのロック状態問い合わせを封じる）'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.check_email_exists(text)', 'EXECUTE'),
  'FR-292-05: authenticated も check_email_exists を実行できない'
);
-- GUARD（過剰 REVOKE 防止）: 管理者ログイン成功時の自己申告経路は残す。
SELECT ok(
  has_function_privilege('authenticated', 'public.admin_login_record(text, boolean)', 'EXECUTE'),
  'GUARD: authenticated は admin_login_record を実行可のまま（login_success の自己申告を壊さない）'
);

-- ───────────────────────────────────────────────────────────────────────────
-- 3. AC-01: anon ロールでの実行が 42501 insufficient_privilege になる
-- ───────────────────────────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SET LOCAL ROLE anon;

SELECT throws_ok(
  $$ SELECT public.admin_login_record('req292-admin@test.local', true) $$,
  '42501', NULL,
  'AC-01: anon から admin_login_record は実行できない（問題A: 1 回の p_success=true でロック解除を封じる）'
);
SELECT throws_ok(
  $$ SELECT public.admin_login_record('req292-admin@test.local', false) $$,
  '42501', NULL,
  'AC-01: anon から admin_login_record(false) も実行できない（問題C: login_failed 注入を封じる）'
);
SELECT throws_ok(
  $$ SELECT public.check_email_exists('req292-admin@test.local') $$,
  '42501', NULL,
  'AC-01: anon から check_email_exists は実行できない（問題D: メール存在確認オラクル）'
);
SELECT throws_ok(
  $$ SELECT public.admin_login_check('req292-admin@test.local') $$,
  '42501', NULL,
  'AC-01: anon から admin_login_check は実行できない'
);
SELECT throws_ok(
  $$ SELECT public.admin_login_password_attempt('{"user_id":"92920000-0000-0000-0000-000000000001","valid":true}'::jsonb) $$,
  '42501', NULL,
  'AC-01: anon から Auth Hook 関数は実行できない'
);

RESET ROLE;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. AC-02: anon は到達できないので audit_logs は 1 行も増えていない
--    ＋ 問題A: 仕込んだ試行カウンタが消えていない
-- ───────────────────────────────────────────────────────────────────────────
SELECT is(
  (SELECT count(*)::int FROM audit_logs),
  (SELECT audit_n FROM req292_baseline),
  'AC-02: anon の呼び出しは全て権限エラーで到達しないため audit_logs は増えない'
);
SELECT is(
  (SELECT attempt_count FROM admin_login_attempts WHERE email_hash = md5('req292-admin@test.local') AND ip = ''),
  4,
  '問題A: anon は試行カウンタを削除・リセットできない'
);

-- ───────────────────────────────────────────────────────────────────────────
-- 5. FR-292-03: login_success は「auth.uid() 実在 ＆ メール一致」のときのみ
-- ───────────────────────────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims',
  '{"sub":"92920000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"role":"admin"}}', true);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$ SELECT public.admin_login_record('req292-other@test.local', true) $$,
  '42501', NULL,
  'FR-292-03: 他人のメールを申告した login_success は 42501（カウンタ削除にも監査記録にも到達しない）'
);
SELECT throws_ok(
  $$ SELECT public.admin_login_record('req292-admin@test.local', false) $$,
  '42501', NULL,
  'FR-292-01: authenticated は失敗記録に到達できない（login_failed 注入はサーバー側専用）'
);
SELECT lives_ok(
  $$ SELECT public.admin_login_record('req292-admin@test.local', true) $$,
  'AC-04: 本人（auth.uid() のメールと一致）なら login_success を記録できる'
);

RESET ROLE;

SELECT is(
  (SELECT count(*)::int FROM audit_logs
    WHERE action = 'login_success' AND admin_id = '92920000-0000-0000-0000-000000000001'),
  1,
  'AC-04: login_success が admin_id 非 NULL で 1 件記録される'
);
SELECT is(
  (SELECT count(*)::int FROM audit_logs WHERE action = 'login_success' AND admin_id IS NULL),
  0,
  '問題C: admin_id が NULL の login_success 行は作れない'
);
SELECT is(
  (SELECT count(*)::int FROM admin_login_attempts WHERE email_hash = md5('req292-admin@test.local')),
  0,
  'AC-04: 本人のログイン成功で試行カウンタが解除される（ip 条件なしで削除＝Auth Hook 記録も消える）'
);

-- ───────────────────────────────────────────────────────────────────────────
-- 5-b. _req292_is_server_caller() の二重ガード (1) の独立検証
--      role GUC（PostgREST が SET LOCAL ROLE で切り替える値。SECURITY DEFINER でも書き換わらない）が
--      anon / authenticated なら、claims が service_role を主張していても拒否する。
--      ＝claims 側のガード (2) が破れても閉じたままであることの確認。
-- ───────────────────────────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims',
  '{"sub":"92920000-0000-0000-0000-000000000001","role":"service_role"}', true);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$ SELECT public.admin_login_record('req292-admin@test.local', false) $$,
  '42501', NULL,
  '二重ガード(1): role GUC が authenticated なら claims が service_role を主張しても失敗記録を拒否する'
);

RESET ROLE;

-- ───────────────────────────────────────────────────────────────────────────
-- 6. 問題A の再来防止: Auth Hook 関数を PostgREST 経由（claims あり）で呼んでも副作用が無い
--    （将来 Supabase 既定の一括 GRANT EXECUTE が復活しても、anon がカウンタを消せない）
-- ───────────────────────────────────────────────────────────────────────────
INSERT INTO admin_login_attempts (email_hash, ip, attempt_count, window_started_at, updated_at)
VALUES (md5('req292-admin@test.local'), '', 4, now(), now())
ON CONFLICT (email_hash, ip) DO UPDATE SET attempt_count = 4, locked_until = NULL;

SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SELECT is(
  public.admin_login_password_attempt(
    '{"user_id":"92920000-0000-0000-0000-000000000001","valid":true}'::jsonb) ->> 'decision',
  'continue',
  'Auth Hook 関数は PostgREST 経由でも例外を投げず continue を返す（fail-open）'
);
SELECT is(
  (SELECT attempt_count FROM admin_login_attempts WHERE email_hash = md5('req292-admin@test.local') AND ip = ''),
  4,
  '問題A の再来防止: PostgREST 経由（claims あり）の Auth Hook 呼び出しは副作用を起こさない'
);

-- ───────────────────────────────────────────────────────────────────────────
-- 7. AC-03 相当: サーバー側（claims 無し = 直 DB 接続 / GoTrue）からは記録が積まれる
--    → `/auth/v1/token` 直叩きでもサーバー側に試行が残る（問題B の記録側の解消）
-- ───────────────────────────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims', '', true);

-- DO ブロックで呼ぶ（bare SELECT だと戻り値が TAP ストリームに混ざるため）。
DO $req292$
BEGIN
  FOR i IN 1..5 LOOP
    PERFORM public.admin_login_password_attempt(
      '{"user_id":"92920000-0000-0000-0000-000000000002","valid":false}'::jsonb);
  END LOOP;
END
$req292$;

SELECT is(
  (SELECT attempt_count FROM admin_login_attempts WHERE email_hash = md5('req292-other@test.local') AND ip = ''),
  5,
  'AC-03: Auth Hook 経路の 5 回失敗がサーバー側カウンタに積まれる'
);
SELECT ok(
  (SELECT locked_until IS NOT NULL AND locked_until > now()
     FROM admin_login_attempts WHERE email_hash = md5('req292-other@test.local') AND ip = ''),
  'AC-03: 5 回失敗で locked_until が立つ'
);
SELECT is(
  (SELECT count(*)::int FROM audit_logs
    WHERE action = 'login_failed' AND details ->> 'source' = 'auth_hook'),
  5,
  'AC-03: login_failed が 5 件（source=auth_hook）記録される＝偽造不能な監査証跡'
);
SELECT is(
  (SELECT count(DISTINCT details ->> 'email_hash')::int FROM audit_logs
    WHERE action = 'login_failed' AND details ->> 'source' = 'auth_hook'),
  1,
  '問題C との差: email_hash はサーバー側で auth.users から導出されるため呼び出し側が指定できない'
);

SELECT * FROM finish();
ROLLBACK;
