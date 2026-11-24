-- REQ-316 の続き / security-hardening 要件1: SECURITY DEFINER 関数の EXECUTE 権限が既定で閉じていること。
--
-- 守るもの:
--   (1) 匿名（anon）と PUBLIC が実行できる SECURITY DEFINER 関数（トリガー関数を除く）は、下の許可リストだけ。
--       許可リストに無い関数が 1 本でも開いていたら、名前つきで落ちる。
--   (2) 内部専用の関数は service_role だけ。管理者・本人用の関数は匿名と PUBLIC に閉じている。
--   (3) 公開が仕様の関数（ランキング・公開プロフィール・配信停止）は、匿名で今までどおり実行できる。
--   (4) これから作る関数は、明示の GRANT が無ければ匿名・ログイン済みから実行できない（既定の権限）。
--
-- ★テスト自身は権限を変更しない★（変えると、migration から行が消えても通ってしまう）。
-- 前提（.github/workflows/ci.yml rls-tests）: schema.sql → Supabase 既定の一括 GRANT と既定権限の付与 →
--   関数 REVOKE の再確定 → migration 20261021120000 を最後に当てる。
--
-- 許可リストに足すときは、匿名に見せてよい理由を添え、本体が NULL の呼び出し（未ログイン）で
-- 他人のデータを返さないことを確かめる（過去に get_user_collection / get_user_progress で素通りした）。

BEGIN;
SELECT plan(12);

CREATE TEMP TABLE allow_anon (sig text PRIMARY KEY, why text) ON COMMIT DROP;
INSERT INTO allow_anon VALUES
  ('public.apply_unsubscribe(uuid,text)',            '未ログインの配信停止ページ。トークンを鍵として認可する'),
  ('public.get_my_experiment_variants()',            '未ログインは空を返す。実験の割付を読むだけ'),
  ('public.get_user_collection(uuid)',               '公開プロフィール。is_public に従う'),
  ('public.get_user_diversity(integer,integer)',     '公開ランキング'),
  ('public.get_user_profile(uuid)',                  '公開プロフィール'),
  ('public.get_user_progress(uuid)',                 '公開プロフィール。is_public に従う'),
  ('public.get_user_quality(integer,integer)',       '公開ランキング'),
  ('public.get_user_ranking(integer,integer,text)',  '公開ランキング'),
  ('public.resolve_unsubscribe_token(uuid)',         '配信停止ページ（現行の画面は未使用。REQ-316 未確定事項4）');

