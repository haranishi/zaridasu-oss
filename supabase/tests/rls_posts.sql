-- REQ-048: posts テーブル RLS / トリガーの自動テスト（pg-tap）
-- 実行方法:
--   1) `supabase start` でローカル Supabase を起動
--   2) `supabase db reset` で schema.sql を適用
--   3) `supabase test db` で本ファイルが実行される（tests/*.sql を自動検出）
--
-- 各テストは BEGIN / ROLLBACK で isolation。副作用は残さない。

BEGIN;
SELECT plan(48);

-- ===================================================
-- セットアップ: 4 ロール分のダミーユーザー
-- ===================================================
-- anon は暗黙的（JWT なし相当）。admin / authenticated は app_metadata で切替える
INSERT INTO auth.users (id, email, raw_app_meta_data)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'admin@test.local', '{"role":"admin"}'::jsonb),
  ('22222222-2222-2222-2222-222222222222', 'user@test.local', '{}'::jsonb),
  -- REQ-244 節専用の一般ユーザー。単一 BEGIN/ROLLBACK 内で user 22222222 に投稿を積み増すと
  -- check_post_rate_limit（24h・同一 user_id で 5 件上限。admin のみバイパス）に達して途中の
  -- INSERT が中断するため、REQ-244 の追加投稿は別ユーザーに逃がして上限を跨がないようにする。
  ('33333333-3333-3333-3333-333333333333', 'user2@test.local', '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- JWT クレームを設定するヘルパー
CREATE OR REPLACE FUNCTION _set_jwt(claims jsonb) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', claims::text, true);
END;$$;
-- 関数の EXECUTE は既定で閉じている（REQ-316）。この補助関数は、ログイン済み・匿名の権限に切り替えた後でも
-- 呼ぶので、明示で許可する。
GRANT EXECUTE ON FUNCTION _set_jwt(jsonb) TO PUBLIC;

-- ===================================================
-- INV-01: authenticated が is_official=true で INSERT しても強制リセット
-- ===================================================
SELECT _set_jwt('{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated","app_metadata":{"role":"authenticated"}}'::jsonb);
SET LOCAL ROLE authenticated;

INSERT INTO posts (lat, lng, species, info_type, user_id, is_anonymous, is_official, is_flagged)
VALUES (39.7, 140.1, 'american', 'sighting', '22222222-2222-2222-2222-222222222222', false, true, true)
RETURNING id \gset

SELECT is(
  (SELECT is_official FROM posts WHERE id = :'id'),
  false,
  'INV-01a: authenticated が is_official=true を指定しても強制的に false'
);
SELECT is(
  (SELECT is_flagged FROM posts WHERE id = :'id'),
  false,
  'INV-01b: authenticated が is_flagged=true を指定しても強制的に false'
);
SELECT is(
  (SELECT status FROM posts WHERE id = :'id'),
  'pending',
  'INV-01c: INSERT 時の status は常に pending'
);

-- ===================================================
-- INV-02: UPDATE で status/is_official/reviewed_by を変更できない
-- ===================================================
UPDATE posts SET
  status = 'approved',
  is_official = true,
  reviewed_by = '22222222-2222-2222-2222-222222222222'
WHERE id = :'id';

SELECT is(
  (SELECT status FROM posts WHERE id = :'id'),
  'pending',
  'INV-02a: authenticated は status を変更できない'
);
SELECT is(
  (SELECT is_official FROM posts WHERE id = :'id'),
  false,
  'INV-02b: authenticated は is_official を変更できない'
);
SELECT is(
  (SELECT reviewed_by FROM posts WHERE id = :'id'),
  NULL::uuid,
  'INV-02c: authenticated は reviewed_by を変更できない'
);

-- ===================================================
-- INV-03: admin は上記すべてを変更できる
-- ===================================================
SELECT _set_jwt('{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","app_metadata":{"role":"admin"}}'::jsonb);

UPDATE posts SET
  status = 'approved',
  is_official = true,
  reviewed_by = '11111111-1111-1111-1111-111111111111'
WHERE id = :'id';

SELECT is(
  (SELECT status FROM posts WHERE id = :'id'),
  'approved',
  'INV-03a: admin は status を approved に変更できる'
);
SELECT is(
  (SELECT is_official FROM posts WHERE id = :'id'),
  true,
  'INV-03b: admin は is_official=true にできる'
);

-- ===================================================
-- INV-04: service_role は status/auto_approved を直接 UPDATE できる
-- ===================================================
SELECT _set_jwt('{"role":"service_role"}'::jsonb);
RESET ROLE;

INSERT INTO posts (lat, lng, species, info_type, user_id, is_anonymous)
VALUES (39.72, 140.1, 'bullfrog', 'capture', '22222222-2222-2222-2222-222222222222', false)
RETURNING id \gset

UPDATE posts SET status = 'approved', auto_approved = true WHERE id = :'id';

SELECT is(
  (SELECT auto_approved FROM posts WHERE id = :'id'),
  true,
  'INV-04: service_role は auto_approved=true にできる（Edge Function 自動承認担保）'
);

-- ===================================================
-- INV-05: anon（未ログイン）は INSERT できない
-- ===================================================
SELECT _set_jwt('{}'::jsonb);
SET LOCAL ROLE anon;

SELECT throws_ok(
  $$INSERT INTO posts (lat, lng, species, info_type, user_id, is_anonymous) VALUES (39.7, 140.1, 'american', 'sighting', '22222222-2222-2222-2222-222222222222', false)$$,
  NULL,
  'new row violates row-level security policy for table "posts"',
  'INV-05: anon は auth_insert ポリシーで INSERT 不可'
);

-- ===================================================
-- REQ-136: protect_post_status 全カラム保護
-- ===================================================
-- service_role で全カラムに「OLD 値」をセットした投稿を 1 件用意
SELECT _set_jwt('{"role":"service_role"}'::jsonb);
RESET ROLE;

INSERT INTO posts (
  lat, lng, species, info_type, user_id, is_anonymous,
  status, rejection_reason, rejection_message, reviewed_at, reviewed_by, auto_approved,
  is_official, is_flagged, reporter_ip,
  ai_result, ai_analyzed_at, ai_failure_count,
  audio_hash, image_hashes,
  audio_url, audio_duration_ms,
  weather, temperature, humidity,
  survey_duration_minutes
)
VALUES (
  35.0, 139.0, 'american', 'sighting', '22222222-2222-2222-2222-222222222222', false,
  'approved', 'orig_reason', 'orig_message', '2026-01-01T00:00:00Z'::timestamptz, '11111111-1111-1111-1111-111111111111', true,
  true, true, '203.0.113.1',
  '{"orig":true}'::jsonb, '2026-01-02T00:00:00Z'::timestamptz, 2,
  repeat('a', 64), ARRAY[repeat('b', 64)]::text[],
  'https://orig.example/audio.webm', 30000,
  'sunny', 22.5, 50,
  10
)
RETURNING id \gset

-- 一般ユーザーで UPDATE して全カラム改竄を試みる
SELECT _set_jwt('{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated","app_metadata":{"role":"authenticated"}}'::jsonb);
SET LOCAL ROLE authenticated;

UPDATE posts SET
  status = 'rejected',
  rejection_reason = 'evil',
  rejection_message = 'evil msg',
  reviewed_at = '2099-01-01T00:00:00Z'::timestamptz,
  reviewed_by = '22222222-2222-2222-2222-222222222222',
  auto_approved = false,
  is_official = false,
  is_flagged = false,
  reporter_ip = '0.0.0.0',
  ai_result = '{"evil":true}'::jsonb,
  ai_analyzed_at = '2099-01-01T00:00:00Z'::timestamptz,
  ai_failure_count = 99,
  audio_hash = repeat('c', 64),
  image_hashes = ARRAY[repeat('d', 64)]::text[],
  audio_url = 'https://evil.example/x.webm',
  audio_duration_ms = 1,
  weather = 'rainy',
  temperature = 1.0,
  humidity = 99,
  survey_duration_minutes = 1
WHERE id = :'id';

-- 22 カラムについて OLD 値が保持されていることを 1 個ずつ assert
SELECT is((SELECT status            FROM posts WHERE id = :'id'), 'approved',          'INV-R136-01: status は OLD 固定');
SELECT is((SELECT rejection_reason  FROM posts WHERE id = :'id'), 'orig_reason',       'INV-R136-02: rejection_reason は OLD 固定');
SELECT is((SELECT rejection_message FROM posts WHERE id = :'id'), 'orig_message',      'INV-R136-03: rejection_message は OLD 固定');
SELECT is((SELECT reviewed_at       FROM posts WHERE id = :'id'), '2026-01-01T00:00:00Z'::timestamptz, 'INV-R136-04: reviewed_at は OLD 固定');
SELECT is((SELECT reviewed_by       FROM posts WHERE id = :'id'), '11111111-1111-1111-1111-111111111111'::uuid, 'INV-R136-05: reviewed_by は OLD 固定');
SELECT is((SELECT auto_approved     FROM posts WHERE id = :'id'), true,                'INV-R136-06: auto_approved は OLD 固定');
SELECT is((SELECT is_official       FROM posts WHERE id = :'id'), true,                'INV-R136-07: is_official は OLD 固定');
SELECT is((SELECT is_flagged        FROM posts WHERE id = :'id'), true,                'INV-R136-08: is_flagged は OLD 固定');
-- INV-R136-09: reporter_ip も OLD 固定（トリガー保護）。ただし reporter_ip は REQ-179 の列レベル
-- 保護で authenticated からは SELECT できない（INV-R179-02 参照）。トリガーが OLD を保持したことの
-- 検証は「値を読める」権限が要るため、一時的に RESET ROLE（= 本テストでは superuser）で読む。
-- 読み終えたら authenticated に戻し、後続の OLD 固定アサート（authenticated 視点）を継続する。
RESET ROLE;
SELECT is((SELECT reporter_ip       FROM posts WHERE id = :'id'), '203.0.113.1',       'INV-R136-09: reporter_ip は OLD 固定');
SELECT _set_jwt('{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated","app_metadata":{"role":"authenticated"}}'::jsonb);
SET LOCAL ROLE authenticated;
SELECT is((SELECT ai_result         FROM posts WHERE id = :'id'), '{"orig":true}'::jsonb, 'INV-R136-10: ai_result は OLD 固定');
SELECT is((SELECT ai_analyzed_at    FROM posts WHERE id = :'id'), '2026-01-02T00:00:00Z'::timestamptz, 'INV-R136-11: ai_analyzed_at は OLD 固定');
SELECT is((SELECT ai_failure_count  FROM posts WHERE id = :'id'), 2,                   'INV-R136-12: ai_failure_count は OLD 固定 (リセット攻撃を防ぐ)');
SELECT is((SELECT audio_hash        FROM posts WHERE id = :'id'), repeat('a', 64),     'INV-R136-13: audio_hash は OLD 固定');
SELECT is((SELECT image_hashes      FROM posts WHERE id = :'id'), ARRAY[repeat('b', 64)]::text[], 'INV-R136-14: image_hashes は OLD 固定');
SELECT is((SELECT audio_url         FROM posts WHERE id = :'id'), 'https://orig.example/audio.webm', 'INV-R136-15: audio_url は OLD 固定 (差し替え攻撃を防ぐ)');
SELECT is((SELECT audio_duration_ms FROM posts WHERE id = :'id'), 30000,               'INV-R136-16: audio_duration_ms は OLD 固定');
SELECT is((SELECT weather           FROM posts WHERE id = :'id'), 'sunny',             'INV-R136-17: weather は OLD 固定');
SELECT is((SELECT temperature       FROM posts WHERE id = :'id'), 22.5::numeric,       'INV-R136-18: temperature は OLD 固定');
SELECT is((SELECT humidity          FROM posts WHERE id = :'id'), 50,                  'INV-R136-19: humidity は OLD 固定');
SELECT is((SELECT survey_duration_minutes FROM posts WHERE id = :'id'), 10,            'INV-R136-20: survey_duration_minutes は OLD 固定');

-- user_id は WITH CHECK 違反で row policy が deny する想定だが、二重防御で OLD 固定もかかる
UPDATE posts SET comment = 'edit ok' WHERE id = :'id';
SELECT is((SELECT comment FROM posts WHERE id = :'id'), 'edit ok', 'INV-R136-21: 保護対象外の comment は通常通り編集可');

-- admin 経路の回帰: 管理系カラムは admin で変更できる
SELECT _set_jwt('{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","app_metadata":{"role":"admin"}}'::jsonb);
UPDATE posts SET status = 'rejected', is_official = false, ai_failure_count = 0 WHERE id = :'id';
SELECT is((SELECT status           FROM posts WHERE id = :'id'), 'rejected', 'INV-R136-22: admin は status を変更できる (REQ-136 回帰)');
SELECT is((SELECT is_official      FROM posts WHERE id = :'id'), false,      'INV-R136-23: admin は is_official を変更できる (REQ-136 回帰)');

-- ===================================================
-- REQ-179: reporter_ip（PII）の列レベル保護
--   anon / authenticated は reporter_ip を SELECT すると権限エラーになる。
--   行 RLS ではなく列権限による保護であることを示すため、service_role で
--   「承認済み（行 RLS では可視）」かつ reporter_ip 入りの行を 1 件用意してから検証する。
-- ===================================================
SELECT _set_jwt('{"role":"service_role"}'::jsonb);
RESET ROLE;

INSERT INTO posts (lat, lng, species, info_type, user_id, is_anonymous, status, reporter_ip)
VALUES (38.0, 138.0, 'american', 'sighting', NULL, true, 'approved', '198.51.100.7')
RETURNING id \gset

-- anon: 承認済み行でも reporter_ip 列は読めない（insufficient_privilege = SQLSTATE 42501）。
-- 保護機構は「テーブルレベル SELECT を剥がし、reporter_ip 以外の全列に列単位 SELECT を付与」
-- （列単位 REVOKE は no-op になるため不可）。この機構では reporter_ip を含むクエリは
-- "permission denied for table posts"（列単位 GRANT の無い列に触れるためテーブル権限が問われる）に
-- なる。機構差でメッセージ文言が変わりうるため、ここでは errcode 42501 のみを検証する（文言は不問）。
SELECT _set_jwt('{}'::jsonb);
SET LOCAL ROLE anon;

SELECT throws_ok(
  format($$SELECT reporter_ip FROM posts WHERE id = %L$$, :'id'),
  '42501',
  NULL,
  'INV-R179-01: anon は reporter_ip 列を SELECT できない（42501 insufficient_privilege）'
);

-- authenticated: 同上（承認済み行は moderated_read で可視だが reporter_ip 列は読めない）
SELECT _set_jwt('{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated","app_metadata":{"role":"authenticated"}}'::jsonb);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  format($$SELECT reporter_ip FROM posts WHERE id = %L$$, :'id'),
  '42501',
  NULL,
  'INV-R179-02: authenticated は reporter_ip 列を SELECT できない（42501 insufficient_privilege）'
);

-- 回帰: 保護列（reporter_ip / lat / lng / accuracy）を「含まない」通常の投稿取得は authenticated でも成功する
-- （列レベル保護が公開閲覧を壊していないことの確認）。REQ-243 で lat/lng も保護対象になったため display_* を使う。
SELECT lives_ok(
  format($$SELECT id, display_lat, display_lng, species, status FROM posts WHERE id = %L$$, :'id'),
  'INV-R179-03: 保護列を含まない SELECT（display_* 使用）は authenticated で成功（公開閲覧は不変）'
);

-- ===================================================
-- REQ-208: protect_official_flag の「JWT 無しセッション」挙動を
--   兄弟関数 protect_post_status とそろえたことの回帰。
--   JWT 無し（空 claims）では両トリガーとも素通りするため、
--   is_official の UPDATE は OLD 固定されずに反映される（旧実装では
--   protect_official_flag が is_official を OLD に戻していた）。
-- ===================================================
-- service_role で is_official=false の行を 1 件用意
SELECT _set_jwt('{"role":"service_role"}'::jsonb);
RESET ROLE;

INSERT INTO posts (lat, lng, species, info_type, user_id, is_anonymous, is_official)
VALUES (37.5, 139.5, 'american', 'sighting', '22222222-2222-2222-2222-222222222222', false, false)
RETURNING id \gset

-- JWT 無し（空 claims）セッションで is_official を true に変更
SELECT _set_jwt('{}'::jsonb);
RESET ROLE;

UPDATE posts SET is_official = true WHERE id = :'id';
SELECT is(
  (SELECT is_official FROM posts WHERE id = :'id'),
  true,
  'INV-R208-01: JWT 無しでは protect_official_flag が素通りし is_official 更新が反映（protect_post_status と一致）'
);

-- 同セッションで status を直接変更しても protect_post_status も素通り（従来挙動の確認）
UPDATE posts SET status = 'approved' WHERE id = :'id';
SELECT is(
  (SELECT status FROM posts WHERE id = :'id'),
  'approved',
  'INV-R208-02: JWT 無しでは protect_post_status も素通り（トリガー族で JWT 無し挙動が一致）'
);

-- ===================================================
-- REQ-244: INSERT 列保護 — サーバ付与地理メタデータ列 & municipality 許可リスト正規化
--   一般ユーザーが付与列（locality/water_body/is_on_water/elevation_m/geo_enriched_at/geo_source）を
--   自分で指定しても保存されず NULL 化され、enrich-place の冪等ガードをバイパスできない。
--   municipality は許可リスト（秋田県 25 市町村）外を NULL 化。admin/service_role は pass-through。
-- ===================================================
-- REQ-244 の追加投稿は user 33333333（REQ-244 専用ユーザー）で行い、user 22222222 の
-- 24h 投稿件数を 5 件上限（check_post_rate_limit）に達させないようにする。sub と user_id を
-- 33333333 でそろえる（auth_insert ポリシー WITH CHECK auth.uid() = user_id を満たすため）。
SELECT _set_jwt('{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated","app_metadata":{"role":"authenticated"}}'::jsonb);
SET LOCAL ROLE authenticated;

-- 攻撃 INSERT: サーバ付与列（geo_source は CHECK 上「有効」な nominatim を使い、CHECK ではなく
-- トリガーが NULL 化したことを一意に示す）+ 許可リスト外 municipality + 数式ペイロード water_body。
INSERT INTO posts (
  lat, lng, species, info_type, user_id, is_anonymous,
  municipality, locality, water_body, is_on_water, elevation_m, geo_enriched_at, geo_source
)
VALUES (
  39.7, 140.1, 'american', 'sighting', '33333333-3333-3333-3333-333333333333', false,
  'ゴッサム市', '偽の字名', '=HYPERLINK("https://evil.example")', true, 9999.9,
  '2000-01-01T00:00:00Z'::timestamptz, 'nominatim'
)
RETURNING id \gset

SELECT is((SELECT locality        FROM posts WHERE id = :'id'), NULL::text,        'INV-R244-01: locality は一般ユーザー INSERT で NULL 化');
SELECT is((SELECT water_body      FROM posts WHERE id = :'id'), NULL::text,        'INV-R244-02: water_body は NULL 化（数式ペイロードも保存されない）');
SELECT is((SELECT is_on_water     FROM posts WHERE id = :'id'), NULL::boolean,     'INV-R244-03: is_on_water は NULL 化');
SELECT is((SELECT elevation_m     FROM posts WHERE id = :'id'), NULL::numeric,     'INV-R244-04: elevation_m は NULL 化');
SELECT is((SELECT geo_enriched_at FROM posts WHERE id = :'id'), NULL::timestamptz, 'INV-R244-05: geo_enriched_at は NULL 化（enrich 冪等ガードのバイパス封じ）');
SELECT is((SELECT geo_source      FROM posts WHERE id = :'id'), NULL::text,        'INV-R244-06: geo_source は NULL 化（有効値でもトリガーが剥がす）');
SELECT is((SELECT municipality    FROM posts WHERE id = :'id'), NULL::text,        'INV-R244-07: 許可リスト外の municipality は NULL 化');

-- 許可リスト内 municipality は保持される（正規投稿の回帰なし）
INSERT INTO posts (lat, lng, species, info_type, user_id, is_anonymous, municipality)
VALUES (39.72, 140.12, 'american', 'sighting', '33333333-3333-3333-3333-333333333333', false, '秋田市')
RETURNING id \gset

SELECT is((SELECT municipality FROM posts WHERE id = :'id'), '秋田市', 'INV-R244-08: 許可リスト内の municipality は保持される');

-- service_role（enrich-place の正規経路）は pass-through: 付与列を書ける
SELECT _set_jwt('{"role":"service_role"}'::jsonb);
RESET ROLE;

INSERT INTO posts (
  lat, lng, species, info_type, user_id, is_anonymous,
  locality, water_body, geo_enriched_at, geo_source
)
VALUES (
  39.73, 140.13, 'american', 'sighting', '22222222-2222-2222-2222-222222222222', false,
  'service が付与した字名', '雄物川', '2026-01-01T00:00:00Z'::timestamptz, 'nominatim'
)
RETURNING id \gset

SELECT is((SELECT locality        FROM posts WHERE id = :'id'), 'service が付与した字名',              'INV-R244-09: service_role は locality を付与できる（正規 enrich フローの回帰なし）');
SELECT is((SELECT geo_enriched_at FROM posts WHERE id = :'id'), '2026-01-01T00:00:00Z'::timestamptz, 'INV-R244-10: service_role は geo_enriched_at を設定できる（pass-through 保持）');

SELECT * FROM finish();
ROLLBACK;
