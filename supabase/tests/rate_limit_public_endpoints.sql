-- REQ-212: 公開エンドポイント（reports / comments / likes）のレート制限トリガー pgTAP テスト。
--
-- 検証観点:
--   reports（通報スパム＝検閲攻撃 AC-02 の核）:
--     R1) 同一 IP × 同一 post の未解決通報は 2 回目で拒否（「すでに通報済み」）
--     R2) 別 IP からの通報は通る（正規の別ユーザー 3 名ならフラグは従来どおり立つ）
--     R3) reporter_ip はクライアント送信値ではなくサーバー側 IP（extract_request_ip）で上書きされる
--     R4) admin は per-post 重複制限を素通り（同一 post に複数回 OK）
--   comments:
--     C1) 同一ユーザーの 1 分 5 件超でバースト拒否
--   likes:
--     L1) 同一ユーザーの 1 分 30 件超でバースト拒否
--
-- 各テストは BEGIN / ROLLBACK で isolation。副作用は残さない。

BEGIN;
SELECT plan(7);

-- ===================================================
-- セットアップ: ユーザー + 承認済み投稿（FK 用）
-- ===================================================
INSERT INTO auth.users (id, email, raw_app_meta_data)
VALUES
  ('44444444-4444-4444-4444-444444444444', 'rl-user@test.local',  '{}'::jsonb),
  ('45454545-4545-4545-4545-454545454545', 'rl-admin@test.local', '{"role":"admin"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- service_role 相当で投稿を 2 件入れる（FK 用 / レート制限・列固定トリガーを素通り）
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT set_config('request.headers', '{}', true);
INSERT INTO posts (lat, lng, species, info_type, user_id, is_anonymous, status)
VALUES (39.7, 140.1, 'american', 'sighting', '44444444-4444-4444-4444-444444444444', false, 'approved')
RETURNING id \gset post1_
INSERT INTO posts (lat, lng, species, info_type, user_id, is_anonymous, status)
VALUES (39.8, 140.2, 'american', 'sighting', '44444444-4444-4444-4444-444444444444', false, 'approved')
RETURNING id \gset post2_

-- ===================================================
-- reports R1 / R2 / R3: anon ロール + IP ヘッダー
-- ===================================================
SELECT set_config('request.jwt.claims', '{}', true);
SET LOCAL ROLE anon;

-- IP-A から post1 へ 1 件目（成功）
SELECT set_config('request.headers', '{"cf-connecting-ip":"203.0.113.1"}', true);
SELECT lives_ok(
  format($q$INSERT INTO reports (post_id, reason) VALUES (%L, 'spam')$q$, :'post1_id'),
  'R1a: IP-A の post1 への 1 件目の通報は成功'
);

-- R3: reporter_ip がサーバー側 IP で記録されている（クライアントは送っていない）
RESET ROLE;
SELECT is(
  (SELECT reporter_ip FROM reports WHERE post_id = :'post1_id' ORDER BY created_at DESC LIMIT 1),
  '203.0.113.1',
  'R3: reporter_ip はサーバー側 IP（extract_request_ip）で記録される'
);
SET LOCAL ROLE anon;

-- R1b: 同一 IP-A から post1 へ 2 件目 → 拒否（検閲攻撃の連打を阻止）
SELECT throws_ok(
  format($q$INSERT INTO reports (post_id, reason) VALUES (%L, 'spam')$q$, :'post1_id'),
  NULL,
  'この投稿はすでに通報済みです',
  'R1b: 同一 IP × 同一 post の 2 件目の通報は拒否（AC-02 検閲攻撃の核）'
);

-- R2: 別 IP-B から post1 への通報は成功（正規の別通報者）
SELECT set_config('request.headers', '{"cf-connecting-ip":"203.0.113.2"}', true);
SELECT lives_ok(
  format($q$INSERT INTO reports (post_id, reason) VALUES (%L, 'inappropriate')$q$, :'post1_id'),
  'R2: 別 IP-B からの post1 への通報は成功（別通報者は従来どおり計上される）'
);

-- ===================================================
-- reports R4: admin は per-post 重複制限を素通り
-- ===================================================
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"app_metadata":{"role":"admin"}}', true);
SELECT set_config('request.headers', '{"cf-connecting-ip":"203.0.113.9"}', true);
SET LOCAL ROLE authenticated;
INSERT INTO reports (post_id, reason) VALUES (:'post2_id', 'spam');
SELECT lives_ok(
  format($q$INSERT INTO reports (post_id, reason) VALUES (%L, 'spam')$q$, :'post2_id'),
  'R4: admin は同一 post への複数回通報を素通りできる（req_is_admin バイパス）'
);

