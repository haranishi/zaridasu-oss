-- REQ-250 (Part A): コレクション（図鑑/水槽）の pg-tap テスト
--
-- 検証観点:
--   1) 投稿承認（pending→approved）でコレクションが前進する（AC-01・info_type/市区町村/検証済み数/初観察）
--   2) 別の info_type / 市区町村を承認すると集合が広がり verified_count が増える
--   3) 重複する info_type / 市区町村では集合は広がらない（重複なし追加）
--   4) first_observed_at は最も早い観察日時を保持（LEAST）
--   5) 承認済み投稿の再 UPDATE では二重加算しない（OLD.status='approved' ガード）
--   6) rejected ではコレクションが作られない（Goodhart 対策・AC-01）
--   7) 一般ユーザーは user_collection を直接 UPDATE できない（RLS 改竄不能・AC-02）
--   8) SELECT は本人＋公開プロフィールのみ（非公開は他人から不可視）
--   9) recompute_all_collections によるバックフィルが既存ユーザーを埋める（NFR-250-04）
--  10) get_user_collection は is_public 準拠（本人/公開のみ行を返す）

BEGIN;
SELECT plan(21);

-- ===================================================
-- セットアップ: ユーザー A(公開)/B(非公開)/C/D
-- ===================================================
INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'col-a@test.local', '{}'::jsonb, '{}'::jsonb),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'col-b@test.local', '{}'::jsonb, '{}'::jsonb),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'col-c@test.local', '{}'::jsonb, '{}'::jsonb),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'col-d@test.local', '{}'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO user_profiles (id, is_public) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', false)
ON CONFLICT (id) DO UPDATE SET is_public = EXCLUDED.is_public;

