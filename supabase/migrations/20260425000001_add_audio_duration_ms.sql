-- REQ-083: posts.audio_duration_ms を追加。
-- 録音時にクライアントで取得した duration をそのまま保存し、UI 表示はこの値を優先する。
-- file メタデータ依存をやめることで native <audio>.duration の不安定さに左右されない描画が可能に。

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS audio_duration_ms int;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'posts_audio_duration_range'
  ) THEN
    ALTER TABLE public.posts
      ADD CONSTRAINT posts_audio_duration_range
      CHECK (audio_duration_ms IS NULL OR (audio_duration_ms >= 0 AND audio_duration_ms <= 60000));
  END IF;
END$$;

COMMENT ON COLUMN public.posts.audio_duration_ms IS
  'REQ-083: 録音時に算出した音声長 (ms)。UI の duration 表示に使用。';

-- column-protection trigger 拡張: user 直接編集を禁止（INSERT のみ許可）
CREATE OR REPLACE FUNCTION protect_post_status() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  jwt_claims jsonb;
BEGIN
  BEGIN
    jwt_claims := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb;
  EXCEPTION WHEN OTHERS THEN
    RETURN NEW;
  END;

  IF jwt_claims IS NULL OR jwt_claims = '{}'::jsonb THEN RETURN NEW; END IF;
  IF (jwt_claims ->> 'role') = 'service_role' THEN RETURN NEW; END IF;
  IF (jwt_claims -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'admin' THEN
    NEW.status            := OLD.status;
    NEW.rejection_reason  := OLD.rejection_reason;
    NEW.rejection_message := OLD.rejection_message;
    NEW.reviewed_at       := OLD.reviewed_at;
    NEW.reviewed_by       := OLD.reviewed_by;
    NEW.auto_approved     := OLD.auto_approved;
    -- REQ-079: hash 改竄禁止
    NEW.audio_hash        := OLD.audio_hash;
    NEW.image_hashes      := OLD.image_hashes;
    -- REQ-083: duration 改竄禁止
    NEW.audio_duration_ms := OLD.audio_duration_ms;
  END IF;
  RETURN NEW;
END;
$$;
