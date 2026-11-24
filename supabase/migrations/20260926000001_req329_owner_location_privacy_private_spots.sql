-- ════════════════════════════════════════════════════════════════════════════
-- REQ-329: 投稿者が選ぶ「位置の非公開」＋非公開の地名退避＋非公開スポット（クイック保存）
--
-- 背景: 希少種（メダカ・サンショウウオ等）の生息地は、公開すると採集圧にさらされる。
--   これまで位置の公開レベル（location_disclosure）は管理者と種ごとの既定しか決められず、
--   投稿者は「この場所は伏せたい」を選べなかった。また hidden にしても、逆ジオで付いた
--   字名（locality）・水系名（water_body）は公開列のまま残り、地域ページの「よく報告される
--   水辺」や地図の一覧データから「〇〇沼」が読めてしまっていた（REQ-243 の取りこぼし）。
--
-- 本 migration の内容:
--   1. protect_post_insert_columns: 一般ユーザーが INSERT で 'hidden' を指定したときだけ尊重する。
--      それ以外（未指定・precise・coarsened）は従来どおり種ごとの既定で上書きする。
--      → 利用者は「より伏せる」ことだけができ、「より細かく公開する」ことはできない。
--   2. protect_post_status: 一般ユーザー（投稿者）は UPDATE で 'hidden' へだけ変更できる（一方向）。
--      公開へ戻す・精度を上げるのは管理者だけ。管理者が伏せた記録を投稿者が戻すこともできない。
--   3. post_hidden_geo: hidden の投稿の locality / water_body を管理者専用テーブルへ退避し、
--      posts の公開列は NULL にする（BEFORE INSERT/UPDATE トリガー）。管理者が公開へ戻すと復元する。
--      研究用の地名データは消さずに残す（削除すると再付与の手段が無い）。
--   4. private_spots: 名前を付けて位置を非公開保存する「クイック保存」。本人と管理者だけが読める。
--      posts とは別テーブル（種の制約・審査・24時間5件の投稿上限・公開データセットに一切関与しない）。
--
-- 冪等設計: CREATE ... IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF EXISTS / DO ... EXCEPTION。
-- schema.sql（正本）と同一定義。テーブルの REVOKE は Supabase 既定 GRANT の「後」に効かせる必要が
-- あるため、supabase/ci/reapply-after-grants.txt に本ファイルを追記している（REQ-325 と同じ扱い）。
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. INSERT トリガー: 投稿者が 'hidden' を選んだときだけ尊重（それ以外は種の既定）
--    本体は schema.sql 9-2（REQ-243 + REQ-244 の完全版）と同一。変更は location_disclosure の 1 文のみ。
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION protect_post_insert_columns()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  jwt_claims jsonb;
BEGIN
  BEGIN
    jwt_claims := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb;
  EXCEPTION WHEN OTHERS THEN
    RETURN NEW;
  END;

  IF jwt_claims IS NULL OR jwt_claims = '{}'::jsonb THEN
    RETURN NEW;
  END IF;
  IF (jwt_claims ->> 'role') = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- 一般ユーザーが INSERT 時に運用制御カラムを指定してきても強制リセット
  IF (jwt_claims -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'admin' THEN
    NEW.status            := 'pending';
    NEW.rejection_reason  := NULL;
    NEW.rejection_message := NULL;
    NEW.reviewed_at       := NULL;
    NEW.reviewed_by       := NULL;
    NEW.auto_approved     := FALSE;
    NEW.is_official       := FALSE;
    NEW.is_flagged        := FALSE;
    NEW.ai_result         := NULL;
    NEW.ai_analyzed_at    := NULL;
    -- REQ-243 / REQ-329: 公開レベルは種ごとの既定（無ければ coarsened）。ただし投稿者が
    -- 'hidden'（位置を非公開）を選んだときだけはそれを尊重する。「より伏せる」方向にしか動かない。
    NEW.location_disclosure := CASE
      WHEN NEW.location_disclosure = 'hidden' THEN 'hidden'
      ELSE COALESCE(
        (SELECT sld.default_disclosure FROM species_location_defaults sld WHERE sld.species = NEW.species),
        'coarsened'
      )
    END;
    -- REQ-244 FR-244-01: サーバ付与専用の地理メタデータ列は一般ユーザー INSERT で常に NULL 化する。
    NEW.locality        := NULL;
    NEW.water_body      := NULL;
    NEW.is_on_water     := NULL;
    NEW.elevation_m     := NULL;
    NEW.geo_enriched_at := NULL;
    NEW.geo_source      := NULL;
    -- REQ-244 FR-244-02: municipality は許可リスト（秋田県 25 市町村）以外を正規化（NULL 化）する。
    -- 許可リストの正本は src/lib/constants.ts の MUNICIPALITIES（両者を同期させること）。
    IF NEW.municipality IS NOT NULL AND NEW.municipality NOT IN (
      '秋田市', '能代市', '横手市', '大館市', '男鹿市', '湯沢市',
      '鹿角市', '由利本荘市', '潟上市', '大仙市', '北秋田市',
      'にかほ市', '仙北市', '小坂町', '上小阿仁村', '藤里町',
      '三種町', '八峰町', '五城目町', '八郎潟町', '井川町',
      '大潟村', '美郷町', '羽後町', '東成瀬村'
    ) THEN
      NEW.municipality := NULL;
    END IF;
    -- reporter_ip は set_post_reporter_ip トリガーが後続で正しい値を入れるため上書きしない
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS enforce_post_insert_columns ON posts;
CREATE TRIGGER enforce_post_insert_columns
  BEFORE INSERT ON posts FOR EACH ROW EXECUTE FUNCTION protect_post_insert_columns();
COMMENT ON FUNCTION protect_post_insert_columns() IS
  'REQ-034 / REQ-243 / REQ-244 / REQ-329: 一般ユーザー INSERT 時、運用制御列（status/is_official 等）・サーバ付与地理メタデータ列を強制リセットし、municipality を許可リストへ正規化する。公開レベルは種の既定で上書きするが、投稿者が hidden を選んだときだけ尊重する。admin / service_role は素通り。';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. UPDATE トリガー: 投稿者は 'hidden' へだけ変更できる（一方向）
--    本体は schema.sql 9-1 と同一。変更は location_disclosure の固定部分のみ。
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION protect_post_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  jwt_claims jsonb;
BEGIN
  BEGIN
    jwt_claims := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb;
  EXCEPTION WHEN OTHERS THEN
    RETURN NEW;
  END;

  -- JWT なし または service_role は許可（Edge Function の自動承認）
  IF jwt_claims IS NULL OR jwt_claims = '{}'::jsonb THEN
    RETURN NEW;
  END IF;
  IF (jwt_claims ->> 'role') = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- 一般ユーザー (= 非 admin) は以下の管理系カラムを OLD 固定
  IF (jwt_claims -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'admin' THEN
    -- status 系 (REQ-034)
    NEW.status                  := OLD.status;
    NEW.rejection_reason        := OLD.rejection_reason;
    NEW.rejection_message       := OLD.rejection_message;
    NEW.reviewed_at             := OLD.reviewed_at;
    NEW.reviewed_by             := OLD.reviewed_by;
    NEW.auto_approved           := OLD.auto_approved;
    -- 運用制御 (REQ-034 / REQ-136)
    NEW.is_official             := OLD.is_official;
    NEW.is_flagged              := OLD.is_flagged;
    NEW.reporter_ip             := OLD.reporter_ip;
    -- AI 関連 (REQ-034 / REQ-125 / REQ-128 / REQ-136)
    NEW.ai_result               := OLD.ai_result;
    NEW.ai_analyzed_at          := OLD.ai_analyzed_at;
    NEW.ai_failure_count        := OLD.ai_failure_count;
    -- hash 改竄禁止 (REQ-079)
    NEW.audio_hash              := OLD.audio_hash;
    NEW.image_hashes            := OLD.image_hashes;
    -- 音声 (REQ-070 / REQ-082 / REQ-083 / REQ-136)
    NEW.audio_url               := OLD.audio_url;
    NEW.audio_duration_ms       := OLD.audio_duration_ms;
    -- 気象 (REQ-051 系 / REQ-136)
    NEW.weather                 := OLD.weather;
    NEW.temperature             := OLD.temperature;
    NEW.humidity                := OLD.humidity;
    -- 位置精度 (REQ-172): INSERT 時の値は本人の測位として許容するが、UPDATE では改竄禁止
    NEW.accuracy                := OLD.accuracy;
    -- 調査依頼 (REQ-084 系 / REQ-136)
    NEW.survey_request_id       := OLD.survey_request_id;
    NEW.survey_duration_minutes := OLD.survey_duration_minutes;
    -- 地理メタデータ (REQ-231): server enrichment 専用列。一般ユーザー改竄禁止
    NEW.locality                := OLD.locality;
    NEW.water_body              := OLD.water_body;
    NEW.is_on_water             := OLD.is_on_water;
    NEW.elevation_m             := OLD.elevation_m;
    NEW.geo_enriched_at         := OLD.geo_enriched_at;
    NEW.geo_source              := OLD.geo_source;
    -- 研究採用 (REQ-234): 管理者/サービスロール専用列。一般ユーザー改竄禁止。
    NEW.research_adopted_at          := OLD.research_adopted_at;
    NEW.research_adopted_notified_at := OLD.research_adopted_notified_at;
    -- 位置公開レベル (REQ-243 / REQ-329): 投稿者ができるのは「非公開（hidden）にする」ことだけ。
    -- 公開へ戻す・精度を上げる（coarsened → precise 等）は管理者だけ。管理者が伏せた記録も戻せない。
    IF NEW.location_disclosure IS DISTINCT FROM 'hidden' THEN
      NEW.location_disclosure   := OLD.location_disclosure;
    END IF;
    -- 所有権 (二重防御。policy でも守られるがトリガー側でも明示)
    NEW.user_id                 := OLD.user_id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS enforce_post_status ON posts;
CREATE TRIGGER enforce_post_status
  BEFORE UPDATE ON posts FOR EACH ROW EXECUTE FUNCTION protect_post_status();
COMMENT ON FUNCTION protect_post_status() IS
  'REQ-034 / REQ-079 / REQ-083 / REQ-136 / REQ-231 / REQ-234 / REQ-329: 一般ユーザー UPDATE 時、status/運用制御/AI/hash/音声/気象/調査/地理メタデータ/研究採用/所有権カラムを OLD に固定。公開レベルは hidden への変更だけを許す（一方向）。admin / service_role は素通り。';

-- 列コメントも新しい意味に合わせる
COMMENT ON COLUMN posts.location_disclosure IS
  'REQ-243 / REQ-329: 座標の公開レベル precise/coarsened/hidden。管理者/サービスロールは設定・変更可。投稿者は hidden にすることだけできる（公開へは戻せない）。';

-- ────────────────────────────────────────────────────────────────────────────
-- 3. 非公開（hidden）投稿の地名退避
--    locality / water_body は「〇〇沼」のように場所を特定できる。hidden の投稿ではこれを
--    管理者専用の post_hidden_geo へ移し、posts の公開列を NULL にする。
--    FK を DEFERRABLE にしているのは、BEFORE INSERT（まだ posts 行が無い時点）でも退避できるようにするため。
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.post_hidden_geo (
  post_id    uuid PRIMARY KEY
               REFERENCES public.posts(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  locality   text,
  water_body text,
  stashed_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.post_hidden_geo IS
  'REQ-329: 位置非公開（hidden）の投稿から退避した字名・水系名。管理者だけが読める。公開へ戻すと posts へ復元される。';

ALTER TABLE public.post_hidden_geo ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY post_hidden_geo_admin_read ON public.post_hidden_geo
    FOR SELECT TO authenticated
    USING (((SELECT auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- 書き込みはトリガー（SECURITY DEFINER）だけ。利用者からは存在ごと見えない。
REVOKE ALL ON public.post_hidden_geo FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.post_hidden_geo TO authenticated;

CREATE OR REPLACE FUNCTION public.stash_hidden_post_geo()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_locality   text;
  v_water_body text;
BEGIN
  IF NEW.location_disclosure = 'hidden' THEN
    -- 非公開のまま地名が書かれる（enrich-place の付与・非公開化の瞬間）: 退避して公開列を空にする
    IF NEW.locality IS NOT NULL OR NEW.water_body IS NOT NULL THEN
      INSERT INTO public.post_hidden_geo AS h (post_id, locality, water_body)
      VALUES (NEW.id, NEW.locality, NEW.water_body)
      ON CONFLICT (post_id) DO UPDATE
        SET locality   = COALESCE(EXCLUDED.locality, h.locality),
            water_body = COALESCE(EXCLUDED.water_body, h.water_body),
            stashed_at = now();
      NEW.locality   := NULL;
      NEW.water_body := NULL;
    END IF;
  ELSIF TG_OP = 'UPDATE' AND OLD.location_disclosure = 'hidden' THEN
    -- 非公開の解除（管理者だけが行える）: 退避してあった地名を戻す
    DELETE FROM public.post_hidden_geo WHERE post_id = NEW.id
      RETURNING locality, water_body INTO v_locality, v_water_body;
    IF FOUND THEN
      NEW.locality   := COALESCE(NEW.locality, v_locality);
      NEW.water_body := COALESCE(NEW.water_body, v_water_body);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.stash_hidden_post_geo() FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION public.stash_hidden_post_geo() IS
  'REQ-329: hidden の投稿の locality / water_body を post_hidden_geo へ退避して公開列を NULL にする。hidden を解除すると復元する。';

-- 名前を zz_ にして、同じ BEFORE トリガー群（enforce_* / set_*）の後に走らせる
-- （一般ユーザーの UPDATE で protect_post_status が地名を OLD に戻した「後」の値を見るため）。
DROP TRIGGER IF EXISTS zz_stash_hidden_post_geo ON public.posts;
CREATE TRIGGER zz_stash_hidden_post_geo
  BEFORE INSERT OR UPDATE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.stash_hidden_post_geo();

-- 既存の hidden 投稿に残っている地名を退避する（一度きり・何度流しても同じ結果）。
INSERT INTO public.post_hidden_geo (post_id, locality, water_body)
SELECT id, locality, water_body
FROM public.posts
WHERE location_disclosure = 'hidden'
  AND (locality IS NOT NULL OR water_body IS NOT NULL)
ON CONFLICT (post_id) DO NOTHING;
UPDATE public.posts
SET locality = NULL, water_body = NULL
WHERE location_disclosure = 'hidden'
  AND (locality IS NOT NULL OR water_body IS NOT NULL);

-- ────────────────────────────────────────────────────────────────────────────
-- 4. private_spots: 名前を付けて位置を非公開で保存する（クイック保存）
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.private_spots (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
  note        text CHECK (note IS NULL OR char_length(note) <= 500),
  lat         numeric(10,7) NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng         numeric(10,7) NOT NULL CHECK (lng BETWEEN -180 AND 180),
  accuracy    numeric(7,1) CHECK (accuracy IS NULL OR accuracy >= 0),
  recorded_at timestamptz NOT NULL DEFAULT now()
                CHECK (recorded_at <= now() + interval '1 day'),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.private_spots IS
  'REQ-329: 名前付きで非公開保存した地点（クイック保存）。本人と管理者だけが読める。posts・公開データセットとは無関係。';
COMMENT ON COLUMN public.private_spots.recorded_at IS
  'REQ-329: 記録した日時（端末の時刻）。オフラインで保存して後から送る場合があるため created_at と分ける。';
CREATE INDEX IF NOT EXISTS idx_private_spots_user_created ON public.private_spots (user_id, created_at DESC);

ALTER TABLE public.private_spots ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY private_spots_select_own_or_admin ON public.private_spots
    FOR SELECT TO authenticated
    USING (
      (SELECT auth.uid()) = user_id
      OR ((SELECT auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY private_spots_insert_own ON public.private_spots
    FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY private_spots_update_own ON public.private_spots
    FOR UPDATE TO authenticated
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY private_spots_delete_own_or_admin ON public.private_spots
    FOR DELETE TO authenticated
    USING (
      (SELECT auth.uid()) = user_id
      OR ((SELECT auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- anon には一切触らせない（whether 層で閉じる）。退会時は auth.users の cascade で消える。
REVOKE ALL ON public.private_spots FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.private_spots TO authenticated;

-- UPDATE では所有者と作成日時を固定する（名前・メモの変更だけを想定）。
CREATE OR REPLACE FUNCTION public.protect_private_spot_columns()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.user_id    := OLD.user_id;
  NEW.created_at := OLD.created_at;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.protect_private_spot_columns() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS enforce_private_spot_columns ON public.private_spots;
CREATE TRIGGER enforce_private_spot_columns
  BEFORE UPDATE ON public.private_spots
  FOR EACH ROW EXECUTE FUNCTION public.protect_private_spot_columns();

-- 保存のしすぎを DB で止める（1 時間 60 件・1 人 2000 件）。管理者は素通り。
CREATE OR REPLACE FUNCTION public.check_private_spot_rate_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_recent integer;
  v_total  integer;
BEGIN
  IF (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'role') = 'admin' THEN
    RETURN NEW;
  END IF;
  SELECT count(*) INTO v_recent FROM public.private_spots
  WHERE user_id = NEW.user_id AND created_at > now() - interval '1 hour';
  IF v_recent >= 60 THEN
    RAISE EXCEPTION '非公開スポットの保存上限（1時間あたり60件）に達しました' USING ERRCODE = 'P0001';
  END IF;
  SELECT count(*) INTO v_total FROM public.private_spots WHERE user_id = NEW.user_id;
  IF v_total >= 2000 THEN
    RAISE EXCEPTION '非公開スポットの保存上限（1人2000件）に達しました' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.check_private_spot_rate_limit() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS enforce_private_spot_rate_limit ON public.private_spots;
CREATE TRIGGER enforce_private_spot_rate_limit
  BEFORE INSERT ON public.private_spots
  FOR EACH ROW EXECUTE FUNCTION public.check_private_spot_rate_limit();

COMMIT;
