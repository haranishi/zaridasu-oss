-- REQ-032: Dashboard stats aggregation RPC
-- Replaces multiple client-side queries with a single server-side aggregation
-- SECURITY INVOKER ensures RLS policies are respected

CREATE OR REPLACE FUNCTION public.get_dashboard_stats(p_months integer DEFAULT 6)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  result jsonb;
  now_ts timestamptz := now();
  this_month_start timestamptz := date_trunc('month', now_ts);
  last_month_start timestamptz := date_trunc('month', now_ts - interval '1 month');
  monthly_window_start timestamptz := date_trunc('month', now_ts - (p_months - 1) * interval '1 month');
BEGIN
  SELECT jsonb_build_object(
    'total_posts', (
      SELECT count(*)
      FROM posts
      WHERE status = 'approved'
    ),
    'this_month_posts', (
      SELECT count(*)
      FROM posts
      WHERE status = 'approved'
        AND created_at >= this_month_start
    ),
    'last_month_posts', (
      SELECT count(*)
      FROM posts
      WHERE status = 'approved'
        AND created_at >= last_month_start
        AND created_at < this_month_start
    ),
    'species_counts', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('species', species, 'count', cnt)), '[]'::jsonb)
      FROM (
        SELECT species, count(*) AS cnt
        FROM posts
        WHERE status = 'approved'
        GROUP BY species
        ORDER BY cnt DESC
      ) sc
    ),
    'info_type_counts', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('info_type', info_type, 'count', cnt)), '[]'::jsonb)
      FROM (
        SELECT info_type, count(*) AS cnt
        FROM posts
        WHERE status = 'approved'
        GROUP BY info_type
        ORDER BY cnt DESC
      ) itc
    ),
    'monthly_data', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('month', m.month_start, 'count', coalesce(mc.cnt, 0)) ORDER BY m.month_start), '[]'::jsonb)
      FROM (
        SELECT generate_series(
          monthly_window_start,
          this_month_start,
          interval '1 month'
        ) AS month_start
      ) m
      LEFT JOIN (
        SELECT date_trunc('month', created_at) AS month_start, count(*) AS cnt
        FROM posts
        WHERE status = 'approved'
          AND created_at >= monthly_window_start
        GROUP BY date_trunc('month', created_at)
      ) mc ON m.month_start = mc.month_start
    ),
    'municipality_counts', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('municipality', municipality, 'count', cnt)), '[]'::jsonb)
      FROM (
        SELECT municipality, count(*) AS cnt
        FROM posts
        WHERE status = 'approved'
          AND municipality IS NOT NULL
        GROUP BY municipality
        ORDER BY cnt DESC
        LIMIT 10
      ) mrc
    )
  ) INTO result;

  RETURN result;
END;
$$;

-- Grant execute to authenticated and anon roles
GRANT EXECUTE ON FUNCTION public.get_dashboard_stats(integer) TO authenticated, anon;

COMMENT ON FUNCTION public.get_dashboard_stats IS 'REQ-032: Server-side aggregation for dashboard statistics. Returns total counts, species/info_type breakdowns, monthly trends, and municipality rankings in a single call.';
