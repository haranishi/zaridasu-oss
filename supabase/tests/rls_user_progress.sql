-- REQ-248: 貢献レベル / 経験値（XP）エンジンの pg-tap テスト
--
-- 検証観点:
--   1) レベル曲線 xp_for_level / level_for_xp の値（単一ソースの正しさ・FR-248-03）
--   2) 投稿承認（pending→approved）で xp/level が加算される（AC-01 / AC-02）
--   3) 承認済み投稿の再 UPDATE では二重加算されない（OLD.status='approved' ガード）
--   4) しきい値超えでレベルが上がる（AC-01）
--   5) rejected では加算されない（AC-01）
--   6) 一般ユーザーは user_progress を直接 UPDATE できない（RLS 改竄不能・AC-04）
--   7) SELECT は本人＋公開プロフィールのみ（非公開は他人から不可視・NFR-248-02）
--   8) recompute_all_progress によるバックフィルが既存ユーザーを埋める（NFR-248-03）

BEGIN;
SELECT plan(21);

-- ===================================================
-- (1) レベル曲線（純関数・フィクスチャ不要）
-- ===================================================
SELECT is( xp_for_level(1), 0::bigint,   'xp_for_level(1)=0' );
SELECT is( xp_for_level(2), 50::bigint,  'xp_for_level(2)=50' );
SELECT is( xp_for_level(3), 150::bigint, 'xp_for_level(3)=150' );
SELECT is( level_for_xp(0),   1, 'level_for_xp(0)=1' );
SELECT is( level_for_xp(49),  1, 'level_for_xp(49)=1 (境界手前)' );
SELECT is( level_for_xp(50),  2, 'level_for_xp(50)=2 (境界ちょうど)' );
SELECT is( level_for_xp(149), 2, 'level_for_xp(149)=2' );
SELECT is( level_for_xp(150), 3, 'level_for_xp(150)=3' );

-- ===================================================
-- セットアップ: ユーザー A(公開)/B(非公開)/C/D
-- auth.users への INSERT は handle_new_user で user_profiles を自動生成する。
-- 明示 UPSERT で is_public を確定させる（トリガー有無に依存しない）。
-- ===================================================
INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'xp-a@test.local', '{}'::jsonb, '{}'::jsonb),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'xp-b@test.local', '{}'::jsonb, '{}'::jsonb),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'xp-c@test.local', '{}'::jsonb, '{}'::jsonb),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'xp-d@test.local', '{}'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO user_profiles (id, is_public) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', false)
ON CONFLICT (id) DO UPDATE SET is_public = EXCLUDED.is_public;

