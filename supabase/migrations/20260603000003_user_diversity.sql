-- REQ-171: 「発見の多様性」集計 RPC
-- Bonter et al. 2023: 継続率は報告種/発見の多様性と正の相関、記録個体数（量）とは無相関。
-- 投稿数競争（get_user_ranking）に代えて、情報種類 × 種 × 市区町村のカバレッジを返す。
-- 既存 get_user_ranking と同じく is_public=true のみ・SECURITY DEFINER・anon/authenticated GRANT。

CREATE OR REPLACE FUNCTION get_user_diversity(p_limit INTEGER DEFAULT 50, p_offset INTEGER DEFAULT 0)
RETURNS TABLE (
  user_id UUID,
  display_name TEXT,
  avatar_emoji TEXT,
  info_type_coverage INTEGER,  -- 報告した info_type の種類数（最大5）
  species_count INTEGER,        -- distinct species
  municipality_count INTEGER,   -- distinct municipality
  diversity_score INTEGER       -- 並べ替え用の合成スコア
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  WITH d AS (
    SELECT p.user_id,
      COUNT(DISTINCT p.info_type)::int AS info_type_coverage,
      COUNT(DISTINCT p.species)::int   AS species_count,
      COUNT(DISTINCT p.municipality) FILTER (WHERE p.municipality IS NOT NULL)::int AS municipality_count
    FROM posts p
    WHERE p.status = 'approved' AND p.user_id IS NOT NULL
    GROUP BY p.user_id
  )
  SELECT d.user_id,
    COALESCE(up.display_name, '名無し調査員')::text,
    COALESCE(up.avatar_emoji, '🦞')::text,
    d.info_type_coverage, d.species_count, d.municipality_count,
    (d.info_type_coverage + d.species_count + d.municipality_count)::int AS diversity_score
  FROM d JOIN user_profiles up ON up.id = d.user_id AND up.is_public = true
  ORDER BY d.info_type_coverage DESC, d.municipality_count DESC, d.species_count DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_user_diversity(INTEGER, INTEGER) TO authenticated, anon;
COMMENT ON FUNCTION public.get_user_diversity(INTEGER, INTEGER) IS
  'REQ-171: 発見の多様性（情報種類/種/市区町村カバレッジ）を返す。投稿数競争に代わるエンゲージ指標（Bonter 2023）。';
