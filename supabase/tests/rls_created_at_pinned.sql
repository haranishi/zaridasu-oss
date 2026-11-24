-- security-hardening 要件3: 一般ユーザーの INSERT / UPDATE で created_at を操作できない。
--
-- 不具合: 回数制限（投稿は 24 時間 5 件など）は、保存済みの行を created_at で数える。created_at を過去にして
--   INSERT すると数えられず、上限を回避できた（20 件通過）。AI 判定は投稿ごとに費用がかかる。
--   修正前のコードでは 1・2・3・4・5・8 が落ちる。
-- 管理者・service_role・SQL の直接実行（移行・取り込み）は、過去の日時を入れられる（6・7・9）。

BEGIN;
SELECT plan(9);

-- 準備（管理者権限・claims なし）: 会員 M、管理者 A、投稿者 O と、O の承認済み投稿 P
SELECT set_config('request.jwt.claims', '{}', true);
INSERT INTO auth.users (id, email) VALUES
  ('d1d1d1d1-0000-0000-0000-000000000001', 'member-m@example.test'),
  ('d2d2d2d2-0000-0000-0000-000000000002', 'admin-a@example.test'),
  ('d3d3d3d3-0000-0000-0000-000000000003', 'owner-o@example.test');
INSERT INTO posts (id, user_id, species, info_type, lat, lng, status)
VALUES ('f0f0f0f0-0000-0000-0000-000000000001', 'd3d3d3d3-0000-0000-0000-000000000003',
        'american', 'sighting', 39.7, 140.1, 'approved');

-- ── 会員 M ────────────────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d1d1d1d1-0000-0000-0000-000000000001","app_metadata":{"role":"authenticated"}}', true);

SELECT lives_ok(
  $sql$DO $x$
  DECLARE i int;
  BEGIN
    FOR i IN 1..5 LOOP
      INSERT INTO posts (user_id, species, info_type, lat, lng, created_at)
      VALUES ('d1d1d1d1-0000-0000-0000-000000000001', 'american', 'sighting', 39.7, 140.1, '2000-01-01');
    END LOOP;
  END $x$$sql$,
  'SEC-3-0: 過去の日時を付けた投稿 5 件は、受け付けられる（上限の範囲内）'
);

SELECT is(
  (SELECT count(*) FROM posts
    WHERE user_id = 'd1d1d1d1-0000-0000-0000-000000000001' AND created_at > now() - interval '1 hour'),
  5::bigint,
  'SEC-3-1: 過去の日時を指定しても、created_at は受付時刻に固定される'
);

SELECT throws_ok(
  $$INSERT INTO posts (user_id, species, info_type, lat, lng, created_at)
    VALUES ('d1d1d1d1-0000-0000-0000-000000000001', 'american', 'sighting', 39.7, 140.1, '2000-01-01')$$,
  'P0001', NULL,
  'SEC-3-2: 過去の日時を指定しても、6 件目は 24 時間 5 件の上限で止まる'
);

UPDATE posts SET created_at = '2000-01-01'
 WHERE user_id = 'd1d1d1d1-0000-0000-0000-000000000001';
SELECT is(
  (SELECT count(*) FROM posts
    WHERE user_id = 'd1d1d1d1-0000-0000-0000-000000000001' AND created_at < now() - interval '1 hour'),
  0::bigint,
  'SEC-3-3: 保存済みの投稿の created_at を過去へ書き換えても、変わらない（数え直しで枠を戻せない）'
);

INSERT INTO comments (post_id, user_id, content, created_at)
VALUES ('f0f0f0f0-0000-0000-0000-000000000001', 'd1d1d1d1-0000-0000-0000-000000000001', 'テスト', '2000-01-01');
SELECT is(
  (SELECT count(*) FROM comments
    WHERE user_id = 'd1d1d1d1-0000-0000-0000-000000000001' AND created_at > now() - interval '1 hour'),
  1::bigint,
  'SEC-3-4: コメントも、created_at が受付時刻に固定される'
);

INSERT INTO likes (post_id, user_id, created_at)
VALUES ('f0f0f0f0-0000-0000-0000-000000000001', 'd1d1d1d1-0000-0000-0000-000000000001', '2000-01-01');
SELECT is(
  (SELECT count(*) FROM likes
    WHERE user_id = 'd1d1d1d1-0000-0000-0000-000000000001' AND created_at > now() - interval '1 hour'),
  1::bigint,
  'SEC-3-5: いいねも、created_at が受付時刻に固定される'
);

-- ── 管理者 A: 取り込みで過去の日時を入れられる ─────────────────────────
SELECT set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d2d2d2d2-0000-0000-0000-000000000002","app_metadata":{"role":"admin"}}', true);
INSERT INTO posts (user_id, species, info_type, lat, lng, created_at)
VALUES ('d2d2d2d2-0000-0000-0000-000000000002', 'american', 'sighting', 39.7, 140.1, '2000-01-01');
SELECT is(
  (SELECT count(*) FROM posts
    WHERE user_id = 'd2d2d2d2-0000-0000-0000-000000000002' AND created_at < '2000-01-02'),
  1::bigint,
  'SEC-3-6: 管理者は、過去の日時で登録できる（取り込み作業を妨げない）'
);

-- ── service_role（Edge Function）と、SQL の直接実行 ────────────────────
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
INSERT INTO comments (post_id, user_id, content, created_at)
VALUES ('f0f0f0f0-0000-0000-0000-000000000001', 'd3d3d3d3-0000-0000-0000-000000000003', 'サービス', '2001-01-01');
RESET ROLE;
SELECT set_config('request.jwt.claims', '{}', true);
INSERT INTO comments (post_id, user_id, content, created_at)
VALUES ('f0f0f0f0-0000-0000-0000-000000000001', 'd3d3d3d3-0000-0000-0000-000000000003', 'SQL', '2002-01-01');
SELECT is(
  (SELECT count(*) FROM comments WHERE created_at < '2003-01-01' AND created_at > '2000-06-01'),
  2::bigint,
  'SEC-3-7: service_role と SQL の直接実行は、過去の日時で登録できる（移行・取り込みを妨げない）'
);

-- ── 回数制限のある 9 表すべてに付いている ─────────────────────────────
SELECT is(
  (SELECT count(*) FROM pg_trigger t
     JOIN pg_class c ON c.oid = t.tgrelid
    WHERE t.tgname = 'aaa_pin_created_at' AND NOT t.tgisinternal
      AND c.relname IN ('posts','comments','likes','reports','survey_requests',
                        'private_spots','rare_sightings','survey_plans','survey_plan_stops')),
  9::bigint,
  'SEC-3-8: 回数制限のある 9 表すべてに、created_at の固定が付いている'
);

SELECT * FROM finish();
ROLLBACK;