-- service_role クレームで承認操作（protect_post_status を素通り）
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ===================================================
-- (2) 承認で XP が加算される（AC-01 / AC-02）
-- ===================================================
INSERT INTO posts (lat, lng, species, info_type, user_id, is_anonymous, status)
VALUES (39.7, 140.1, 'american', 'sighting', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', false, 'pending')
RETURNING id \gset

SELECT ok(
  NOT EXISTS (SELECT 1 FROM user_progress WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'pending: 進捗行はまだ無い（未承認は加点しない）'
);

UPDATE posts SET status = 'approved' WHERE id = :'id';

-- base 10 + 初回発見(種)15 + 初回発見(情報種別)10 = 35（municipality=NULL のため市区町村ボーナス無し）
SELECT is(
  (SELECT xp FROM user_progress WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  35::bigint,
  'approve: xp=35（基本+初回発見 種+情報種別）'
);
SELECT is(
  (SELECT level FROM user_progress WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  1,
  'approve: level=1（<50）'
);

-- ===================================================
-- (3) 承認済み投稿の再 UPDATE では二重加算しない
-- ===================================================
UPDATE posts SET is_flagged = true WHERE id = :'id';
SELECT is(
  (SELECT xp FROM user_progress WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  35::bigint,
  '再UPDATE（OLD.status=approved）: xp は増えない（二重加算なし）'
);

-- ===================================================
-- (4) しきい値超えでレベルが上がる（AC-01）
--     2件目: base10 + 初回発見(市区町村)12 + 定点5 + GPS良好3 + 高精度同定5 = 35 → 累計70 → level 2
-- ===================================================
INSERT INTO posts (lat, lng, species, info_type, municipality, user_id, is_anonymous, status,
                   survey_method, accuracy, auto_approved, ai_result)
VALUES (39.72, 140.11, 'american', 'sighting', '秋田市', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        false, 'pending', 'structured', 10, true, '{"confidence":0.95}'::jsonb)
RETURNING id \gset

UPDATE posts SET status = 'approved' WHERE id = :'id';

SELECT is(
  (SELECT level FROM user_progress WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  2,
  '2件目承認でしきい値(50)を超え level=2'
);
SELECT cmp_ok(
  (SELECT xp FROM user_progress WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  '>=', 50::bigint,
  'level 2 のしきい値 XP 以上'
);

-- B にも承認済み投稿を1件（非公開プロフィールの可視性テスト用に進捗行を作る）
INSERT INTO posts (lat, lng, species, info_type, user_id, is_anonymous, status)
VALUES (39.7, 140.1, 'american', 'sighting', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', false, 'pending')
RETURNING id \gset
UPDATE posts SET status = 'approved' WHERE id = :'id';

-- ===================================================
-- (5) rejected では加算されない（AC-01）
-- ===================================================
INSERT INTO posts (lat, lng, species, info_type, user_id, is_anonymous, status)
VALUES (39.7, 140.1, 'bullfrog', 'capture', 'cccccccc-cccc-cccc-cccc-cccccccccccc', false, 'pending')
RETURNING id \gset
UPDATE posts SET status = 'rejected' WHERE id = :'id';

SELECT ok(
  NOT EXISTS (SELECT 1 FROM user_progress WHERE user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
  'rejected: 進捗行は作られない'
);

-- ===================================================
-- (6) RLS: 一般ユーザーは user_progress を直接 UPDATE できない（AC-04）
-- ===================================================
SELECT set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

-- UPDATE ポリシーが無いため 0 行更新（エラーにはならないが値は変わらない＝改竄不能）。
UPDATE user_progress SET xp = 999999 WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

-- ===================================================
-- (7) RLS SELECT: 本人は自分を見られる / 公開は他人も見られる / 非公開は他人から不可視
-- ===================================================
SELECT ok(
  EXISTS (SELECT 1 FROM user_progress WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'RLS SELECT: 本人は自分の進捗を見られる'
);

RESET ROLE;
SELECT is(
  (SELECT xp FROM user_progress WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  70::bigint,
  'RLS: authenticated の直接 UPDATE で xp は改竄されない（70 のまま）'
);

-- B(非公開) のセッションから A(公開) を見る → 見える
SELECT set_config('request.jwt.claims',
  '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT ok(
  EXISTS (SELECT 1 FROM user_progress WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'RLS SELECT: 公開プロフィールの進捗は他人も見られる'
);
RESET ROLE;

-- A のセッションから B(非公開) を見る → 見えない
SELECT set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT ok(
  NOT EXISTS (SELECT 1 FROM user_progress WHERE user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  'RLS SELECT: 非公開プロフィールの進捗は他人から不可視'
);
RESET ROLE;

-- ===================================================
-- (8) バックフィル: recompute_all_progress が既存ユーザーを埋める（NFR-248-03）
--     承認済み投稿の「INSERT」はトリガー（AFTER UPDATE）を発火させないため自動加点されない。
--     その状態から recompute を呼ぶと進捗が算出される。
-- ===================================================
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
INSERT INTO posts (lat, lng, species, info_type, user_id, is_anonymous, status)
VALUES (39.7, 140.1, 'american', 'sighting', 'dddddddd-dddd-dddd-dddd-dddddddddddd', false, 'approved');

SELECT ok(
  NOT EXISTS (SELECT 1 FROM user_progress WHERE user_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'),
  'backfill 前提: approved の INSERT はトリガー未発火で自動加点されない'
);

-- JWT を外して recompute（migration 相当のコンテキスト＝権限チェックを通過）
SELECT set_config('request.jwt.claims', '', true);
SELECT recompute_all_progress();

SELECT is(
  (SELECT xp FROM user_progress WHERE user_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'),
  35::bigint,
  'backfill: recompute で既存ユーザーの xp=35 が算出される'
);

SELECT * FROM finish();
ROLLBACK;
