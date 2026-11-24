-- ════════════════════════════════════════════════════════════════════════════
-- REQ-231: 逆ジオコーディングによる地名・水系・水辺フラグの付与
--   （データ品質 + 地名ロングテール SEO の素材供給）
--   schema.sql と同期（REQ-003 / NFR-231-07 方針）。過去 migration は改変しない。
--
-- 本 migration が作るもの:
--   1. posts への地理メタデータ列（全列 NULL 許容・後方互換 / FR-231-01）
--   2. survey_sites への水系・水辺種別列（任意 / FR-231-07）
--   3. geo_cache テーブル（座標グリッド単位の DB 永続キャッシュ / FR-231-04）
--   4. posts INSERT → pg_net → Edge Function enrich-place 非同期起動（FR-231-03）
--
-- 重要な制約（Nominatim Usage Policy / NFR-231-01）:
--   - 1req/秒・識別可能 User-Agent・結果キャッシュ・bulk 禁止は Edge Function 側で担保。
--   - 本 migration は「列・キャッシュ表・非同期トリガー」のみ。外部 API は叩かない。
--   - 付与失敗でも投稿は成立（fail-open）。geo_enriched_at で冪等スキップ（FR-231-03）。
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. posts: 地理メタデータ列（全列 NULL 許容 / FR-231-01・AC-01）
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS locality        TEXT,
  ADD COLUMN IF NOT EXISTS water_body      TEXT,
  ADD COLUMN IF NOT EXISTS is_on_water     BOOLEAN,
  ADD COLUMN IF NOT EXISTS elevation_m     DECIMAL(7,1),
  ADD COLUMN IF NOT EXISTS geo_enriched_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS geo_source      TEXT;

-- geo_source は出典追跡用の enum 相当（database.types.ts の literal union と一致させる / AC-01）。
ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS posts_geo_source_check;
ALTER TABLE public.posts ADD CONSTRAINT posts_geo_source_check
  CHECK (geo_source IS NULL OR geo_source IN ('nominatim','opencage','geoapify','onwater','opentopodata','cache'));

COMMENT ON COLUMN public.posts.locality IS
  'REQ-231: 字・大字・町丁目レベルの地名（Nominatim の suburb/neighbourhood/hamlet/quarter 等）。NULL=未付与/取得不能';
COMMENT ON COLUMN public.posts.water_body IS
  'REQ-231: 近傍水系/河川/湖沼名。NULL=未付与/取得不能';
COMMENT ON COLUMN public.posts.is_on_water IS
  'REQ-231: true=水上 / false=陸上 / NULL=判定不能（OnWater 等）。eDNA 文脈の水辺メタデータ';
COMMENT ON COLUMN public.posts.elevation_m IS
  'REQ-231: 標高（m）。任意。Open Topo Data（CORS 不可のためサーバー側のみ）。NULL=未付与/取得不能';
COMMENT ON COLUMN public.posts.geo_enriched_at IS
  'REQ-231: 地理メタデータ付与日時。冪等スキップ（二重 webhook 配信）に使う';
COMMENT ON COLUMN public.posts.geo_source IS
  'REQ-231: 付与の情報源（nominatim/opencage/geoapify/onwater/opentopodata/cache）。出典追跡・再付与用';

-- 部分インデックス: 付与済みかどうか（再付与バッチ・管理 UI の未付与抽出を安価にする）。
CREATE INDEX IF NOT EXISTS idx_posts_geo_enriched ON public.posts (geo_enriched_at)
  WHERE geo_enriched_at IS NOT NULL;
-- 水辺フラグ別の品質チェック（FR-231-08 の素地）。
CREATE INDEX IF NOT EXISTS idx_posts_is_on_water ON public.posts (is_on_water)
  WHERE is_on_water IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1-b. protect_post_status: 新規地理列を一般ユーザー UPDATE から保護（REQ-179/034 と整合）
--   付与は service_role（Edge Function）が書く列。一般ユーザーが自分で改竄できないよう
--   OLD 固定する。schema.sql の正本 protect_post_status() に追記カラムを足す（NFR-231-07）。
--   service_role / admin は素通り（Edge Function の付与・管理修正を許可）。
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.protect_post_status()
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
    -- 位置精度 (REQ-172)
    NEW.accuracy                := OLD.accuracy;
    -- 調査依頼 (REQ-084 系 / REQ-136)
    NEW.survey_request_id       := OLD.survey_request_id;
    NEW.survey_duration_minutes := OLD.survey_duration_minutes;
    -- 地理メタデータ (REQ-231): server enrichment 専用列。一般ユーザー改竄禁止
    NEW.locality                := OLD.locality;
    NEW.water_body              := OLD.water_body;
    NEW.is_on_water             := OLD.is_on_water;
    NEW.elevation_m             := OLD.elevation_m;
    NEW.geo_enriched_at         := OLD.geo_enriched_at;
    NEW.geo_source              := OLD.geo_source;
    -- 所有権 (二重防御)
    NEW.user_id                 := OLD.user_id;
  END IF;
  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. survey_sites: 水系・水辺種別（任意 / FR-231-07）
--   eDNA・定点反復（REQ-174）の水系メタデータ。最小スコープ（列のみ）。
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.survey_sites
  ADD COLUMN IF NOT EXISTS water_body  TEXT,
  ADD COLUMN IF NOT EXISTS water_type  TEXT;

ALTER TABLE public.survey_sites DROP CONSTRAINT IF EXISTS survey_sites_water_type_check;
ALTER TABLE public.survey_sites ADD CONSTRAINT survey_sites_water_type_check
  CHECK (water_type IS NULL OR water_type IN ('lentic','lotic','unknown'));

