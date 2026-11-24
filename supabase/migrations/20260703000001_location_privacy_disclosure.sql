-- ════════════════════════════════════════════════════════════════════════════
-- REQ-243: 位置情報プライバシー — 生座標の anon 露出の是正 + 管理者による種/記録単位の公開範囲管理
--
-- 監査で判明した問題: REQ-230 のデータセット粗化は「エクスポート経路のみ」の保護で、
-- anon キーで PostgREST（posts / survey_requests）を直接叩けば生精度の座標が一括取得できた。
-- 本 migration で「公開座標は粗化、正確座標は所有者・管理者限定」を DB 境界（RLS/列/生成列/RPC）で
-- 一貫して実効化する。あわせて管理者が種単位・記録単位で公開レベルを管理できるようにする。
--
--   公開レベル（posts.location_disclosure）:
--     precise   … 生精度も公開（display_lat/lng = 生値）
--     coarsened … 粗化座標のみ公開（display_lat/lng = round(_,3) ≒ 111m）
--     hidden    … 座標を出さない（display_lat/lng = NULL）
--   所有者（auth.uid()=user_id）・管理者は公開レベルに関わらず get_my_post_location /
--   get_admin_post_locations RPC で常に正確座標を取得できる。
--
-- 冪等設計: 何度実行しても安全（IF NOT EXISTS / CREATE OR REPLACE / DO ... EXCEPTION）。
-- schema.sql（正本）と同一定義。列レベル SELECT 保護は Supabase 既定 GRANT の「後」に効かせる
-- 必要があるため（REQ-179 と同理由）、本 migration 末尾で再確定する（CI も既定 GRANT 後に本 file を適用）。
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. 種ごとの既定公開レベル（管理者が管理する設定メタデータ）
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS species_location_defaults (
  species            TEXT PRIMARY KEY,
  default_disclosure TEXT NOT NULL DEFAULT 'coarsened'
                       CHECK (default_disclosure IN ('precise', 'coarsened', 'hidden')),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by         UUID REFERENCES auth.users(id)
);
COMMENT ON TABLE species_location_defaults IS
  'REQ-243: 種ごとの既定公開レベル。新規投稿の location_disclosure 初期値に使う。管理者のみ変更可（RLS + RPC）。';

-- 現状の特定外来生物 2 種を保守的な既定（coarsened）で seed。管理者が後から precise / hidden に変更できる。
INSERT INTO species_location_defaults (species, default_disclosure) VALUES
  ('american', 'coarsened'),
  ('bullfrog', 'coarsened')
ON CONFLICT (species) DO NOTHING;

ALTER TABLE species_location_defaults ENABLE ROW LEVEL SECURITY;
-- 公開読み取り可（ポリシーのメタデータであり秘匿情報ではない）。書き込みは管理者のみ。
DO $$ BEGIN
  CREATE POLICY "species_defaults_read" ON species_location_defaults FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "species_defaults_admin_write" ON species_location_defaults FOR ALL TO authenticated
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
    WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. posts: 公開レベル列 + 粗化生成列（display_lat / display_lng）
--    display_* は STORED 生成列。round(numeric,int) は immutable なので生成列に使える。
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE posts ADD COLUMN IF NOT EXISTS location_disclosure TEXT NOT NULL DEFAULT 'coarsened';
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_location_disclosure_check;
ALTER TABLE posts ADD CONSTRAINT posts_location_disclosure_check
  CHECK (location_disclosure IN ('precise', 'coarsened', 'hidden'));
COMMENT ON COLUMN posts.location_disclosure IS
  'REQ-243: 座標の公開レベル precise=生精度公開 / coarsened=粗化(≒111m)のみ / hidden=非公開。管理者/サービスロールのみ設定・変更可。';

ALTER TABLE posts ADD COLUMN IF NOT EXISTS display_lat DECIMAL(10,7)
  GENERATED ALWAYS AS (
    CASE location_disclosure
      WHEN 'hidden'  THEN NULL
      WHEN 'precise' THEN lat
      ELSE round(lat, 3)
    END
  ) STORED;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS display_lng DECIMAL(10,7)
  GENERATED ALWAYS AS (
    CASE location_disclosure
      WHEN 'hidden'  THEN NULL
      WHEN 'precise' THEN lng
      ELSE round(lng, 3)
    END
  ) STORED;
