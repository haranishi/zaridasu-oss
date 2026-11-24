-- REQ-175: 介入評価・実験計測基盤
-- フィーチャーフラグ（experiments）+ 安定割付（experiment_assignments）+ 4指標集計 RPC。
-- 卒研の仮説 H2 を準実験デザイン（段階ロールアウト / DID）で検証する土台。
-- 冪等に再適用可能。schema.sql と同期（REQ-003 方針）。

-- ── 実験定義 ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS experiments (
  key                TEXT PRIMARY KEY,
  description        TEXT,
  enabled            BOOLEAN NOT NULL DEFAULT false,
  rollout_percentage INTEGER NOT NULL DEFAULT 0 CHECK (rollout_percentage BETWEEN 0 AND 100),
  variants           TEXT[]  NOT NULL DEFAULT ARRAY['control','treatment'],
  seed               TEXT    NOT NULL DEFAULT gen_random_uuid()::text,
  started_at         TIMESTAMPTZ,
  ended_at           TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE experiments IS 'REQ-175: A/B・段階ロールアウト実験定義。key=ai_feedback(REQ-170)/new_ranking(REQ-171) 等';

-- ── 安定割付（ユーザー × 実験 → variant）──────────────────────────────────────
CREATE TABLE IF NOT EXISTS experiment_assignments (
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  experiment_key TEXT NOT NULL REFERENCES experiments(key) ON DELETE CASCADE,
  variant        TEXT NOT NULL,
  assigned_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, experiment_key)
);
COMMENT ON TABLE experiment_assignments IS 'REQ-175: 割付の確定（exposure）を保存。事後の群別集計で投稿と突合';

-- ── posts へ計測メタ列 ───────────────────────────────────────────────────────
-- location_source: 位置取得手段（REQ-172/REQ-175 FR-175-08）。experiment_assignments: 投稿時点の群割付。
ALTER TABLE posts ADD COLUMN IF NOT EXISTS location_source TEXT
  CHECK (location_source IS NULL OR location_source IN ('gps','manual','exif'));
ALTER TABLE posts ADD COLUMN IF NOT EXISTS experiment_assignments JSONB NOT NULL DEFAULT '{}'::jsonb;
COMMENT ON COLUMN posts.location_source IS 'REQ-175: 位置取得手段 gps/manual/exif';
COMMENT ON COLUMN posts.experiment_assignments IS 'REQ-175: 投稿時点の {実験key: variant} 群割付（群別4指標集計の突合キー）';

-- ── 決定的バケット（0-99）。同一 seed+subject は常に同じ値 ───────────────────────
CREATE OR REPLACE FUNCTION public._experiment_bucket(p_seed text, p_subject text)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT (abs(('x' || substr(md5(p_seed || ':' || p_subject), 1, 8))::bit(32)::int) % 100);
$$;

-- ── 現在ユーザーの全有効実験の割付を返す（exposure を upsert）─────────────────────
-- 段階ロールアウト: bucket < rollout_percentage を treatment。率を上げても treatment は維持（単調性）。
-- 未ログインは {}（control 相当）。SECURITY DEFINER で assignment を保存。
CREATE OR REPLACE FUNCTION public.get_my_experiment_variants()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_rec record;
  v_variant text;
  v_bucket int;
  v_result jsonb := '{}'::jsonb;
BEGIN
  IF v_uid IS NULL THEN RETURN '{}'::jsonb; END IF;
  FOR v_rec IN SELECT * FROM experiments WHERE enabled = true LOOP
    v_bucket := public._experiment_bucket(v_rec.seed, v_uid::text);
    IF v_bucket < v_rec.rollout_percentage THEN
      v_variant := COALESCE(v_rec.variants[2], 'treatment');
    ELSE
      v_variant := COALESCE(v_rec.variants[1], 'control');
    END IF;
    INSERT INTO experiment_assignments(user_id, experiment_key, variant)
      VALUES (v_uid, v_rec.key, v_variant)
      ON CONFLICT (user_id, experiment_key)
      DO UPDATE SET variant = EXCLUDED.variant, assigned_at = now();
    v_result := v_result || jsonb_build_object(v_rec.key, v_variant);
  END LOOP;
  RETURN v_result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_my_experiment_variants() TO authenticated;

