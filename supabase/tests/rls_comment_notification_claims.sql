-- security-hardening 要件9: コメント通知メールの送信済みの印（comment_notification_claims）。
--
-- Edge Function notify-comment は、送る前にこの表へ comment_id を挿入して先取りし、主キーの重複なら送らない。
-- 本テストは、その前提になる表の性質を守る:
--   (1) service_role は挿入でき、同じコメントの 2 回目は重複エラー（23505）になる。
--   (2) 匿名・ログイン済みは、読めも書けもしない（RLS を有効にしてポリシーを置いていない）。
--   (3) 先取りを取り下げる（送信失敗のとき）と、同じコメントでもう一度挿入できる。
--   (4) コメントが消えたら、印も消える。

BEGIN;
SELECT plan(8);

SELECT set_config('request.jwt.claims', '{}', true);
INSERT INTO auth.users (id, email) VALUES
  ('71717171-0000-0000-0000-000000000001', 'writer@example.test'),
  ('72727272-0000-0000-0000-000000000002', 'owner@example.test');
INSERT INTO posts (id, user_id, species, info_type, lat, lng, status)
VALUES ('70707070-0000-0000-0000-000000000001', '72727272-0000-0000-0000-000000000002', 'american', 'sighting', 39.7, 140.1, 'approved');
INSERT INTO comments (id, post_id, user_id, content)
VALUES ('7c7c7c7c-0000-0000-0000-000000000001', '70707070-0000-0000-0000-000000000001',
        '71717171-0000-0000-0000-000000000001', 'コメント');

SELECT is(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.comment_notification_claims'::regclass), true,
  'SEC-9-1: 送信済みの印の表は、RLS が有効'
);
SELECT is(
  (SELECT count(*) FROM pg_policy WHERE polrelid = 'public.comment_notification_claims'::regclass), 0::bigint,
  'SEC-9-2: ポリシーを置いていない（service_role 以外は行に触れない）'
);

-- ── service_role ──────────────────────────────────────────────────────
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

SELECT lives_ok(
  $$INSERT INTO public.comment_notification_claims (comment_id) VALUES ('7c7c7c7c-0000-0000-0000-000000000001')$$,
  'SEC-9-3: service_role は、コメントの送信済みの印を先取りできる'
);
SELECT throws_ok(
  $$INSERT INTO public.comment_notification_claims (comment_id) VALUES ('7c7c7c7c-0000-0000-0000-000000000001')$$,
  '23505', NULL,
  'SEC-9-4: 同じコメントの 2 回目は、重複エラーになる（メールを再送しない）'
);
DELETE FROM public.comment_notification_claims WHERE comment_id = '7c7c7c7c-0000-0000-0000-000000000001';
SELECT lives_ok(
  $$INSERT INTO public.comment_notification_claims (comment_id) VALUES ('7c7c7c7c-0000-0000-0000-000000000001')$$,
  'SEC-9-5: 先取りを取り下げる（送信失敗）と、同じコメントで再度先取りできる'
);

-- ── 匿名・ログイン済み ───────────────────────────────────────────────
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"71717171-0000-0000-0000-000000000001"}', true);
SELECT throws_ok(
  $$INSERT INTO public.comment_notification_claims (comment_id) VALUES ('7c7c7c7c-0000-0000-0000-000000000001')$$,
  '42501', NULL,
  'SEC-9-6: ログイン済みは、送信済みの印に書き込めない'
);
SELECT throws_ok(
  $$SELECT count(*) FROM public.comment_notification_claims$$,
  '42501', NULL,
  'SEC-9-7: ログイン済みは、送信済みの印のSELECT権限を持たない'
);

-- ── コメントが消えたら、印も消える ────────────────────────────────────
RESET ROLE;
SELECT set_config('request.jwt.claims', '{}', true);
DELETE FROM comments WHERE id = '7c7c7c7c-0000-0000-0000-000000000001';
SELECT is(
  (SELECT count(*) FROM public.comment_notification_claims), 0::bigint,
  'SEC-9-8: コメントを消すと、送信済みの印も消える'
);

SELECT * FROM finish();
ROLLBACK;
