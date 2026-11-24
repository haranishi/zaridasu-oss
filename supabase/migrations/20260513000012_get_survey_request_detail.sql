-- REQ-157: 調査依頼詳細の取得を 1 往復に統合する RPC。
-- 旧 useSurveyRequest は survey_requests → user_profiles → posts を 3 本の逐次クエリで取得しており、
-- ラウンドトリップが直列に積み上がっていた（survey_requests と user_profiles に FK が無いのが分離の理由）。
-- 本 RPC は本体・投稿者プロフィール・関連投稿（承認済み最大 10 件）を 1 回で返す。
--
-- SECURITY INVOKER により RLS を真の防衛線として維持する：
--   - survey_requests: 公開 SELECT ポリシー（USING true）
--   - user_profiles  : is_public=true または本人のみ（非公開なら user_profiles は null になり旧挙動と一致）
--   - posts          : approved の閲覧ポリシー
-- いずれも RPC 内部クエリに適用され、embed/RPC が RLS をバイパスしないことを保証する。

CREATE OR REPLACE FUNCTION public.get_survey_request_detail(p_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'request', to_jsonb(sr) || jsonb_build_object(
      'user_profiles', (
        SELECT jsonb_build_object('display_name', up.display_name, 'avatar_emoji', up.avatar_emoji)
        FROM user_profiles up
        WHERE up.id = sr.user_id
      )
    ),
    'related_posts', (
      SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.created_at DESC), '[]'::jsonb)
      FROM (
        SELECT id, created_at, species, info_type, municipality, comment, photos, user_id, lat, lng
        FROM posts
        WHERE survey_request_id = p_id AND status = 'approved'
        ORDER BY created_at DESC
        LIMIT 10
      ) p
    )
  )
  FROM (
    SELECT id, user_id, lat, lng, municipality, species, reason, urgency, status, created_at, closed_at, response_count
    FROM survey_requests
    WHERE id = p_id
  ) sr;
$$;

GRANT EXECUTE ON FUNCTION public.get_survey_request_detail(uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.get_survey_request_detail(uuid) IS
  'REQ-157: 調査依頼詳細（本体+投稿者プロフィール+関連投稿）を 1 往復で返す RPC。SECURITY INVOKER で RLS を尊重。';
