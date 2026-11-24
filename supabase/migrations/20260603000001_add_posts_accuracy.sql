-- REQ-172: GPS 位置精度（accuracy）の保存
-- posts に水平位置精度（m）列を追加する。NULL=手動地図選択（測位なし）。
-- 種分布モデリング（SDM）では 30m 以下が最低要件（Grady et al. 2026）。
-- 冪等に再適用可能（ADD COLUMN IF NOT EXISTS / DROP CONSTRAINT IF EXISTS / CREATE OR REPLACE）。

ALTER TABLE posts ADD COLUMN IF NOT EXISTS accuracy DECIMAL(7,1);
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_accuracy_nonneg;
ALTER TABLE posts ADD CONSTRAINT posts_accuracy_nonneg CHECK (accuracy IS NULL OR accuracy >= 0);
COMMENT ON COLUMN posts.accuracy IS 'REQ-172: GPS 水平位置精度（m）。NULL=手動地図選択（測位なし）。SDM では 30m 以下が最低要件';

-- protect_post_status: 一般ユーザーの UPDATE で accuracy を OLD 固定（INSERT 時は本人の測位として許容）。
-- schema.sql の統合版定義に accuracy 固定を追記した版に合わせて CREATE OR REPLACE する。
CREATE OR REPLACE FUNCTION protect_post_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  jwt_claims jsonb;
BEGIN
  BEGIN
    jwt_claims := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb;
  EXCEPTION WHEN OTHERS THEN
    RETURN NEW;
  END;

  IF jwt_claims IS NULL OR jwt_claims = '{}'::jsonb THEN
    RETURN NEW;
  END IF;
  IF (jwt_claims ->> 'role') = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF (jwt_claims -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'admin' THEN
    NEW.status                  := OLD.status;
    NEW.rejection_reason        := OLD.rejection_reason;
    NEW.rejection_message       := OLD.rejection_message;
    NEW.reviewed_at             := OLD.reviewed_at;
    NEW.reviewed_by             := OLD.reviewed_by;
    NEW.auto_approved           := OLD.auto_approved;
    NEW.is_official             := OLD.is_official;
    NEW.is_flagged              := OLD.is_flagged;
    NEW.reporter_ip             := OLD.reporter_ip;
    NEW.ai_result               := OLD.ai_result;
    NEW.ai_analyzed_at          := OLD.ai_analyzed_at;
    NEW.ai_failure_count        := OLD.ai_failure_count;
    NEW.audio_hash              := OLD.audio_hash;
    NEW.image_hashes            := OLD.image_hashes;
    NEW.audio_url               := OLD.audio_url;
    NEW.audio_duration_ms       := OLD.audio_duration_ms;
    NEW.weather                 := OLD.weather;
    NEW.temperature             := OLD.temperature;
    NEW.humidity                := OLD.humidity;
    NEW.accuracy                := OLD.accuracy;
    NEW.survey_request_id       := OLD.survey_request_id;
    NEW.survey_duration_minutes := OLD.survey_duration_minutes;
    NEW.user_id                 := OLD.user_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_post_status ON posts;
CREATE TRIGGER enforce_post_status
  BEFORE UPDATE ON posts FOR EACH ROW EXECUTE FUNCTION protect_post_status();
