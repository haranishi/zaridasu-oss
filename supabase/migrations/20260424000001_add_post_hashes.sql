-- REQ-079 Phase 4: hash dedup 用に audio_hash / image_hashes カラムを追加。
-- 既存投稿は NULL 許容で後方互換。SHA-256 の hex 64 文字のみ許可。

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS audio_hash text,
  ADD COLUMN IF NOT EXISTS image_hashes text[];

-- hex 64 文字の CHECK 制約（NULL は許容）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'posts_audio_hash_format'
  ) THEN
    ALTER TABLE public.posts
      ADD CONSTRAINT posts_audio_hash_format
      CHECK (audio_hash IS NULL OR audio_hash ~ '^[a-f0-9]{64}$');
  END IF;
END$$;

-- CHECK 制約内でサブクエリ (unnest) は使えないため、IMMUTABLE 関数に包んで適用する。
CREATE OR REPLACE FUNCTION public._is_valid_sha256_hex_array(arr text[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT arr IS NULL OR (
    array_position(arr, NULL::text) IS NULL
    AND NOT EXISTS (SELECT 1 FROM unnest(arr) AS h(v) WHERE h.v !~ '^[a-f0-9]{64}$')
  )
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'posts_image_hashes_format'
  ) THEN
    ALTER TABLE public.posts
      ADD CONSTRAINT posts_image_hashes_format
      CHECK (public._is_valid_sha256_hex_array(image_hashes));
  END IF;
END$$;

-- dedup 検索高速化
CREATE INDEX IF NOT EXISTS idx_posts_audio_hash
  ON public.posts (audio_hash) WHERE audio_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_posts_image_hashes_gin
  ON public.posts USING gin (image_hashes) WHERE image_hashes IS NOT NULL;

COMMENT ON COLUMN public.posts.audio_hash IS
  'REQ-079: 音声 SHA-256 (hex)。AI 判定 dedup に使用。NULL=計算失敗 or 既存データ。';
COMMENT ON COLUMN public.posts.image_hashes IS
  'REQ-079: 画像 SHA-256 (hex) 配列。posts.photos と同順。';

-- protect_post_status を拡張して audio_hash / image_hashes を管理者以外の UPDATE で保護
-- REQ-034 の拡張: user が直接 hash を書き換えて dedup を悪用するのを防ぐ
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
    -- REQ-079: user による hash 改竄を禁止（INSERT 時のみ設定可能）
    NEW.audio_hash        := OLD.audio_hash;
    NEW.image_hashes      := OLD.image_hashes;
  END IF;
  RETURN NEW;
END;
$$;
