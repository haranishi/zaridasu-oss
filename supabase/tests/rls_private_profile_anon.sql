-- security-hardening 要件2: 非公開プロフィールの図鑑・進捗を、未ログイン（匿名）に返さない。
--
-- 不具合: get_user_progress / get_user_collection は `v_is_owner := (p_user_id = auth.uid())` を使っていた。
--   未ログインでは auth.uid() が NULL になり、`IF NOT v_is_owner AND ...` が NULL（偽扱い）になって、
--   拒否の RETURN を通らずに行を返していた。修正前のコードでは 1・2・3 が落ちる。
--
-- 既存の rls_user_collection / rls_user_progress は、ログイン済みの他人の拒否を確かめているが、
-- 匿名の拒否は確かめていなかった。本テストはその穴を埋める。

BEGIN;
SELECT plan(8);

-- 準備（管理者権限で）: 非公開の利用者 A と、公開の利用者 B。どちらにも図鑑 1 行と進捗を置く。
SELECT set_config('request.jwt.claims', '{}', true);
INSERT INTO auth.users (id, email) VALUES
  ('a1a1a1a1-0000-0000-0000-000000000001', 'private-a@example.test'),
  ('b2b2b2b2-0000-0000-0000-000000000002', 'public-b@example.test'),
  ('c3c3c3c3-0000-0000-0000-000000000003', 'other-c@example.test');
UPDATE user_profiles SET is_public = false WHERE id = 'a1a1a1a1-0000-0000-0000-000000000001';
UPDATE user_profiles SET is_public = true  WHERE id = 'b2b2b2b2-0000-0000-0000-000000000002';
INSERT INTO user_collection (user_id, species, first_observed_at, info_types_seen, municipalities_seen, verified_count)
VALUES
  ('a1a1a1a1-0000-0000-0000-000000000001', 'american', '2026-05-01', ARRAY['sighting'], ARRAY['由利本荘市'], 3),
  ('b2b2b2b2-0000-0000-0000-000000000002', 'american', '2026-05-02', ARRAY['sighting'], ARRAY['秋田市'], 2);
INSERT INTO user_progress (user_id, xp, level) VALUES
  ('a1a1a1a1-0000-0000-0000-000000000001', 120, 2),
  ('b2b2b2b2-0000-0000-0000-000000000002', 80, 1)
ON CONFLICT (user_id) DO UPDATE SET xp = EXCLUDED.xp, level = EXCLUDED.level;

-- ── 匿名（公開キーだけ）──────────────────────────────────────────────
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);

SELECT is(
  (SELECT count(*) FROM public.get_user_progress('a1a1a1a1-0000-0000-0000-000000000001')), 0::bigint,
  'SEC-2-1: 匿名は、非公開プロフィールの進捗（経験値）を取得できない'
);
SELECT is(
  (SELECT count(*) FROM public.get_user_collection('a1a1a1a1-0000-0000-0000-000000000001')), 0::bigint,
  'SEC-2-2: 匿名は、非公開プロフィールの図鑑（種・市区町村）を取得できない'
);

-- JWT が無いリクエスト（claims が空）でも同じ
SELECT set_config('request.jwt.claims', '{}', true);
SELECT is(
  (SELECT count(*) FROM public.get_user_progress('a1a1a1a1-0000-0000-0000-000000000001')), 0::bigint,
  'SEC-2-3: claims が空のリクエストでも、非公開プロフィールの進捗を取得できない'
);

-- 公開プロフィールは、匿名でも今までどおり見える
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SELECT is(
  (SELECT xp FROM public.get_user_progress('b2b2b2b2-0000-0000-0000-000000000002')), 80::bigint,
  'SEC-2-4: 匿名は、公開プロフィールの進捗を今までどおり取得できる'
);
SELECT is(
  (SELECT count(*) FROM public.get_user_collection('b2b2b2b2-0000-0000-0000-000000000002')), 1::bigint,
  'SEC-2-5: 匿名は、公開プロフィールの図鑑を今までどおり取得できる'
);

-- ── ログイン済みの他人 ─────────────────────────────────────────────
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"c3c3c3c3-0000-0000-0000-000000000003"}', true);

SELECT is(
  (SELECT count(*) FROM public.get_user_collection('a1a1a1a1-0000-0000-0000-000000000001')), 0::bigint,
  'SEC-2-6: ログイン済みの他人は、非公開プロフィールの図鑑を取得できない'
);

-- ── 本人 ──────────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"a1a1a1a1-0000-0000-0000-000000000001"}', true);

SELECT is(
  (SELECT xp FROM public.get_user_progress('a1a1a1a1-0000-0000-0000-000000000001')), 120::bigint,
  'SEC-2-7: 本人は、非公開でも自分の進捗を取得できる'
);
SELECT is(
  (SELECT count(*) FROM public.get_user_collection('a1a1a1a1-0000-0000-0000-000000000001')), 1::bigint,
  'SEC-2-8: 本人は、非公開でも自分の図鑑を取得できる'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
