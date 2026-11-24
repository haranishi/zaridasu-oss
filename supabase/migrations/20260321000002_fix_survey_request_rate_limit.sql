-- ===================================================
-- 調査依頼「permission denied for table users」エラー修正
--
-- 原因: check_survey_request_rate_limit() が auth.users を参照しているが
--       SECURITY DEFINER が付いておらず、authenticated ロールでは
--       auth.users へのアクセス権がないため失敗していた。
-- ===================================================

CREATE OR REPLACE FUNCTION check_survey_request_rate_limit()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT raw_app_meta_data->>'role' FROM auth.users WHERE id = NEW.user_id) = 'admin' THEN
    RETURN NEW;
  END IF;
  IF (
    SELECT COUNT(*) FROM survey_requests
    WHERE user_id = NEW.user_id AND created_at > NOW() - INTERVAL '24 hours'
  ) >= 3 THEN
    RAISE EXCEPTION '調査依頼は1日3件までです';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
