-- security-hardening 要件3: 頻度制限が、申告された日時で回避できた不具合の修正。
--
-- 原因: 投稿・コメントなどの回数制限は、保存済みの行を `created_at > now() - interval '24 hours'` で数える。
--   `created_at` は DEFAULT now() だが、INSERT で明示でき、INSERT の方針（auth_insert）も列の権限も止めていない。
--   一般ユーザーが `created_at = '2000-01-01'` を付けて投稿すると、上限（24 時間 5 件）に数えられない。
--   2026-10-21 に、CI 相当の手元 DB で再現した（20 件通過。通常は 5 件で止まる）。AI 判定は投稿ごとに費用がかかる。
-- 修正: 一般ユーザーの INSERT は受付時刻に固定し、UPDATE は旧値に戻す。管理者・service_role・SQL の直接実行
--   （移行・取り込み）は触らない。観察した日は observed_at が持つので、アプリの挙動は変わらない。
-- 限界: 投稿を消してから作り直すと、枠は戻る。この変更では塞がない（AI の呼び出しは別に上限がある）。
-- 対象: 回数制限のある 9 表（water_reports は入力検証のトリガーが元から固定している）。
-- トリガー名を aaa_ で始めるのは、他のトリガーより先に動かして、その後の処理が固定後の値を見るため。
BEGIN;

CREATE OR REPLACE FUNCTION public.pin_created_at_on_client_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_claims jsonb;
BEGIN
  -- 一般ユーザー（anon / authenticated）の書き込みだけを対象にする。service_role・postgres（移行・
  -- 取り込み・Edge Function）は、過去の日時を入れる正当な理由があるので触らない。
  -- SECURITY INVOKER にしてあるので、current_user は本当の実行者になる。
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;
  BEGIN
    v_claims := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb;
  EXCEPTION WHEN OTHERS THEN
    v_claims := NULL;
  END;
  -- 管理者は、データの取り込みで過去の日時を入れることがある（回数制限も管理者は対象外）。
  IF (v_claims -> 'app_metadata' ->> 'role') = 'admin' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := now();
  ELSE
    NEW.created_at := OLD.created_at;
  END IF;
  RETURN NEW;
END;
$$;
COMMENT ON FUNCTION public.pin_created_at_on_client_write() IS
  'security-hardening 要件3: 一般ユーザーの INSERT は created_at を受付時刻にし、UPDATE は旧値に戻す。回数制限は created_at で数えるため、過去の日時を申告されると数えられずに回避できた。観察日は observed_at が持つ。';

DROP TRIGGER IF EXISTS aaa_pin_created_at ON public.posts;
CREATE TRIGGER aaa_pin_created_at BEFORE INSERT OR UPDATE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.pin_created_at_on_client_write();
DROP TRIGGER IF EXISTS aaa_pin_created_at ON public.comments;
CREATE TRIGGER aaa_pin_created_at BEFORE INSERT OR UPDATE ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.pin_created_at_on_client_write();
DROP TRIGGER IF EXISTS aaa_pin_created_at ON public.likes;
CREATE TRIGGER aaa_pin_created_at BEFORE INSERT OR UPDATE ON public.likes
  FOR EACH ROW EXECUTE FUNCTION public.pin_created_at_on_client_write();
DROP TRIGGER IF EXISTS aaa_pin_created_at ON public.reports;
CREATE TRIGGER aaa_pin_created_at BEFORE INSERT OR UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.pin_created_at_on_client_write();
DROP TRIGGER IF EXISTS aaa_pin_created_at ON public.survey_requests;
CREATE TRIGGER aaa_pin_created_at BEFORE INSERT OR UPDATE ON public.survey_requests
  FOR EACH ROW EXECUTE FUNCTION public.pin_created_at_on_client_write();
DROP TRIGGER IF EXISTS aaa_pin_created_at ON public.private_spots;
CREATE TRIGGER aaa_pin_created_at BEFORE INSERT OR UPDATE ON public.private_spots
  FOR EACH ROW EXECUTE FUNCTION public.pin_created_at_on_client_write();
DROP TRIGGER IF EXISTS aaa_pin_created_at ON public.rare_sightings;
CREATE TRIGGER aaa_pin_created_at BEFORE INSERT OR UPDATE ON public.rare_sightings
  FOR EACH ROW EXECUTE FUNCTION public.pin_created_at_on_client_write();
DROP TRIGGER IF EXISTS aaa_pin_created_at ON public.survey_plans;
CREATE TRIGGER aaa_pin_created_at BEFORE INSERT OR UPDATE ON public.survey_plans
  FOR EACH ROW EXECUTE FUNCTION public.pin_created_at_on_client_write();
DROP TRIGGER IF EXISTS aaa_pin_created_at ON public.survey_plan_stops;
CREATE TRIGGER aaa_pin_created_at BEFORE INSERT OR UPDATE ON public.survey_plan_stops
  FOR EACH ROW EXECUTE FUNCTION public.pin_created_at_on_client_write();

COMMIT;
