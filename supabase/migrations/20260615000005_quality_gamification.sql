-- REQ-235: 品質連動ゲーミフィケーション（検証済み投稿・種同定精度を称える設計）
--
-- 背景:
--   既存のバッジ／ランキングは「投稿数（量）」中心で、品質シグナル（承認済み・AI 信頼度・
--   GPS 精度・定点反復調査）をほとんど称えていなかった。量・いいね偏重は水増し／低品質投稿を
--   招く（Goodhart の法則）。本 migration は既存のバッジ／ランキング基盤に「検証された貢献（質）」
--   を称える軸を追加し、量×質をペアで称える設計に拡張する。
--
-- 方針（schema.sql の対応ブロックと同一定義・REQ-003 ドリフトゼロ）:
--   1. badge_definitions に品質バッジ4種を追加（category='quality'・ON CONFLICT DO NOTHING）。
--      既存 posts_*/multi_*/ai_perfect は後方互換で維持（NFR-235-02: 付与済みバッジは消えない）。
--   2. check_and_grant_badges() に品質バッジの付与条件を追加（既存 ai_perfect と同設計・
--      SECURITY DEFINER + SET search_path=public・status<>'approved' 早期 return ガード維持）。
--   3. 品質連動ランキング RPC get_user_quality を追加（is_public のみ・集計値のみ・PII を返さない）。
--
-- 冪等: INSERT ... ON CONFLICT DO NOTHING / CREATE OR REPLACE FUNCTION。

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. 品質バッジ定義（FR-235-01）
--    (a) verified_25      : 承認済み（検証済み）投稿が25件
--    (b) high_accuracy_10 : auto_approved かつ AI 信頼度 0.9 以上の承認済み投稿が10件
--    (c) structured_observer: survey_method='structured'（REQ-174 定点反復調査）が10件
--    (d) precise_locator  : GPS 精度 30m 以内（REQ-172 / GPS_ACCURACY_GOOD_M）が20件
-- ───────────────────────────────────────────────────────────────────────────
INSERT INTO badge_definitions (id, name, description, icon, category, sort_order) VALUES
  ('verified_25',         '検証済み調査員',  '審査を通過した検証済み投稿が25件',           '🔬', 'quality', 100),
  ('high_accuracy_10',    '高精度同定者',    'AI信頼度90%以上での自動承認が10件',          '🎯', 'quality', 110),
  ('structured_observer', '定点観察者',      '定点反復調査（structured）の投稿が10件',     '📍', 'quality', 120),
  ('precise_locator',     '高精度測位者',    'GPS精度30m以内の高精度な位置情報が20件',     '🛰️', 'quality', 130)
ON CONFLICT (id) DO NOTHING;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. バッジ付与トリガー関数（FR-235-02 / NFR-235-01）。schema.sql と同一定義。
--    既存条件はそのまま維持し、末尾に品質連動条件を追加（追加のみ）。
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION check_and_grant_badges() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID; v_post_count BIGINT; v_species_count BIGINT; v_municipality_count BIGINT; v_absence_count BIGINT;
  -- REQ-235: 品質連動バッジ用の集計。承認済み投稿のみを母集合とする（v_post_count と同じガード）。
  v_high_accuracy_count BIGINT; v_structured_count BIGINT; v_precise_loc_count BIGINT;
