-- REQ-316 (scoped): internal notification entrypoints and admin cost RPC.
-- Append-only correction; public profile/ranking/unsubscribe RPCs are unchanged.
BEGIN;

CREATE OR REPLACE FUNCTION public.call_lifecycle_edge_function(p_fn text, p_payload jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_url text;
  v_key text;
BEGIN
  -- Validate before the fail-soft block: rejected destinations must stay rejected.
  IF p_fn IS NULL OR p_fn NOT IN (
    'notify-weekly-digest', 'notify-dormant-reengage', 'notify-research-adopted'
  ) THEN
    RAISE EXCEPTION 'unsupported lifecycle function' USING ERRCODE = '22023';
  END IF;

  BEGIN
    SELECT decrypted_secret INTO v_key
      FROM vault.decrypted_secrets WHERE name = 'edge_function_service_role_key' LIMIT 1;
    IF v_key IS NULL THEN RETURN; END IF;
    v_url := current_setting('app.settings.supabase_url', true);
    IF v_url IS NULL OR v_url = '' THEN
      v_url := 'https://project-not-configured.invalid';
    END IF;
    PERFORM net.http_post(
      url := v_url || '/functions/v1/' || p_fn,
      headers := private.edge_webhook_headers(v_key),
      body := p_payload
    );
  EXCEPTION WHEN OTHERS THEN
    NULL; -- Notification failures must not roll back the originating write.
  END;
END;
$$;

-- These outer wrappers must also be closed; otherwise they bypass the inner ACL.
CREATE OR REPLACE FUNCTION public.call_notify_research_adopted(payload jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  PERFORM public.call_lifecycle_edge_function('notify-research-adopted', payload);
END;
$$;
CREATE OR REPLACE FUNCTION public.run_dormant_reengage_batch()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  PERFORM public.call_lifecycle_edge_function('notify-dormant-reengage', '{}'::jsonb);
END;
$$;
CREATE OR REPLACE FUNCTION public.run_weekly_digest_batch()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  PERFORM public.call_lifecycle_edge_function('notify-weekly-digest', '{}'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.call_lifecycle_edge_function(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.call_send_push(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.call_notify_survey_request(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.call_notify_research_adopted(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.run_dormant_reengage_batch() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.run_weekly_digest_batch() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.run_ai_anomaly_check() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.call_lifecycle_edge_function(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.call_send_push(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.call_notify_survey_request(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.call_notify_research_adopted(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.run_dormant_reengage_batch() TO service_role;
GRANT EXECUTE ON FUNCTION public.run_weekly_digest_batch() TO service_role;
GRANT EXECUTE ON FUNCTION public.run_ai_anomaly_check() TO service_role;

-- Keep the existing JSON contract; a missing app_metadata.role must fail closed.
CREATE OR REPLACE FUNCTION public.get_ai_cost_summary(p_days int DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_is_admin boolean;
  v_since timestamptz;
  v_result jsonb;
BEGIN
  v_is_admin := (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin';
  IF v_is_admin IS NOT TRUE THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  v_since := now() - make_interval(days => p_days);
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
        FROM public.ai_call_logs WHERE created_at >= v_since GROUP BY function_name
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
        FROM public.ai_call_logs WHERE created_at >= v_since GROUP BY model
      ) t
    ),
    'daily', (
      SELECT COALESCE(jsonb_agg(row_to_json(d)), '[]'::jsonb)
      FROM (
        SELECT date_trunc('day', created_at)::date AS date,
          COUNT(*) AS calls,
          COALESCE(SUM(input_tokens), 0) AS input_tokens,
          COALESCE(SUM(output_tokens), 0) AS output_tokens
        FROM public.ai_call_logs WHERE created_at >= v_since
        GROUP BY 1 ORDER BY 1
      ) d
    )
  ) INTO v_result
  FROM public.ai_call_logs WHERE created_at >= v_since;
  RETURN v_result;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_ai_cost_summary(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ai_cost_summary(integer) TO authenticated, service_role;

COMMIT;
