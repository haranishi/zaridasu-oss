-- REQ-325: 本人専用の回答。schema.sql と既定GRANT後の再適用を経て実行する。
BEGIN;
SELECT plan(18);

INSERT INTO auth.users (id, email, raw_app_meta_data) VALUES
  ('32500000-0000-0000-0000-000000000001', 'onboarding1@test.local', '{}'::jsonb),
  ('32500000-0000-0000-0000-000000000002', 'onboarding2@test.local', '{}'::jsonb);

CREATE OR REPLACE FUNCTION _set_jwt(claims jsonb) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', claims::text, true);
END;$$;
-- 関数の EXECUTE は既定で閉じている（REQ-316）。この補助関数は、ログイン済み・匿名の権限に切り替えた後でも
-- 呼ぶので、明示で許可する。
GRANT EXECUTE ON FUNCTION _set_jwt(jsonb) TO PUBLIC;

SELECT _set_jwt('{"sub":"32500000-0000-0000-0000-000000000001","role":"authenticated"}'::jsonb);
SET LOCAL ROLE authenticated;
SELECT lives_ok($$INSERT INTO public.user_onboarding (user_id, region, seen_crayfish, updated_at)
  VALUES ('32500000-0000-0000-0000-000000000001', 'akita_city', 'maybe', '2000-01-01')$$, '本人 INSERT');
SELECT is((SELECT count(*) FROM public.user_onboarding), 1::bigint, '本人 SELECT');
SELECT ok((SELECT onboarded_at IS NOT NULL FROM public.user_onboarding), '完了日時 DEFAULT');
SELECT lives_ok($$UPDATE public.user_onboarding SET region = 'north', seen_crayfish = 'yes'$$, '本人 UPDATE');
SELECT is((SELECT region FROM public.user_onboarding), 'north', '地域更新が反映');
SELECT ok((SELECT updated_at > '2000-01-01'::timestamptz FROM public.user_onboarding), '更新日時トリガー');
SELECT throws_ok($$UPDATE public.user_onboarding SET region = 'invalid'$$, '23514', NULL, 'region CHECK');
SELECT throws_ok($$UPDATE public.user_onboarding SET seen_crayfish = 'invalid'$$, '23514', NULL, 'seen CHECK');
SELECT throws_ok($$UPDATE public.user_onboarding SET region = NULL$$, '23502', NULL, 'region NOT NULL');
SELECT throws_ok($$UPDATE public.user_onboarding SET user_id = '32500000-0000-0000-0000-000000000002'$$,
  '42501', NULL, '他人への所有者変更はWITH CHECKで拒否');
SELECT throws_ok($$INSERT INTO public.user_onboarding (user_id, region, seen_crayfish)
  VALUES ('32500000-0000-0000-0000-000000000002', 'south', 'no')$$, '42501', NULL, '他人の行 INSERT 拒否');
SELECT throws_ok($$DELETE FROM public.user_onboarding$$, '42501', NULL, '本人も直接 DELETE 不可');

SELECT _set_jwt('{"sub":"32500000-0000-0000-0000-000000000002","role":"authenticated"}'::jsonb);
SELECT is((SELECT count(*) FROM public.user_onboarding), 0::bigint, '他人の行 SELECT 0件');
-- データ変更を含む CTE はサブクエリに置けない（PostgreSQL: must be at the top level）ので、
-- UPDATE は単文で流し、他人の行が変わっていないことは RESET ROLE 後に本体の値で確認する。
SELECT lives_ok($$UPDATE public.user_onboarding SET region = 'south'$$, '他人の行 UPDATE はエラーにならず 0 件');

SELECT _set_jwt('{}'::jsonb);
SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT * FROM public.user_onboarding$$, '42501', NULL, 'anon SELECT 拒否');
SELECT throws_ok($$INSERT INTO public.user_onboarding (user_id, region, seen_crayfish)
  VALUES ('32500000-0000-0000-0000-000000000002', 'other', 'no')$$, '42501', NULL, 'anon INSERT 拒否');

RESET ROLE;
SELECT is((SELECT region FROM public.user_onboarding WHERE user_id = '32500000-0000-0000-0000-000000000001'),
  'north', '他人からの UPDATE は反映されていない（RLS で 0 件）');
DELETE FROM auth.users WHERE id = '32500000-0000-0000-0000-000000000001';
SELECT is((SELECT count(*) FROM public.user_onboarding), 0::bigint, '退会 cascade');
SELECT * FROM finish();
ROLLBACK;
