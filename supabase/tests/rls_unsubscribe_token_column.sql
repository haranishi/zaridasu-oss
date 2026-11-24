-- security-hardening 要件4: 配信停止トークン（user_profiles.unsubscribe_token）を、本人以外が読めない。
--
-- 不具合: 公開プロフィールの行は、テーブル全体のSELECT権限で読める。トークンの列も含まれ、匿名が読んだトークンで
--   apply_unsubscribe(トークン, 'all') を呼ぶと、他人の通知3種を全て止められた。修正前のコードでは 1・2・3・4 が落ちる。
-- 前提（.github/workflows/ci.yml）: Supabase 既定の一括 GRANT の後に、migration 20261021120300 を当て直す。
--   テスト自身は権限を変更しない。

BEGIN;
SELECT plan(9);

-- 準備（管理者権限）: 公開プロフィールの利用者 V。通知はすべて有効にしておく。
SELECT set_config('request.jwt.claims', '{}', true);
INSERT INTO auth.users (id, email) VALUES ('e1e1e1e1-0000-0000-0000-000000000001', 'victim@example.test');
UPDATE user_profiles
   SET is_public = true, notify_research_adopted = true, notify_dormant_reengage = true, notify_weekly_digest = true
 WHERE id = 'e1e1e1e1-0000-0000-0000-000000000001';
-- 本人のトークンを、後で匿名の呼び出しに渡す（実際のメールのリンクに入る値）
SELECT set_config('test.token',
  (SELECT unsubscribe_token::text FROM user_profiles WHERE id = 'e1e1e1e1-0000-0000-0000-000000000001'), true);

-- ── 権限の状態 ──────────────────────────────────────────────────────
SELECT is(has_column_privilege('anon', 'public.user_profiles', 'unsubscribe_token', 'SELECT'), false,
  'SEC-4-1: 匿名は、配信停止トークンの列を読めない');
SELECT is(has_column_privilege('authenticated', 'public.user_profiles', 'unsubscribe_token', 'SELECT'), false,
  'SEC-4-2: ログイン済みも、配信停止トークンの列を読めない');
SELECT is(has_column_privilege('service_role', 'public.user_profiles', 'unsubscribe_token', 'SELECT'), true,
  'SEC-4-3: メール送信側（service_role）は、トークンを読める');

-- トークン以外の列は、これまでどおり読める（画面を壊していない）
SELECT is(
  (SELECT coalesce(string_agg(a.attname, ',' ORDER BY a.attnum), '')
     FROM pg_attribute a
    WHERE a.attrelid = 'public.user_profiles'::regclass AND a.attnum > 0 AND NOT a.attisdropped
      AND a.attname <> 'unsubscribe_token'
      AND NOT (has_column_privilege('anon', a.attrelid, a.attnum, 'SELECT')
           AND has_column_privilege('authenticated', a.attrelid, a.attnum, 'SELECT'))),
  '',
  'SEC-4-4: トークン以外の全ての列を、匿名・ログイン済みとも、これまでどおり読める'
);

-- ── 実際に読んでみる ────────────────────────────────────────────────
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);

SELECT throws_ok(
  $$SELECT unsubscribe_token FROM public.user_profiles WHERE is_public$$,
  '42501', NULL,
  'SEC-4-5: 匿名が公開プロフィールからトークンを読もうとすると、権限エラーになる'
);
SELECT lives_ok(
  $$SELECT id, display_name, avatar_emoji FROM public.user_profiles WHERE is_public$$,
  'SEC-4-6: 匿名は、公開プロフィールの名前とアイコンを、これまでどおり読める'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"e1e1e1e1-0000-0000-0000-000000000001"}', true);

SELECT throws_ok(
  $$SELECT unsubscribe_token FROM public.user_profiles WHERE id = 'e1e1e1e1-0000-0000-0000-000000000001'$$,
  '42501', NULL,
  'SEC-4-7: 本人でも、トークンの列は読めない（画面は読まない設計）'
);

-- ── 正しいトークンでの配信停止は動く（匿名の配信停止ページ）──────────────
RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);

SELECT is(
  public.apply_unsubscribe(current_setting('test.token')::uuid, 'weekly_digest'), true,
  'SEC-4-8: メールのリンクの正しいトークンで、配信停止は今までどおり成功する'
);

RESET ROLE;
SELECT is(
  (SELECT notify_weekly_digest FROM user_profiles WHERE id = 'e1e1e1e1-0000-0000-0000-000000000001'),
  false,
  'SEC-4-9: 配信停止した種類（週次）だけが無効になる'
);

SELECT * FROM finish();
ROLLBACK;
