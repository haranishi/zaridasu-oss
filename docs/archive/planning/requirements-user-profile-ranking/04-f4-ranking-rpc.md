### F4: ランキングRPC（DB関数）

```sql
CREATE OR REPLACE FUNCTION get_user_ranking(
  p_limit  INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0,
  p_period TEXT    DEFAULT 'all'  -- 'all', 'month', 'year'
)
RETURNS TABLE (
  rank          BIGINT,
  user_id       UUID,
  display_name  TEXT,
  avatar_emoji  TEXT,
  post_count    BIGINT,
  badge_count   BIGINT,
  total_count   BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
    WITH post_stats AS (
      SELECT
        p.user_id,
        COUNT(*) AS post_count
      FROM posts p
      WHERE p.status = 'approved'
        AND p.user_id IS NOT NULL
        AND (p_period = 'all'
             OR (p_period = 'month' AND p.created_at >= date_trunc('month', now()))
             OR (p_period = 'year'  AND p.created_at >= date_trunc('year', now())))
      GROUP BY p.user_id
    ),
    badge_stats AS (
      SELECT ub.user_id, COUNT(*) AS badge_count
      FROM user_badges ub
      GROUP BY ub.user_id
    )
    SELECT
      ROW_NUMBER() OVER (ORDER BY ps.post_count DESC, bs.badge_count DESC NULLS LAST)::BIGINT AS rank,
      ps.user_id,
      COALESCE(up.display_name, '名無し調査員')::TEXT,
      COALESCE(up.avatar_emoji, '🦞')::TEXT,
      ps.post_count,
      COALESCE(bs.badge_count, 0)::BIGINT,
      COUNT(*) OVER ()::BIGINT AS total_count
    FROM post_stats ps
    JOIN user_profiles up ON up.id = ps.user_id AND up.is_public = true
    LEFT JOIN badge_stats bs ON bs.user_id = ps.user_id
    ORDER BY ps.post_count DESC, bs.badge_count DESC NULLS LAST
    LIMIT p_limit OFFSET p_offset;
END;
$$;
```

