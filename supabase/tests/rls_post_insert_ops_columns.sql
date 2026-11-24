-- security-hardening 要件6: 新規投稿で、運用側の値（研究採用日時・採用通知日時・AI失敗回数）を申告できない。
--
-- 不具合: protect_post_insert_columns が3列を初期化していなかった。会員は新規投稿に「採用済み・通知済み」を付けて
--   保存でき、後の正式な採用でも通知が送られなかった（notify-research-adopted が already_notified で止まる）。
--   修正前のコードでは 1・2・3 が落ちる。
-- 管理者・service_role・SQL の直接実行は、従来どおり値を入れられる（4・5・6）。

BEGIN;
SELECT plan(6);

SELECT set_config('request.jwt.claims', '{}', true);
INSERT INTO auth.users (id, email) VALUES
  ('c1c1c1c1-0000-0000-0000-000000000001', 'member@example.test'),
  ('c2c2c2c2-0000-0000-0000-000000000002', 'admin@example.test');

-- ── 会員が3列を申告して投稿する ──────────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"c1c1c1c1-0000-0000-0000-000000000001","app_metadata":{"role":"authenticated"}}', true);
INSERT INTO posts (id, user_id, species, info_type, lat, lng, research_adopted_at, research_adopted_notified_at, ai_failure_count)
VALUES ('c0c0c0c0-0000-0000-0000-000000000001', 'c1c1c1c1-0000-0000-0000-000000000001',
        'american', 'sighting', 39.7, 140.1, now(), now(), 99);
RESET ROLE;

SELECT is((SELECT research_adopted_at FROM posts WHERE id = 'c0c0c0c0-0000-0000-0000-000000000001'), NULL::timestamptz,
  'SEC-6-1: 会員が申告した研究採用日時は、空に初期化される');
SELECT is((SELECT research_adopted_notified_at FROM posts WHERE id = 'c0c0c0c0-0000-0000-0000-000000000001'), NULL::timestamptz,
  'SEC-6-2: 会員が申告した採用通知日時は、空に初期化される（後の正式な採用通知を止められない）');
SELECT is((SELECT ai_failure_count FROM posts WHERE id = 'c0c0c0c0-0000-0000-0000-000000000001'), 0,
  'SEC-6-3: 会員が申告した AI 失敗回数は、0 に初期化される');

-- ── 管理者 ────────────────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"c2c2c2c2-0000-0000-0000-000000000002","app_metadata":{"role":"admin"}}', true);
INSERT INTO posts (id, user_id, species, info_type, lat, lng, research_adopted_at, ai_failure_count)
VALUES ('c0c0c0c0-0000-0000-0000-000000000002', 'c2c2c2c2-0000-0000-0000-000000000002',
        'american', 'sighting', 39.7, 140.1, '2026-01-01', 2);
RESET ROLE;
SELECT is((SELECT ai_failure_count FROM posts WHERE id = 'c0c0c0c0-0000-0000-0000-000000000002'), 2,
  'SEC-6-4: 管理者は、これまでどおり値を入れて登録できる（取り込みを妨げない）');

-- ── service_role と SQL の直接実行 ────────────────────────────────────
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
INSERT INTO posts (id, user_id, species, info_type, lat, lng, ai_failure_count)
VALUES ('c0c0c0c0-0000-0000-0000-000000000003', 'c1c1c1c1-0000-0000-0000-000000000001',
        'american', 'sighting', 39.7, 140.1, 5);
RESET ROLE;
SELECT is((SELECT ai_failure_count FROM posts WHERE id = 'c0c0c0c0-0000-0000-0000-000000000003'), 5,
  'SEC-6-5: service_role は、これまでどおり値を入れて登録できる');

SELECT set_config('request.jwt.claims', '{}', true);
INSERT INTO posts (id, user_id, species, info_type, lat, lng, research_adopted_at)
VALUES ('c0c0c0c0-0000-0000-0000-000000000004', 'c1c1c1c1-0000-0000-0000-000000000001',
        'american', 'sighting', 39.7, 140.1, '2025-12-31');
SELECT is((SELECT research_adopted_at FROM posts WHERE id = 'c0c0c0c0-0000-0000-0000-000000000004'), '2025-12-31'::timestamptz,
  'SEC-6-6: SQL の直接実行（移行・取り込み）は、これまでどおり値を入れられる');

SELECT * FROM finish();
ROLLBACK;
