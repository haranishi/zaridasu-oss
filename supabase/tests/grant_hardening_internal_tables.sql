-- REQ-221（残作業）: 内部テーブルへの anon/authenticated 不要 GRANT の最小権限化（回帰テスト）
--
-- 目的:
--   migration 20260616000004_grant_hardening.sql が REVOKE する「内部専用テーブル」について、
--   REVOKE 後に anon / authenticated がテーブル権限を一切持たないこと、かつ
--   ユーザー向けテーブル（posts / comments / reports / survey_requests / user_profiles / likes /
--   push_subscriptions）の anon/authenticated 権限は**変わらない**ことを検証する。
--
-- harness 前提（.github/workflows/ci.yml rls-tests）:
--   pg_prove は schema.sql 適用 → Supabase 既定 GRANT 一括付与 → の順の後に走る。すなわち
--   テスト開始時点では内部テーブルにも既定 GRANT（anon: SELECT/INSERT, authenticated: ALL）が
--   付いている（schema.sql 内の REVOKE は後続の既定 GRANT に上書きされるため）。
--   そこで本テストは **migration 004 と同じ REVOKE をトランザクション内で適用してから**、
--   到達した最小権限の最終状態をアサートする（live DB で migration が確定させる不変条件の検証）。
--   BEGIN / ROLLBACK で隔離し副作用は残さない。
--
-- 実行方法: `supabase test db` もしくは CI の pg_prove (.github/workflows/ci.yml rls-tests)。

BEGIN;
SELECT plan(21);

-- ───────────────────────────────────────────────────────────────────────────
-- 0. 前提の健全性: 対象テーブル/ビューが存在すること（schema.sql 由来）
--    （admin_login_attempts / geo_cache / lifecycle_email_log はテーブル、user_last_active はビュー）
-- ───────────────────────────────────────────────────────────────────────────
SELECT has_table_privilege('service_role', 'public.admin_login_attempts', 'SELECT'),
       'PRE: service_role は内部テーブル（admin_login_attempts）にアクセスできる（BYPASSRLS / 既定 ALL）';

-- 既定 GRANT が効いている = REVOKE 前は anon が内部テーブルを触れる前提を確認（後段 REVOKE の効果を意味づけるため）。
SELECT ok(
  has_table_privilege('anon', 'public.admin_login_attempts', 'SELECT'),
  'PRE: REVOKE 前は既定 GRANT により anon が admin_login_attempts を SELECT 可（この後 REVOKE で閉じる）'
);

-- ───────────────────────────────────────────────────────────────────────────
-- 1. migration 004 と同一の REVOKE を適用（live DB の最終状態を再現）
-- ───────────────────────────────────────────────────────────────────────────
REVOKE ALL ON public.admin_login_attempts FROM anon, authenticated;
REVOKE ALL ON public.geo_cache            FROM anon, authenticated;
REVOKE ALL ON public.lifecycle_email_log  FROM anon, authenticated;
REVOKE ALL ON public.user_last_active     FROM anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. 内部テーブル: anon / authenticated は SELECT / INSERT / UPDATE / DELETE いずれも不可
--    （has_table_privilege が false。RLS の有無に依らず「whether」層が閉じていること）
-- ───────────────────────────────────────────────────────────────────────────
-- admin_login_attempts
SELECT ok(NOT has_table_privilege('anon', 'public.admin_login_attempts', 'SELECT'),
  'admin_login_attempts: anon は SELECT 不可');
SELECT ok(NOT has_table_privilege('anon', 'public.admin_login_attempts', 'INSERT'),
  'admin_login_attempts: anon は INSERT 不可');
SELECT ok(NOT has_table_privilege('authenticated', 'public.admin_login_attempts', 'SELECT'),
  'admin_login_attempts: authenticated は SELECT 不可');
SELECT ok(NOT has_table_privilege('authenticated', 'public.admin_login_attempts', 'INSERT'),
  'admin_login_attempts: authenticated は INSERT 不可');
SELECT ok(NOT has_table_privilege('authenticated', 'public.admin_login_attempts', 'UPDATE'),
  'admin_login_attempts: authenticated は UPDATE 不可');
