-- REQ-136: posts.protect_post_status を REQ-034 / REQ-079 以降に増えた管理カラムへ拡張
--
-- 背景:
--   schema.sql 側で REQ-034 として is_official / is_flagged / reporter_ip / ai_result /
--   ai_analyzed_at を OLD 固定していたが、20260424000001 の `CREATE OR REPLACE` で
--   これらの代入が落ち、20260425000001 で audio_duration_ms までは保護されたものの
--   それ以降に追加された ai_failure_count / audio_url / weather / temperature / humidity /
--   survey_request_id / survey_duration_minutes / user_id が無保護のまま残っていた。
--   本 migration で 20 列すべてを OLD 固定する形に集約し、以後の migration drift を防ぐ。
--   admin / service_role は従来通り素通り。

BEGIN;

CREATE OR REPLACE FUNCTION protect_post_status() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  jwt_claims jsonb;
BEGIN
  BEGIN
    jwt_claims := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb;
  EXCEPTION WHEN OTHERS THEN
    RETURN NEW;
  END;

  -- JWT なし or service_role は素通り（Edge Function の自動承認・hash 書込み）
  IF jwt_claims IS NULL OR jwt_claims = '{}'::jsonb THEN RETURN NEW; END IF;
  IF (jwt_claims ->> 'role') = 'service_role' THEN RETURN NEW; END IF;

  -- 一般ユーザー (= 非 admin) は以下の管理系カラムを OLD 固定
  IF (jwt_claims -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'admin' THEN
    -- status 系 (REQ-034)
    NEW.status                  := OLD.status;
    NEW.rejection_reason        := OLD.rejection_reason;
    NEW.rejection_message       := OLD.rejection_message;
    NEW.reviewed_at             := OLD.reviewed_at;
    NEW.reviewed_by             := OLD.reviewed_by;
    NEW.auto_approved           := OLD.auto_approved;

    -- 運用制御 (REQ-034 / REQ-136)
    NEW.is_official             := OLD.is_official;
    NEW.is_flagged              := OLD.is_flagged;
    NEW.reporter_ip             := OLD.reporter_ip;

    -- AI 関連 (REQ-034 / REQ-125 / REQ-128 / REQ-136)
    NEW.ai_result               := OLD.ai_result;
    NEW.ai_analyzed_at          := OLD.ai_analyzed_at;
    NEW.ai_failure_count        := OLD.ai_failure_count;

    -- hash 改竄禁止 (REQ-079)
    NEW.audio_hash              := OLD.audio_hash;
    NEW.image_hashes            := OLD.image_hashes;

    -- 音声 (REQ-070 / REQ-082 / REQ-083 / REQ-136)
    NEW.audio_url               := OLD.audio_url;
    NEW.audio_duration_ms       := OLD.audio_duration_ms;

    -- 気象 (REQ-051 系 / REQ-136)
    NEW.weather                 := OLD.weather;
    NEW.temperature             := OLD.temperature;
    NEW.humidity                := OLD.humidity;

    -- 調査依頼 (REQ-084 系 / REQ-136)
    NEW.survey_request_id       := OLD.survey_request_id;
    NEW.survey_duration_minutes := OLD.survey_duration_minutes;

    -- 所有権 (二重防御。policy でも守られるがトリガー側でも明示)
    NEW.user_id                 := OLD.user_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_post_status ON posts;
CREATE TRIGGER enforce_post_status
  BEFORE UPDATE ON posts FOR EACH ROW EXECUTE FUNCTION protect_post_status();

COMMENT ON FUNCTION protect_post_status() IS
  'REQ-034 / REQ-079 / REQ-083 / REQ-136: 一般ユーザー UPDATE 時、status/運用制御/AI/hash/音声/気象/調査/所有権カラムを OLD に固定。admin / service_role は素通り。';

COMMIT;
