-- REQ-329: 投稿者が選ぶ位置の非公開・非公開投稿の地名退避・非公開スポット（クイック保存）の自動テスト（pg-tap）
-- 実行方法は rls_posts.sql と同じ（CI では pg_prove が tests/*.sql を自動検出）。
-- 前提: schema.sql + Supabase 既定 GRANT + reapply-after-grants.txt（本 REQ の migration を含む）適用後の DB 状態。
-- BEGIN / ROLLBACK で隔離し、副作用は残さない。

BEGIN;
SELECT plan(30);

-- ── セットアップ: admin / 投稿者 A / 他人 B ──
INSERT INTO auth.users (id, email, raw_app_meta_data)
VALUES
  ('55555555-5555-5555-5555-555555555555', 'admin329@test.local', '{"role":"admin"}'::jsonb),
  ('66666666-6666-6666-6666-666666666666', 'owner329@test.local', '{}'::jsonb),
  ('77777777-7777-7777-7777-777777777777', 'other329@test.local', '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION _set_jwt(claims jsonb) RETURNS void LANGUAGE plpgsql AS $$
BEGIN PERFORM set_config('request.jwt.claims', claims::text, true); END;$$;
-- 関数の EXECUTE は既定で閉じている（REQ-316）。この補助関数は、ログイン済み・匿名の権限に切り替えた後でも
-- 呼ぶので、明示で許可する。
GRANT EXECUTE ON FUNCTION _set_jwt(jsonb) TO PUBLIC;

INSERT INTO species_location_defaults (species, default_disclosure)
VALUES ('american', 'coarsened') ON CONFLICT (species) DO NOTHING;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. 投稿者は INSERT で「位置を非公開（hidden）」を選べる。細かく公開する方向（precise）は選べない
-- ════════════════════════════════════════════════════════════════════════════
SELECT _set_jwt('{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated","app_metadata":{}}'::jsonb);
SET LOCAL ROLE authenticated;

INSERT INTO posts (lat, lng, species, info_type, user_id, is_anonymous, location_disclosure)
VALUES (39.6011111, 140.2022222, 'american', 'sighting', '66666666-6666-6666-6666-666666666666', false, 'hidden')
RETURNING id AS id_hidden_by_owner \gset
INSERT INTO posts (lat, lng, species, info_type, user_id, is_anonymous, location_disclosure)
VALUES (39.6011111, 140.2022222, 'american', 'sighting', '66666666-6666-6666-6666-666666666666', false, 'precise')
RETURNING id AS id_public \gset
INSERT INTO posts (lat, lng, species, info_type, user_id, is_anonymous)
VALUES (39.6011111, 140.2022222, 'american', 'sighting', '66666666-6666-6666-6666-666666666666', false)
RETURNING id AS id_default \gset

SELECT is(
  (SELECT location_disclosure FROM posts WHERE id = :'id_hidden_by_owner'),
  'hidden',
  'REQ-329-01: 投稿者が hidden を指定して INSERT すると hidden のまま保存される'
);
SELECT is(
  (SELECT location_disclosure FROM posts WHERE id = :'id_public'),
  'coarsened',
  'REQ-329-02: precise を指定しても種の既定（coarsened）に倒される（細かくは公開できない）'
);
SELECT is(
  (SELECT location_disclosure FROM posts WHERE id = :'id_default'),
  'coarsened',
  'REQ-329-03: 指定なしは従来どおり種の既定（coarsened）'
);

-- anon から見た非公開投稿の座標は NULL（地図にも公開データにも出ない）
SELECT _set_jwt('{}'::jsonb);
SET LOCAL ROLE anon;
SELECT is(
  (SELECT display_lat FROM posts WHERE id = :'id_hidden_by_owner'),
  NULL::numeric,
  'REQ-329-04: 投稿者が非公開にした投稿の display_lat は anon から NULL'
);

-- ════════════════════════════════════════════════════════════════════════════
-- 2. 投稿後の変更: 投稿者は hidden へだけ変更できる（一方向）。戻すのは管理者だけ
-- ════════════════════════════════════════════════════════════════════════════
SELECT _set_jwt('{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated","app_metadata":{}}'::jsonb);
SET LOCAL ROLE authenticated;

UPDATE posts SET location_disclosure = 'hidden' WHERE id = :'id_public';
SELECT is(
  (SELECT location_disclosure FROM posts WHERE id = :'id_public'),
  'hidden',
  'REQ-329-05: 投稿者は自分の投稿を hidden に変更できる'
);
UPDATE posts SET location_disclosure = 'coarsened' WHERE id = :'id_public';
SELECT is(
  (SELECT location_disclosure FROM posts WHERE id = :'id_public'),
  'hidden',
  'REQ-329-06: 投稿者は hidden を公開（coarsened）へ戻せない'
);
UPDATE posts SET location_disclosure = 'precise' WHERE id = :'id_default';
SELECT is(
  (SELECT location_disclosure FROM posts WHERE id = :'id_default'),
  'coarsened',
  'REQ-329-07: 投稿者は精度を上げる方向（precise）へは変更できない'
);

-- 他人（B）は RLS で UPDATE できない（0 行・値は変わらない）
SELECT _set_jwt('{"sub":"77777777-7777-7777-7777-777777777777","role":"authenticated","app_metadata":{}}'::jsonb);
UPDATE posts SET location_disclosure = 'hidden' WHERE id = :'id_default';
SELECT _set_jwt('{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated","app_metadata":{}}'::jsonb);
SELECT is(
  (SELECT location_disclosure FROM posts WHERE id = :'id_default'),
  'coarsened',
  'REQ-329-08: 他人は位置の公開レベルを変更できない'
);

-- 管理者は戻せる
SELECT _set_jwt('{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated","app_metadata":{"role":"admin"}}'::jsonb);
UPDATE posts SET location_disclosure = 'coarsened' WHERE id = :'id_public';
SELECT is(
  (SELECT location_disclosure FROM posts WHERE id = :'id_public'),
  'coarsened',
  'REQ-329-09: 管理者は hidden を公開へ戻せる'
);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. 地名の退避: hidden の投稿では locality / water_body を公開列から外し、管理者専用テーブルへ移す
-- ════════════════════════════════════════════════════════════════════════════
-- enrich-place（service_role）が非公開投稿に地名を書き戻す
SELECT _set_jwt('{"role":"service_role"}'::jsonb);
RESET ROLE;
UPDATE posts SET locality = '字テスト', water_body = 'テスト沼', geo_enriched_at = now()
WHERE id = :'id_hidden_by_owner';

SELECT is(
  (SELECT locality FROM posts WHERE id = :'id_hidden_by_owner'),
  NULL::text,
  'REQ-329-10: 非公開投稿へ書かれた locality は公開列に残らない（NULL）'
);
SELECT is(
  (SELECT water_body FROM posts WHERE id = :'id_hidden_by_owner'),
  NULL::text,
  'REQ-329-11: 非公開投稿へ書かれた water_body は公開列に残らない（NULL）'
);
SELECT is(
  (SELECT water_body FROM post_hidden_geo WHERE post_id = :'id_hidden_by_owner'),
  'テスト沼',
  'REQ-329-12: 地名は post_hidden_geo に退避される（研究データとして消さない）'
);

-- 公開中の投稿に地名が付いた後で投稿者が非公開にしたときも退避される
UPDATE posts SET locality = '字公開', water_body = '公開川', geo_enriched_at = now()
WHERE id = :'id_default';
SELECT _set_jwt('{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated","app_metadata":{}}'::jsonb);
SET LOCAL ROLE authenticated;
UPDATE posts SET location_disclosure = 'hidden' WHERE id = :'id_default';
SELECT _set_jwt('{}'::jsonb);
SET LOCAL ROLE anon;
SELECT is(
  (SELECT water_body FROM posts WHERE id = :'id_default'),
  NULL::text,
  'REQ-329-13: 投稿者が後から非公開にすると、公開列の water_body は anon から NULL になる'
);
SELECT throws_ok(
  'SELECT count(*) FROM post_hidden_geo',
  '42501', NULL,
  'REQ-329-14: anon は post_hidden_geo を参照できない（42501）'
);

-- 一般ユーザー（投稿者本人でも）は退避テーブルを 1 行も読めない
SELECT _set_jwt('{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated","app_metadata":{}}'::jsonb);
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*)::int FROM post_hidden_geo),
  0,
  'REQ-329-15: 一般ユーザーは post_hidden_geo の行を読めない（RLS で 0 行）'
);

-- 管理者は読め、公開へ戻すと地名が posts へ復元される
SELECT _set_jwt('{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated","app_metadata":{"role":"admin"}}'::jsonb);
SELECT is(
  (SELECT count(*)::int FROM post_hidden_geo WHERE post_id IN (:'id_hidden_by_owner', :'id_default')),
  2,
  'REQ-329-16: 管理者は退避された地名を読める'
);
SELECT public.set_post_location_disclosure(:'id_default'::uuid, 'coarsened');
SELECT is(
  (SELECT water_body FROM posts WHERE id = :'id_default'),
  '公開川',
  'REQ-329-17: 管理者が公開へ戻すと water_body が posts へ復元される'
);
SELECT is(
  (SELECT count(*)::int FROM post_hidden_geo WHERE post_id = :'id_default'),
  0,
  'REQ-329-18: 復元した記録の退避行は消える'
);

-- ════════════════════════════════════════════════════════════════════════════
-- 4. private_spots: 本人と管理者だけ
-- ════════════════════════════════════════════════════════════════════════════
SELECT _set_jwt('{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated","app_metadata":{}}'::jsonb);
SET LOCAL ROLE authenticated;
INSERT INTO private_spots (user_id, name, note, lat, lng, accuracy)
VALUES ('66666666-6666-6666-6666-666666666666', 'メダカの池', 'テスト', 39.7111111, 140.1222222, 8)
RETURNING id AS id_spot \gset
SELECT is(
  (SELECT name FROM private_spots WHERE id = :'id_spot'),
  'メダカの池',
  'REQ-329-19: 本人は自分の非公開スポットを保存して読める'
);
SELECT throws_ok(
  $$INSERT INTO private_spots (user_id, name, lat, lng) VALUES ('77777777-7777-7777-7777-777777777777', 'なりすまし', 39.7, 140.1)$$,
  '42501', NULL,
  'REQ-329-20: 他人名義の非公開スポットは作れない（RLS WITH CHECK）'
);
SELECT throws_ok(
  $$INSERT INTO private_spots (user_id, name, lat, lng) VALUES ('66666666-6666-6666-6666-666666666666', '   ', 39.7, 140.1)$$,
  '23514', NULL,
  'REQ-329-21: 空白だけの名前は保存できない（CHECK）'
);

-- 名前は変えられるが、所有者は付け替えられない
UPDATE private_spots SET name = '名前変更', user_id = '77777777-7777-7777-7777-777777777777' WHERE id = :'id_spot';
SELECT is(
  (SELECT user_id::text || '|' || name FROM private_spots WHERE id = :'id_spot'),
  '66666666-6666-6666-6666-666666666666|名前変更',
  'REQ-329-22: 名前は変更でき、所有者は固定される'
);

-- 他人は読めない・消せない
SELECT _set_jwt('{"sub":"77777777-7777-7777-7777-777777777777","role":"authenticated","app_metadata":{}}'::jsonb);
SELECT is(
  (SELECT count(*)::int FROM private_spots WHERE id = :'id_spot'),
  0,
  'REQ-329-23: 他人は非公開スポットを読めない'
);
DELETE FROM private_spots WHERE id = :'id_spot';

-- anon は触れない
SELECT _set_jwt('{}'::jsonb);
SET LOCAL ROLE anon;
SELECT throws_ok(
  'SELECT count(*) FROM private_spots',
  '42501', NULL,
  'REQ-329-24: anon は private_spots を参照できない（42501）'
);

-- 管理者は読める（研究データ）・消せる（運用）
SELECT _set_jwt('{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated","app_metadata":{"role":"admin"}}'::jsonb);
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*)::int FROM private_spots WHERE id = :'id_spot'),
  1,
  'REQ-329-25: 他人の DELETE は効いておらず、管理者は非公開スポットを読める'
);
DELETE FROM private_spots WHERE id = :'id_spot';
SELECT is(
  (SELECT count(*)::int FROM private_spots WHERE id = :'id_spot'),
  0,
  'REQ-329-26: 管理者は非公開スポットを削除できる'
);

-- ── 保存しすぎの上限（1 時間 60 件）──
SELECT _set_jwt('{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated","app_metadata":{}}'::jsonb);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  FOR i IN 1..60 LOOP
    INSERT INTO private_spots (user_id, name, lat, lng)
    VALUES ('66666666-6666-6666-6666-666666666666', 'spot ' || i, 39.7, 140.1);
  END LOOP;
END $$;
SELECT is(
  (SELECT count(*)::int FROM private_spots WHERE user_id = '66666666-6666-6666-6666-666666666666'),
  60,
  'REQ-329-27: 1 時間 60 件までは保存できる'
);
SELECT throws_ok(
  $$INSERT INTO private_spots (user_id, name, lat, lng) VALUES ('66666666-6666-6666-6666-666666666666', 'spot 61', 39.7, 140.1)$$,
  'P0001', NULL,
  'REQ-329-28: 1 時間 61 件目は DB で止まる'
);

-- ════════════════════════════════════════════════════════════════════════════
-- 5. 権限の whether 層: トリガー関数は直接実行できない
-- ════════════════════════════════════════════════════════════════════════════
RESET ROLE;
SELECT ok(
  NOT has_function_privilege('anon', 'public.stash_hidden_post_geo()', 'EXECUTE'),
  'REQ-329-29: anon は stash_hidden_post_geo を EXECUTE できない'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.private_spots', 'SELECT'),
  'REQ-329-30: anon は private_spots に SELECT 権限を持たない'
);

SELECT * FROM finish();
ROLLBACK;
