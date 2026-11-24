-- ════════════════════════════════════════════════════════════════════════════
-- REQ-330: 調査の日を「計画→案内→記録」の一続きにし、希少種は公開経路から切り離して記録する
--
-- 背景: 希少種（ニホンザリガニ・メダカ・ゼニタナゴ等）は、場所が知られると採集される。
--   posts に入れると、RLS を通らない公開 RPC（集計・ランキング・週報など）、誰でも一覧できる
--   写真置き場 post-photos、状態に関係なく全件公開の comments / likes のすべてに除外条件を
--   書き続けることになり、1か所の書き忘れで公開される。そこで別表と非公開の写真置き場に置く。
--   既存の公開経路はこの表を参照しない（scripts/check-private-tables-not-public.mjs が CI で見張る）。
--
-- 本 migration の内容:
--   1. survey_plans       調査計画（題名・予定日・状態・メモ）
--   2. survey_plan_stops  計画の地点（順番・名前・座標・出どころ・状態）。座標は複製して持つ
--   3. survey_stop_posts  地点と投稿のつながり（posts に列を足すと anon から見えるため別表）
--   4. rare_sightings     希少種の記録（種・数・座標・観察日時・写真のパス）。client_id で二重登録を弾く
--   5. 地点の並べ替え RPC（SECURITY INVOKER。本人の計画だけ）
--   6. 写真置き場 rare-photos（非公開・5MB・jpeg/png/webp）と storage.objects のポリシー
--
-- 権限の型は private_spots（REQ-329）を写す: SELECT は本人か管理者、INSERT・UPDATE は本人、
--   DELETE は本人か管理者。anon には GRANT 自体を付けない。つながりは作るか消すかだけ（UPDATE なし）。
--
-- 冪等設計: CREATE ... IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF EXISTS / DO ... EXCEPTION /
--   ON CONFLICT。schema.sql（正本）と同一定義。テーブルの REVOKE は Supabase 既定 GRANT の「後」に
--   効かせる必要があるため、supabase/ci/reapply-after-grants.txt に本ファイルを追記している。
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. survey_plans: 調査計画
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.survey_plans (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 60),
  planned_on  date NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Tokyo')::date),
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'done', 'archived')),
  note        text CHECK (note IS NULL OR char_length(note) <= 500),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.survey_plans IS
  'REQ-330: 調査計画。本人と管理者だけが読める。家で計画して現地で使うため端末ではなく DB に置く。';
COMMENT ON COLUMN public.survey_plans.planned_on IS
  'REQ-330: 予定日。既定は日本時間の今日。';
CREATE INDEX IF NOT EXISTS idx_survey_plans_user_planned ON public.survey_plans (user_id, planned_on DESC);
CREATE INDEX IF NOT EXISTS idx_survey_plans_user_created ON public.survey_plans (user_id, created_at DESC);

-- ────────────────────────────────────────────────────────────────────────────
-- 2. survey_plan_stops: 計画の地点
--    座標は複製して持つ（元の非公開スポットを消しても計画は壊れない）。source_id は外部キーにしない。
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.survey_plan_stops (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id     uuid NOT NULL REFERENCES public.survey_plans(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sort_order  integer NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 9999),
  name        text CHECK (name IS NULL OR char_length(btrim(name)) BETWEEN 1 AND 60),
  note        text CHECK (note IS NULL OR char_length(note) <= 500),
  lat         numeric(10,7) NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng         numeric(10,7) NOT NULL CHECK (lng BETWEEN -180 AND 180),
  source      text NOT NULL CHECK (source IN ('pin', 'private_spot', 'survey_request', 'current_location')),
  source_id   uuid,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'skipped')),
  visited_at  timestamptz CHECK (visited_at IS NULL OR visited_at <= now() + interval '1 day'),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  -- 元の id を持つのは非公開スポットと調査依頼から足した地点だけ（ピン・現在地は持たない）
  CONSTRAINT survey_plan_stops_source_id_matches
    CHECK ((source_id IS NOT NULL) = (source = 'private_spot' OR source = 'survey_request'))
);
COMMENT ON TABLE public.survey_plan_stops IS
  'REQ-330: 調査計画の地点。本人と管理者だけが読める。座標は複製して持ち、元のスポットとは外部キーで結ばない。';
