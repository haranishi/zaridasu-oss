-- REQ-243: 位置情報プライバシーの RLS / 列保護 / 公開レベルトリガー / RPC の自動テスト（pg-tap）
-- 実行方法は rls_posts.sql と同じ（supabase test db / CI では pg_prove が tests/*.sql を自動検出）。
-- 前提: schema.sql + Supabase 既定 GRANT + 列レベル保護 migration（20260703000001）適用後の DB 状態。
-- 各テストは BEGIN / ROLLBACK で isolation。副作用は残さない。

BEGIN;
SELECT plan(14);

-- ── セットアップ: admin / 一般ユーザーのダミー ──
INSERT INTO auth.users (id, email, raw_app_meta_data)
VALUES
  ('33333333-3333-3333-3333-333333333333', 'admin2@test.local', '{"role":"admin"}'::jsonb),
  ('44444444-4444-4444-4444-444444444444', 'user2@test.local', '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION _set_jwt(claims jsonb) RETURNS void LANGUAGE plpgsql AS $$
BEGIN PERFORM set_config('request.jwt.claims', claims::text, true); END;$$;
-- 関数の EXECUTE は既定で閉じている（REQ-316）。この補助関数は、ログイン済み・匿名の権限に切り替えた後でも
-- 呼ぶので、明示で許可する。
GRANT EXECUTE ON FUNCTION _set_jwt(jsonb) TO PUBLIC;

-- 種の既定（american=coarsened）を保証（schema.sql が seed 済みだがテスト単独適用にも耐えるよう明示）
INSERT INTO species_location_defaults (species, default_disclosure)
VALUES ('american', 'coarsened') ON CONFLICT (species) DO NOTHING;

-- ── service_role: 公開レベル別の投稿を用意（トリガーは service_role 素通り＝明示値が入る） ──
SELECT _set_jwt('{"role":"service_role"}'::jsonb);
RESET ROLE;

INSERT INTO posts (lat, lng, species, info_type, user_id, is_anonymous, status, location_disclosure)
VALUES (39.7001234, 140.1004567, 'american', 'sighting', NULL, true, 'approved', 'coarsened')
RETURNING id AS id_coarse \gset
INSERT INTO posts (lat, lng, species, info_type, user_id, is_anonymous, status, location_disclosure)
VALUES (39.7001234, 140.1004567, 'american', 'sighting', NULL, true, 'approved', 'hidden')
RETURNING id AS id_hidden \gset
INSERT INTO posts (lat, lng, species, info_type, user_id, is_anonymous, status, location_disclosure)
VALUES (39.7001234, 140.1004567, 'american', 'sighting', NULL, true, 'approved', 'precise')
RETURNING id AS id_precise \gset
-- 一般ユーザー 4444 が所有する hidden 投稿（所有者は正確座標を RPC で取れることの検証用）
INSERT INTO posts (lat, lng, species, info_type, user_id, is_anonymous, status, location_disclosure)
VALUES (39.7001234, 140.1004567, 'american', 'sighting', '44444444-4444-4444-4444-444444444444', false, 'approved', 'hidden')
RETURNING id AS id_owned \gset

-- ════════════════════════════════════════════════════════════════════════════
-- INV-01: anon は生 lat / accuracy を SELECT できない（列 GRANT 剥奪 = 42501）
-- ════════════════════════════════════════════════════════════════════════════
SELECT _set_jwt('{}'::jsonb);
SET LOCAL ROLE anon;

SELECT throws_ok(
  format($$SELECT lat FROM posts WHERE id = %L$$, :'id_coarse'),
  '42501', NULL,
  'INV-243-01: anon は生 lat 列を SELECT できない（42501）'
);
SELECT throws_ok(
  format($$SELECT accuracy FROM posts WHERE id = %L$$, :'id_coarse'),
  '42501', NULL,
  'INV-243-02: anon は accuracy 列を SELECT できない（42501）'
);

-- ── 非所有者 authenticated も同様 ──
SELECT _set_jwt('{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated","app_metadata":{"role":"authenticated"}}'::jsonb);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  format($$SELECT lng FROM posts WHERE id = %L$$, :'id_coarse'),
  '42501', NULL,
  'INV-243-03: 非所有者 authenticated は生 lng 列を SELECT できない（42501）'
);

-- ════════════════════════════════════════════════════════════════════════════
-- INV-02: anon は display_lat/lng（公開レベル反映済み）を参照できる
--   coarsened=round(_,3) / hidden=NULL / precise=生値
-- ════════════════════════════════════════════════════════════════════════════
SELECT _set_jwt('{}'::jsonb);
SET LOCAL ROLE anon;

SELECT is(
  (SELECT display_lat FROM posts WHERE id = :'id_coarse'),
  39.700::numeric,
  'INV-243-04: coarsened は display_lat が round(lat,3)=39.700'
);
SELECT is(
  (SELECT display_lat FROM posts WHERE id = :'id_hidden'),
  NULL::numeric,
  'INV-243-05: hidden は display_lat が NULL（座標なし）'
);
SELECT is(
  (SELECT display_lat FROM posts WHERE id = :'id_precise'),
  39.7001234::numeric,
  'INV-243-06: precise は display_lat が生値'
);

-- ════════════════════════════════════════════════════════════════════════════
-- INV-03: location_disclosure はユーザー改竄不可（INSERT は種既定で強制 / UPDATE は OLD 固定）
-- ════════════════════════════════════════════════════════════════════════════
SELECT _set_jwt('{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated","app_metadata":{"role":"authenticated"}}'::jsonb);
SET LOCAL ROLE authenticated;

INSERT INTO posts (lat, lng, species, info_type, user_id, is_anonymous, location_disclosure)
VALUES (39.5, 140.2, 'american', 'sighting', '44444444-4444-4444-4444-444444444444', false, 'precise')
RETURNING id AS id_user \gset

SELECT is(
  (SELECT location_disclosure FROM posts WHERE id = :'id_user'),
  'coarsened',
  'INV-243-07: 一般ユーザーが precise 指定で INSERT しても種既定(coarsened)で強制される'
);

UPDATE posts SET location_disclosure = 'precise' WHERE id = :'id_user';
SELECT is(
  (SELECT location_disclosure FROM posts WHERE id = :'id_user'),
  'coarsened',
  'INV-243-08: 一般ユーザーは UPDATE で location_disclosure を変更できない（OLD 固定）'
);

-- ── admin は変更できる ──
SELECT _set_jwt('{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated","app_metadata":{"role":"admin"}}'::jsonb);
UPDATE posts SET location_disclosure = 'hidden' WHERE id = :'id_user';
SELECT is(
  (SELECT location_disclosure FROM posts WHERE id = :'id_user'),
  'hidden',
  'INV-243-09: admin は location_disclosure を変更できる'
);

-- ════════════════════════════════════════════════════════════════════════════
-- INV-04: get_my_post_location は所有者にのみ正確座標を返す（hidden でも所有者は取得可）
-- ════════════════════════════════════════════════════════════════════════════
SELECT _set_jwt('{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated","app_metadata":{"role":"authenticated"}}'::jsonb);
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT lat FROM public.get_my_post_location(:'id_owned'::uuid)),
  39.7001234::numeric,
  'INV-243-10: 所有者は get_my_post_location で自分の hidden 投稿の正確座標を取得できる'
);
SELECT is(
  (SELECT count(*)::int FROM public.get_my_post_location(:'id_coarse'::uuid)),
  0,
  'INV-243-11: 非所有者は get_my_post_location で他人の座標を取得できない（0 行）'
);

-- ════════════════════════════════════════════════════════════════════════════
-- INV-05: survey_requests / survey_sites の座標・可視性
-- ════════════════════════════════════════════════════════════════════════════
SELECT _set_jwt('{"role":"service_role"}'::jsonb);
RESET ROLE;
INSERT INTO survey_requests (user_id, lat, lng, species, reason)
VALUES ('44444444-4444-4444-4444-444444444444', 39.8009876, 140.3001234, 'american', 'テスト依頼')
RETURNING id AS id_sr \gset
INSERT INTO survey_sites (user_id, name, lat, lng)
VALUES ('44444444-4444-4444-4444-444444444444', 'マイ定点', 39.9, 140.4)
RETURNING id AS id_site \gset

SELECT _set_jwt('{}'::jsonb);
SET LOCAL ROLE anon;
SELECT throws_ok(
  format($$SELECT lat FROM survey_requests WHERE id = %L$$, :'id_sr'),
  '42501', NULL,
  'INV-243-12: anon は survey_requests の生 lat 列を SELECT できない（42501）'
);
SELECT is(
  (SELECT display_lat FROM survey_requests WHERE id = :'id_sr'),
  39.801::numeric,
  'INV-243-13: survey_requests は display_lat=round(lat,3)=39.801 を anon に見せる'
);
-- survey_sites は所有者+管理者のみ SELECT 可（anon は行が見えず 0 件）
SELECT is(
  (SELECT count(*)::int FROM survey_sites WHERE id = :'id_site'),
  0,
  'INV-243-14: anon は survey_sites を読めない（公開 SELECT 廃止・所有者/管理者限定）'
);

SELECT * FROM finish();
ROLLBACK;