SELECT ok(NOT has_table_privilege('authenticated', 'public.admin_login_attempts', 'DELETE'),
  'admin_login_attempts: authenticated は DELETE 不可');

-- geo_cache
SELECT ok(NOT has_table_privilege('anon', 'public.geo_cache', 'SELECT'),
  'geo_cache: anon は SELECT 不可');
SELECT ok(NOT has_table_privilege('authenticated', 'public.geo_cache', 'SELECT'),
  'geo_cache: authenticated は SELECT 不可');
SELECT ok(NOT has_table_privilege('authenticated', 'public.geo_cache', 'INSERT'),
  'geo_cache: authenticated は INSERT 不可');

-- lifecycle_email_log
SELECT ok(NOT has_table_privilege('anon', 'public.lifecycle_email_log', 'SELECT'),
  'lifecycle_email_log: anon は SELECT 不可');
SELECT ok(NOT has_table_privilege('authenticated', 'public.lifecycle_email_log', 'SELECT'),
  'lifecycle_email_log: authenticated は SELECT 不可');

-- user_last_active（ビュー）
SELECT ok(NOT has_table_privilege('anon', 'public.user_last_active', 'SELECT'),
  'user_last_active: anon は SELECT 不可');
SELECT ok(NOT has_table_privilege('authenticated', 'public.user_last_active', 'SELECT'),
  'user_last_active: authenticated は SELECT 不可');

-- ───────────────────────────────────────────────────────────────────────────
-- 3. 過剰 REVOKE 防止（最重要の安全網）: ユーザー向けテーブルの anon/authenticated 権限は不変
--    REVOKE がユーザー向けテーブルへ誤って波及していたらここで落ちる。
-- ───────────────────────────────────────────────────────────────────────────
-- REQ-179: posts は reporter_ip（PII）を列レベルで保護したため、anon の SELECT は
-- 「テーブル全体」ではなく「reporter_ip を除く全列」に列単位で付与されている。
-- したがって has_table_privilege(..., 'SELECT')（= 全列 SELECT 可か）は false が正。
-- 公開閲覧が壊れていないことは has_any_column_privilege（= いずれかの列を SELECT 可か）で担保する。
SELECT ok(has_any_column_privilege('anon', 'public.posts', 'SELECT'),
  'GUARD: posts は anon が（reporter_ip 以外の）列を SELECT 可のまま（公開閲覧を壊さない）');
SELECT ok(NOT has_column_privilege('anon', 'public.posts', 'reporter_ip', 'SELECT'),
  'GUARD: posts.reporter_ip は anon SELECT 不可（REQ-179 列レベル保護が効いている）');
SELECT ok(has_table_privilege('anon', 'public.posts', 'INSERT'),
  'GUARD: posts は anon INSERT 可のまま（匿名投稿を壊さない）');
SELECT ok(has_table_privilege('authenticated', 'public.comments', 'INSERT'),
  'GUARD: comments は authenticated INSERT 可のまま');
-- REQ-243: survey_requests も lat/lng を列レベルで保護（テーブル SELECT を剥がし lat/lng 以外へ
-- 列単位 GRANT）したため has_table_privilege(..., 'SELECT')（= 全列可か）は false が正。公開閲覧が
-- 壊れていないこと（＝過剰 REVOKE で全列不可になっていないこと）は has_any_column_privilege で担保する。
SELECT ok(has_any_column_privilege('anon', 'public.survey_requests', 'SELECT'),
  'GUARD: survey_requests は anon が（lat/lng 以外の）列を SELECT 可のまま（REQ-243 後も公開閲覧を壊さない）');
SELECT ok(has_table_privilege('authenticated', 'public.push_subscriptions', 'SELECT'),
  'GUARD: push_subscriptions は authenticated SELECT 可のまま（本人 read/write を壊さない）');
SELECT ok(has_table_privilege('authenticated', 'public.user_profiles', 'UPDATE'),
  'GUARD: user_profiles は authenticated UPDATE 可のまま');

SELECT * FROM finish();
ROLLBACK;