COMMENT ON COLUMN public.survey_plan_stops.visited_at IS
  'REQ-330: 済み・飛ばしにした端末の時刻。圏外で溜めて後から送る場合があるため updated_at と分ける。';
CREATE INDEX IF NOT EXISTS idx_survey_plan_stops_plan_order ON public.survey_plan_stops (plan_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_survey_plan_stops_user_created ON public.survey_plan_stops (user_id, created_at DESC);

-- ────────────────────────────────────────────────────────────────────────────
-- 3. survey_stop_posts: 地点と投稿のつながり
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.survey_stop_posts (
  stop_id     uuid NOT NULL REFERENCES public.survey_plan_stops(id) ON DELETE CASCADE,
  post_id     uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('sighting', 'absence')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (stop_id, post_id)
);
COMMENT ON TABLE public.survey_stop_posts IS
  'REQ-330: 調査地点から作った投稿のつながり。本人と管理者だけが読める。地点も投稿も自分のものに限る。作るか消すかだけ（UPDATE なし）。';
CREATE INDEX IF NOT EXISTS idx_survey_stop_posts_post ON public.survey_stop_posts (post_id);

-- ────────────────────────────────────────────────────────────────────────────
-- 4. rare_sightings: 希少種の記録
--    種は形式だけ検査し、一覧はコードの定数 1 か所（src/features/fieldwork/constants.ts）に置く。
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rare_sightings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id       uuid NOT NULL,
  stop_id         uuid REFERENCES public.survey_plan_stops(id) ON DELETE SET NULL,
  species_key     text NOT NULL CHECK (species_key ~ '^[a-z][a-z0-9_]{0,39}$'),
  species_label   text CHECK (species_label IS NULL OR char_length(btrim(species_label)) BETWEEN 1 AND 60),
  count           integer CHECK (count IS NULL OR count BETWEEN 0 AND 100000),
  note            text CHECK (note IS NULL OR char_length(note) <= 500),
  lat             numeric(10,7) NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng             numeric(10,7) NOT NULL CHECK (lng BETWEEN -180 AND 180),
  accuracy        numeric(7,1) CHECK (accuracy IS NULL OR accuracy >= 0),
  location_source text NOT NULL CHECK (location_source IN ('gps', 'map')),
  observed_at     timestamptz NOT NULL DEFAULT now() CHECK (observed_at <= now() + interval '1 day'),
  photo_paths     text[] NOT NULL DEFAULT '{}'::text[] CHECK (cardinality(photo_paths) <= 3),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rare_sightings_other_needs_label CHECK (species_key <> 'other' OR species_label IS NOT NULL),
  -- 応答が途切れたあとの再送で 2 行入らないように、端末で作る id で弾く（REQ-329 の非公開スポットの穴を作らない）
  CONSTRAINT rare_sightings_user_client_key UNIQUE (user_id, client_id)
);
COMMENT ON TABLE public.rare_sightings IS
  'REQ-330: 希少種の記録。本人と管理者だけが読める。posts・公開データセット・集計 RPC とは無関係。写真は非公開の rare-photos に置く。';
COMMENT ON COLUMN public.rare_sightings.client_id IS
  'REQ-330: 端末で作る uuid。同じ送信の二重登録を UNIQUE (user_id, client_id) で弾く。';
COMMENT ON COLUMN public.rare_sightings.location_source IS
  'REQ-330: 位置の取り方。gps=現在地（accuracy も保存）、map=地点や地図の座標。';
COMMENT ON COLUMN public.rare_sightings.photo_paths IS
  'REQ-330: rare-photos 内のパス（3 つまで）。どれも <自分の user_id>/ で始まる（トリガーで検査）。';
