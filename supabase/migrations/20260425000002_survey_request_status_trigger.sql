-- REQ-086 Phase 2: posts への survey_request_id 紐付き INSERT で
-- 親 survey_request の status を 'open' → 'responded' に自動遷移する。
-- closed は変更しない（巻き戻し禁止）。

CREATE OR REPLACE FUNCTION public.mark_survey_request_responded()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.survey_request_id IS NOT NULL THEN
    UPDATE public.survey_requests
      SET status = 'responded'
      WHERE id = NEW.survey_request_id
        AND status = 'open';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS posts_mark_survey_responded ON public.posts;
CREATE TRIGGER posts_mark_survey_responded
  AFTER INSERT ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.mark_survey_request_responded();

-- バックフィル: 既に紐付け済みだが open のままの依頼を responded に
UPDATE public.survey_requests sr
  SET status = 'responded'
  WHERE sr.status = 'open'
    AND EXISTS (SELECT 1 FROM public.posts p WHERE p.survey_request_id = sr.id);