-- ── 群×期間の4指標集計（DID 用に pre/post セル別）──────────────────────────────
-- 管理者のみ。投稿の experiment_assignments->>key を群とし、experiments.started_at を境に pre/post を分ける。
-- 個人行は返さず集計のみ（NFR-175-02）。
CREATE OR REPLACE FUNCTION public.get_experiment_metrics(
  p_experiment_key text,
  p_from timestamptz DEFAULT NULL,
  p_to   timestamptz DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_claims jsonb;
  v_to       timestamptz := coalesce(p_to, now());
  v_from     timestamptz := coalesce(p_from, v_to - interval '180 days');
  v_to_excl  timestamptz := v_to + interval '1 day';
  v_started  timestamptz;
  result jsonb;
BEGIN
  -- 管理者チェック
  v_claims := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb;
  IF v_claims IS NULL
     OR (v_claims ->> 'role') IS DISTINCT FROM 'service_role'
        AND (v_claims -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'forbidden: admin only';
  END IF;

  SELECT started_at INTO v_started FROM experiments WHERE key = p_experiment_key;

  WITH base AS (
    SELECT p.user_id, p.created_at, p.photos, p.accuracy,
           (p.experiment_assignments ->> p_experiment_key) AS variant,
           CASE WHEN v_started IS NULL OR p.created_at >= v_started THEN 'post' ELSE 'pre' END AS period
    FROM posts p
    WHERE p.created_at >= v_from AND p.created_at < v_to_excl
      AND p.experiment_assignments ? p_experiment_key
  ),
  per_user AS (
    SELECT variant, period, user_id, count(*) AS c
    FROM base GROUP BY variant, period, user_id
  ),
  cells AS (
    SELECT b.variant, b.period,
      count(*)                                                                   AS post_count,
      count(DISTINCT b.user_id)                                                  AS n_users,
      avg(CASE WHEN b.photos IS NOT NULL AND array_length(b.photos,1) > 0 THEN 1.0 ELSE 0.0 END) AS photo_rate,
      avg(CASE WHEN b.accuracy IS NOT NULL THEN 1.0 ELSE 0.0 END)                AS gps_rate,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY b.accuracy) FILTER (WHERE b.accuracy IS NOT NULL) AS accuracy_median
    FROM base b GROUP BY b.variant, b.period
  ),
  rep AS (
    SELECT variant, period,
      (count(*) FILTER (WHERE c >= 2))::numeric / NULLIF(count(*),0) AS repeat_rate
    FROM per_user GROUP BY variant, period
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'variant', cells.variant,
    'period',  cells.period,
    'post_count', cells.post_count,
    'n_users', cells.n_users,
    'photo_rate', round(coalesce(cells.photo_rate,0)::numeric, 4),
    'gps_rate', round(coalesce(cells.gps_rate,0)::numeric, 4),
    'accuracy_median', cells.accuracy_median,
    'repeat_rate', round(coalesce(rep.repeat_rate,0)::numeric, 4)
  ) ORDER BY cells.variant, cells.period), '[]'::jsonb)
  INTO result
  FROM cells LEFT JOIN rep ON rep.variant = cells.variant AND rep.period = cells.period;

  RETURN result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_experiment_metrics(text, timestamptz, timestamptz) TO authenticated;

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE experiment_assignments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "admin_all_experiments" ON experiments FOR ALL TO authenticated
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
    WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "own_select_assignments" ON experiment_assignments FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "admin_all_assignments" ON experiment_assignments FOR ALL TO authenticated
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
    WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
