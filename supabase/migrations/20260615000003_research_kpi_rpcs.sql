-- REQ-233: 卒研 KPI ダッシュボード集計 RPC
--   （North Star + ガードレール + KGI サマリー / 獲得月コホート継続率 /
--     承認ファネル + 量×質カウンター指標）。
--
-- 背景:
--   既存の集計は「全体カウント（種別/月次/市区町村）」と「実験別 DID（get_experiment_metrics）」
--   に限られ、卒論の中心的主張（継続率・参加率・データ品質）を、生存者バイアスを排した形
--   （獲得月コホート別の継続カーブ）と Goodhart 対策（量×質ペア）で示す集計が無かった。
--   本 migration は admin 限定の読み取り専用 RPC を 3 本追加する。
--
-- 方針（schema.sql 末尾「REQ-233」ブロックと同一定義・REQ-003 ドリフトゼロ）:
--   - すべて admin 限定。get_experiment_metrics と同一の JWT claims 検査
--     （service_role か app_metadata.role='admin' のみ通す）。
--   - SECURITY DEFINER SET search_path = public（PII 保護 RLS を跨ぐため明示認可必須）。
--   - 集計値のみを返す。reporter_ip 等の PII 列（REQ-179）や user_id 個票は返さない。
--   - 期間引数で posts 全期間スキャンを抑える（NFR-233-05）。
--   - 読み取り専用・admin 限定のため投稿/モデレーション本番フローに影響しない。
--
-- 冪等: CREATE OR REPLACE FUNCTION / CREATE INDEX IF NOT EXISTS。

BEGIN;

