-- REQ-088 Phase 4: 通知のための user_profiles 拡張と Webhook トリガーの土台。
-- 実通知配信は Edge Function notify-survey-request が担う（Resend 経由）。
-- 本マイグレーションは「カラム追加 + Webhook 起動関数」のみ。

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS notify_survey_request boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_response_digest boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.user_profiles.notify_survey_request IS
  'REQ-088: 新規依頼/結果投稿/クローズ通知の opt-in フラグ';
COMMENT ON COLUMN public.user_profiles.notify_response_digest IS
  'REQ-088: 応答ダイジェスト通知の opt-in フラグ';

-- 通知 Webhook 起動関数（pg_net + Edge Function）
-- 既存 private.call_ai_edge_function (REQ-073) と同パターン
CREATE OR REPLACE FUNCTION public.call_notify_survey_request(payload jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_url text;
  v_key text;
BEGIN
  -- pg_net が使える環境のみ実行。env vault 未設定なら no-op
  BEGIN
    SELECT decrypted_secret INTO v_key
      FROM vault.decrypted_secrets WHERE name = 'edge_function_service_role_key' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    RETURN;
  END;
  IF v_key IS NULL THEN RETURN; END IF;

  v_url := current_setting('app.settings.supabase_url', true);
  IF v_url IS NULL OR v_url = '' THEN
    v_url := 'https://project-not-configured.invalid';
  END IF;

  PERFORM net.http_post(
    url := v_url || '/functions/v1/notify-survey-request',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := payload
  );
EXCEPTION WHEN OTHERS THEN
  -- 通知失敗は本処理を止めない
  NULL;
END;
$$;

-- 新規依頼 INSERT 時の通知
CREATE OR REPLACE FUNCTION public.trg_notify_new_survey_request()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.call_notify_survey_request(jsonb_build_object(
    'event_type', 'request_created',
    'request_id', NEW.id,
    'user_id', NEW.user_id,
    'municipality', NEW.municipality,
    'species', NEW.species,
    'urgency', NEW.urgency
  ));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_new_survey_request ON public.survey_requests;
CREATE TRIGGER notify_new_survey_request
  AFTER INSERT ON public.survey_requests
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_new_survey_request();

-- status 遷移通知（open → responded / * → closed）
CREATE OR REPLACE FUNCTION public.trg_notify_survey_request_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status = 'open' AND NEW.status = 'responded' THEN
      PERFORM public.call_notify_survey_request(jsonb_build_object(
        'event_type', 'request_responded',
        'request_id', NEW.id,
        'user_id', NEW.user_id
      ));
    ELSIF NEW.status = 'closed' THEN
      PERFORM public.call_notify_survey_request(jsonb_build_object(
        'event_type', 'request_closed',
        'request_id', NEW.id,
        'user_id', NEW.user_id
      ));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_survey_request_status ON public.survey_requests;
CREATE TRIGGER notify_survey_request_status
  AFTER UPDATE OF status ON public.survey_requests
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_survey_request_status();
