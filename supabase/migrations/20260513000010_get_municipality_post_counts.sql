-- REQ-143: /area の市区町村別投稿数集計を Postgres 側に移し、ネットワーク転送量と
-- アプリ側ループを削減する。RLS を尊重するため SECURITY INVOKER で実装する。
-- 既存の anon SELECT ポリシー（approved 行）と整合する前提。

CREATE OR REPLACE FUNCTION public.get_municipality_post_counts()
RETURNS TABLE (municipality text, post_count bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT municipality, count(*)::bigint AS post_count
  FROM posts
  WHERE status = 'approved' AND municipality IS NOT NULL
  GROUP BY municipality
  ORDER BY post_count DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_municipality_post_counts() TO anon, authenticated;

COMMENT ON FUNCTION public.get_municipality_post_counts() IS
  'REQ-143: approved 投稿の市区町村別件数を集計して返す RPC。SECURITY INVOKER で RLS を尊重する。';

-- approved + municipality NOT NULL に最適化した部分インデックス。
-- 既存 idx_posts_municipality / idx_posts_status は単独カラム索引であり、
-- approved 集計クエリでは Index Scan が使えても WHERE 句評価が残る。
-- 本部分インデックスは行数を絞り込んだ上で municipality を直接持つため、
-- GROUP BY の Index Only Scan を狙える。
CREATE INDEX IF NOT EXISTS idx_posts_approved_municipality
  ON public.posts (municipality)
  WHERE status = 'approved' AND municipality IS NOT NULL;
