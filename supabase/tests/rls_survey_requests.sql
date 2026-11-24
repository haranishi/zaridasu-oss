-- REQ-208: survey_requests の列固定トリガー（protect_survey_request_columns）の自動テスト（pg-tap）
-- 実行方法:
--   1) `supabase start` でローカル Supabase を起動
--   2) `supabase db reset` で schema.sql を適用（CI は psql -f supabase/schema.sql）
--   3) `supabase test db` / `pg_prove --ext .sql supabase/tests/` で実行
--
-- 各テストは BEGIN / ROLLBACK で isolation。副作用は残さない。
-- 注: CI は schema.sql のみを適用するため survey_request_responses（migration 由来）は存在しない。
--     response_count の保護は「所有者の直接 UPDATE が OLD 固定される」ことで検証する。

BEGIN;
SELECT plan(14);

-- ===================================================
-- セットアップ: admin / owner / other の 3 ユーザー
-- ===================================================
INSERT INTO auth.users (id, email, raw_app_meta_data)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'admin@test.local', '{"role":"admin"}'::jsonb),
  ('22222222-2222-2222-2222-222222222222', 'owner@test.local', '{}'::jsonb),
  ('33333333-3333-3333-3333-333333333333', 'other@test.local', '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- JWT クレームを設定するヘルパー（rls_posts.sql と同形式。ロールバックされるため本ファイルでも定義）
CREATE OR REPLACE FUNCTION _set_jwt(claims jsonb) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', claims::text, true);
END;$$;
-- 関数の EXECUTE は既定で閉じている（REQ-316）。この補助関数は、ログイン済み・匿名の権限に切り替えた後でも
-- 呼ぶので、明示で許可する。
GRANT EXECUTE ON FUNCTION _set_jwt(jsonb) TO PUBLIC;

-- service_role で「OLD 値」をセットした調査依頼を 1 件用意（response_count=5, status=open）
SELECT _set_jwt('{"role":"service_role"}'::jsonb);
RESET ROLE;

INSERT INTO survey_requests (
  id, created_at, user_id, lat, lng, municipality, species, reason, urgency, status, response_count, closed_at
)
VALUES (
  '44444444-4444-4444-4444-444444444444',
  '2026-01-01T00:00:00Z'::timestamptz,
  '22222222-2222-2222-2222-222222222222',
  39.7, 140.1, '秋田市', 'american', 'orig reason', 'normal', 'open', 5, NULL
)
RETURNING id \gset

-- ===================================================
-- AC-01: 所有者が response_count を直接 UPDATE しても OLD 固定
-- ===================================================
SELECT _set_jwt('{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated","app_metadata":{"role":"authenticated"}}'::jsonb);
SET LOCAL ROLE authenticated;

UPDATE survey_requests SET response_count = 9999 WHERE id = :'id';

SELECT is(
  (SELECT response_count FROM survey_requests WHERE id = :'id'),
  5,
  'AC-01: 所有者が response_count=9999 を指定しても OLD(5) 固定（集計キャッシュ保護）'
);

-- ===================================================
-- INV: 所有者は user_id / created_at / reason 等も改竄できない（OLD 固定）
-- ===================================================
UPDATE survey_requests SET
  user_id    = '33333333-3333-3333-3333-333333333333',
  created_at = '2099-01-01T00:00:00Z'::timestamptz,
  reason     = 'evil reason',
  species    = 'bullfrog',
  urgency    = 'urgent',
  lat        = 0.0,
  lng        = 0.0
WHERE id = :'id';

SELECT is((SELECT user_id    FROM survey_requests WHERE id = :'id'), '22222222-2222-2222-2222-222222222222'::uuid, 'INV-01: 所有者は user_id を変更できない');
SELECT is((SELECT created_at FROM survey_requests WHERE id = :'id'), '2026-01-01T00:00:00Z'::timestamptz,            'INV-02: 所有者は created_at を変更できない');
SELECT is((SELECT reason     FROM survey_requests WHERE id = :'id'), 'orig reason',                                  'INV-03: 所有者は reason を変更できない');
SELECT is((SELECT species    FROM survey_requests WHERE id = :'id'), 'american',                                     'INV-04: 所有者は species を変更できない');
SELECT is((SELECT urgency    FROM survey_requests WHERE id = :'id'), 'normal',                                       'INV-05: 所有者は urgency を変更できない');

-- ===================================================
-- INV: 所有者は status を 'closed' 以外へ直接変更できない（responded への巻き戻し攻撃を防ぐ）
-- ===================================================
UPDATE survey_requests SET status = 'responded' WHERE id = :'id';
SELECT is(
  (SELECT status FROM survey_requests WHERE id = :'id'),
  'open',
  'INV-06: 所有者は status を responded に直接変更できない（OLD 固定）'
);

-- ===================================================
-- AC-02: 所有者はクローズ操作（status='closed' / closed_at 設定）はできる
-- ===================================================
UPDATE survey_requests SET status = 'closed', closed_at = '2026-02-01T00:00:00Z'::timestamptz WHERE id = :'id';
SELECT is(
  (SELECT status FROM survey_requests WHERE id = :'id'),
  'closed',
  'AC-02a: 所有者は status=closed にクローズできる'
);
SELECT is(
  (SELECT closed_at FROM survey_requests WHERE id = :'id'),
  '2026-02-01T00:00:00Z'::timestamptz,
  'AC-02b: 所有者は closed_at を設定できる（クローズ操作の一部）'
);

-- ===================================================
-- AC-03(service_role): バックエンド（service_role / BYPASSRLS）は response_count / status を
--   自由に更新できる（集計トリガー sync_survey_response_count・status 自動遷移の実行主体）。
--   protect_survey_request_columns は service_role を素通りさせ、RLS も BYPASSRLS で跨ぐため、
--   どの行でも任意更新できる = response_count の正規の更新者はこの経路（とカスケード）に限られる。
-- 注（設計の明確化）: survey_requests には posts の admin_all_posts に相当する「admin の RLS
--   UPDATE ポリシー」が存在しない（schema.sql:1601-1604 は viewable/insertable/owner_update/
--   owner_delete のみ）。したがって "所有者でない admin" がクライアント鍵で他人の依頼を更新する
--   経路は無く（RLS USING=auth.uid()=user_id が偽 → 0 行更新）、管理系の更新は service_role 経由が
--   正規。protect_survey_request_columns の admin 素通り分岐は「admin 本人が自分の依頼を更新する」
--   ケースで効く（下の AC-03d で検証）。REQ-208 AC-03「admin は従来どおり更新でき／他人は不可／
--   既存 RLS の回帰なし」を、実在する RLS 設計（admin RLS ポリシー無し）に忠実な形で検証する。
-- ===================================================
SELECT _set_jwt('{"role":"service_role"}'::jsonb);
RESET ROLE;

UPDATE survey_requests SET response_count = 42, status = 'responded' WHERE id = :'id';
SELECT is((SELECT response_count FROM survey_requests WHERE id = :'id'), 42,          'AC-03a: service_role は response_count を変更できる（集計の正規更新者）');
SELECT is((SELECT status         FROM survey_requests WHERE id = :'id'), 'responded', 'AC-03b: service_role は status を任意に変更できる');

-- ===================================================
-- AC-03(other): 他人の依頼は更新できない（既存 RLS = survey_requests_owner_update）
--   RLS USING が偽の行は UPDATE 対象に入らず 0 行更新（エラーにはならない）→ 値は不変。
--   非 admin の他人（other）。直前で service_role が 42/responded に更新済みなので、値が不変＝42。
-- ===================================================
SELECT _set_jwt('{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated","app_metadata":{"role":"authenticated"}}'::jsonb);
SET LOCAL ROLE authenticated;

UPDATE survey_requests SET status = 'closed', response_count = 1 WHERE id = :'id';
SELECT is(
  (SELECT response_count FROM survey_requests WHERE id = :'id'),
  42,
  'AC-03c: 他人（非 admin）は依頼を更新できない（RLS により 0 行更新・値不変）'
);

-- ===================================================
-- AC-03d: protect_survey_request_columns の admin 素通り分岐の回帰。
--   admin が「自分の」依頼を更新するケース（= RLS owner_update を通過できる唯一の admin 経路）で、
--   トリガーが OLD 固定せず response_count / status を自由に変更できることを確認する。
--   （admin 用に owner=admin の依頼を service_role で 1 件用意してから検証）
-- ===================================================
SELECT _set_jwt('{"role":"service_role"}'::jsonb);
RESET ROLE;

INSERT INTO survey_requests (
  id, created_at, user_id, lat, lng, municipality, species, reason, urgency, status, response_count, closed_at
)
VALUES (
  '55555555-5555-5555-5555-555555555555',
  '2026-01-01T00:00:00Z'::timestamptz,
  '11111111-1111-1111-1111-111111111111',
  39.7, 140.1, '秋田市', 'american', 'admin own', 'normal', 'open', 7, NULL
)
RETURNING id \gset

SELECT _set_jwt('{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","app_metadata":{"role":"admin"}}'::jsonb);
SET LOCAL ROLE authenticated;

UPDATE survey_requests SET response_count = 42, status = 'responded' WHERE id = :'id';
SELECT is((SELECT response_count FROM survey_requests WHERE id = :'id'), 42,          'AC-03d-1: admin は自分の依頼の response_count を変更できる（トリガー素通り）');
SELECT is((SELECT status         FROM survey_requests WHERE id = :'id'), 'responded', 'AC-03d-2: admin は自分の依頼の status を任意に変更できる（トリガー素通り）');

SELECT * FROM finish();
ROLLBACK;
