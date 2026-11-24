-- REQ-208: survey_requests の列固定トリガーを追加（posts.protect_post_status と同設計の多層防御）。
--
-- 背景:
--   survey_requests は行レベルの所有者判定 (survey_requests_owner_update) だけで、posts のような
--   BEFORE UPDATE 列固定トリガーが無く、所有者が response_count（集計キャッシュ）や status /
--   created_at / user_id を直接改竄できた。response_count は survey_request_responses の
--   INSERT/DELETE で sync_survey_response_count() が同期する集計値であり、トリガーを唯一の
--   更新者とすべきだが、列保護が無いため `UPDATE survey_requests SET response_count = 9999`
--   のような水増しが可能だった（影響は自分の依頼カードの表示に限定だが集計整合性が崩れる）。
--
-- 方針（posts のトリガー族と統一）:
--   - service_role / admin は素通り（バックエンド鍵・管理者運用）。
--   - JWT 無し / 空 claims / claims パース失敗も素通り（protect_post_status と同じ判定順）。
--   - 他トリガーからのカスケード更新（pg_trigger_depth() > 1）は素通り。
--     sync_survey_response_count（response_count 同期）と mark_survey_request_responded
--     （status='responded' 自動遷移）は AFTER トリガー内の UPDATE で、呼び出し元 JWT
--     （一般ユーザー）のまま survey_requests を更新するため、深さで内部更新を許可して
--     「response_count の唯一の更新者は集計トリガー」を担保する。直接 UPDATE は深さ 1。
--   - 一般所有者の直接 UPDATE では: user_id / created_at / response_count / lat / lng /
--     municipality / species / reason / urgency を OLD 固定。status はクローズ（'closed'）のみ
--     許可し、それ以外への変更は OLD に戻す。closed_at は設定可（クローズ操作の一部）。
--
-- 冪等: CREATE OR REPLACE FUNCTION / DROP TRIGGER IF EXISTS → CREATE TRIGGER。
-- schema.sql 側（protect_survey_request_columns / enforce_survey_request_columns）と同一定義。

BEGIN;

CREATE OR REPLACE FUNCTION protect_survey_request_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  jwt_claims jsonb;
BEGIN
  -- claims のパース失敗は素通り。JWT 無し / 空 claims も素通り（protect_post_status と統一）。
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
  IF (jwt_claims -> 'app_metadata' ->> 'role') = 'admin' THEN
    RETURN NEW;
  END IF;

  -- 他トリガー（集計同期・status 自動遷移）からのカスケード更新は許可。
  -- 一般ユーザーの「直接」UPDATE のみ深さ 1 で到達し、以下の列固定が効く。
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  -- 識別子・作成日時・集計キャッシュ・不変フィールドは OLD 固定
  NEW.user_id        := OLD.user_id;
  NEW.created_at     := OLD.created_at;
  NEW.response_count := OLD.response_count;
  NEW.lat            := OLD.lat;
  NEW.lng            := OLD.lng;
  NEW.municipality   := OLD.municipality;
  NEW.species        := OLD.species;
  NEW.reason         := OLD.reason;
  NEW.urgency        := OLD.urgency;

  -- status はクローズ操作（'closed'）のみ許可。それ以外への変更は OLD に戻す。
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'closed' THEN
    NEW.status := OLD.status;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_survey_request_columns ON survey_requests;
CREATE TRIGGER enforce_survey_request_columns
  BEFORE UPDATE ON survey_requests
  FOR EACH ROW EXECUTE FUNCTION protect_survey_request_columns();

COMMENT ON FUNCTION protect_survey_request_columns() IS
  'REQ-208: 一般所有者の survey_requests UPDATE をクローズ操作のみに制限し、response_count/user_id/created_at 等を OLD 固定。service_role / admin / JWT 無し / カスケード更新(pg_trigger_depth>1)は素通り。';

COMMIT;
