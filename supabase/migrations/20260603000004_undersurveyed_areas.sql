-- REQ-173: 空間バイアス補正ナッジ
-- Callaghan et al. 2023（FrogID RCT）: 過少観測エリアへユーザーを誘導すると訪問率が大幅に向上。
-- 直近 p_days 日間の approved 投稿の市区町村別件数を返す。クライアントが全市区町村リスト
-- （MUNICIPALITIES）と突合し、件数の少ない/ゼロのエリアを「優先調査エリア」として提示する。
-- SECURITY INVOKER で RLS を尊重（anon は approved のみ可視＝既存挙動と一致）。

CREATE OR REPLACE FUNCTION public.get_undersurveyed_areas(p_days integer DEFAULT 90)
RETURNS TABLE (municipality text, recent_count bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT municipality, count(*)::bigint AS recent_count
  FROM posts
  WHERE status = 'approved'
    AND municipality IS NOT NULL
    AND created_at >= now() - make_interval(days => p_days)
  GROUP BY municipality;
$$;
GRANT EXECUTE ON FUNCTION public.get_undersurveyed_areas(integer) TO anon, authenticated;
COMMENT ON FUNCTION public.get_undersurveyed_areas(integer) IS
  'REQ-173: 直近 p_days 日の市区町村別 approved 投稿数。クライアントで全市区町村と突合し過少観測エリアを抽出する。';