COMMENT ON COLUMN public.survey_sites.water_body IS
  'REQ-231: 定点サイトの近傍水系/河川/湖沼名（任意）';
COMMENT ON COLUMN public.survey_sites.water_type IS
  'REQ-231: 水辺種別 lentic=止水 / lotic=流水 / unknown=不明（任意・eDNA 文脈）';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. geo_cache: 座標グリッド単位の DB 永続キャッシュ（FR-231-04 / NFR-231-01(c)）
--   - キーは丸め座標（NFR-231-06: プライバシー上、過度に細かい座標を残さない）。
--     既存クライアントキャッシュの ≒100m（toFixed(3)）を参考に lat/lng を 3 桁丸め。
--   - 同一グリッドは外部 API を再コールせず付与（規約「キャッシュ推奨」/ AC-03(c)）。
--   - 地名はほぼ不変なので TTL は長め（fetched_at で経過判定。既定 365 日）。
--   - RLS: anon/authenticated からの読み書きは不可。service_role（Edge Function）のみ。
--     RLS 有効 + ポリシー無し = anon/authenticated は全拒否、service_role は RLS バイパス。
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.geo_cache (
  grid_key    TEXT        PRIMARY KEY,          -- 例 "39.720,140.103"（lat,lng を 3 桁丸め）
  lat         DECIMAL(10,7) NOT NULL,           -- 丸め後の代表座標
  lng         DECIMAL(10,7) NOT NULL,
  locality    TEXT,
  water_body  TEXT,
  is_on_water BOOLEAN,
  elevation_m DECIMAL(7,1),
  geo_source  TEXT,
  fetched_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.geo_cache IS
  'REQ-231: 逆ジオコーディング結果の DB 永続キャッシュ（座標グリッド単位）。Nominatim 規約「キャッシュ推奨」と外部 API コスト削減（REQ-218）に資する。service_role のみアクセス可。';
COMMENT ON COLUMN public.geo_cache.grid_key IS
  'REQ-231: lat,lng を 3 桁丸め（≒100m）したキー。NFR-231-06: 個人特定可能な細かい座標を残さない';

ALTER TABLE public.geo_cache ENABLE ROW LEVEL SECURITY;
-- ポリシーは作らない（anon/authenticated は全拒否）。Edge Function は service_role で RLS バイパス。
-- 念のため一般ロールへの直接 GRANT も与えない（テーブル作成者=postgres のみ既定で持つ）。
REVOKE ALL ON public.geo_cache FROM anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. 付与トリガー: posts INSERT → pg_net → Edge Function enrich-place（FR-231-03）
--   既存 private.call_ai_edge_function（REQ-073）と同パターン。
--   - service_role_key は Vault（edge_function_service_role_key）から取得。
--   - kill switch: app.settings.geo_enrich_enabled が 'false' のときは起動しない
--     （NFR-231-02(c) / AC-07。env/GUC 未設定なら既定 ON でも、Edge 側にも GEO_ENRICH_ENABLED ガードあり）。
--   - 失敗は warning に握り潰し、投稿トランザクションを止めない（fail-open / NFR-231-04）。
--   - lat/lng があり、まだ付与されていない（geo_enriched_at IS NULL）行のみ起動。
-- ─────────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO postgres, service_role;

CREATE OR REPLACE FUNCTION private.trigger_enrich_place()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_service_key text;
  v_url         text;
  v_enabled     text;
BEGIN
  -- kill switch（DB 側）: GUC app.settings.geo_enrich_enabled = 'false' なら起動しない。
  v_enabled := current_setting('app.settings.geo_enrich_enabled', true);
  IF v_enabled IS NOT NULL AND lower(v_enabled) = 'false' THEN
    RETURN NEW;
  END IF;

  -- lat/lng が無い / 既に付与済みなら何もしない（冪等 / FR-231-03）
  IF NEW.lat IS NULL OR NEW.lng IS NULL OR NEW.geo_enriched_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    SELECT decrypted_secret INTO v_service_key
    FROM vault.decrypted_secrets
    WHERE name = 'edge_function_service_role_key'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    RETURN NEW;  -- Vault 未設定環境（CI / ローカル）では no-op
  END;

  IF v_service_key IS NULL THEN
    RETURN NEW;
  END IF;

  v_url := current_setting('app.settings.supabase_url', true);
  IF v_url IS NULL OR v_url = '' THEN
    v_url := 'https://project-not-configured.invalid';
  END IF;

  -- 座標は最小限（id/lat/lng）のみ送る（NFR-231-06: reporter_ip 等 PII は送らない）。
  PERFORM net.http_post(
    url := v_url || '/functions/v1/enrich-place',
    body := jsonb_build_object('record', jsonb_build_object(
      'id',  NEW.id,
      'lat', NEW.lat,
      'lng', NEW.lng
    )),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    timeout_milliseconds := 10000
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- 付与の起動失敗は投稿を止めない（fail-open / NFR-231-04）
  RAISE WARNING '[enrich-place] trigger failed for post %: %', NEW.id, sqlerrm;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION private.trigger_enrich_place() IS
  'REQ-231: posts INSERT 後に enrich-place Edge Function を pg_net で非同期起動。Vault/kill switch 未設定や失敗は no-op（fail-open）。';

DROP TRIGGER IF EXISTS enrich_place_on_insert ON public.posts;
CREATE TRIGGER enrich_place_on_insert
  AFTER INSERT ON public.posts
  FOR EACH ROW EXECUTE FUNCTION private.trigger_enrich_place();