-- 共通 admin 判定（SECURITY DEFINER 内で明示）。
CREATE OR REPLACE FUNCTION public._kpi_assert_admin()
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_claims jsonb;
BEGIN
  v_claims := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb;
  IF v_claims IS NULL
     OR (v_claims ->> 'role') IS DISTINCT FROM 'service_role'
        AND (v_claims -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'forbidden: admin only';
  END IF;
END;
$$;
COMMENT ON FUNCTION public._kpi_assert_admin() IS
  'REQ-233: KPI 集計 RPC 共通の admin 認可。get_experiment_metrics と同一判定。';

-- FR-233-02 / AC-02: 獲得月コホート × 経過月の継続率マトリクス。
CREATE OR REPLACE FUNCTION public.get_retention_cohorts(p_months integer DEFAULT 12)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_months integer := greatest(1, least(coalesce(p_months, 12), 24));
  v_first_cohort date := (date_trunc('month', now()) - ((v_months - 1) * interval '1 month'))::date;
  result jsonb;
BEGIN
  PERFORM public._kpi_assert_admin();

  WITH first_post AS (
    SELECT user_id, date_trunc('month', min(created_at))::date AS cohort_month
    FROM posts
    WHERE user_id IS NOT NULL
    GROUP BY user_id
  ),
  in_window AS (
    SELECT * FROM first_post WHERE cohort_month >= v_first_cohort
  ),
  activity AS (
    SELECT DISTINCT f.user_id, f.cohort_month,
      (extract(year  from age(date_trunc('month', p.created_at), f.cohort_month)) * 12
     + extract(month from age(date_trunc('month', p.created_at), f.cohort_month)))::int AS m
    FROM in_window f
    JOIN posts p ON p.user_id = f.user_id
    WHERE p.created_at >= f.cohort_month
  ),
  sizes AS (
    SELECT cohort_month, count(*) AS cohort_size
    FROM in_window GROUP BY cohort_month
  ),
  retained AS (
    SELECT cohort_month, m, count(DISTINCT user_id) AS retained_users
    FROM activity
    WHERE m >= 0 AND m < v_months
    GROUP BY cohort_month, m
  )
  SELECT jsonb_build_object(
    'max_months', v_months,
    'cohorts', coalesce(jsonb_agg(
      jsonb_build_object(
        'cohort', to_char(s.cohort_month, 'YYYY-MM'),
        'size', s.cohort_size,
        'retention', (
          SELECT coalesce(jsonb_agg(
            jsonb_build_object(
              'm', r.m,
              'users', r.retained_users,
              'rate', round((r.retained_users::numeric) / NULLIF(s.cohort_size, 0), 4)
            ) ORDER BY r.m), '[]'::jsonb)
          FROM retained r WHERE r.cohort_month = s.cohort_month
        )
      ) ORDER BY s.cohort_month
    ), '[]'::jsonb)
  ) INTO result
  FROM sizes s;

  RETURN result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_retention_cohorts(integer) TO authenticated;
COMMENT ON FUNCTION public.get_retention_cohorts(integer) IS
  'REQ-233 FR-233-02: 獲得月コホート×経過月の保持率マトリクス（admin限定・集計のみ）。';

-- FR-233-03 / FR-233-04 / AC-03 / AC-04: 承認ファネル ＋ 量×質カウンター指標。
CREATE OR REPLACE FUNCTION public.get_kpi_quality_funnel(
  p_from timestamptz DEFAULT NULL,
  p_to   timestamptz DEFAULT NULL,
  p_accuracy_threshold numeric DEFAULT 30
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_to        timestamptz := coalesce(p_to, now());
  v_from      timestamptz := coalesce(p_from, v_to - interval '90 days');
  v_to_excl   timestamptz := v_to + interval '1 day';
  v_thresh    numeric := coalesce(p_accuracy_threshold, 30);
  result jsonb;
BEGIN
  PERFORM public._kpi_assert_admin();

  WITH base AS (
    SELECT status, photos, accuracy
    FROM posts
    WHERE created_at >= v_from AND created_at < v_to_excl
  ),
  agg AS (
    SELECT
      count(*)                                              AS total,
      count(*) FILTER (WHERE status = 'approved')           AS approved,
      count(*) FILTER (WHERE status = 'pending')            AS pending,
      count(*) FILTER (WHERE status = 'rejected')           AS rejected,
      count(*) FILTER (
        WHERE photos IS NOT NULL AND array_length(photos, 1) > 0 AND accuracy IS NOT NULL
      )                                                     AS complete,
      count(*) FILTER (WHERE photos IS NOT NULL AND array_length(photos, 1) > 0) AS has_photo,
      count(*) FILTER (WHERE accuracy IS NOT NULL)          AS has_accuracy,
      count(*) FILTER (WHERE accuracy IS NOT NULL AND accuracy <= v_thresh) AS within_thresh
    FROM base
  ),
  ai AS (
    SELECT
      coalesce(sum(input_tokens), 0)  AS input_tokens,
      coalesce(sum(output_tokens), 0) AS output_tokens,
      count(*)                        AS ai_calls
    FROM ai_call_logs
    WHERE created_at >= v_from AND created_at < v_to_excl
  )
  SELECT jsonb_build_object(
    'accuracy_threshold_m', v_thresh,
    'funnel', jsonb_build_object(
      'completed', agg.total,
      'approved',  agg.approved,
      'pending',   agg.pending,
      'rejected',  agg.rejected,
      'approval_rate', round(agg.approved::numeric / NULLIF(agg.total, 0), 4),
      'rejection_rate', round(agg.rejected::numeric / NULLIF(agg.total, 0), 4)
    ),
    'completeness', jsonb_build_object(
      'count', agg.total,
      'complete', agg.complete,
      'rate', round(agg.complete::numeric / NULLIF(agg.total, 0), 4),
      'photo_rate', round(agg.has_photo::numeric / NULLIF(agg.total, 0), 4),
      'accuracy_present_rate', round(agg.has_accuracy::numeric / NULLIF(agg.total, 0), 4)
    ),
    'accuracy', jsonb_build_object(
      'count', agg.total,
      'within_threshold', agg.within_thresh,
      'rate_of_all', round(agg.within_thresh::numeric / NULLIF(agg.total, 0), 4),
      'rate_of_measured', round(agg.within_thresh::numeric / NULLIF(agg.has_accuracy, 0), 4),
      'measured', agg.has_accuracy
    ),
    'cost_per_submission', jsonb_build_object(
      'approved', agg.approved,
      'ai_calls', ai.ai_calls,
      'input_tokens', ai.input_tokens,
      'output_tokens', ai.output_tokens,
      'tokens_per_approved',
        round((ai.input_tokens + ai.output_tokens)::numeric / NULLIF(agg.approved, 0), 2)
    )
  ) INTO result
  FROM agg, ai;

  RETURN result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_kpi_quality_funnel(timestamptz, timestamptz, numeric) TO authenticated;
COMMENT ON FUNCTION public.get_kpi_quality_funnel(timestamptz, timestamptz, numeric) IS
  'REQ-233 FR-233-03/04: 承認ファネル（status別）＋量×質カウンター指標（完全率/正確率/1提出あたりトークン）。admin限定・集計のみ。';

-- FR-233-01 / FR-233-05 / AC-01 / AC-05: NSM + ガードレール + KGI サマリー（WoW 付き）。
CREATE OR REPLACE FUNCTION public.get_kpi_summary(p_accuracy_threshold numeric DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_now    timestamptz := now();
  v_w0     timestamptz := v_now - interval '7 days';
  v_w1     timestamptz := v_now - interval '14 days';
  v_thresh numeric := coalesce(p_accuracy_threshold, 30);
  v_nsm_now  bigint;
  v_nsm_prev bigint;
  result jsonb;
BEGIN
  PERFORM public._kpi_assert_admin();

  SELECT count(*) INTO v_nsm_now FROM (
    SELECT user_id FROM posts
    WHERE status = 'approved' AND user_id IS NOT NULL
      AND created_at >= v_w0 AND created_at < v_now
    GROUP BY user_id HAVING count(*) >= 2
  ) a;
  SELECT count(*) INTO v_nsm_prev FROM (
    SELECT user_id FROM posts
    WHERE status = 'approved' AND user_id IS NOT NULL
      AND created_at >= v_w1 AND created_at < v_w0
    GROUP BY user_id HAVING count(*) >= 2
  ) b;

  SELECT jsonb_build_object(
    'accuracy_threshold_m', v_thresh,
    'nsm', jsonb_build_object(
      'label', 'weekly_active_contributors',
      'value', v_nsm_now,
      'prev', v_nsm_prev,
      'wow', CASE WHEN v_nsm_prev = 0 THEN NULL
                  ELSE round((v_nsm_now - v_nsm_prev)::numeric / v_nsm_prev, 4) END,
      'delta', v_nsm_now - v_nsm_prev
    ),
    'guardrails', jsonb_build_object(
      'rejection_rate', (
        SELECT round(
          count(*) FILTER (WHERE status = 'rejected')::numeric / NULLIF(count(*), 0), 4)
        FROM posts WHERE created_at >= v_w0 AND created_at < v_now
      ),
      'completeness_rate', (
        SELECT round(
          count(*) FILTER (
            WHERE photos IS NOT NULL AND array_length(photos, 1) > 0 AND accuracy IS NOT NULL
          )::numeric / NULLIF(count(*), 0), 4)
        FROM posts WHERE created_at >= v_w0 AND created_at < v_now
      ),
      'accuracy_rate', (
        SELECT round(
          count(*) FILTER (WHERE accuracy IS NOT NULL AND accuracy <= v_thresh)::numeric
            / NULLIF(count(*), 0), 4)
        FROM posts WHERE created_at >= v_w0 AND created_at < v_now
      ),
      'posts_this_week', (
        SELECT count(*) FROM posts WHERE created_at >= v_w0 AND created_at < v_now
      )
    ),
    'kgi', jsonb_build_object(
      'cumulative_approved', (
        SELECT count(*) FROM posts WHERE status = 'approved'
      ),
      'repeat_contributors', (
        SELECT count(*) FROM (
          SELECT user_id FROM posts
          WHERE status = 'approved' AND user_id IS NOT NULL
          GROUP BY user_id HAVING count(*) >= 2
        ) c
      )
    )
  ) INTO result;

  RETURN result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_kpi_summary(numeric) TO authenticated;
COMMENT ON FUNCTION public.get_kpi_summary(numeric) IS
  'REQ-233 FR-233-01/05: NSM(週次アクティブ投稿者)+ガードレール+KGI サマリー（WoW付き）。admin限定・集計のみ。';

-- NFR-233-01: コホート/継続率算出を高速化する複合インデックス。
CREATE INDEX IF NOT EXISTS idx_posts_user_created ON posts (user_id, created_at)
  WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_posts_status_user ON posts (status, user_id)
  WHERE user_id IS NOT NULL;

COMMIT;
