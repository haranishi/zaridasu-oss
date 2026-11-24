-- REQ-154: 管理ダッシュボードの集計（種別 / 情報種別 / 月次 / 市区町村）を Postgres 側に集約する RPC。
-- 旧実装は filteredPosts('species, info_type, municipality, created_at') でレンジ内の全投稿行を
-- クライアントへ転送し JS でループ集計していたため、投稿数に比例して egress とクライアント負荷が増大していた。
-- 本 RPC は GROUP BY で集約済みの結果のみを返し、転送量を「種別数 + 情報種別数 + 月数 + 市区町村数」に抑える。
--
-- SECURITY INVOKER により RLS を尊重する。useAdminStats は status フィルタを持たず全ステータスを集計対象に
-- するが、これは「管理者は全投稿を SELECT 可能」という既存 RLS に依存している（非管理者が呼ぶと approved のみ
-- 集計される — 旧クライアント実装と同一の可視範囲であり、情報漏洩は発生しない）。
--
-- 件数ウィンドウは旧 filteredPosts の `gte(from)` / `lte(to + 1日)` セマンティクスに合わせ、
-- [v_from, v_to + 1日) の半開区間とする。月次バケットは v_from〜v_to のカレンダー月で zero-fill する。

CREATE OR REPLACE FUNCTION public.get_admin_post_stats(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_max_months integer DEFAULT 12
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  v_to        timestamptz := coalesce(p_to, now());
  v_from      timestamptz := coalesce(p_from, date_trunc('month', v_to) - (p_max_months - 1) * interval '1 month');
  v_to_excl   timestamptz := v_to + interval '1 day';
  v_month_start timestamptz := date_trunc('month', v_from);
  v_month_end   timestamptz := date_trunc('month', v_to);
BEGIN
  SELECT jsonb_build_object(
    'species_counts', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('species', species, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb)
      FROM (
        SELECT species, count(*) AS cnt
        FROM posts
        WHERE created_at >= v_from AND created_at < v_to_excl
        GROUP BY species
      ) s
    ),
    'info_type_counts', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('info_type', info_type, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb)
      FROM (
        SELECT info_type, count(*) AS cnt
        FROM posts
        WHERE created_at >= v_from AND created_at < v_to_excl
        GROUP BY info_type
      ) i
    ),
    'municipality_counts', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('municipality', municipality, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb)
      FROM (
        SELECT municipality, count(*) AS cnt
        FROM posts
        WHERE created_at >= v_from AND created_at < v_to_excl AND municipality IS NOT NULL
        GROUP BY municipality
      ) m
    ),
    'monthly', (
      SELECT coalesce(jsonb_agg(
               jsonb_build_object('month', to_char(g.m, 'YYYY-MM-DD'), 'count', coalesce(mc.cnt, 0))
               ORDER BY g.m
             ), '[]'::jsonb)
      FROM generate_series(v_month_start, v_month_end, interval '1 month') AS g(m)
      LEFT JOIN (
        SELECT date_trunc('month', created_at) AS mon, count(*) AS cnt
        FROM posts
        WHERE created_at >= v_from AND created_at < v_to_excl
        GROUP BY 1
      ) mc ON mc.mon = g.m
    )
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_post_stats(timestamptz, timestamptz, integer) TO authenticated;

COMMENT ON FUNCTION public.get_admin_post_stats(timestamptz, timestamptz, integer) IS
  'REQ-154: 管理ダッシュボードの種別/情報種別/月次/市区町村集計を返す RPC。SECURITY INVOKER で RLS を尊重。';