-- ===================================================
-- comments C1: 1 分 5 件超でバースト拒否
-- ===================================================
RESET ROLE;
SELECT set_config('request.jwt.claims',
  '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated","app_metadata":{"role":"authenticated"}}', true);
SELECT set_config('request.headers', '{}', true);
SET LOCAL ROLE authenticated;

-- 5 件までは OK（6 件目で拒否）。直近 1 分のカウントなので連続 INSERT で再現できる。
INSERT INTO comments (post_id, user_id, content) VALUES (:'post1_id', '44444444-4444-4444-4444-444444444444', 'c1');
INSERT INTO comments (post_id, user_id, content) VALUES (:'post1_id', '44444444-4444-4444-4444-444444444444', 'c2');
INSERT INTO comments (post_id, user_id, content) VALUES (:'post1_id', '44444444-4444-4444-4444-444444444444', 'c3');
INSERT INTO comments (post_id, user_id, content) VALUES (:'post1_id', '44444444-4444-4444-4444-444444444444', 'c4');
INSERT INTO comments (post_id, user_id, content) VALUES (:'post1_id', '44444444-4444-4444-4444-444444444444', 'c5');
SELECT throws_ok(
  format($q$INSERT INTO comments (post_id, user_id, content) VALUES (%L, '44444444-4444-4444-4444-444444444444', 'c6')$q$, :'post1_id'),
  NULL,
  'コメントが集中しています。しばらくお待ちください',
  'C1: 同一ユーザーの 1 分 6 件目のコメントはバースト制限で拒否'
);

-- ===================================================
-- likes L1: 1 分 30 件超でバースト拒否
-- ===================================================
-- 31 件目で拒否されることを確認するため、まず 30 件分の投稿 + like を入れる。
-- like は UNIQUE(post_id,user_id) なので別 post が必要。
-- 注: 31 投稿の用意は check_post_rate_limit（24h 5 件）に当たるため admin claim で素通りさせる
--     （posts のレート制限は app_metadata.role='admin' のみバイパス。service_role はバイパスしない）。
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"app_metadata":{"role":"admin"}}', true);
DO $$
DECLARE i int;
BEGIN
  -- REQ-243 で posts.lat/lng は anon/authenticated から列レベルで隠された。後段の like 用
  -- 投稿抽出は authenticated ロールで走るため lng で絞ると "permission denied for table posts" に
  -- なる。抽出用に非保護列 comment へマーカーを入れ、user 44444444 の他投稿（post1/post2）と
  -- 区別できるようにする。
  FOR i IN 1..31 LOOP
    INSERT INTO posts (lat, lng, species, info_type, user_id, is_anonymous, status, comment)
    VALUES (40.0 + i*0.001, 141.0, 'american', 'sighting',
            '44444444-4444-4444-4444-444444444444', false, 'approved', 'L1-like-fixture');
  END LOOP;
END $$;

SELECT set_config('request.jwt.claims',
  '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated","app_metadata":{"role":"authenticated"}}', true);
SET LOCAL ROLE authenticated;

-- 直近 1 分で 30 件 like を入れる（31 投稿のうち先頭 30 件）。
DO $$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN
    SELECT id FROM posts
    WHERE user_id = '44444444-4444-4444-4444-444444444444' AND comment = 'L1-like-fixture'
    ORDER BY created_at ASC
  LOOP
    EXIT WHEN n >= 30;
    INSERT INTO likes (post_id, user_id) VALUES (r.id, '44444444-4444-4444-4444-444444444444');
    n := n + 1;
  END LOOP;
END $$;

-- 31 件目（残り 1 投稿）への like は拒否される。
SELECT throws_ok(
  $$INSERT INTO likes (post_id, user_id)
    SELECT id, '44444444-4444-4444-4444-444444444444' FROM posts
    WHERE user_id = '44444444-4444-4444-4444-444444444444' AND comment = 'L1-like-fixture'
    ORDER BY created_at DESC LIMIT 1$$,
  NULL,
  'いいねが集中しています。しばらくお待ちください',
  'L1: 同一ユーザーの 1 分 31 件目のいいねはバースト制限で拒否'
);

SELECT * FROM finish();
ROLLBACK;