-- service_role クレームで承認操作（protect_post_status を素通り）
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ===================================================
-- (1) 承認でコレクションが前進する（AC-01）
--     observed_at を明示（LEAST 検証用に 6/05）
-- ===================================================
INSERT INTO posts (lat, lng, species, info_type, municipality, user_id, is_anonymous, status, observed_at)
VALUES (39.7, 140.1, 'american', 'sighting', '秋田市', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', false, 'pending', '2026-06-05T10:00:00Z')
RETURNING id \gset

SELECT ok(
  NOT EXISTS (SELECT 1 FROM user_collection WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'pending: コレクション行はまだ無い（未承認は前進しない）'
);

UPDATE posts SET status = 'approved' WHERE id = :'id';

SELECT is(
  (SELECT verified_count FROM user_collection WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' AND species = 'american'),
  1::bigint, 'approve: verified_count=1'
);
SELECT ok(
  (SELECT info_types_seen FROM user_collection WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' AND species = 'american') @> ARRAY['sighting'],
  'approve: info_types_seen が sighting を含む'
);
SELECT ok(
  (SELECT municipalities_seen FROM user_collection WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' AND species = 'american') @> ARRAY['秋田市'],
  'approve: municipalities_seen が 秋田市 を含む'
);
SELECT is(
  (SELECT array_length(info_types_seen, 1) FROM user_collection WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' AND species = 'american'),
  1, 'approve: info_type は 1 種'
);

-- ===================================================
-- (2) 別の info_type / 市区町村 → 集合が広がり verified_count 増加
--     observed_at を 6/02（より早い）にして LEAST を検証
-- ===================================================
INSERT INTO posts (lat, lng, species, info_type, municipality, user_id, is_anonymous, status, observed_at)
VALUES (39.31, 140.55, 'american', 'capture', '横手市', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', false, 'pending', '2026-06-02T10:00:00Z')
RETURNING id \gset
UPDATE posts SET status = 'approved' WHERE id = :'id';

SELECT is(
  (SELECT verified_count FROM user_collection WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' AND species = 'american'),
  2::bigint, '2件目承認: verified_count=2'
);
SELECT is(
  (SELECT array_length(info_types_seen, 1) FROM user_collection WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' AND species = 'american'),
  2, 'info_types が 2 種に増える'
);
SELECT is(
  (SELECT array_length(municipalities_seen, 1) FROM user_collection WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' AND species = 'american'),
  2, 'municipalities が 2 件に増える'
);

-- ===================================================
-- (4) first_observed_at は最も早い観察（6/02）を保持（LEAST）
-- ===================================================
SELECT is(
  (SELECT first_observed_at FROM user_collection WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' AND species = 'american'),
  '2026-06-02T10:00:00Z'::timestamptz, 'first_observed_at は最も早い観察日時（LEAST）'
);

-- ===================================================
-- (3) 重複する info_type / 市区町村 → 集合は広がらない・count は増える
-- ===================================================
INSERT INTO posts (lat, lng, species, info_type, municipality, user_id, is_anonymous, status)
VALUES (39.7, 140.1, 'american', 'sighting', '秋田市', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', false, 'pending')
RETURNING id \gset
UPDATE posts SET status = 'approved' WHERE id = :'id';

SELECT is(
  (SELECT verified_count FROM user_collection WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' AND species = 'american'),
  3::bigint, '重複承認: verified_count=3'
);
SELECT is(
  (SELECT array_length(info_types_seen, 1) FROM user_collection WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' AND species = 'american'),
  2, '重複 info_type では集合は広がらない（重複なし追加）'
);

-- ===================================================
-- (5) 承認済み投稿の再 UPDATE では二重加算しない
-- ===================================================
UPDATE posts SET is_flagged = true WHERE id = :'id';
SELECT is(
  (SELECT verified_count FROM user_collection WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' AND species = 'american'),
  3::bigint, '再UPDATE（OLD.status=approved）: verified_count は増えない（二重加算なし）'
);

-- ===================================================
-- (6) rejected ではコレクションが作られない（C）
-- ===================================================
INSERT INTO posts (lat, lng, species, info_type, user_id, is_anonymous, status)
VALUES (39.7, 140.1, 'bullfrog', 'capture', 'cccccccc-cccc-cccc-cccc-cccccccccccc', false, 'pending')
RETURNING id \gset
UPDATE posts SET status = 'rejected' WHERE id = :'id';
SELECT ok(
  NOT EXISTS (SELECT 1 FROM user_collection WHERE user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
  'rejected: コレクション行は作られない'
);

-- B(非公開) にも承認済み投稿を1件（可視性テスト用の行を作る）
INSERT INTO posts (lat, lng, species, info_type, user_id, is_anonymous, status)
VALUES (39.7, 140.1, 'american', 'sighting', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', false, 'pending')
RETURNING id \gset
UPDATE posts SET status = 'approved' WHERE id = :'id';

-- ===================================================
-- (7) RLS: 一般ユーザーは user_collection を直接 UPDATE できない（AC-02）
-- ===================================================
SELECT set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

-- UPDATE ポリシーが無いため 0 行更新（改竄不能）。
UPDATE user_collection SET verified_count = 999999 WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

SELECT ok(
  EXISTS (SELECT 1 FROM user_collection WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'RLS SELECT: 本人は自分のコレクションを見られる'
);

RESET ROLE;
SELECT is(
  (SELECT verified_count FROM user_collection WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' AND species = 'american'),
  3::bigint, 'RLS: authenticated の直接 UPDATE で verified_count は改竄されない（3 のまま）'
);

-- ===================================================
-- (8) RLS SELECT: 公開は他人も見られる / 非公開は他人から不可視
-- ===================================================
-- B(非公開) から A(公開) を見る → 見える
SELECT set_config('request.jwt.claims',
  '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT ok(
  EXISTS (SELECT 1 FROM user_collection WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'RLS SELECT: 公開プロフィールのコレクションは他人も見られる'
);
RESET ROLE;

-- A から B(非公開) を見る → 見えない
SELECT set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT ok(
  NOT EXISTS (SELECT 1 FROM user_collection WHERE user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  'RLS SELECT: 非公開プロフィールのコレクションは他人から不可視'
);

-- ===================================================
-- (10) get_user_collection は is_public 準拠
-- ===================================================
SELECT is(
  (SELECT COUNT(*) FROM get_user_collection('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')),
  1::bigint, 'RPC: 本人は自分のコレクション（american 1種）を取得できる'
);
SELECT is(
  (SELECT COUNT(*) FROM get_user_collection('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')),
  0::bigint, 'RPC: 非公開プロフィールを他人が呼ぶと 0 行'
);
RESET ROLE;

-- ===================================================
-- (9) バックフィル: recompute_all_collections が既存ユーザーを埋める（NFR-250-04）
--     承認済み投稿の INSERT はトリガー（AFTER UPDATE）を発火させないため自動前進しない。
-- ===================================================
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
INSERT INTO posts (lat, lng, species, info_type, municipality, user_id, is_anonymous, status)
VALUES (39.7, 140.1, 'bullfrog', 'capture', '大館市', 'dddddddd-dddd-dddd-dddd-dddddddddddd', false, 'approved');

SELECT ok(
  NOT EXISTS (SELECT 1 FROM user_collection WHERE user_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'),
  'backfill 前提: approved の INSERT はトリガー未発火で自動前進しない'
);

-- JWT を外して recompute（migration 相当のコンテキスト＝権限チェックを通過）
SELECT set_config('request.jwt.claims', '', true);
SELECT recompute_all_collections();

SELECT is(
  (SELECT verified_count FROM user_collection WHERE user_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd' AND species = 'bullfrog'),
  1::bigint, 'backfill: recompute で既存ユーザーの verified_count=1 が算出される'
);

SELECT * FROM finish();
ROLLBACK;
