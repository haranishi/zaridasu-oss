-- REQ-330: 調査計画（survey_plans / survey_plan_stops / survey_stop_posts）・希少種の記録（rare_sightings）・
--          非公開の写真置き場 rare-photos の権限と制約の自動テスト（pg-tap）。
-- 実行方法は rls_posts.sql と同じ（CI では pg_prove が tests/*.sql を自動検出）。
-- 前提: storage の代役（supabase/ci/storage_stub.sql）→ schema.sql → Supabase 既定 GRANT →
--       reapply-after-grants.txt（本 REQ の migration を含む）→ 関数 REVOKE の再確定、の後の DB 状態。
-- BEGIN / ROLLBACK で隔離し、副作用は残さない。
-- 行の id は固定値にしてある（\gset を使わない）。UPDATE / DELETE は lives_ok の単文で流し、
-- RESET ROLE（RLS の外）に戻ってから値を is() で確かめる。

BEGIN;
SELECT plan(107);

-- ── セットアップ: 管理者 / 調査する人 A / 他人 B / 上限を確かめる人 C ──
INSERT INTO auth.users (id, email, raw_app_meta_data)
VALUES
  ('55555555-5555-5555-5555-555555555555', 'admin330@test.local', '{"role":"admin"}'::jsonb),
  ('66666666-6666-6666-6666-666666666666', 'a330@test.local', '{}'::jsonb),
  ('77777777-7777-7777-7777-777777777777', 'b330@test.local', '{}'::jsonb),
  ('88888888-8888-8888-8888-888888888888', 'c330@test.local', '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- request.jwt.claims を利用者ごとに切り替える（トランザクション内だけ有効）
CREATE OR REPLACE FUNCTION _as330(uid text, is_admin boolean DEFAULT false) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', uid, 'role', 'authenticated',
    'app_metadata', CASE WHEN is_admin THEN json_build_object('role', 'admin') ELSE '{}'::json END
  )::text, true);
END;$$;
-- 関数の EXECUTE は既定で閉じている（REQ-316）。この補助関数は、ログイン済み・匿名の権限に切り替えた後でも
-- 呼ぶので、明示で許可する。
GRANT EXECUTE ON FUNCTION _as330(text, boolean) TO PUBLIC;

-- 投稿（つながりの相手）。A・B・管理者が 1 件ずつ自分で投稿する。
-- B の投稿は承認済みにして誰からも見える状態にする（RLS で見えないから拒否された、で通らないように）。
SELECT _as330('66666666-6666-6666-6666-666666666666');
SET LOCAL ROLE authenticated;
INSERT INTO posts (id, lat, lng, species, info_type, user_id, is_anonymous)
VALUES ('0330a003-0000-4000-8000-000000000001', 39.7111111, 140.1222222, 'american', 'sighting',
        '66666666-6666-6666-6666-666666666666', false);
SELECT _as330('77777777-7777-7777-7777-777777777777');
INSERT INTO posts (id, lat, lng, species, info_type, user_id, is_anonymous)
VALUES ('0330b003-0000-4000-8000-000000000001', 39.7222222, 140.1333333, 'american', 'absence',
        '77777777-7777-7777-7777-777777777777', false);
SELECT _as330('55555555-5555-5555-5555-555555555555', true);
INSERT INTO posts (id, lat, lng, species, info_type, user_id, is_anonymous)
VALUES ('0330c003-0000-4000-8000-000000000001', 39.7333333, 140.1444444, 'american', 'sighting',
        '55555555-5555-5555-5555-555555555555', false);
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
UPDATE posts SET status = 'approved' WHERE id = '0330b003-0000-4000-8000-000000000001';

-- ════════════════════════════════════════════════════════════════════════════
-- 1. anon は 4 表とも権限ごと持たない（AC-01）                                  [01-08]
-- ════════════════════════════════════════════════════════════════════════════
SELECT ok(NOT has_table_privilege('anon', 'public.survey_plans', 'SELECT, INSERT, UPDATE, DELETE'),
  'REQ-330-01: anon は survey_plans に権限を持たない');
SELECT ok(NOT has_table_privilege('anon', 'public.survey_plan_stops', 'SELECT, INSERT, UPDATE, DELETE'),
  'REQ-330-02: anon は survey_plan_stops に権限を持たない');
SELECT ok(NOT has_table_privilege('anon', 'public.survey_stop_posts', 'SELECT, INSERT, UPDATE, DELETE'),
  'REQ-330-03: anon は survey_stop_posts に権限を持たない');
SELECT ok(NOT has_table_privilege('anon', 'public.rare_sightings', 'SELECT, INSERT, UPDATE, DELETE'),
  'REQ-330-04: anon は rare_sightings に権限を持たない');

SELECT set_config('request.jwt.claims', '{}', true);
SET LOCAL ROLE anon;
SELECT throws_ok('SELECT count(*) FROM survey_plans', '42501', NULL,
  'REQ-330-05: anon の survey_plans の SELECT は 42501');
SELECT throws_ok('SELECT count(*) FROM survey_plan_stops', '42501', NULL,
  'REQ-330-06: anon の survey_plan_stops の SELECT は 42501');
SELECT throws_ok('SELECT count(*) FROM survey_stop_posts', '42501', NULL,
  'REQ-330-07: anon の survey_stop_posts の SELECT は 42501');
SELECT throws_ok('SELECT count(*) FROM rare_sightings', '42501', NULL,
  'REQ-330-08: anon の rare_sightings の SELECT は 42501');
RESET ROLE;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. survey_plans: 本人が作って変える・他人は 0 行・管理者は読むだけ             [09-25]
-- ════════════════════════════════════════════════════════════════════════════
SELECT _as330('66666666-6666-6666-6666-666666666666');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO survey_plans (id, user_id, title)
    VALUES ('0330a001-0000-4000-8000-000000000001', '66666666-6666-6666-6666-666666666666', '今日の調査')$$,
  'REQ-330-09: 本人は自分の計画を作れる'
);
SELECT is(
  (SELECT planned_on FROM survey_plans WHERE id = '0330a001-0000-4000-8000-000000000001'),
  (now() AT TIME ZONE 'Asia/Tokyo')::date,
  'REQ-330-10: 予定日の既定は日本時間の今日'
);
SELECT is(
  (SELECT status FROM survey_plans WHERE id = '0330a001-0000-4000-8000-000000000001'),
  'active',
  'REQ-330-11: 状態の既定は active'
);
SELECT throws_ok(
  $$INSERT INTO survey_plans (user_id, title) VALUES ('66666666-6666-6666-6666-666666666666', '   ')$$,
  '23514', NULL,
  'REQ-330-12: 空白だけの題名は保存できない'
);
SELECT throws_ok(
  $$INSERT INTO survey_plans (user_id, title) VALUES ('66666666-6666-6666-6666-666666666666', repeat('あ', 61))$$,
  '23514', NULL,
  'REQ-330-13: 61 字の題名は保存できない'
);
SELECT throws_ok(
  $$INSERT INTO survey_plans (user_id, title, status) VALUES ('66666666-6666-6666-6666-666666666666', '計画', 'paused')$$,
  '23514', NULL,
  'REQ-330-14: 状態は active / done / archived だけ'
);
SELECT throws_ok(
  $$INSERT INTO survey_plans (user_id, title) VALUES ('77777777-7777-7777-7777-777777777777', 'なりすまし')$$,
  '42501', NULL,
  'REQ-330-15: 他人名義の計画は作れない（RLS WITH CHECK）'
);

SELECT _as330('77777777-7777-7777-7777-777777777777');
SELECT lives_ok(
  $$INSERT INTO survey_plans (id, user_id, title)
    VALUES ('0330b001-0000-4000-8000-000000000001', '77777777-7777-7777-7777-777777777777', 'B の計画')$$,
  'REQ-330-16: 他人（B）も自分の計画を作れる'
);
SELECT is(
  (SELECT count(*)::int FROM survey_plans WHERE id = '0330a001-0000-4000-8000-000000000001'),
  0,
  'REQ-330-17: 他人（B）は A の計画を読めない（0 行）'
);
SELECT lives_ok(
  $$UPDATE survey_plans SET title = '書き換え' WHERE id = '0330a001-0000-4000-8000-000000000001'$$,
  'REQ-330-18: 他人の UPDATE は 0 行で終わる'
);
SELECT lives_ok(
  $$DELETE FROM survey_plans WHERE id = '0330a001-0000-4000-8000-000000000001'$$,
  'REQ-330-19: 他人の DELETE は 0 行で終わる'
);
RESET ROLE;
SELECT is(
  (SELECT title FROM survey_plans WHERE id = '0330a001-0000-4000-8000-000000000001'),
  '今日の調査',
  'REQ-330-20: 他人は計画を書き換えも削除もできていない'
);

SELECT _as330('66666666-6666-6666-6666-666666666666');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$UPDATE survey_plans
       SET title = '朝の調査', status = 'done',
           user_id = '77777777-7777-7777-7777-777777777777', created_at = '2000-01-01T00:00:00Z'
     WHERE id = '0330a001-0000-4000-8000-000000000001'$$,
  'REQ-330-21: 本人は自分の計画を更新できる'
);
RESET ROLE;
SELECT is(
  (SELECT user_id::text || '|' || title || '|' || status || '|' || (created_at > '2001-01-01'::timestamptz)::text
     FROM survey_plans WHERE id = '0330a001-0000-4000-8000-000000000001'),
  '66666666-6666-6666-6666-666666666666|朝の調査|done|true',
  'REQ-330-22: 題名と状態は変わり、所有者と作成日時は旧値に戻る'
);

SELECT _as330('55555555-5555-5555-5555-555555555555', true);
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*)::int FROM survey_plans
    WHERE id IN ('0330a001-0000-4000-8000-000000000001', '0330b001-0000-4000-8000-000000000001')),
  2,
  'REQ-330-23: 管理者は全員の計画を読める'
);
SELECT lives_ok(
  $$UPDATE survey_plans SET title = '管理者' WHERE id = '0330a001-0000-4000-8000-000000000001'$$,
  'REQ-330-24: 管理者の他人の計画への UPDATE は 0 行で終わる'
);
RESET ROLE;
SELECT is(
  (SELECT title FROM survey_plans WHERE id = '0330a001-0000-4000-8000-000000000001'),
  '朝の調査',
  'REQ-330-25: 管理者も他人の計画は書き換えられない（読むだけ）'
);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. survey_plan_stops: 自分の計画にだけ足せる・計画と所有者は付け替えられない    [26-37]
-- ════════════════════════════════════════════════════════════════════════════
SELECT _as330('77777777-7777-7777-7777-777777777777');
SET LOCAL ROLE authenticated;
INSERT INTO survey_plan_stops (id, plan_id, user_id, sort_order, lat, lng, source)
VALUES ('0330b002-0000-4000-8000-000000000001', '0330b001-0000-4000-8000-000000000001',
        '77777777-7777-7777-7777-777777777777', 0, 39.7300000, 140.1400000, 'pin');

SELECT _as330('66666666-6666-6666-6666-666666666666');
INSERT INTO survey_plans (id, user_id, title)
VALUES ('0330a001-0000-4000-8000-000000000002', '66666666-6666-6666-6666-666666666666', '別の計画');
SELECT lives_ok(
  $$INSERT INTO survey_plan_stops (id, plan_id, user_id, sort_order, name, lat, lng, source)
    VALUES ('0330a002-0000-4000-8000-000000000001', '0330a001-0000-4000-8000-000000000001',
            '66666666-6666-6666-6666-666666666666', 0, '北の池', 39.7400000, 140.1500000, 'pin')$$,
  'REQ-330-26: 本人は自分の計画に地点を足せる'
);
SELECT lives_ok(
  $$INSERT INTO survey_plan_stops (id, plan_id, user_id, sort_order, lat, lng, source, source_id)
    VALUES ('0330a002-0000-4000-8000-000000000002', '0330a001-0000-4000-8000-000000000001',
            '66666666-6666-6666-6666-666666666666', 1, 39.7500000, 140.1600000,
            'private_spot', '0330a0ff-0000-4000-8000-000000000001')$$,
  'REQ-330-27: 非公開スポットから足した地点は元の id を持てる'
);
SELECT throws_ok(
  $$INSERT INTO survey_plan_stops (plan_id, user_id, lat, lng, source)
    VALUES ('0330b001-0000-4000-8000-000000000001', '66666666-6666-6666-6666-666666666666', 39.7, 140.1, 'pin')$$,
  '42501', NULL,
  'REQ-330-28: 他人の計画へ地点を足せない（RLS WITH CHECK）'
);
SELECT throws_ok(
  $$INSERT INTO survey_plan_stops (plan_id, user_id, lat, lng, source)
    VALUES ('0330a001-0000-4000-8000-000000000001', '66666666-6666-6666-6666-666666666666', 39.7, 140.1, 'private_spot')$$,
  '23514', NULL,
  'REQ-330-29: 非公開スポットから足すなら元の id が要る（CHECK）'
);
SELECT throws_ok(
  $$INSERT INTO survey_plan_stops (plan_id, user_id, lat, lng, source)
    VALUES ('0330a001-0000-4000-8000-000000000001', '66666666-6666-6666-6666-666666666666', 39.7, 140.1, 'gps')$$,
  '23514', NULL,
  'REQ-330-30: 出どころは pin / private_spot / survey_request / current_location だけ'
);
SELECT _as330('55555555-5555-5555-5555-555555555555', true);
SELECT throws_ok(
  $$INSERT INTO survey_plan_stops (plan_id, user_id, lat, lng, source)
    VALUES ('0330a001-0000-4000-8000-000000000001', '55555555-5555-5555-5555-555555555555', 39.7, 140.1, 'pin')$$,
  '42501', NULL,
  'REQ-330-31: 管理者も他人の計画へ地点を足せない（全員分が見えても、足せるのは自分の計画だけ）'
);

SELECT _as330('77777777-7777-7777-7777-777777777777');
SELECT is(
  (SELECT count(*)::int FROM survey_plan_stops WHERE plan_id = '0330a001-0000-4000-8000-000000000001'),
  0,
  'REQ-330-32: 他人（B）は A の地点を読めない（0 行）'
);
SELECT lives_ok(
  $$UPDATE survey_plan_stops SET status = 'skipped' WHERE id = '0330a002-0000-4000-8000-000000000001'$$,
  'REQ-330-33: 他人の地点への UPDATE は 0 行で終わる'
);
SELECT lives_ok(
  $$DELETE FROM survey_plan_stops WHERE id = '0330a002-0000-4000-8000-000000000001'$$,
  'REQ-330-34: 他人の地点への DELETE は 0 行で終わる'
);
RESET ROLE;
SELECT is(
  (SELECT status FROM survey_plan_stops WHERE id = '0330a002-0000-4000-8000-000000000001'),
  'pending',
  'REQ-330-35: 他人は地点を書き換えも削除もできていない'
);

SELECT _as330('66666666-6666-6666-6666-666666666666');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$UPDATE survey_plan_stops
       SET status = 'done', visited_at = now(),
           plan_id = '0330a001-0000-4000-8000-000000000002', user_id = '77777777-7777-7777-7777-777777777777'
     WHERE id = '0330a002-0000-4000-8000-000000000001'$$,
  'REQ-330-36: 本人は地点の状態を変えられる'
);
RESET ROLE;
SELECT is(
  (SELECT plan_id::text || '|' || user_id::text || '|' || status
     FROM survey_plan_stops WHERE id = '0330a002-0000-4000-8000-000000000001'),
  '0330a001-0000-4000-8000-000000000001|66666666-6666-6666-6666-666666666666|done',
  'REQ-330-37: 状態は変わり、計画と所有者は旧値に戻る'
);

-- ════════════════════════════════════════════════════════════════════════════
-- 4. 地点の並べ替え RPC（SECURITY INVOKER・本人の計画だけ）＋ 管理者の読み取り     [38-42]
-- ════════════════════════════════════════════════════════════════════════════
SELECT _as330('66666666-6666-6666-6666-666666666666');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$SELECT public.reorder_survey_plan_stops('0330a001-0000-4000-8000-000000000001',
      ARRAY['0330a002-0000-4000-8000-000000000002', '0330a002-0000-4000-8000-000000000001']::uuid[])$$,
  'REQ-330-38: 本人は計画の地点を並べ替えられる'
);
SELECT throws_ok(
  $$SELECT public.reorder_survey_plan_stops('0330a001-0000-4000-8000-000000000001',
      ARRAY['0330a002-0000-4000-8000-000000000001']::uuid[])$$,
  'P0001', NULL,
  'REQ-330-39: 地点の一部だけでは並べ替えられない（順番を重ねない）'
);
SELECT _as330('77777777-7777-7777-7777-777777777777');
SELECT throws_ok(
  $$SELECT public.reorder_survey_plan_stops('0330a001-0000-4000-8000-000000000001',
      ARRAY['0330a002-0000-4000-8000-000000000001', '0330a002-0000-4000-8000-000000000002']::uuid[])$$,
  'P0001', NULL,
  'REQ-330-40: 他人の計画は並べ替えられない（地点が見えない）'
);
SELECT _as330('55555555-5555-5555-5555-555555555555', true);
SELECT throws_ok(
  $$SELECT public.reorder_survey_plan_stops('0330a001-0000-4000-8000-000000000001',
      ARRAY['0330a002-0000-4000-8000-000000000001', '0330a002-0000-4000-8000-000000000002']::uuid[])$$,
  '42501', NULL,
  'REQ-330-41: 管理者も他人の計画は並べ替えられない'
);
SELECT is(
  (SELECT string_agg(id::text, ',' ORDER BY sort_order) FROM survey_plan_stops
    WHERE plan_id = '0330a001-0000-4000-8000-000000000001'),
  '0330a002-0000-4000-8000-000000000002,0330a002-0000-4000-8000-000000000001',
  'REQ-330-42: 管理者は他人の地点を読め、順番は本人の並べ替えどおり（0 から振り直し）'
);

-- ════════════════════════════════════════════════════════════════════════════
-- 5. survey_stop_posts: 地点も投稿も自分のものだけ・書き換えは無い                 [43-53]
-- ════════════════════════════════════════════════════════════════════════════
SELECT _as330('66666666-6666-6666-6666-666666666666');
SELECT lives_ok(
  $$INSERT INTO survey_stop_posts (stop_id, post_id, user_id, kind)
    VALUES ('0330a002-0000-4000-8000-000000000001', '0330a003-0000-4000-8000-000000000001',
            '66666666-6666-6666-6666-666666666666', 'sighting')$$,
  'REQ-330-43: 自分の地点と自分の投稿をつなげる'
);
SELECT throws_ok(
  $$INSERT INTO survey_stop_posts (stop_id, post_id, user_id, kind)
    VALUES ('0330a002-0000-4000-8000-000000000002', '0330b003-0000-4000-8000-000000000001',
            '66666666-6666-6666-6666-666666666666', 'absence')$$,
  '42501', NULL,
  'REQ-330-44: 他人の投稿はつなげない'
);
SELECT throws_ok(
  $$INSERT INTO survey_stop_posts (stop_id, post_id, user_id, kind)
    VALUES ('0330b002-0000-4000-8000-000000000001', '0330a003-0000-4000-8000-000000000001',
            '66666666-6666-6666-6666-666666666666', 'sighting')$$,
  '42501', NULL,
  'REQ-330-45: 他人の地点にはつなげない'
);
SELECT throws_ok(
  $$INSERT INTO survey_stop_posts (stop_id, post_id, user_id, kind)
    VALUES ('0330a002-0000-4000-8000-000000000002', '0330a003-0000-4000-8000-000000000001',
            '66666666-6666-6666-6666-666666666666', 'capture')$$,
  '23514', NULL,
  'REQ-330-46: 種類は sighting / absence だけ'
);
SELECT throws_ok(
  $$INSERT INTO survey_stop_posts (stop_id, post_id, user_id, kind)
    VALUES ('0330a002-0000-4000-8000-000000000001', '0330a003-0000-4000-8000-000000000001',
            '66666666-6666-6666-6666-666666666666', 'sighting')$$,
  '23505', NULL,
  'REQ-330-47: 同じつながりは二重に入らない（再送しても増えない）'
);
SELECT throws_ok(
  $$UPDATE survey_stop_posts SET kind = 'absence' WHERE stop_id = '0330a002-0000-4000-8000-000000000001'$$,
  '42501', NULL,
  'REQ-330-48: つながりは書き換えられない（UPDATE の権限が無い）'
);
SELECT _as330('77777777-7777-7777-7777-777777777777');
SELECT is(
  (SELECT count(*)::int FROM survey_stop_posts WHERE stop_id = '0330a002-0000-4000-8000-000000000001'),
  0,
  'REQ-330-49: 他人（B）は A のつながりを読めない（0 行）'
);
SELECT lives_ok(
  $$DELETE FROM survey_stop_posts WHERE stop_id = '0330a002-0000-4000-8000-000000000001'$$,
  'REQ-330-50: 他人のつながりへの DELETE は 0 行で終わる'
);
SELECT _as330('55555555-5555-5555-5555-555555555555', true);
SELECT is(
  (SELECT count(*)::int FROM survey_stop_posts WHERE stop_id = '0330a002-0000-4000-8000-000000000001'),
  1,
  'REQ-330-51: 他人の DELETE は効いておらず、管理者はつながりを読める'
);
-- 管理者は全員の地点と投稿が見える。それでも、つなげられるのは自分の地点と自分の投稿だけ。
INSERT INTO survey_plans (id, user_id, title)
VALUES ('0330c001-0000-4000-8000-000000000001', '55555555-5555-5555-5555-555555555555', '管理者の計画');
INSERT INTO survey_plan_stops (id, plan_id, user_id, lat, lng, source)
VALUES ('0330c002-0000-4000-8000-000000000001', '0330c001-0000-4000-8000-000000000001',
        '55555555-5555-5555-5555-555555555555', 39.7600000, 140.1700000, 'pin');
SELECT throws_ok(
  $$INSERT INTO survey_stop_posts (stop_id, post_id, user_id, kind)
    VALUES ('0330a002-0000-4000-8000-000000000002', '0330c003-0000-4000-8000-000000000001',
            '55555555-5555-5555-5555-555555555555', 'sighting')$$,
  '42501', NULL,
  'REQ-330-52: 管理者も他人の地点には自分の投稿をつなげない'
);
SELECT throws_ok(
  $$INSERT INTO survey_stop_posts (stop_id, post_id, user_id, kind)
    VALUES ('0330c002-0000-4000-8000-000000000001', '0330a003-0000-4000-8000-000000000001',
            '55555555-5555-5555-5555-555555555555', 'sighting')$$,
  '42501', NULL,
  'REQ-330-53: 管理者も自分の地点に他人の投稿をつなげない'
);

-- ════════════════════════════════════════════════════════════════════════════
-- 6. rare_sightings: 制約・写真パス・本人と管理者だけ                            [54-84]
-- ════════════════════════════════════════════════════════════════════════════
SELECT _as330('66666666-6666-6666-6666-666666666666');
SELECT lives_ok(
  $$INSERT INTO rare_sightings (id, user_id, client_id, stop_id, species_key, count, lat, lng, accuracy,
                                location_source, photo_paths)
    VALUES ('0330a004-0000-4000-8000-000000000001', '66666666-6666-6666-6666-666666666666',
            '0330a005-0000-4000-8000-000000000001', '0330a002-0000-4000-8000-000000000001',
            'nihon_zarigani', 3, 39.7400000, 140.1500000, 8, 'gps',
            ARRAY['66666666-6666-6666-6666-666666666666/p1.jpg'])$$,
  'REQ-330-54: 本人は自分の地点に希少種の記録を付けられる（写真は自分のフォルダ）'
);
SELECT throws_ok(
  $$INSERT INTO rare_sightings (user_id, client_id, species_key, lat, lng, location_source)
    VALUES ('66666666-6666-6666-6666-666666666666', '0330a005-0000-4000-8000-000000000001',
            'nihon_zarigani', 39.74, 140.15, 'gps')$$,
  '23505', NULL,
  'REQ-330-55: 同じ client_id の 2 回目は一意制約で拒否する（再送で増えない）'
);
SELECT throws_ok(
  $$INSERT INTO rare_sightings (user_id, client_id, species_key, lat, lng, location_source)
    VALUES ('66666666-6666-6666-6666-666666666666', gen_random_uuid(), 'other', 39.74, 140.15, 'map')$$,
  '23514', NULL,
  'REQ-330-56: 「その他」で名前が無いと拒否する'
);
SELECT throws_ok(
  $$INSERT INTO rare_sightings (user_id, client_id, species_key, species_label, lat, lng, location_source)
    VALUES ('66666666-6666-6666-6666-666666666666', gen_random_uuid(), 'other', '   ', 39.74, 140.15, 'map')$$,
  '23514', NULL,
  'REQ-330-57: 「その他」で名前が空白だけでも拒否する'
);
SELECT lives_ok(
  $$INSERT INTO rare_sightings (id, user_id, client_id, species_key, species_label, lat, lng, location_source)
    VALUES ('0330a004-0000-4000-8000-000000000002', '66666666-6666-6666-6666-666666666666',
            '0330a005-0000-4000-8000-000000000002', 'other', 'カワシンジュガイ', 39.74, 140.15, 'map')$$,
  'REQ-330-58: 「その他」は名前があれば計画なしでも記録できる'
);
SELECT throws_ok(
  $$INSERT INTO rare_sightings (user_id, client_id, species_key, lat, lng, location_source)
    VALUES ('66666666-6666-6666-6666-666666666666', gen_random_uuid(), 'Medaka', 39.74, 140.15, 'map')$$,
  '23514', NULL,
  'REQ-330-59: 種の識別子は英小文字の形式だけ（^[a-z][a-z0-9_]{0,39}$）'
);
SELECT throws_ok(
  $$INSERT INTO rare_sightings (user_id, client_id, species_key, lat, lng, location_source, photo_paths)
    VALUES ('66666666-6666-6666-6666-666666666666', gen_random_uuid(), 'medaka', 39.74, 140.15, 'map',
            ARRAY['77777777-7777-7777-7777-777777777777/p1.jpg'])$$,
  '42501', NULL,
  'REQ-330-60: 他人のフォルダの写真パスは拒否する'
);
SELECT throws_ok(
  $$INSERT INTO rare_sightings (user_id, client_id, species_key, lat, lng, location_source, photo_paths)
    VALUES ('66666666-6666-6666-6666-666666666666', gen_random_uuid(), 'medaka', 39.74, 140.15, 'map',
            ARRAY['66666666-6666-6666-6666-666666666666/../77777777-7777-7777-7777-777777777777/p1.jpg'])$$,
  '42501', NULL,
  'REQ-330-61: 自分のフォルダから他人のフォルダへまたぐパスも拒否する'
);
SELECT throws_ok(
  $$INSERT INTO rare_sightings (user_id, client_id, species_key, lat, lng, location_source, photo_paths)
    VALUES ('66666666-6666-6666-6666-666666666666', gen_random_uuid(), 'medaka', 39.74, 140.15, 'map',
            ARRAY['66666666-6666-6666-6666-666666666666/1.jpg', '66666666-6666-6666-6666-666666666666/2.jpg',
                  '66666666-6666-6666-6666-666666666666/3.jpg', '66666666-6666-6666-6666-666666666666/4.jpg'])$$,
  '23514', NULL,
  'REQ-330-62: 写真は 3 枚まで'
);
SELECT throws_ok(
  $$INSERT INTO rare_sightings (user_id, client_id, species_key, count, lat, lng, location_source)
    VALUES ('66666666-6666-6666-6666-666666666666', gen_random_uuid(), 'medaka', -1, 39.74, 140.15, 'map')$$,
  '23514', NULL,
  'REQ-330-63: 数は 0 以上'
);
SELECT throws_ok(
  $$INSERT INTO rare_sightings (user_id, client_id, species_key, count, lat, lng, location_source)
    VALUES ('66666666-6666-6666-6666-666666666666', gen_random_uuid(), 'medaka', 100001, 39.74, 140.15, 'map')$$,
  '23514', NULL,
  'REQ-330-64: 数は 100000 まで'
);
SELECT throws_ok(
  $$INSERT INTO rare_sightings (user_id, client_id, species_key, lat, lng, location_source, observed_at)
    VALUES ('66666666-6666-6666-6666-666666666666', gen_random_uuid(), 'medaka', 39.74, 140.15, 'map',
            now() + interval '2 days')$$,
  '23514', NULL,
  'REQ-330-65: 観察日時は今から 1 日後より未来を拒否する'
);
SELECT throws_ok(
  $$INSERT INTO rare_sightings (user_id, client_id, species_key, lat, lng, location_source)
    VALUES ('66666666-6666-6666-6666-666666666666', gen_random_uuid(), 'medaka', 39.74, 140.15, 'exif')$$,
  '23514', NULL,
  'REQ-330-66: 位置の取り方は gps / map だけ'
);
SELECT throws_ok(
  $$INSERT INTO rare_sightings (user_id, client_id, stop_id, species_key, lat, lng, location_source)
    VALUES ('66666666-6666-6666-6666-666666666666', gen_random_uuid(), '0330b002-0000-4000-8000-000000000001',
            'medaka', 39.74, 140.15, 'map')$$,
  '42501', NULL,
  'REQ-330-67: 他人の地点に希少種の記録を付けられない'
);
SELECT throws_ok(
  $$INSERT INTO rare_sightings (user_id, client_id, species_key, lat, lng, location_source)
    VALUES ('77777777-7777-7777-7777-777777777777', gen_random_uuid(), 'medaka', 39.74, 140.15, 'map')$$,
  '42501', NULL,
  'REQ-330-68: 他人名義の記録は作れない（RLS WITH CHECK）'
);
SELECT _as330('55555555-5555-5555-5555-555555555555', true);
SELECT throws_ok(
  $$INSERT INTO rare_sightings (user_id, client_id, stop_id, species_key, lat, lng, location_source)
    VALUES ('55555555-5555-5555-5555-555555555555', gen_random_uuid(), '0330a002-0000-4000-8000-000000000002',
            'medaka', 39.74, 140.15, 'map')$$,
  '42501', NULL,
  'REQ-330-69: 管理者も他人の地点に自分の記録を付けられない'
);
SELECT _as330('66666666-6666-6666-6666-666666666666');
SELECT lives_ok(
  $$UPDATE rare_sightings
       SET note = '2匹は小さい', user_id = '77777777-7777-7777-7777-777777777777',
           client_id = '0330a005-0000-4000-8000-0000000000ff', created_at = '2000-01-01T00:00:00Z'
     WHERE id = '0330a004-0000-4000-8000-000000000001'$$,
  'REQ-330-70: 本人は自分の記録を更新できる'
);
RESET ROLE;
SELECT is(
  (SELECT user_id::text || '|' || client_id::text || '|' || note || '|' || (created_at > '2001-01-01'::timestamptz)::text
     FROM rare_sightings WHERE id = '0330a004-0000-4000-8000-000000000001'),
  '66666666-6666-6666-6666-666666666666|0330a005-0000-4000-8000-000000000001|2匹は小さい|true',
  'REQ-330-71: メモは変わり、所有者・client_id・作成日時は旧値に戻る'
);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$UPDATE rare_sightings
       SET user_id = '77777777-7777-7777-7777-777777777777',
           photo_paths = ARRAY['77777777-7777-7777-7777-777777777777/p1.jpg']
     WHERE id = '0330a004-0000-4000-8000-000000000001'$$,
  '42501', NULL,
  'REQ-330-72: 所有者を書き換えても他人の写真は付けられない（旧行の所有者で照合する）'
);

SELECT _as330('77777777-7777-7777-7777-777777777777');
SELECT is(
  (SELECT count(*)::int FROM rare_sightings WHERE user_id = '66666666-6666-6666-6666-666666666666'),
  0,
  'REQ-330-73: 他人（B）は A の希少種の記録を読めない（0 行）'
);
SELECT lives_ok(
  $$UPDATE rare_sightings SET note = '書き換え' WHERE id = '0330a004-0000-4000-8000-000000000001'$$,
  'REQ-330-74: 他人の記録への UPDATE は 0 行で終わる'
);
SELECT lives_ok(
  $$DELETE FROM rare_sightings WHERE id = '0330a004-0000-4000-8000-000000000001'$$,
  'REQ-330-75: 他人の記録への DELETE は 0 行で終わる'
);
RESET ROLE;
SELECT is(
  (SELECT note FROM rare_sightings WHERE id = '0330a004-0000-4000-8000-000000000001'),
  '2匹は小さい',
  'REQ-330-76: 他人は記録を書き換えも削除もできていない'
);

SELECT _as330('55555555-5555-5555-5555-555555555555', true);
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*)::int FROM rare_sightings WHERE user_id = '66666666-6666-6666-6666-666666666666'),
  2,
  'REQ-330-77: 管理者は他人の希少種の記録を読める'
);
SELECT lives_ok(
  $$UPDATE rare_sightings SET note = '管理者' WHERE id = '0330a004-0000-4000-8000-000000000001'$$,
  'REQ-330-78: 管理者の他人の記録への UPDATE は 0 行で終わる'
);
SELECT lives_ok(
  $$DELETE FROM rare_sightings WHERE id = '0330a004-0000-4000-8000-000000000002'$$,
  'REQ-330-79: 管理者は記録を削除できる'
);
RESET ROLE;
SELECT is(
  (SELECT string_agg(id::text || ':' || coalesce(note, ''), ',' ORDER BY id)
     FROM rare_sightings WHERE user_id = '66666666-6666-6666-6666-666666666666'),
  '0330a004-0000-4000-8000-000000000001:2匹は小さい',
  'REQ-330-80: 管理者は他人の記録を書き換えられず、削除はできている'
);

-- 地点を消しても希少種の記録は残る（地点の参照だけ外れる）。つながりは地点と一緒に消える。
SELECT _as330('66666666-6666-6666-6666-666666666666');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$DELETE FROM survey_plan_stops WHERE id = '0330a002-0000-4000-8000-000000000001'$$,
  'REQ-330-81: 本人は自分の地点を消せる'
);
RESET ROLE;
SELECT is(
  (SELECT (stop_id IS NULL)::text || '|' || species_key FROM rare_sightings
    WHERE id = '0330a004-0000-4000-8000-000000000001'),
  'true|nihon_zarigani',
  'REQ-330-82: 地点を消しても希少種の記録は残り、地点の参照だけ外れる'
);
SELECT is(
  (SELECT count(*)::int FROM survey_stop_posts WHERE stop_id = '0330a002-0000-4000-8000-000000000001'),
  0,
  'REQ-330-83: 地点を消すとつながりも消える'
);
SELECT is(
  (SELECT count(*)::int FROM posts WHERE id = '0330a003-0000-4000-8000-000000000001'),
  1,
  'REQ-330-84: 地点を消しても投稿そのものは残る'
);

-- ════════════════════════════════════════════════════════════════════════════
-- 7. 上限（管理者は対象外）                                                   [85-91]
-- ════════════════════════════════════════════════════════════════════════════
-- 希少種: 1 時間 60 件（C で確かめる）
SELECT _as330('88888888-8888-8888-8888-888888888888');
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  FOR i IN 1..60 LOOP
    INSERT INTO rare_sightings (user_id, client_id, species_key, lat, lng, location_source)
    VALUES ('88888888-8888-8888-8888-888888888888', gen_random_uuid(), 'medaka', 39.7, 140.1, 'map');
  END LOOP;
END $$;
SELECT is(
  (SELECT count(*)::int FROM rare_sightings WHERE user_id = '88888888-8888-8888-8888-888888888888'),
  60,
  'REQ-330-85: 希少種の記録は 1 時間 60 件目までは通る'
);
SELECT throws_ok(
  $$INSERT INTO rare_sightings (user_id, client_id, species_key, lat, lng, location_source)
    VALUES ('88888888-8888-8888-8888-888888888888', gen_random_uuid(), 'medaka', 39.7, 140.1, 'map')$$,
  'P0001', NULL,
  'REQ-330-86: 希少種の記録の 61 件目は DB で止まる'
);

-- 計画: 1 日 30 件（C で確かめる）
DO $$
BEGIN
  FOR i IN 1..30 LOOP
    INSERT INTO survey_plans (user_id, title) VALUES ('88888888-8888-8888-8888-888888888888', '計画 ' || i);
  END LOOP;
END $$;
SELECT throws_ok(
  $$INSERT INTO survey_plans (user_id, title) VALUES ('88888888-8888-8888-8888-888888888888', '計画 31')$$,
  'P0001', NULL,
  'REQ-330-87: 計画の 1 日 31 件目は DB で止まる（30 件目までは通る）'
);

-- 地点: 1 計画 100 か所（A の別の計画で確かめる）
SELECT _as330('66666666-6666-6666-6666-666666666666');
DO $$
BEGIN
  FOR i IN 0..99 LOOP
    INSERT INTO survey_plan_stops (plan_id, user_id, sort_order, lat, lng, source)
    VALUES ('0330a001-0000-4000-8000-000000000002', '66666666-6666-6666-6666-666666666666', i, 39.7, 140.1, 'pin');
  END LOOP;
END $$;
SELECT is(
  (SELECT count(*)::int FROM survey_plan_stops WHERE plan_id = '0330a001-0000-4000-8000-000000000002'),
  100,
  'REQ-330-88: 1 つの計画に 100 か所までは入る'
);
SELECT throws_ok(
  $$INSERT INTO survey_plan_stops (plan_id, user_id, sort_order, lat, lng, source)
    VALUES ('0330a001-0000-4000-8000-000000000002', '66666666-6666-6666-6666-666666666666', 100, 39.7, 140.1, 'pin')$$,
  'P0001', NULL,
  'REQ-330-89: 101 か所目は DB で止まる'
);

-- 管理者は対象外（自分の記録を 61 件）
SELECT _as330('55555555-5555-5555-5555-555555555555', true);
DO $$
BEGIN
  FOR i IN 1..61 LOOP
    INSERT INTO rare_sightings (user_id, client_id, species_key, lat, lng, location_source)
    VALUES ('55555555-5555-5555-5555-555555555555', gen_random_uuid(), 'tagame', 39.7, 140.1, 'map');
  END LOOP;
END $$;
SELECT is(
  (SELECT count(*)::int FROM rare_sightings WHERE user_id = '55555555-5555-5555-5555-555555555555'),
  61,
  'REQ-330-90: 管理者は希少種の記録の上限の対象外'
);
DO $$
BEGIN
  FOR i IN 1..31 LOOP
    INSERT INTO survey_plans (user_id, title) VALUES ('55555555-5555-5555-5555-555555555555', '管理者の計画 ' || i);
  END LOOP;
END $$;
SELECT is(
  (SELECT count(*)::int FROM survey_plans
    WHERE user_id = '55555555-5555-5555-5555-555555555555' AND title LIKE '管理者の計画 %'),
  31,
  'REQ-330-91: 管理者は計画の上限（1 日 30 件）の対象外'
);

-- ════════════════════════════════════════════════════════════════════════════
-- 8. 写真置き場 rare-photos（非公開・本人と管理者だけ・UPDATE なし）              [92-105]
-- ════════════════════════════════════════════════════════════════════════════
RESET ROLE;
SELECT is(
  (SELECT public FROM storage.buckets WHERE id = 'rare-photos'),
  false,
  'REQ-330-92: rare-photos は非公開の置き場'
);
SELECT is(
  (SELECT file_size_limit::text || '|' || array_to_string(allowed_mime_types, ',')
     FROM storage.buckets WHERE id = 'rare-photos'),
  '5242880|image/jpeg,image/png,image/webp',
  'REQ-330-93: rare-photos は 5MB まで・jpeg / png / webp だけ'
);
SELECT is(
  (SELECT string_agg(policyname || ':' || cmd || ':' || array_to_string(roles, ','), ' ' ORDER BY policyname)
     FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND (coalesce(qual, '') || coalesce(with_check, '')) LIKE '%rare-photos%'),
  'rare_photos_delete_own_or_admin:DELETE:authenticated rare_photos_insert_own:INSERT:authenticated rare_photos_select_own_or_admin:SELECT:authenticated',
  'REQ-330-94: rare-photos のポリシーは authenticated だけの 3 本（UPDATE と公開の読み取りは無い）'
);

SELECT _as330('66666666-6666-6666-6666-666666666666');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO storage.objects (bucket_id, name, owner)
    VALUES ('rare-photos', '66666666-6666-6666-6666-666666666666/r1.jpg', '66666666-6666-6666-6666-666666666666')$$,
  'REQ-330-95: 本人は自分のフォルダに写真を置ける'
);
SELECT throws_ok(
  $$INSERT INTO storage.objects (bucket_id, name, owner)
    VALUES ('rare-photos', '77777777-7777-7777-7777-777777777777/r1.jpg', '66666666-6666-6666-6666-666666666666')$$,
  '42501', NULL,
  'REQ-330-96: 他人のフォルダには置けない'
);
SELECT throws_ok(
  $$INSERT INTO storage.objects (bucket_id, name, owner)
    VALUES ('rare-photos', 'r1.jpg', '66666666-6666-6666-6666-666666666666')$$,
  '42501', NULL,
  'REQ-330-97: フォルダなしでは置けない'
);
SELECT throws_ok(
  $$INSERT INTO storage.objects (bucket_id, name, owner)
    VALUES ('rare-photos', '66666666-6666-6666-6666-666666666666/r1.gif', '66666666-6666-6666-6666-666666666666')$$,
  '42501', NULL,
  'REQ-330-98: jpg / jpeg / png / webp 以外の拡張子は置けない'
);
SELECT lives_ok(
  $$UPDATE storage.objects SET name = '66666666-6666-6666-6666-666666666666/renamed.jpg'
     WHERE bucket_id = 'rare-photos' AND name = '66666666-6666-6666-6666-666666666666/r1.jpg'$$,
  'REQ-330-99: 本人の UPDATE は 0 行で終わる（UPDATE のポリシーは無い）'
);

SELECT _as330('77777777-7777-7777-7777-777777777777');
SELECT is(
  (SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'rare-photos'),
  0,
  'REQ-330-100: 他人（B）は A の写真を読めない'
);
SELECT lives_ok(
  $$DELETE FROM storage.objects
     WHERE bucket_id = 'rare-photos' AND name = '66666666-6666-6666-6666-666666666666/r1.jpg'$$,
  'REQ-330-101: 他人の写真への DELETE は 0 行で終わる'
);

-- anon と、対照として公開の post-photos（誰でも読める＝希少種の写真を置いてはいけない置き場）
RESET ROLE;
INSERT INTO storage.objects (bucket_id, name, owner)
VALUES ('post-photos', '66666666-6666-6666-6666-666666666666/public.jpg', '66666666-6666-6666-6666-666666666666');
SELECT set_config('request.jwt.claims', '{}', true);
SET LOCAL ROLE anon;
SELECT is(
  (SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'rare-photos'),
  0,
  'REQ-330-102: anon は rare-photos の写真を読めない'
);
SELECT is(
  (SELECT count(*)::int FROM storage.objects
    WHERE bucket_id = 'post-photos' AND name = '66666666-6666-6666-6666-666666666666/public.jpg'),
  1,
  'REQ-330-103: （対照）post-photos は anon でも読める（代役の上で既存の公開ポリシーが作られている）'
);

SELECT _as330('55555555-5555-5555-5555-555555555555', true);
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT string_agg(name, ',') FROM storage.objects WHERE bucket_id = 'rare-photos'),
  '66666666-6666-6666-6666-666666666666/r1.jpg',
  'REQ-330-104: 管理者は A の写真を読める（B の DELETE と A の UPDATE は効いていない）'
);

SELECT _as330('66666666-6666-6666-6666-666666666666');
SELECT lives_ok(
  $$DELETE FROM storage.objects
     WHERE bucket_id = 'rare-photos' AND name = '66666666-6666-6666-6666-666666666666/r1.jpg'$$,
  'REQ-330-105: 本人は自分の写真を消せる（DELETE の本体）'
);

-- ════════════════════════════════════════════════════════════════════════════
-- 9. 写真の削除の確認と、関数の EXECUTE 権限                                   [106-107]
-- ════════════════════════════════════════════════════════════════════════════
RESET ROLE;
SELECT is(
  (SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'rare-photos'),
  0,
  'REQ-330-106: 本人の DELETE で写真が消えている'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.reorder_survey_plan_stops(uuid, uuid[])', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.reorder_survey_plan_stops(uuid, uuid[])', 'EXECUTE')
  AND NOT EXISTS (
    SELECT 1
      FROM unnest(ARRAY[
        'public.protect_survey_plan_columns()', 'public.protect_survey_plan_stop_columns()',
        'public.protect_rare_sighting_columns()', 'public.check_rare_sighting_photo_paths()',
        'public.check_survey_plan_rate_limit()', 'public.check_survey_plan_stop_rate_limit()',
        'public.check_rare_sighting_rate_limit()'
      ]) AS f(sig)
     WHERE has_function_privilege('anon', f.sig, 'EXECUTE')
        OR has_function_privilege('authenticated', f.sig, 'EXECUTE')
  ),
  'REQ-330-107: 並べ替え RPC は authenticated だけ・トリガー関数 7 本は anon にも authenticated にも閉じている'
);

SELECT * FROM finish();
ROLLBACK;
