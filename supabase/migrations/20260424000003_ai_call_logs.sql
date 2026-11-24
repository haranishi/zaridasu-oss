-- REQ-075 Phase 0 / REQ-079 Phase 4:
-- AI 判定 API の呼び出しログを記録するテーブル。コスト集計・dedup 統計・reanalysis rate limit に使用。
--
-- 既存 audit_logs は CHECK 制約 (action enum) と admin_id NOT NULL のため Edge Function からの
-- service_role 書き込みに不向き。案 B (新設) を採用。

CREATE TABLE IF NOT EXISTS public.ai_call_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid REFERENCES public.posts(id) ON DELETE SET NULL,
  function_name text NOT NULL CHECK (function_name IN ('analyze-audio', 'analyze-image')),
  model text NOT NULL,
  input_tokens int,
  output_tokens int,
  latency_ms int,
  status text NOT NULL CHECK (status IN ('success', 'error', 'skipped', 'dedup_hit', 'rate_limited', 'cache_hit', 'cache_miss')),
  reanalysis boolean NOT NULL DEFAULT false,
  dedup_status text CHECK (dedup_status IS NULL OR dedup_status IN ('hit', 'miss', 'skipped')),
  cache_status text CHECK (cache_status IS NULL OR cache_status IN ('hit', 'miss', 'refresh', 'error')),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_call_logs_created
  ON public.ai_call_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_call_logs_fn_model
  ON public.ai_call_logs (function_name, model);
-- REQ-079: reanalysis rate limit 検索用（post_id + reanalysis + 24h 以内）
CREATE INDEX IF NOT EXISTS idx_ai_call_logs_post_reanalysis
  ON public.ai_call_logs (post_id, reanalysis, created_at DESC)
  WHERE reanalysis = true;

ALTER TABLE public.ai_call_logs ENABLE ROW LEVEL SECURITY;

-- service_role は RLS bypass のためポリシー不要。
-- admin は SELECT のみ許可（ダッシュボード用）
DO $$ BEGIN
  CREATE POLICY "admin_select_ai_call_logs" ON public.ai_call_logs
    FOR SELECT TO authenticated
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE public.ai_call_logs IS
  'REQ-075: AI 判定 API 呼び出しログ。コスト集計 / dedup 統計 / reanalysis rate limit に利用。';

-- 日次集計ビュー（ダッシュボードの初期表示を高速化）
-- 既存 view の WITH オプションを確実に差し替えるため一度 DROP → CREATE → ALTER で明示設定する
DROP VIEW IF EXISTS public.ai_call_logs_daily;

CREATE VIEW public.ai_call_logs_daily
WITH (security_invoker = true) AS
SELECT
  date_trunc('day', created_at)::date AS day,
  function_name,
  model,
  COUNT(*) AS total_calls,
  COUNT(*) FILTER (WHERE status = 'success') AS success_calls,
  COUNT(*) FILTER (WHERE status = 'error') AS error_calls,
  COUNT(*) FILTER (WHERE status = 'dedup_hit') AS dedup_hits,
  COUNT(*) FILTER (WHERE cache_status = 'hit') AS cache_hits,
  COALESCE(SUM(input_tokens), 0) AS total_input_tokens,
  COALESCE(SUM(output_tokens), 0) AS total_output_tokens
FROM public.ai_call_logs
WHERE created_at >= now() - interval '90 days'
GROUP BY 1, 2, 3;

-- 冗長だが linter の誤検知を防ぐため明示的に再設定
ALTER VIEW public.ai_call_logs_daily SET (security_invoker = true);

GRANT SELECT ON public.ai_call_logs_daily TO authenticated;

-- admin 向け集計 RPC（30/90 日の呼び出し数・推定コストを返す）
CREATE OR REPLACE FUNCTION public.get_ai_cost_summary(p_days int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_since timestamptz := now() - make_interval(days => p_days);
  v_result jsonb;
BEGIN
  -- admin 制限（SECURITY DEFINER のため明示チェック必須）
  v_is_admin := (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin';
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'period_days', p_days,
    'total_calls', COUNT(*),
    'total_input_tokens', COALESCE(SUM(input_tokens), 0),
    'total_output_tokens', COALESCE(SUM(output_tokens), 0),
    'by_function', (
      SELECT jsonb_object_agg(function_name, payload)
      FROM (
        SELECT function_name, jsonb_build_object(
          'calls', COUNT(*),
          'input_tokens', COALESCE(SUM(input_tokens), 0),
          'output_tokens', COALESCE(SUM(output_tokens), 0)
        ) AS payload
        FROM public.ai_call_logs
        WHERE created_at >= v_since
        GROUP BY function_name
      ) t
    ),
    'by_model', (
      SELECT jsonb_object_agg(model, payload)
      FROM (
        SELECT model, jsonb_build_object(
          'calls', COUNT(*),
          'input_tokens', COALESCE(SUM(input_tokens), 0),
          'output_tokens', COALESCE(SUM(output_tokens), 0)
        ) AS payload
        FROM public.ai_call_logs
        WHERE created_at >= v_since
        GROUP BY model
      ) t
    ),
    'daily', (
      SELECT COALESCE(jsonb_agg(row_to_json(d)), '[]'::jsonb)
      FROM (
        SELECT
          date_trunc('day', created_at)::date AS date,
          COUNT(*) AS calls,
          COALESCE(SUM(input_tokens), 0) AS input_tokens,
          COALESCE(SUM(output_tokens), 0) AS output_tokens
        FROM public.ai_call_logs
        WHERE created_at >= v_since
        GROUP BY 1
        ORDER BY 1
      ) d
    )
  )
  INTO v_result
  FROM public.ai_call_logs
  WHERE created_at >= v_since;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_ai_cost_summary(int) TO authenticated;
