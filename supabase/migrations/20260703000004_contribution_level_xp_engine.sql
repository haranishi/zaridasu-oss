-- REQ-248: 貢献レベル / 経験値（XP）エンジン（品質連動・DB 権威・段階的機能解放の土台）
--
-- 背景:
--   ザリダスにはバッジ / 3軸ランキング / プロフィール実績はあるが、数値レベル・経験値・アンロックという
--   「進行」概念が無かった。本 migration は DB 権威・改竄不能・品質連動の進行エンジンを新設し、
--   バッジ / ランキング / 機能解放（REQ-249）/ コレクション（REQ-250）が参照する「唯一の進行の正」を作る。
--
-- 設計原則（Goodhart 対策・市民科学ファースト）:
--   XP は承認遷移（pending→approved）でのみ加算する（check_and_grant_badges と同一ガード）。
--   未承認 / 却下 / いいねには一切加点しない。量産は日次上限と初回発見ボーナスの自然逓減で抑止する。
--
-- 冪等: CREATE TABLE IF NOT EXISTS / CREATE OR REPLACE FUNCTION / DROP TRIGGER IF EXISTS + CREATE /
--       DO $$ ... EXCEPTION WHEN duplicate_object $$。バックフィルは recompute_all_progress（上書き）で冪等。
-- 同期: supabase/schema.sql の「12-1. 貢献レベル / 経験値（XP）エンジン」ブロックと同一定義（REQ-003 ドリフトゼロ）。

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- (A) レベル曲線（単一ソース / FR-248-03）。src/lib/constants.ts の XP_LEVEL_COEFF / xpForLevel / levelForXp と同期。
--     xp_for_level(L) = 25*(L-1)*L（L1=0, L2=50, L3=150, L4=300, L5=500 …・単調増加）。
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION xp_for_level(p_level integer)
RETURNS bigint LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN p_level <= 1 THEN 0::bigint
              ELSE 25::bigint * (p_level - 1)::bigint * p_level::bigint END;
$$;
COMMENT ON FUNCTION xp_for_level(integer) IS
  'REQ-248 FR-248-03: レベル曲線の単一ソース。xp_for_level(L)=25*(L-1)*L。src/lib/constants.ts の xpForLevel と同期。';

CREATE OR REPLACE FUNCTION level_for_xp(p_xp bigint)
RETURNS integer LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE v_level integer;
BEGIN
  IF p_xp IS NULL OR p_xp <= 0 THEN RETURN 1; END IF;
  v_level := floor((25 + sqrt(625 + 100 * p_xp::numeric)) / 50)::integer;
  IF v_level < 1 THEN v_level := 1; END IF;
  WHILE xp_for_level(v_level + 1) <= p_xp LOOP v_level := v_level + 1; END LOOP;
  WHILE v_level > 1 AND xp_for_level(v_level) > p_xp LOOP v_level := v_level - 1; END LOOP;
  RETURN v_level;
END;
$$;
COMMENT ON FUNCTION level_for_xp(bigint) IS
  'REQ-248 FR-248-03: 累積 XP からレベルを算出（xp_for_level の逆関数・整数補正）。src/lib/constants.ts の levelForXp と同期。';

-- ───────────────────────────────────────────────────────────────────────────
-- (B) XP 係数の単一ソース（品質連動 / FR-248-01）。トリガーとバックフィルが共用（DRY）。
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION xp_for_post(
  p_auto_approved         boolean,
  p_confidence            numeric,
  p_survey_method         text,
  p_accuracy              numeric,
  p_info_type             text,
  p_is_first_species      boolean,
  p_is_first_info_type    boolean,
  p_is_first_municipality boolean
) RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT 10                                                                              -- XP_BASE: 承認済み投稿1件
       + CASE WHEN p_auto_approved AND COALESCE(p_confidence, 0) >= 0.9 THEN 5 ELSE 0 END -- +5 高精度同定
       + CASE WHEN p_survey_method = 'structured' THEN 5 ELSE 0 END                        -- +5 定点観察（REQ-174）
       + CASE WHEN p_accuracy IS NOT NULL AND p_accuracy <= 30 THEN 3 ELSE 0 END           -- +3 GPS 良好（REQ-172）
       + CASE WHEN p_info_type = 'absence' THEN 4 ELSE 0 END                               -- +4 不在確認（負データ）
       + CASE WHEN p_is_first_species THEN 15 ELSE 0 END                                   -- +15 初回発見: 種
       + CASE WHEN p_is_first_info_type THEN 10 ELSE 0 END                                 -- +10 初回発見: 情報種別
       + CASE WHEN p_is_first_municipality THEN 12 ELSE 0 END;                             -- +12 初回発見: 市区町村