CREATE INDEX IF NOT EXISTS idx_rare_sightings_user_created ON public.rare_sightings (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rare_sightings_stop ON public.rare_sightings (stop_id) WHERE stop_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. RLS（private_spots と同じ型。管理者の判定も同じ式）
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.survey_plans      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.survey_plan_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.survey_stop_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rare_sightings    ENABLE ROW LEVEL SECURITY;

-- survey_plans
DO $$ BEGIN
  CREATE POLICY survey_plans_select_own_or_admin ON public.survey_plans
    FOR SELECT TO authenticated
    USING (
      (SELECT auth.uid()) = user_id
      OR ((SELECT auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY survey_plans_insert_own ON public.survey_plans
    FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY survey_plans_update_own ON public.survey_plans
    FOR UPDATE TO authenticated
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY survey_plans_delete_own_or_admin ON public.survey_plans
    FOR DELETE TO authenticated
    USING (
      (SELECT auth.uid()) = user_id
      OR ((SELECT auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- survey_plan_stops（INSERT は「その計画が自分のもの」も確かめる）
DO $$ BEGIN
  CREATE POLICY survey_plan_stops_select_own_or_admin ON public.survey_plan_stops
    FOR SELECT TO authenticated
    USING (
      (SELECT auth.uid()) = user_id
      OR ((SELECT auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY survey_plan_stops_insert_own ON public.survey_plan_stops
    FOR INSERT TO authenticated
    WITH CHECK (
      (SELECT auth.uid()) = user_id
      AND EXISTS (
        SELECT 1 FROM public.survey_plans p
        WHERE p.id = survey_plan_stops.plan_id AND p.user_id = (SELECT auth.uid())
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY survey_plan_stops_update_own ON public.survey_plan_stops
    FOR UPDATE TO authenticated
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY survey_plan_stops_delete_own_or_admin ON public.survey_plan_stops
    FOR DELETE TO authenticated
    USING (
      (SELECT auth.uid()) = user_id
      OR ((SELECT auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- survey_stop_posts（INSERT は「地点も投稿も自分のもの」。UPDATE のポリシーと権限は付けない）
DO $$ BEGIN
  CREATE POLICY survey_stop_posts_select_own_or_admin ON public.survey_stop_posts
    FOR SELECT TO authenticated
    USING (
      (SELECT auth.uid()) = user_id
      OR ((SELECT auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY survey_stop_posts_insert_own ON public.survey_stop_posts
    FOR INSERT TO authenticated
    WITH CHECK (
      (SELECT auth.uid()) = user_id
      AND EXISTS (
        SELECT 1 FROM public.survey_plan_stops s
        WHERE s.id = survey_stop_posts.stop_id AND s.user_id = (SELECT auth.uid())
      )
      AND EXISTS (
        SELECT 1 FROM public.posts p
        WHERE p.id = survey_stop_posts.post_id AND p.user_id = (SELECT auth.uid())
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY survey_stop_posts_delete_own_or_admin ON public.survey_stop_posts
    FOR DELETE TO authenticated
    USING (
      (SELECT auth.uid()) = user_id
      OR ((SELECT auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- rare_sightings（地点を付けるなら自分の地点だけ）
DO $$ BEGIN
  CREATE POLICY rare_sightings_select_own_or_admin ON public.rare_sightings
    FOR SELECT TO authenticated
    USING (
      (SELECT auth.uid()) = user_id
      OR ((SELECT auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY rare_sightings_insert_own ON public.rare_sightings
    FOR INSERT TO authenticated
    WITH CHECK (
      (SELECT auth.uid()) = user_id
      AND (
        stop_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.survey_plan_stops s
          WHERE s.id = rare_sightings.stop_id AND s.user_id = (SELECT auth.uid())
        )
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY rare_sightings_update_own ON public.rare_sightings
    FOR UPDATE TO authenticated
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK (
      (SELECT auth.uid()) = user_id
      AND (
        stop_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.survey_plan_stops s
          WHERE s.id = rare_sightings.stop_id AND s.user_id = (SELECT auth.uid())
        )
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY rare_sightings_delete_own_or_admin ON public.rare_sightings
    FOR DELETE TO authenticated
    USING (
      (SELECT auth.uid()) = user_id
      OR ((SELECT auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- anon には一切触らせない（whether 層で閉じる）。退会時は auth.users の cascade で消える。
REVOKE ALL ON public.survey_plans      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.survey_plan_stops FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.survey_stop_posts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.rare_sightings    FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.survey_plans      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.survey_plan_stops TO authenticated;
GRANT SELECT, INSERT, DELETE         ON public.survey_stop_posts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rare_sightings    TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. UPDATE で所有者・端末 ID・作成日時（地点は計画も）を旧値に戻す（protect_private_spot_columns と同じ形）
--    updated_at は既存の update_updated_at に任せる。
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.protect_survey_plan_columns()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.user_id    := OLD.user_id;
  NEW.created_at := OLD.created_at;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.protect_survey_plan_columns() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS enforce_survey_plan_columns ON public.survey_plans;
CREATE TRIGGER enforce_survey_plan_columns
  BEFORE UPDATE ON public.survey_plans
  FOR EACH ROW EXECUTE FUNCTION public.protect_survey_plan_columns();

CREATE OR REPLACE FUNCTION public.protect_survey_plan_stop_columns()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.user_id    := OLD.user_id;
  NEW.plan_id    := OLD.plan_id;
  NEW.created_at := OLD.created_at;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.protect_survey_plan_stop_columns() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS enforce_survey_plan_stop_columns ON public.survey_plan_stops;
CREATE TRIGGER enforce_survey_plan_stop_columns
  BEFORE UPDATE ON public.survey_plan_stops
  FOR EACH ROW EXECUTE FUNCTION public.protect_survey_plan_stop_columns();

CREATE OR REPLACE FUNCTION public.protect_rare_sighting_columns()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.user_id    := OLD.user_id;
  NEW.client_id  := OLD.client_id;
  NEW.created_at := OLD.created_at;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.protect_rare_sighting_columns() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS enforce_rare_sighting_columns ON public.rare_sightings;
CREATE TRIGGER enforce_rare_sighting_columns
  BEFORE UPDATE ON public.rare_sightings
  FOR EACH ROW EXECUTE FUNCTION public.protect_rare_sighting_columns();

DROP TRIGGER IF EXISTS set_survey_plans_updated_at ON public.survey_plans;
CREATE TRIGGER set_survey_plans_updated_at
  BEFORE UPDATE ON public.survey_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
DROP TRIGGER IF EXISTS set_survey_plan_stops_updated_at ON public.survey_plan_stops;
CREATE TRIGGER set_survey_plan_stops_updated_at
  BEFORE UPDATE ON public.survey_plan_stops
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
DROP TRIGGER IF EXISTS set_rare_sightings_updated_at ON public.rare_sightings;
CREATE TRIGGER set_rare_sightings_updated_at
  BEFORE UPDATE ON public.rare_sightings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
-- 7. 写真のパスは自分のフォルダ（<user_id>/ファイル名）だけ。他人の写真を自分の記録に結び付けさせない。
--    UPDATE では旧行の所有者で照合する（トリガーの発火順に頼らず、所有者の書き換えで検査をすり抜けさせない）。
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_rare_sighting_photo_paths()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_owner uuid;
  v_path  text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_owner := OLD.user_id;
  ELSE
    v_owner := NEW.user_id;
  END IF;
  IF NEW.photo_paths IS NULL THEN
    RETURN NEW;  -- NOT NULL 制約が拒否する
  END IF;
  FOREACH v_path IN ARRAY NEW.photo_paths LOOP
    IF v_path IS NULL OR v_path !~ ('^' || v_owner::text || '/[A-Za-z0-9][A-Za-z0-9._-]{0,199}$') THEN
      RAISE EXCEPTION '写真は自分のフォルダ（%/）にあるものだけ付けられます', v_owner USING ERRCODE = '42501';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.check_rare_sighting_photo_paths() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS zz_check_rare_sighting_photo_paths ON public.rare_sightings;
CREATE TRIGGER zz_check_rare_sighting_photo_paths
  BEFORE INSERT OR UPDATE ON public.rare_sightings
  FOR EACH ROW EXECUTE FUNCTION public.check_rare_sighting_photo_paths();

-- ────────────────────────────────────────────────────────────────────────────
-- 8. 上限（private_spots と同じ書き方。管理者は素通り）
--    計画: 1日30件・1人1000件 / 地点: 1時間300件・1計画100件 / 希少種: 1時間60件・1人5000件
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_survey_plan_rate_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_recent integer;
  v_total  integer;
BEGIN
  IF (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'role') = 'admin' THEN
    RETURN NEW;
  END IF;
  SELECT count(*) INTO v_recent FROM public.survey_plans
  WHERE user_id = NEW.user_id AND created_at > now() - interval '1 day';
  IF v_recent >= 30 THEN
    RAISE EXCEPTION '調査計画の作成上限（1日あたり30件）に達しました' USING ERRCODE = 'P0001';
  END IF;
  SELECT count(*) INTO v_total FROM public.survey_plans WHERE user_id = NEW.user_id;
  IF v_total >= 1000 THEN
    RAISE EXCEPTION '調査計画の作成上限（1人1000件）に達しました' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.check_survey_plan_rate_limit() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS enforce_survey_plan_rate_limit ON public.survey_plans;
CREATE TRIGGER enforce_survey_plan_rate_limit
  BEFORE INSERT ON public.survey_plans
  FOR EACH ROW EXECUTE FUNCTION public.check_survey_plan_rate_limit();

CREATE OR REPLACE FUNCTION public.check_survey_plan_stop_rate_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_recent  integer;
  v_in_plan integer;
BEGIN
  IF (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'role') = 'admin' THEN
    RETURN NEW;
  END IF;
  SELECT count(*) INTO v_recent FROM public.survey_plan_stops
  WHERE user_id = NEW.user_id AND created_at > now() - interval '1 hour';
  IF v_recent >= 300 THEN
    RAISE EXCEPTION '調査地点の追加上限（1時間あたり300件）に達しました' USING ERRCODE = 'P0001';
  END IF;
  SELECT count(*) INTO v_in_plan FROM public.survey_plan_stops WHERE plan_id = NEW.plan_id;
  IF v_in_plan >= 100 THEN
    RAISE EXCEPTION '1つの計画に入れられる地点は100か所までです' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.check_survey_plan_stop_rate_limit() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS enforce_survey_plan_stop_rate_limit ON public.survey_plan_stops;
CREATE TRIGGER enforce_survey_plan_stop_rate_limit
  BEFORE INSERT ON public.survey_plan_stops
  FOR EACH ROW EXECUTE FUNCTION public.check_survey_plan_stop_rate_limit();

CREATE OR REPLACE FUNCTION public.check_rare_sighting_rate_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_recent integer;
  v_total  integer;
BEGIN
  IF (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'role') = 'admin' THEN
    RETURN NEW;
  END IF;
  SELECT count(*) INTO v_recent FROM public.rare_sightings
  WHERE user_id = NEW.user_id AND created_at > now() - interval '1 hour';
  IF v_recent >= 60 THEN
    RAISE EXCEPTION '希少種の記録の上限（1時間あたり60件）に達しました' USING ERRCODE = 'P0001';
  END IF;
  SELECT count(*) INTO v_total FROM public.rare_sightings WHERE user_id = NEW.user_id;
  IF v_total >= 5000 THEN
    RAISE EXCEPTION '希少種の記録の上限（1人5000件）に達しました' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.check_rare_sighting_rate_limit() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS enforce_rare_sighting_rate_limit ON public.rare_sightings;
CREATE TRIGGER enforce_rare_sighting_rate_limit
  BEFORE INSERT ON public.rare_sightings
  FOR EACH ROW EXECUTE FUNCTION public.check_rare_sighting_rate_limit();

-- ────────────────────────────────────────────────────────────────────────────
-- 9. 地点の並べ替え（本人用 RPC）
--    計画の地点を全部、新しい順に渡すと sort_order を 0 から振り直す。1 回の取引で済むので、
--    途中で切れて順番が重なることがない。SECURITY INVOKER なので RLS がそのまま効く
--    （他人の計画は見えず、管理者も他人の計画は並べ替えられない）。
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reorder_survey_plan_stops(p_plan_id uuid, p_stop_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_n       integer := COALESCE(cardinality(p_stop_ids), 0);
  v_total   integer;
  v_updated integer;
BEGIN
  IF v_n = 0 THEN
    RAISE EXCEPTION '並べ替える地点がありません' USING ERRCODE = '22023';
  END IF;
  IF v_n <> (SELECT count(DISTINCT x) FROM unnest(p_stop_ids) AS x) THEN
    RAISE EXCEPTION '同じ地点が2回入っています' USING ERRCODE = '22023';
  END IF;
  SELECT count(*) INTO v_total FROM public.survey_plan_stops WHERE plan_id = p_plan_id;
  IF v_total <> v_n THEN
    RAISE EXCEPTION '計画の地点が変わっています。読み込み直してください' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.survey_plan_stops AS s
     SET sort_order = t.ord - 1
    FROM unnest(p_stop_ids) WITH ORDINALITY AS t(stop_id, ord)
   WHERE s.id = t.stop_id AND s.plan_id = p_plan_id;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> v_n THEN
    RAISE EXCEPTION '並べ替えられない地点があります' USING ERRCODE = '42501';
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.reorder_survey_plan_stops(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reorder_survey_plan_stops(uuid, uuid[]) TO authenticated;
COMMENT ON FUNCTION public.reorder_survey_plan_stops(uuid, uuid[]) IS
  'REQ-330: 計画の地点を渡された順に並べ直す（sort_order を 0 から振り直す）。SECURITY INVOKER で本人の計画だけ。';

-- ────────────────────────────────────────────────────────────────────────────
-- 10. 写真置き場 rare-photos（非公開）
--     post-photos は誰でも一覧できる（public_read_photos）ので、希少種の写真は絶対にそこへ置かない。
--     表示は期限付きの署名 URL（createSignedUrl）だけ。UPDATE のポリシーは付けない。
--     既に公開で作られていても非公開へ戻す（ON CONFLICT DO UPDATE）。
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'rare-photos',
  'rare-photos',
  false,
  5242880, -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public             = false,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "rare_photos_insert_own" ON storage.objects;
CREATE POLICY "rare_photos_insert_own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'rare-photos'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    AND lower(storage.extension(name)) IN ('jpg', 'jpeg', 'png', 'webp')
  );
DROP POLICY IF EXISTS "rare_photos_select_own_or_admin" ON storage.objects;
CREATE POLICY "rare_photos_select_own_or_admin" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'rare-photos'
    AND (
      (storage.foldername(name))[1] = (SELECT auth.uid())::text
      OR ((SELECT auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin'
    )
  );
DROP POLICY IF EXISTS "rare_photos_delete_own_or_admin" ON storage.objects;
CREATE POLICY "rare_photos_delete_own_or_admin" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'rare-photos'
    AND (
      (storage.foldername(name))[1] = (SELECT auth.uid())::text
      OR ((SELECT auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin'
    )
  );
-- 注: Supabase ホストでは storage.objects の所有者が supabase_storage_admin のため、
--   COMMENT ON POLICY は "must be owner" で失敗する（20260513000007 と同じ）。説明はこのコメントに残す。
--   rare_photos_insert_own          : パスの 1 段目が自分の uid のときだけ。拡張子 jpg/jpeg/png/webp。
--   rare_photos_select_own_or_admin : 自分のフォルダか管理者だけ（署名 URL の発行にも要る）。
--   rare_photos_delete_own_or_admin : 自分のフォルダか管理者だけ。

COMMIT;
