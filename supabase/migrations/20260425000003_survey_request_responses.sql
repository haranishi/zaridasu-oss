-- REQ-087 Phase 3: 「協力する」軽量応答機能のためのテーブルとトリガー。
-- 既存 survey_requests.response_count は集計キャッシュとして同期する。

CREATE TABLE IF NOT EXISTS public.survey_request_responses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  uuid NOT NULL REFERENCES public.survey_requests(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_responses_request ON public.survey_request_responses (request_id);
CREATE INDEX IF NOT EXISTS idx_responses_user ON public.survey_request_responses (user_id);

ALTER TABLE public.survey_request_responses ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "public_select_responses" ON public.survey_request_responses
    FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "user_insert_own_response" ON public.survey_request_responses
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "user_delete_own_response" ON public.survey_request_responses
    FOR DELETE TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- response_count 同期トリガー
CREATE OR REPLACE FUNCTION public.sync_survey_response_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE public.survey_requests SET response_count = response_count + 1
      WHERE id = NEW.request_id;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE public.survey_requests SET response_count = GREATEST(response_count - 1, 0)
      WHERE id = OLD.request_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS survey_responses_count_sync ON public.survey_request_responses;
CREATE TRIGGER survey_responses_count_sync
  AFTER INSERT OR DELETE ON public.survey_request_responses
  FOR EACH ROW EXECUTE FUNCTION public.sync_survey_response_count();

-- closed 依頼への応答禁止
CREATE OR REPLACE FUNCTION public.block_response_to_closed()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s text;
BEGIN
  SELECT status INTO s FROM public.survey_requests WHERE id = NEW.request_id;
  IF s = 'closed' THEN
    RAISE EXCEPTION 'クローズ済みの依頼には応答できません' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS survey_responses_closed_guard ON public.survey_request_responses;
CREATE TRIGGER survey_responses_closed_guard
  BEFORE INSERT ON public.survey_request_responses
  FOR EACH ROW EXECUTE FUNCTION public.block_response_to_closed();

-- 応答レート制限（24h で 20 件まで、admin バイパス）
CREATE OR REPLACE FUNCTION public.check_survey_response_rate_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role text;
  v_count int;
BEGIN
  v_role := COALESCE(current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role', '');
  IF v_role = 'admin' THEN RETURN NEW; END IF;
  SELECT COUNT(*) INTO v_count FROM public.survey_request_responses
    WHERE user_id = NEW.user_id AND created_at > now() - interval '24 hours';
  IF v_count >= 20 THEN
    RAISE EXCEPTION '24時間以内の応答上限（20件）に達しました' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS survey_responses_rate_limit ON public.survey_request_responses;
CREATE TRIGGER survey_responses_rate_limit
  BEFORE INSERT ON public.survey_request_responses
  FOR EACH ROW EXECUTE FUNCTION public.check_survey_response_rate_limit();

COMMENT ON TABLE public.survey_request_responses IS
  'REQ-087: 調査依頼への軽量「協力する」応答。同一 user × request はユニーク。';