COMMENT ON COLUMN posts.display_lat IS 'REQ-243: 公開用の緯度（location_disclosure に応じて hidden=NULL / precise=生値 / それ以外=round(_,3)）。anon/authenticated はこの列のみ参照可。';
COMMENT ON COLUMN posts.display_lng IS 'REQ-243: 公開用の経度（display_lat と同ロジック）。';

-- ────────────────────────────────────────────────────────────────────────────
-- 3. survey_requests: 粗化生成列（常に round(_,3)。調査依頼に公開レベルは持たせず一律粗化）
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE survey_requests ADD COLUMN IF NOT EXISTS display_lat DECIMAL(10,7)
  GENERATED ALWAYS AS (round(lat, 3)) STORED;
ALTER TABLE survey_requests ADD COLUMN IF NOT EXISTS display_lng DECIMAL(10,7)
  GENERATED ALWAYS AS (round(lng, 3)) STORED;
COMMENT ON COLUMN survey_requests.display_lat IS 'REQ-243: 公開用の粗化緯度（round(_,3) ≒ 111m）。anon/authenticated はこの列のみ参照可。';
COMMENT ON COLUMN survey_requests.display_lng IS 'REQ-243: 公開用の粗化経度（round(_,3) ≒ 111m）。';

-- ────────────────────────────────────────────────────────────────────────────
-- 4. INSERT トリガー: 一般ユーザーの location_disclosure を種の既定で強制（自己設定を禁止）
--    admin / service_role は素通り（明示値 or 列 DEFAULT 'coarsened'）。
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
    -- REQ-243: 公開レベルはユーザーが決められない。種ごとの既定（無ければ coarsened）で上書きする。
    NEW.location_disclosure := COALESCE(
      (SELECT sld.default_disclosure FROM species_location_defaults sld WHERE sld.species = NEW.species),
      'coarsened'
    );
    -- reporter_ip は set_post_reporter_ip トリガーが後続で正しい値を入れるため上書きしない
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS enforce_post_insert_columns ON posts;
CREATE TRIGGER enforce_post_insert_columns
  BEFORE INSERT ON posts FOR EACH ROW EXECUTE FUNCTION protect_post_insert_columns();

