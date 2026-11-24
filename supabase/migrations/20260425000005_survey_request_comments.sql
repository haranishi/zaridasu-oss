-- REQ-089 Phase 5: 調査依頼への直接コメント。既存 posts 経由のコメントとは別テーブル。
-- 統合表示は survey_request_timeline view で行う。

CREATE TABLE IF NOT EXISTS public.survey_request_comments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  uuid NOT NULL REFERENCES public.survey_requests(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body        text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  created_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);

CREATE INDEX IF NOT EXISTS idx_request_comments_request
  ON public.survey_request_comments (request_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_request_comments_user
  ON public.survey_request_comments (user_id);

ALTER TABLE public.survey_request_comments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "public_select_request_comments" ON public.survey_request_comments
    FOR SELECT USING (deleted_at IS NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "user_insert_request_comment" ON public.survey_request_comments
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 直接 UPDATE/DELETE は禁止。soft delete は RPC 経由のみ
-- closed への投稿禁止（BEFORE INSERT トリガー）
CREATE OR REPLACE FUNCTION public.block_comment_to_closed()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s text;
BEGIN
  SELECT status INTO s FROM public.survey_requests WHERE id = NEW.request_id;
  IF s = 'closed' THEN
    RAISE EXCEPTION 'クローズ済みの依頼にはコメントできません' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS request_comments_closed_guard ON public.survey_request_comments;
CREATE TRIGGER request_comments_closed_guard
  BEFORE INSERT ON public.survey_request_comments
  FOR EACH ROW EXECUTE FUNCTION public.block_comment_to_closed();

-- レート制限（24h で 30 件、admin バイパス）
CREATE OR REPLACE FUNCTION public.check_request_comment_rate_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role text;
  v_count int;
BEGIN
  v_role := COALESCE(current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role', '');
  IF v_role = 'admin' THEN RETURN NEW; END IF;
  SELECT COUNT(*) INTO v_count FROM public.survey_request_comments
    WHERE user_id = NEW.user_id AND created_at > now() - interval '24 hours';
  IF v_count >= 30 THEN
    RAISE EXCEPTION '24時間以内のコメント上限（30件）に達しました' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS request_comments_rate_limit ON public.survey_request_comments;
CREATE TRIGGER request_comments_rate_limit
  BEFORE INSERT ON public.survey_request_comments
  FOR EACH ROW EXECUTE FUNCTION public.check_request_comment_rate_limit();

-- ソフトデリート RPC
CREATE OR REPLACE FUNCTION public.soft_delete_request_comment(comment_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.survey_request_comments
    SET deleted_at = now()
    WHERE id = comment_id AND user_id = auth.uid() AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION '権限がありません' USING ERRCODE = '42501'; END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.soft_delete_request_comment(uuid) TO authenticated;

-- 統合タイムライン view（依頼コメント + 関連結果投稿コメント）
CREATE OR REPLACE VIEW public.survey_request_timeline
WITH (security_invoker = true) AS
SELECT
  'request_comment'::text AS source,
  src.request_id,
  src.user_id,
  src.body,
  src.created_at,
  NULL::uuid AS post_id,
  src.id AS source_id
FROM public.survey_request_comments src
WHERE src.deleted_at IS NULL

UNION ALL

SELECT
  'post_comment'::text AS source,
  p.survey_request_id AS request_id,
  c.user_id,
  c.content AS body,
  c.created_at,
  c.post_id,
  c.id AS source_id
FROM public.comments c
JOIN public.posts p ON p.id = c.post_id
WHERE p.survey_request_id IS NOT NULL;

ALTER VIEW public.survey_request_timeline SET (security_invoker = true);

GRANT SELECT ON public.survey_request_timeline TO authenticated, anon;

COMMENT ON TABLE public.survey_request_comments IS
  'REQ-089: 調査依頼への直接コメント。posts 経由とは別テーブル。';
COMMENT ON VIEW public.survey_request_timeline IS
  'REQ-089: 依頼直接コメントと関連 posts コメントの統合タイムライン。';

-- コメント INSERT 通知（REQ-088 連携）
CREATE OR REPLACE FUNCTION public.trg_notify_request_comment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.call_notify_survey_request(jsonb_build_object(
    'event_type', 'comment_created',
    'request_id', NEW.request_id,
    'user_id', NEW.user_id,
    'comment_id', NEW.id
  ));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_request_comment ON public.survey_request_comments;
CREATE TRIGGER notify_request_comment
  AFTER INSERT ON public.survey_request_comments
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_request_comment();
