-- REQ-253: AI 判定の信頼性エビデンス化（精度統計）
--
-- 背景:
--   自作モデルでないため「なぜその信頼度%が妥当か」を運用データで説明できるようにする。
--   posts.ai_result.confidence（AI 信頼度）を信頼度ビンに分け、各ビンで人手判定の結果
--   （approved/rejected/pending）・自動承認数・承認率・的中率（AI 検出種＝確定種）を集計する。
--
-- 「正解（truth）」の考え方:
--   - status='approved' は人手（またはルールベース自動承認）が「有効な観測」と確定した状態。
--     承認済み投稿では申告 species を真値とみなし、AI の detected_species と突合して的中率を出す。
--   - status='rejected' は人手が「無効」と確定（分母には含むが的中は数えない）。
--   - これは真の適合率/再現率ではなく運用プロキシ。真の指標にはラベル付き検証セットが要る（REQ-253 本文）。
--   - 注意: 高信頼度帯の承認は auto_approved（信頼度連動）を多く含むため承認率は上振れする。
--     独立検証には人手レビュー分（reviewed_by 非 NULL）の的中率を summary.human_reviewed に併記する。
--
-- 方針（兄弟 KPI RPC = get_kpi_summary / get_kpi_quality_funnel と同一）:
--   - admin 限定（_kpi_assert_admin）。SECURITY DEFINER SET search_path = public。
--   - 集計値のみを返す（生 PII・個票を返さない）。読み取り専用で投稿/モデレーション本番フローに影響しない。
--   - confidence が数値でない/NULL のレコードにも頑健（正規表現ガードで数値のみ採用）。
--
-- 冪等: CREATE OR REPLACE FUNCTION。schema.sql 末尾の同名定義と同期（REQ-003 ドリフトゼロ）。

BEGIN;

CREATE OR REPLACE FUNCTION public.get_ai_accuracy_stats()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  result jsonb;
BEGIN
  PERFORM public._kpi_assert_admin();

  WITH scored AS (
    -- confidence は数値のみ採用（NULL・非数値文字列は除外＝null 頑健）。
    SELECT
      CASE WHEN (p.ai_result->>'confidence') ~ '^[0-9]+(\.[0-9]+)?$'
           THEN (p.ai_result->>'confidence')::numeric END AS conf,
      p.status,
      p.auto_approved,
      p.reviewed_by,
      p.species,
      (p.ai_result->>'detected_species') AS detected
    FROM posts p
    WHERE p.ai_result IS NOT NULL
  ),
  binned AS (
    SELECT
      CASE
        WHEN conf < 0.5 THEN 0   -- 〜50%
        WHEN conf < 0.7 THEN 1   -- 50〜70%
        WHEN conf < 0.9 THEN 2   -- 70〜90%
        ELSE 3                   -- 90〜100%
      END AS bin,
      status, auto_approved, reviewed_by, species, detected, conf
    FROM scored
    WHERE conf IS NOT NULL
  ),
  agg AS (
    SELECT
      bin,
      count(*)::bigint                                             AS total,
      count(*) FILTER (WHERE status = 'approved')::bigint          AS approved,
      count(*) FILTER (WHERE status = 'rejected')::bigint          AS rejected,
      count(*) FILTER (WHERE status = 'pending')::bigint           AS pending,
      count(*) FILTER (WHERE auto_approved)::bigint                AS auto_approved,
      -- 的中: 承認済みで AI 検出種＝確定種（detected NULL は不一致扱い＝カウントしない）。
      count(*) FILTER (WHERE status = 'approved' AND detected = species)::bigint AS matched
    FROM binned
    GROUP BY bin
  ),
  -- 固定 4 ビン（空ビンも 0 で必ず現れるよう LEFT JOIN の左側に置く）。
  labels(bin, key, lo, hi) AS (
    VALUES (0, 'lt50', 0.0, 0.5), (1, 'c50_70', 0.5, 0.7),
           (2, 'c70_90', 0.7, 0.9), (3, 'c90_100', 0.9, 1.0)
  )
  SELECT jsonb_build_object(
    'bins', (
      SELECT coalesce(jsonb_agg(
        jsonb_build_object(
          'key', l.key,
          'min', l.lo,
          'max', l.hi,
          'total',         coalesce(a.total, 0),
          'approved',      coalesce(a.approved, 0),
          'rejected',      coalesce(a.rejected, 0),
          'pending',       coalesce(a.pending, 0),
          'auto_approved', coalesce(a.auto_approved, 0),
          -- 承認率 = 承認 ÷（承認＋却下）。保留は未判定なので分母から除外。
          'approval_rate', round(coalesce(a.approved, 0)::numeric
                             / NULLIF(coalesce(a.approved, 0) + coalesce(a.rejected, 0), 0), 4),
          -- 的中率 = 的中 ÷ 承認。承認 0 のビンは NULL。
          'match_rate',    round(coalesce(a.matched, 0)::numeric
                             / NULLIF(coalesce(a.approved, 0), 0), 4)
        ) ORDER BY l.bin
      ), '[]'::jsonb)
      FROM labels l LEFT JOIN agg a ON a.bin = l.bin
    ),
    'summary', (
      SELECT jsonb_build_object(
        'total',         count(*),
        'approved',      count(*) FILTER (WHERE status = 'approved'),
        'rejected',      count(*) FILTER (WHERE status = 'rejected'),
        'pending',       count(*) FILTER (WHERE status = 'pending'),
        'auto_approved', count(*) FILTER (WHERE auto_approved),
        'approval_rate', round(count(*) FILTER (WHERE status = 'approved')::numeric
                           / NULLIF(count(*) FILTER (WHERE status IN ('approved', 'rejected')), 0), 4),
        'match_rate',    round(count(*) FILTER (WHERE status = 'approved' AND detected = species)::numeric
                           / NULLIF(count(*) FILTER (WHERE status = 'approved'), 0), 4),
        'avg_confidence', round(avg(conf), 4),
        -- 人手レビュー分（reviewed_by 非 NULL）＝自動承認を除いた独立検証の的中率。
        'human_reviewed', jsonb_build_object(
          'count',    count(*) FILTER (WHERE reviewed_by IS NOT NULL),
          'approved', count(*) FILTER (WHERE reviewed_by IS NOT NULL AND status = 'approved'),
          'rejected', count(*) FILTER (WHERE reviewed_by IS NOT NULL AND status = 'rejected'),
          'match_rate', round(
            count(*) FILTER (WHERE reviewed_by IS NOT NULL AND status = 'approved' AND detected = species)::numeric
            / NULLIF(count(*) FILTER (WHERE reviewed_by IS NOT NULL AND status = 'approved'), 0), 4)
        )
      )
      FROM binned
    )
  ) INTO result;

  RETURN result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_ai_accuracy_stats() TO authenticated;
COMMENT ON FUNCTION public.get_ai_accuracy_stats() IS
  'REQ-253: AI 信頼度ビン別の承認/的中率（admin限定・集計のみ・PII非露出）。承認率=承認/(承認+却下)、的中率=承認かつAI検出種=確定種/承認。';

COMMIT;