-- ────────────────────────────────────────────────────────────────────────────
-- 5. UPDATE トリガー: 一般ユーザーは location_disclosure を変更できない（OLD 固定）。admin は変更可。
--    既存 protect_post_status に 1 列追加するのみ（他の列固定は不変）。
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

  IF jwt_claims IS NULL OR jwt_claims = '{}'::jsonb THEN
    RETURN NEW;
  END IF;
  IF (jwt_claims ->> 'role') = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF (jwt_claims -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'admin' THEN
    NEW.status                  := OLD.status;
    NEW.rejection_reason        := OLD.rejection_reason;
    NEW.rejection_message       := OLD.rejection_message;
    NEW.reviewed_at             := OLD.reviewed_at;
    NEW.reviewed_by             := OLD.reviewed_by;
    NEW.auto_approved           := OLD.auto_approved;
    NEW.is_official             := OLD.is_official;
    NEW.is_flagged              := OLD.is_flagged;
    NEW.reporter_ip             := OLD.reporter_ip;
    NEW.ai_result               := OLD.ai_result;
    NEW.ai_analyzed_at          := OLD.ai_analyzed_at;
    NEW.ai_failure_count        := OLD.ai_failure_count;
    NEW.audio_hash              := OLD.audio_hash;
    NEW.image_hashes            := OLD.image_hashes;
    NEW.audio_url               := OLD.audio_url;
    NEW.audio_duration_ms       := OLD.audio_duration_ms;
    NEW.weather                 := OLD.weather;
    NEW.temperature             := OLD.temperature;
    NEW.humidity                := OLD.humidity;
    NEW.accuracy                := OLD.accuracy;
    NEW.survey_request_id       := OLD.survey_request_id;
    NEW.survey_duration_minutes := OLD.survey_duration_minutes;
    NEW.locality                := OLD.locality;
    NEW.water_body              := OLD.water_body;
    NEW.is_on_water             := OLD.is_on_water;
    NEW.elevation_m             := OLD.elevation_m;
    NEW.geo_enriched_at         := OLD.geo_enriched_at;
    NEW.geo_source              := OLD.geo_source;
    NEW.research_adopted_at          := OLD.research_adopted_at;
    NEW.research_adopted_notified_at := OLD.research_adopted_notified_at;
    -- REQ-243: 公開レベルは管理者のみ変更可。一般ユーザーは OLD 固定。
    NEW.location_disclosure     := OLD.location_disclosure;
    NEW.user_id                 := OLD.user_id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS enforce_post_status ON posts;
CREATE TRIGGER enforce_post_status
  BEFORE UPDATE ON posts FOR EACH ROW EXECUTE FUNCTION protect_post_status();

-- ────────────────────────────────────────────────────────────────────────────
-- 6. 正確座標 RPC（所有者 / 管理者）と公開レベル管理 RPC（管理者）
-- ────────────────────────────────────────────────────────────────────────────
-- 6-1. 所有者が自分の投稿の正確座標を取得（編集フロー等）。auth.uid()=user_id のときのみ返す。
CREATE OR REPLACE FUNCTION public.get_my_post_location(p_post_id uuid)
RETURNS TABLE(lat numeric, lng numeric, accuracy numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.lat, p.lng, p.accuracy
  FROM posts p
  WHERE p.id = p_post_id
    AND p.user_id = auth.uid()
    AND auth.uid() IS NOT NULL;
$$;
REVOKE EXECUTE ON FUNCTION public.get_my_post_location(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_post_location(uuid) TO authenticated;
COMMENT ON FUNCTION public.get_my_post_location(uuid) IS
  'REQ-243: 投稿所有者が自分の投稿の正確座標を取得する（auth.uid()=user_id のときのみ）。';

-- 6-2. 管理者が任意投稿の正確座標を一括取得（審査・管理ツール用）。管理者以外には空を返す。
CREATE OR REPLACE FUNCTION public.get_admin_post_locations(p_ids uuid[])
RETURNS TABLE(id uuid, lat numeric, lng numeric, accuracy numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (auth.jwt() -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'admin' THEN
    RETURN;  -- 管理者以外は空（漏えい防止）
  END IF;
  RETURN QUERY
    SELECT p.id, p.lat, p.lng, p.accuracy
    FROM posts p
    WHERE p.id = ANY(p_ids);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_admin_post_locations(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_admin_post_locations(uuid[]) TO authenticated;
COMMENT ON FUNCTION public.get_admin_post_locations(uuid[]) IS
  'REQ-243: 管理者が投稿の正確座標を一括取得（審査/CSV/地図確認）。管理者クレーム以外は空を返す。';

-- 6-3. 管理者が記録単位で公開レベルを設定・変更する。
CREATE OR REPLACE FUNCTION public.set_post_location_disclosure(p_post_id uuid, p_level text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (auth.jwt() -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'admin only' USING ERRCODE = '42501';
  END IF;
  IF p_level NOT IN ('precise', 'coarsened', 'hidden') THEN
    RAISE EXCEPTION 'invalid disclosure level: %', p_level USING ERRCODE = '22023';
  END IF;
  UPDATE posts SET location_disclosure = p_level WHERE id = p_post_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.set_post_location_disclosure(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_post_location_disclosure(uuid, text) TO authenticated;
COMMENT ON FUNCTION public.set_post_location_disclosure(uuid, text) IS
  'REQ-243 FR-243-01b: 管理者が投稿記録の公開レベルを設定する（admin クレーム必須）。';

-- 6-4. 管理者が種ごとの既定公開レベルを設定・変更する。
CREATE OR REPLACE FUNCTION public.set_species_location_default(p_species text, p_level text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (auth.jwt() -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'admin only' USING ERRCODE = '42501';
  END IF;
  IF p_level NOT IN ('precise', 'coarsened', 'hidden') THEN
    RAISE EXCEPTION 'invalid disclosure level: %', p_level USING ERRCODE = '22023';
  END IF;
  INSERT INTO species_location_defaults (species, default_disclosure, updated_at, updated_by)
  VALUES (p_species, p_level, now(), auth.uid())
  ON CONFLICT (species) DO UPDATE
    SET default_disclosure = EXCLUDED.default_disclosure,
        updated_at = now(),
        updated_by = auth.uid();
END;
$$;
REVOKE EXECUTE ON FUNCTION public.set_species_location_default(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_species_location_default(text, text) TO authenticated;
COMMENT ON FUNCTION public.set_species_location_default(text, text) IS
  'REQ-243 FR-243-01b: 管理者が種ごとの既定公開レベルを設定する（admin クレーム必須）。';

-- ────────────────────────────────────────────────────────────────────────────
-- 7. survey_sites: 個人の定点観察地点（自宅近傍の蓋然性）。公開 SELECT を廃し所有者+管理者に限定。
-- ────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "survey_sites_select_all" ON survey_sites;
DO $$ BEGIN
  CREATE POLICY "survey_sites_select_own" ON survey_sites FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- admin は既存の survey_sites_admin_all（FOR ALL）で SELECT 可。

-- ────────────────────────────────────────────────────────────────────────────
-- 8. get_survey_request_detail: 公開詳細の座標を粗化（display_*）にして返す（SECURITY INVOKER 維持）。
--    生 lat/lng は列 GRANT 剥奪により INVOKER でも読めないため、display_* を参照する。
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_survey_request_detail(p_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'request', to_jsonb(sr) || jsonb_build_object(
      'user_profiles', (
        SELECT jsonb_build_object('display_name', up.display_name, 'avatar_emoji', up.avatar_emoji)
        FROM user_profiles up
        WHERE up.id = sr.user_id
      )
    ),
    'related_posts', (
      SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.created_at DESC), '[]'::jsonb)
      FROM (
        SELECT id, created_at, species, info_type, municipality, comment, photos, user_id,
               display_lat AS lat, display_lng AS lng
        FROM posts
        WHERE survey_request_id = p_id AND status = 'approved'
        ORDER BY created_at DESC
        LIMIT 10
      ) p
    )
  )
  FROM (
    SELECT id, user_id, display_lat AS lat, display_lng AS lng, municipality, species, reason,
           urgency, status, created_at, closed_at, response_count
    FROM survey_requests
    WHERE id = p_id
  ) sr;
$$;
COMMENT ON FUNCTION public.get_survey_request_detail(uuid) IS
  'REQ-157/REQ-243: 調査依頼詳細を 1 往復で返す RPC。SECURITY INVOKER で RLS 尊重。座標は粗化（display_*）で返す。';

-- ────────────────────────────────────────────────────────────────────────────
-- 9. 列レベル SELECT 保護（REQ-179 の技法を lat/lng/accuracy に拡張）。
--    テーブルレベル SELECT を剥がし、保護対象を「除く」全列に列単位 SELECT を貼り直す。
--      posts           : reporter_ip / lat / lng / accuracy を anon/authenticated から隠す（display_* は公開）。
--      survey_requests : lat / lng を anon/authenticated から隠す（display_* は公開・user_id は所有者判定に残す）。
--    ⚠ Supabase 既定の一括 GRANT は migration の「後」に効くため、本ブロックは migration 末尾で再確定する。
--    冪等・列の増減に自動追随。所有者でないロールで適用された場合は握りつぶす。
-- ────────────────────────────────────────────────────────────────────────────
DO $location_privacy_protect$
DECLARE
  v_cols text;
BEGIN
  IF to_regclass('public.posts') IS NOT NULL THEN
    EXECUTE 'REVOKE SELECT ON public.posts FROM anon, authenticated';
    SELECT string_agg(format('%I', column_name), ', ' ORDER BY ordinal_position)
      INTO v_cols
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'posts'
      AND column_name NOT IN ('reporter_ip', 'lat', 'lng', 'accuracy');
    IF v_cols IS NOT NULL THEN
      EXECUTE format('GRANT SELECT (%s) ON public.posts TO anon, authenticated', v_cols);
    END IF;
  END IF;

  IF to_regclass('public.survey_requests') IS NOT NULL THEN
    EXECUTE 'REVOKE SELECT ON public.survey_requests FROM anon, authenticated';
    SELECT string_agg(format('%I', column_name), ', ' ORDER BY ordinal_position)
      INTO v_cols
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'survey_requests'
      AND column_name NOT IN ('lat', 'lng');
    IF v_cols IS NOT NULL THEN
      EXECUTE format('GRANT SELECT (%s) ON public.survey_requests TO anon, authenticated', v_cols);
    END IF;
  END IF;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'REQ-243: 列レベル SELECT 保護をスキップ（権限不足）。runbook の手動 REVOKE/GRANT に委ねる';
END
$location_privacy_protect$;

COMMIT;