BEGIN
  IF NEW.status <> 'approved' OR (TG_OP = 'UPDATE' AND OLD.status = 'approved') THEN RETURN NEW; END IF;
  v_user_id := NEW.user_id;
  IF v_user_id IS NULL THEN RETURN NEW; END IF;

  SELECT COUNT(*) INTO v_post_count FROM posts WHERE user_id = v_user_id AND status = 'approved';
  IF v_post_count >= 1 THEN INSERT INTO user_badges (user_id, badge_id) VALUES (v_user_id, 'first_post') ON CONFLICT DO NOTHING; END IF;
  IF v_post_count >= 10 THEN INSERT INTO user_badges (user_id, badge_id) VALUES (v_user_id, 'posts_10') ON CONFLICT DO NOTHING; END IF;
  IF v_post_count >= 50 THEN INSERT INTO user_badges (user_id, badge_id) VALUES (v_user_id, 'posts_50') ON CONFLICT DO NOTHING; END IF;
  IF v_post_count >= 100 THEN INSERT INTO user_badges (user_id, badge_id) VALUES (v_user_id, 'posts_100') ON CONFLICT DO NOTHING; END IF;

  SELECT COUNT(DISTINCT species) INTO v_species_count FROM posts WHERE user_id = v_user_id AND status = 'approved';
  IF v_species_count >= 2 THEN INSERT INTO user_badges (user_id, badge_id) VALUES (v_user_id, 'multi_species') ON CONFLICT DO NOTHING; END IF;

  SELECT COUNT(DISTINCT municipality) INTO v_municipality_count FROM posts WHERE user_id = v_user_id AND status = 'approved' AND municipality IS NOT NULL;
  IF v_municipality_count >= 3 THEN INSERT INTO user_badges (user_id, badge_id) VALUES (v_user_id, 'multi_municipality') ON CONFLICT DO NOTHING; END IF;

  SELECT COUNT(*) INTO v_absence_count FROM posts WHERE user_id = v_user_id AND status = 'approved' AND info_type = 'absence';
  IF v_absence_count >= 5 THEN INSERT INTO user_badges (user_id, badge_id) VALUES (v_user_id, 'absence_reporter') ON CONFLICT DO NOTHING; END IF;

  IF NEW.auto_approved = true AND (NEW.ai_result->>'confidence')::numeric >= 0.95 THEN
    INSERT INTO user_badges (user_id, badge_id) VALUES (v_user_id, 'ai_perfect') ON CONFLICT DO NOTHING;
  END IF;

  -- REQ-235: 品質連動バッジ（量・いいね偏重の是正）。すべて承認済み（status='approved'）が母集合。
  -- (a) 検証済み投稿: 承認済み投稿数そのものを「検証された貢献」として称える（posts_* の量とは別軸）。
  IF v_post_count >= 25 THEN INSERT INTO user_badges (user_id, badge_id) VALUES (v_user_id, 'verified_25') ON CONFLICT DO NOTHING; END IF;

  -- (b) 高精度同定: auto_approved かつ AI 信頼度 0.9 以上の承認済み投稿が10件。
  SELECT COUNT(*) INTO v_high_accuracy_count FROM posts
    WHERE user_id = v_user_id AND status = 'approved' AND auto_approved = true
      AND (ai_result->>'confidence')::numeric >= 0.9;
  IF v_high_accuracy_count >= 10 THEN INSERT INTO user_badges (user_id, badge_id) VALUES (v_user_id, 'high_accuracy_10') ON CONFLICT DO NOTHING; END IF;

  -- (c) 定点観察者: survey_method='structured'（REQ-174 定点反復調査）の承認済み投稿が10件。
  SELECT COUNT(*) INTO v_structured_count FROM posts
    WHERE user_id = v_user_id AND status = 'approved' AND survey_method = 'structured';
  IF v_structured_count >= 10 THEN INSERT INTO user_badges (user_id, badge_id) VALUES (v_user_id, 'structured_observer') ON CONFLICT DO NOTHING; END IF;

  -- (d) 高精度測位: GPS 水平精度 30m 以内（REQ-172 / GPS_ACCURACY_GOOD_M）の承認済み投稿が20件。
  SELECT COUNT(*) INTO v_precise_loc_count FROM posts
    WHERE user_id = v_user_id AND status = 'approved' AND accuracy IS NOT NULL AND accuracy <= 30;
  IF v_precise_loc_count >= 20 THEN INSERT INTO user_badges (user_id, badge_id) VALUES (v_user_id, 'precise_locator') ON CONFLICT DO NOTHING; END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_post_approved_check_badges ON posts;
CREATE TRIGGER on_post_approved_check_badges
  AFTER UPDATE ON posts FOR EACH ROW
  EXECUTE FUNCTION check_and_grant_badges();