CREATE TEMP TABLE internal_only (sig text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO internal_only VALUES
  ('private.call_ai_edge_function(text,jsonb)'),
  ('public._kpi_assert_admin()'),
  ('public.call_lifecycle_edge_function(text,jsonb)'),
  ('public.call_notify_research_adopted(jsonb)'),
  ('public.call_notify_survey_request(jsonb)'),
  ('public.call_send_push(jsonb)'),
  ('public.deactivate_push_subscription(text)'),
  ('public.extract_request_ip()'),
  ('public.get_lifecycle_unsubscribe_rate(integer)'),
  ('public.get_municipality_weekly_digest(text)'),
  ('public.get_weekly_digest_recipients(integer)'),
  ('public.prune_disabled_push_subscriptions(integer)'),
  ('public.recompute_all_collections()'),
  ('public.recompute_all_progress()'),
  ('public.req_is_admin()'),
  ('public.run_ai_anomaly_check()'),
  ('public.run_dormant_reengage_batch()'),
  ('public.run_weekly_digest_batch()');

CREATE TEMP TABLE signed_in_only (sig text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO signed_in_only VALUES
  ('public.adopt_post_research(uuid,boolean)'),
  ('public.delete_own_account()'),
  ('public.get_admin_post_locations(uuid[])'),
  ('public.get_admin_user_list()'),
  ('public.get_ai_accuracy_stats()'),
  ('public.get_ai_cost_summary(integer)'),
  ('public.get_audit_logs(integer,integer,text,timestamptz,timestamptz,uuid)'),
  ('public.get_experiment_metrics(text,timestamptz,timestamptz)'),
  ('public.get_kpi_quality_funnel(timestamptz,timestamptz,numeric)'),
  ('public.get_kpi_summary(numeric)'),
  ('public.get_my_post_location(uuid)'),
  ('public.get_retention_cohorts(integer)'),
  ('public.get_user_activity(uuid)'),
  ('public.set_post_location_disclosure(uuid,text)'),
  ('public.set_species_location_default(text,text)'),
  ('public.set_user_admin_role(uuid,boolean)');

-- SECURITY DEFINER かつトリガーでない関数（拡張が持つものを除く）
CREATE TEMP VIEW definer_fns AS
  SELECT p.oid, p.oid::regprocedure::text AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE p.prosecdef AND p.prokind = 'f' AND p.prorettype <> 'trigger'::regtype
     AND n.nspname IN ('public', 'private')
     AND NOT EXISTS (SELECT 1 FROM pg_depend d
                      WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e');

-- ───────────────────────────────────────────────────────────────────────────
-- (1) 許可リスト以外が開いていない
-- ───────────────────────────────────────────────────────────────────────────
SELECT is(
  (SELECT coalesce(string_agg(sig, E'\n' ORDER BY sig), '')
     FROM definer_fns f
    WHERE has_function_privilege('anon', f.oid, 'EXECUTE')
      AND f.sig NOT IN (SELECT to_regprocedure(sig)::text FROM allow_anon WHERE to_regprocedure(sig) IS NOT NULL)),
  '',
  'REQ-316-01: 許可リスト以外の SECURITY DEFINER 関数を、匿名（anon）が実行できない'
);

SELECT is(
  (SELECT coalesce(string_agg(sig, E'\n' ORDER BY sig), '')
     FROM definer_fns f
    WHERE has_function_privilege('public', f.oid, 'EXECUTE')),
  '',
  'REQ-316-02: SECURITY DEFINER 関数に、PUBLIC（全員）への EXECUTE が付いていない'
);

-- ───────────────────────────────────────────────────────────────────────────
-- (3) 公開が仕様の関数は、匿名で実行できる（空振りの合格を防ぐ）
-- ───────────────────────────────────────────────────────────────────────────
SELECT is(
  (SELECT coalesce(string_agg(a.sig, E'\n' ORDER BY a.sig), '')
     FROM allow_anon a
    WHERE to_regprocedure(a.sig) IS NULL
       OR NOT has_function_privilege('anon', to_regprocedure(a.sig)::oid, 'EXECUTE')),
  '',
  'REQ-316-03: 公開が仕様の 9 本は存在し、匿名で実行できる（誤って閉じていない）'
);

-- ───────────────────────────────────────────────────────────────────────────
-- (2) 内部専用・管理者本人用
-- ───────────────────────────────────────────────────────────────────────────
SELECT is(
  (SELECT coalesce(string_agg(i.sig, E'\n' ORDER BY i.sig), '')
     FROM internal_only i
    WHERE to_regprocedure(i.sig) IS NOT NULL
      AND (has_function_privilege('anon', to_regprocedure(i.sig)::oid, 'EXECUTE')
        OR has_function_privilege('authenticated', to_regprocedure(i.sig)::oid, 'EXECUTE')
        OR has_function_privilege('public', to_regprocedure(i.sig)::oid, 'EXECUTE'))),
  '',
  'REQ-316-04: 内部専用の関数は、匿名・ログイン済み・PUBLIC のどれからも実行できない'
);

SELECT is(
  (SELECT coalesce(string_agg(i.sig, E'\n' ORDER BY i.sig), '')
     FROM internal_only i
    WHERE to_regprocedure(i.sig) IS NOT NULL
      AND NOT has_function_privilege('service_role', to_regprocedure(i.sig)::oid, 'EXECUTE')),
  '',
  'REQ-316-05: 内部専用の関数を、service_role は実行できる（Edge Function の経路を壊していない）'
);

SELECT is(
  (SELECT coalesce(string_agg(s.sig, E'\n' ORDER BY s.sig), '')
     FROM signed_in_only s
    WHERE to_regprocedure(s.sig) IS NOT NULL
      AND (has_function_privilege('anon', to_regprocedure(s.sig)::oid, 'EXECUTE')
        OR has_function_privilege('public', to_regprocedure(s.sig)::oid, 'EXECUTE'))),
  '',
  'REQ-316-06: 管理者・本人用の関数は、匿名と PUBLIC から実行できない'
);

SELECT is(
  (SELECT coalesce(string_agg(s.sig, E'\n' ORDER BY s.sig), '')
     FROM signed_in_only s
    WHERE to_regprocedure(s.sig) IS NOT NULL
      AND NOT has_function_privilege('authenticated', to_regprocedure(s.sig)::oid, 'EXECUTE')),
  '',
  'REQ-316-07: 管理者・本人用の関数を、ログイン済みは実行できる（管理画面・退会を壊していない）'
);

-- ───────────────────────────────────────────────────────────────────────────
-- 実際に呼んで確かめる（権限エラーになる／公開のものは通る）
-- ───────────────────────────────────────────────────────────────────────────
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);

SELECT throws_ok(
  $$SELECT * FROM public.get_weekly_digest_recipients(10)$$,
  '42501', NULL,
  'REQ-316-08: 匿名は、配信を希望する利用者の宛先一覧を取得できない'
);
SELECT throws_ok(
  $$SELECT public.prune_disabled_push_subscriptions(0)$$,
  '42501', NULL,
  'REQ-316-09: 匿名は、Push 購読の掃除（行の削除）を起動できない'
);
SELECT lives_ok(
  $$SELECT * FROM public.get_user_ranking(5, 0, 'all')$$,
  'REQ-316-10: 匿名は、公開ランキングを今までどおり取得できる'
);

RESET ROLE;

-- ───────────────────────────────────────────────────────────────────────────
-- (4) これから作る関数は既定で閉じている
-- ───────────────────────────────────────────────────────────────────────────
CREATE FUNCTION public.__req316_probe() RETURNS int LANGUAGE sql AS 'SELECT 1';

SELECT is(
  has_function_privilege('anon', 'public.__req316_probe()', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.__req316_probe()', 'EXECUTE')
    OR has_function_privilege('public', 'public.__req316_probe()', 'EXECUTE'),
  false,
  'REQ-316-11: 新しく作った関数は、明示の GRANT が無ければ匿名・ログイン済み・PUBLIC から実行できない'
);
SELECT ok(
  has_function_privilege('service_role', 'public.__req316_probe()', 'EXECUTE'),
  'REQ-316-12: 新しく作った関数を、service_role は実行できる（既定の付与を残している）'
);

SELECT * FROM finish();
ROLLBACK;