$$;
COMMENT ON FUNCTION xp_for_post(boolean, numeric, text, numeric, text, boolean, boolean, boolean) IS
  'REQ-248 FR-248-01: 承認済み投稿1件あたりの XP（基本+品質+初回発見）。係数の単一ソース。award_xp_on_approval と recompute_all_progress が共用。';

-- ───────────────────────────────────────────────────────────────────────────
-- (C) 日次 XP 上限（ファーミング抑止 / FR-248-02）。
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION xp_daily_cap()
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = public AS $$ SELECT 120; $$;   -- XP_DAILY_CAP
COMMENT ON FUNCTION xp_daily_cap() IS
  'REQ-248 FR-248-02: 1日あたり XP 上限（ファーミング抑止）。src/lib/constants.ts の XP_DAILY_CAP と同期。';

-- ───────────────────────────────────────────────────────────────────────────
-- (D) 進行テーブル（DB 権威・改竄不能 / FR-248-04）。書き込みはトリガー / 関数のみ（INSERT/UPDATE ポリシー無し）。
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_progress (
  user_id       UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  xp            BIGINT NOT NULL DEFAULT 0 CHECK (xp >= 0),
  level         INT NOT NULL DEFAULT 1 CHECK (level >= 1),
  daily_xp      BIGINT NOT NULL DEFAULT 0 CHECK (daily_xp >= 0),
  daily_xp_date DATE,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE user_progress IS
  'REQ-248: 貢献レベル/XP（DB 権威・改竄不能）。書き込みは award_xp_on_approval / recompute_all_progress のみ（INSERT/UPDATE ポリシー無し＝user_badges と同パターン）。';

ALTER TABLE user_progress ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "progress_viewable" ON user_progress FOR SELECT USING (
    (SELECT auth.uid()) = user_id
    OR EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = user_progress.user_id AND up.is_public = true)
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- (E) XP 付与トリガー（FR-248-01 / FR-248-04 / NFR-248-01）。承認遷移でのみ発火・承認本体に非干渉。
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION award_xp_on_approval()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id           uuid;
  v_is_first_species  boolean;
  v_is_first_info     boolean;
  v_is_first_muni     boolean;
  v_award             integer;
  v_cap               integer := xp_daily_cap();
  v_used_today        bigint;
  v_grant             bigint;
BEGIN
  IF NEW.status <> 'approved' OR (TG_OP = 'UPDATE' AND OLD.status = 'approved') THEN RETURN NEW; END IF;
  v_user_id := NEW.user_id;
  IF v_user_id IS NULL THEN RETURN NEW; END IF;

  BEGIN
    SELECT COUNT(*) = 1 INTO v_is_first_species
      FROM posts WHERE user_id = v_user_id AND status = 'approved' AND species = NEW.species;
    SELECT COUNT(*) = 1 INTO v_is_first_info
      FROM posts WHERE user_id = v_user_id AND status = 'approved' AND info_type = NEW.info_type;
    IF NEW.municipality IS NULL THEN
      v_is_first_muni := false;
    ELSE
      SELECT COUNT(*) = 1 INTO v_is_first_muni
        FROM posts WHERE user_id = v_user_id AND status = 'approved' AND municipality = NEW.municipality;
    END IF;

    v_award := xp_for_post(
      NEW.auto_approved, (NEW.ai_result->>'confidence')::numeric, NEW.survey_method,
      NEW.accuracy, NEW.info_type, v_is_first_species, v_is_first_info, v_is_first_muni
    );

    SELECT CASE WHEN daily_xp_date = CURRENT_DATE THEN daily_xp ELSE 0 END
      INTO v_used_today FROM user_progress WHERE user_id = v_user_id;
    v_used_today := COALESCE(v_used_today, 0);
    v_grant := LEAST(v_award, GREATEST(0, v_cap - v_used_today));
    IF v_grant <= 0 THEN RETURN NEW; END IF;

    INSERT INTO user_progress (user_id, xp, level, daily_xp, daily_xp_date, updated_at)
    VALUES (v_user_id, v_grant, level_for_xp(v_grant), v_grant, CURRENT_DATE, now())
    ON CONFLICT (user_id) DO UPDATE SET
      xp            = user_progress.xp + v_grant,
      level         = level_for_xp(user_progress.xp + v_grant),
      daily_xp      = CASE WHEN user_progress.daily_xp_date = CURRENT_DATE
                           THEN user_progress.daily_xp + v_grant ELSE v_grant END,
      daily_xp_date = CURRENT_DATE,
      updated_at    = now();
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'award_xp_on_approval failed for user %: %', v_user_id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_post_approved_award_xp ON posts;
CREATE TRIGGER on_post_approved_award_xp
  AFTER UPDATE ON posts FOR EACH ROW
  EXECUTE FUNCTION award_xp_on_approval();

-- ───────────────────────────────────────────────────────────────────────────
-- (F) バックフィル / 再計算（NFR-248-03）。承認済み投稿から xp/level を遡って算出。日次上限は作成日ごと。
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION recompute_all_progress()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE jwt_claims jsonb;
BEGIN
  BEGIN
    jwt_claims := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb;
  EXCEPTION WHEN OTHERS THEN jwt_claims := NULL;
  END;
  IF jwt_claims IS NOT NULL AND jwt_claims <> '{}'::jsonb THEN
    IF (jwt_claims ->> 'role') IS DISTINCT FROM 'service_role'
       AND (jwt_claims -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'admin' THEN
      RAISE EXCEPTION 'Permission denied';
    END IF;
  END IF;

  WITH approved AS (
    SELECT p.user_id,
      COALESCE(p.created_at, now())::date AS d,
      xp_for_post(
        p.auto_approved,
        (p.ai_result->>'confidence')::numeric,
        p.survey_method,
        p.accuracy,
        p.info_type,
        ROW_NUMBER() OVER (PARTITION BY p.user_id, p.species      ORDER BY p.created_at, p.id) = 1,
        ROW_NUMBER() OVER (PARTITION BY p.user_id, p.info_type    ORDER BY p.created_at, p.id) = 1,
        p.municipality IS NOT NULL
          AND ROW_NUMBER() OVER (PARTITION BY p.user_id, p.municipality ORDER BY p.created_at, p.id) = 1
      ) AS xp
    FROM posts p
    WHERE p.status = 'approved' AND p.user_id IS NOT NULL
  ),
  daily AS (
    SELECT user_id, d, LEAST(SUM(xp), xp_daily_cap())::bigint AS capped
    FROM approved GROUP BY user_id, d
  ),
  totals AS (
    SELECT user_id, SUM(capped)::bigint AS total_xp FROM daily GROUP BY user_id
  )
  INSERT INTO user_progress (user_id, xp, level, daily_xp, daily_xp_date, updated_at)
  SELECT user_id, total_xp, level_for_xp(total_xp), 0, NULL, now()
  FROM totals
  ON CONFLICT (user_id) DO UPDATE SET
    xp = EXCLUDED.xp, level = EXCLUDED.level, updated_at = now();
END;
$$;
COMMENT ON FUNCTION recompute_all_progress() IS
  'REQ-248 NFR-248-03: 承認済み投稿から xp/level を遡って再計算（バックフィル / 係数変更時）。日次上限は作成日ごとに適用。migration が一度だけ呼ぶ。';

-- ───────────────────────────────────────────────────────────────────────────
-- (G) 参照 RPC（FR-248-05）。集計のみ・is_public 準拠。
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_user_progress(p_user_id UUID)
RETURNS TABLE (
  xp                bigint,
  level             integer,
  xp_into_level     bigint,
  xp_for_next_level bigint,
  approved_count    bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_is_owner  boolean := (p_user_id = (SELECT auth.uid()));
  v_is_public boolean;
  v_xp        bigint;
  v_level     integer;
BEGIN
  SELECT COALESCE(up.is_public, false) INTO v_is_public FROM user_profiles up WHERE up.id = p_user_id;
  IF NOT v_is_owner AND NOT COALESCE(v_is_public, false) THEN RETURN; END IF;

  SELECT COALESCE(pr.xp, 0), COALESCE(pr.level, 1) INTO v_xp, v_level
    FROM user_progress pr WHERE pr.user_id = p_user_id;
  IF v_xp IS NULL THEN v_xp := 0; v_level := 1; END IF;
  v_level := level_for_xp(v_xp);

  RETURN QUERY SELECT
    v_xp,
    v_level,
    v_xp - xp_for_level(v_level),
    xp_for_level(v_level + 1) - xp_for_level(v_level),
    (SELECT COUNT(*) FROM posts WHERE user_id = p_user_id AND status = 'approved')::bigint;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_user_progress(UUID) TO authenticated, anon;
COMMENT ON FUNCTION public.get_user_progress(UUID) IS
  'REQ-248 FR-248-05: 貢献レベル/XP の参照 RPC（集計のみ・is_public 準拠）。xp/level/xp_into_level/xp_for_next_level/approved_count を返す。';

-- ───────────────────────────────────────────────────────────────────────────
-- (H) 一度きりのバックフィル（NFR-248-03）。既存ユーザーが 0 スタートにならないよう遡って算出する。
--     JWT 無し（migration コンテキスト）のため recompute_all_progress は権限チェックを通過する。
-- ───────────────────────────────────────────────────────────────────────────
SELECT recompute_all_progress();

COMMIT;