-- ───────────────────────────────────────────────────────────────────────────
-- 3. 品質連動ランキング RPC（FR-235-03 / NFR-235-03）。schema.sql と同一定義。
--    検証済み投稿数（量）と承認率/定点率/GPS良好率/AI平均信頼度（質）をペアで返す。
--    is_public=true のみ・集計値のみ（生 PII を返さない）・SECURITY DEFINER・anon/authenticated GRANT。
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_user_quality(p_limit INTEGER DEFAULT 50, p_offset INTEGER DEFAULT 0)
RETURNS TABLE (
  user_id UUID, display_name TEXT, avatar_emoji TEXT,
  verified_count BIGINT,        -- 承認済み（検証済み）投稿数＝量指標
  total_count BIGINT,           -- 全投稿数（承認率の分母）
  approval_rate NUMERIC,        -- 承認率 = verified_count / total_count（0..1）
  structured_count BIGINT,      -- 承認済みのうち定点反復調査（structured, REQ-174）
  structured_rate NUMERIC,      -- 定点率 = structured_count / verified_count（0..1）
  gps_good_count BIGINT,        -- 承認済みのうち GPS 精度 30m 以内（REQ-172）
  gps_good_rate NUMERIC,        -- GPS良好率 = gps_good_count / verified_count（0..1）
  avg_confidence NUMERIC,       -- 承認済みの AI 信頼度平均（NULL=AI 値なし）
  quality_score NUMERIC         -- 並べ替え用の合成スコア（量×質）
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  WITH q AS (
    SELECT p.user_id,
      COUNT(*) FILTER (WHERE p.status = 'approved')::bigint AS verified_count,
      COUNT(*)::bigint AS total_count,
      COUNT(*) FILTER (WHERE p.status = 'approved' AND p.survey_method = 'structured')::bigint AS structured_count,
      COUNT(*) FILTER (WHERE p.status = 'approved' AND p.accuracy IS NOT NULL AND p.accuracy <= 30)::bigint AS gps_good_count,
      avg((p.ai_result->>'confidence')::numeric) FILTER (WHERE p.status = 'approved' AND (p.ai_result->>'confidence') IS NOT NULL) AS avg_confidence
    FROM posts p
    WHERE p.user_id IS NOT NULL
    GROUP BY p.user_id
  )
  SELECT q.user_id,
    COALESCE(up.display_name, '名無し調査員')::text,
    COALESCE(up.avatar_emoji, '🦞')::text,
    q.verified_count,
    q.total_count,
    round(q.verified_count::numeric / NULLIF(q.total_count, 0), 4) AS approval_rate,
    q.structured_count,
    round(q.structured_count::numeric / NULLIF(q.verified_count, 0), 4) AS structured_rate,
    q.gps_good_count,
    round(q.gps_good_count::numeric / NULLIF(q.verified_count, 0), 4) AS gps_good_rate,
    round(q.avg_confidence, 4) AS avg_confidence,
    -- 合成スコア: 検証済み件数を質係数（定点率/GPS率/承認率の平均）で重み付け。量だけでは上がらない。
    round(
      q.verified_count
      * (1 + COALESCE(q.structured_count::numeric / NULLIF(q.verified_count, 0), 0)
           + COALESCE(q.gps_good_count::numeric / NULLIF(q.verified_count, 0), 0)
           + COALESCE(q.verified_count::numeric / NULLIF(q.total_count, 0), 0)),
      2
    ) AS quality_score
  FROM q JOIN user_profiles up ON up.id = q.user_id AND up.is_public = true
  WHERE q.verified_count > 0
  ORDER BY quality_score DESC, q.verified_count DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_user_quality(INTEGER, INTEGER) TO authenticated, anon;
COMMENT ON FUNCTION public.get_user_quality(INTEGER, INTEGER) IS
  'REQ-235: 品質連動ランキング。検証済み投稿数（量）と承認率/定点率/GPS良好率/AI平均信頼度（質）をペアで返す。いいね偏重を避け Goodhart 対策。';

COMMIT;
