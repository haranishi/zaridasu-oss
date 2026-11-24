-- ===================================================
-- ザリダス: Supabase データベーススキーマ（統合版）
-- Supabase SQL Editor でこのファイルを1回実行してください
-- 冪等設計: 何度実行してもエラーになりません
-- ===================================================

-- UUID 拡張
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ===================================================
-- 0. 最小権限の土台（REQ-221: Supabase 本番ハードニング）
-- ===================================================
-- クライアント直結（anon/publishable キーで PostgREST を直接叩く）構成では、防御線は
-- アプリではなく DB 側にある。RLS（どの行か）の一段「外」にあたる「そもそも誰がオブジェクトに
-- 触れてよいか（whether）」を暗黙の既定まかせにせず、PUBLIC 擬似ロールの不要権限を明示的に閉じる。
--
-- 1) public スキーマへの CREATE 権限を PUBLIC から剥奪。
--    一般ロール（anon/authenticated）が public にオブジェクトを作る正当な理由は無い。
--    Supabase では public スキーマの所有者は postgres であり、本剥奪は anon/authenticated/
--    service_role の既存 SELECT/INSERT/UPDATE/DELETE/EXECUTE には影響しない（CREATE のみ）。
-- 2) 【2026-10-21 置き換え済み（security-hardening 要件1 / REQ-316 FR-316-05）】
--    以前は `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC` を置いていたが、
--    **動いていなかった**（REQ-298 で実測・2026-08-03）。PUBLIC への EXECUTE は組み込みの既定で、スキーマ単位の
--    行ではないため、PostgreSQL 16 で単独実行しても pg_default_acl に行が作られず、直後に作った関数の
--    proacl は NULL（＝PUBLIC が EXECUTE を持つ既定）のままだった。ファイル末尾の 3 文に置き換えた。
--    （ロール単位の既定は、postgres が作る全スキーマの新しい関数に及ぶ。拡張を後から追加したときは、
--    その関数に必要な EXECUTE を明示すること。supabase/migrations/README/03-operating-rules.md）
--
--    影響: `REVOKE EXECUTE ON FUNCTION f FROM anon` は anon への**直接付与**しか剥がさない。
--    PUBLIC が EXECUTE を持ったままだと anon は PUBLIC 経由で実行でき、has_function_privilege も
--    true を返す。**関数を anon から確実に閉じるには `FROM PUBLIC` の REVOKE が必須**
--    （REQ-292 の 5 関数は FROM PUBLIC と FROM anon の 2 行セットになっており、この形が正しい）。
--
--    本番側は migration 20260616000001 の一度きりの
--    `REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC` により、**それ以前に作られた**
--    関数は閉じている。それ以降に作られた関数（detect_ai_anomalies 等）は開いたままで、
--    2026-08-03 の本番実測でも確認した（→ REQ-298 実装記録・別途の是正要件を参照）。
--
--    この行自体は無害なので残すが、**これがあるから安全だと読まないこと。**
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
-- 関数の既定の権限（これから作る関数を閉じる）は、ファイル末尾に置いた。ここに置くと、このファイルの全関数が
-- 閉じた状態で作られ、CI が本番（PUBLIC に EXECUTE が付いた状態）より「閉じて」見えてしまうため。

-- ===================================================
-- 1. posts テーブル
-- ===================================================
CREATE TABLE IF NOT EXISTS posts (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  lat          DECIMAL(10, 7) NOT NULL CHECK (lat  BETWEEN -90  AND 90),
  lng          DECIMAL(10, 7) NOT NULL CHECK (lng  BETWEEN -180 AND 180),
  species      TEXT        NOT NULL CHECK (species IN ('american', 'bullfrog')),
  info_type    TEXT        NOT NULL CHECK (info_type IN ('sighting', 'capture', 'trace', 'damage', 'absence')),
  municipality TEXT,
  comment      TEXT        CHECK (char_length(comment) <= 500),
  photos       TEXT[],
  user_id      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  is_anonymous BOOLEAN     DEFAULT TRUE NOT NULL,
  is_official  BOOLEAN     DEFAULT FALSE NOT NULL,
  count        INTEGER     CHECK (count > 0 AND count <= 999),
  observed_at  TIMESTAMPTZ CHECK (observed_at IS NULL OR observed_at <= (NOW() + INTERVAL '1 day')),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),

  -- スパム対策・システム制御
  reporter_ip  TEXT,
  is_flagged   BOOLEAN     NOT NULL DEFAULT FALSE,

  -- 天気情報
  weather      TEXT        CHECK (weather IN ('sunny', 'cloudy', 'overcast', 'rainy', 'snowy', 'thunderstorm', 'unknown')),
  temperature  DECIMAL(4,1),
  humidity     INTEGER     CHECK (humidity BETWEEN 0 AND 100),

  -- REQ-172: GPS 水平位置精度（m）。NULL=手動地図選択（測位なし）
  accuracy     DECIMAL(7,1) CHECK (accuracy IS NULL OR accuracy >= 0)
);

COMMENT ON TABLE  posts IS 'アメリカザリガニ・ウシガエル出没・分布情報';
COMMENT ON COLUMN posts.species IS 'american=アメリカザリガニ, bullfrog=ウシガエル';
COMMENT ON COLUMN posts.info_type IS 'sighting=目撃, capture=捕獲, trace=痕跡, damage=農業被害';
COMMENT ON COLUMN posts.count IS '目撃・捕獲個体数（任意）';
COMMENT ON COLUMN posts.observed_at IS '実際の観察日時（任意。nullの場合はcreated_atを観察日とする）';
COMMENT ON COLUMN posts.weather IS 'WMOコードから変換した天気カテゴリ（Open-Meteo API）';
COMMENT ON COLUMN posts.accuracy IS 'REQ-172: GPS 水平位置精度（m）。NULL=手動地図選択（測位なし）。SDM では 30m 以下が最低要件';

-- 既存環境向けカラム追加（すでにテーブルが存在する場合のため）
ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_official BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS count INTEGER CHECK (count > 0 AND count <= 999);
ALTER TABLE posts ADD COLUMN IF NOT EXISTS observed_at TIMESTAMPTZ;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE posts ADD COLUMN IF NOT EXISTS reporter_ip TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_flagged BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS weather TEXT CHECK (weather IN ('sunny', 'cloudy', 'overcast', 'rainy', 'snowy', 'thunderstorm', 'unknown'));
ALTER TABLE posts ADD COLUMN IF NOT EXISTS temperature DECIMAL(4,1);
ALTER TABLE posts ADD COLUMN IF NOT EXISTS humidity INTEGER CHECK (humidity BETWEEN 0 AND 100);
-- REQ-172: 位置精度（m）。NULL=手動地図選択
ALTER TABLE posts ADD COLUMN IF NOT EXISTS accuracy DECIMAL(7,1);
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_accuracy_nonneg;
ALTER TABLE posts ADD CONSTRAINT posts_accuracy_nonneg CHECK (accuracy IS NULL OR accuracy >= 0);
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_comment_length;
ALTER TABLE posts ADD CONSTRAINT posts_comment_length CHECK (char_length(comment) <= 500);

-- ═══ REQ-243: 位置情報の公開レベル + 粗化生成列（migration 20260703000001 と同期） ═══
-- 種ごとの既定公開レベル（管理者が管理する設定メタデータ）。protect_post_insert_columns が参照するため先に作る。
CREATE TABLE IF NOT EXISTS species_location_defaults (
  species            TEXT PRIMARY KEY,
  default_disclosure TEXT NOT NULL DEFAULT 'coarsened'
                       CHECK (default_disclosure IN ('precise', 'coarsened', 'hidden')),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by         UUID REFERENCES auth.users(id)
);
COMMENT ON TABLE species_location_defaults IS
  'REQ-243: 種ごとの既定公開レベル。新規投稿の location_disclosure 初期値に使う。管理者のみ変更可（RLS + RPC）。';
INSERT INTO species_location_defaults (species, default_disclosure) VALUES
  ('american', 'coarsened'), ('bullfrog', 'coarsened')
ON CONFLICT (species) DO NOTHING;
ALTER TABLE species_location_defaults ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "species_defaults_read" ON species_location_defaults FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "species_defaults_admin_write" ON species_location_defaults FOR ALL TO authenticated
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
    WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- posts の公開レベル列。precise=生精度公開 / coarsened=粗化(≒111m)のみ / hidden=非公開。
-- 管理者/サービスロールは自由に設定可。投稿者は hidden（非公開）にすることだけできる（REQ-329・一方向）。
ALTER TABLE posts ADD COLUMN IF NOT EXISTS location_disclosure TEXT NOT NULL DEFAULT 'coarsened';
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_location_disclosure_check;
ALTER TABLE posts ADD CONSTRAINT posts_location_disclosure_check
  CHECK (location_disclosure IN ('precise', 'coarsened', 'hidden'));
COMMENT ON COLUMN posts.location_disclosure IS
  'REQ-243 / REQ-329: 座標の公開レベル precise/coarsened/hidden。管理者/サービスロールは設定・変更可。投稿者は hidden にすることだけできる（公開へは戻せない）。';
-- 粗化生成列（STORED）。round(numeric,int) は immutable なので生成列に使える。anon/authenticated はこの列のみ参照可。
ALTER TABLE posts ADD COLUMN IF NOT EXISTS display_lat DECIMAL(10,7)
  GENERATED ALWAYS AS (
    CASE location_disclosure WHEN 'hidden' THEN NULL WHEN 'precise' THEN lat ELSE round(lat, 3) END
  ) STORED;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS display_lng DECIMAL(10,7)
  GENERATED ALWAYS AS (
    CASE location_disclosure WHEN 'hidden' THEN NULL WHEN 'precise' THEN lng ELSE round(lng, 3) END
  ) STORED;
COMMENT ON COLUMN posts.display_lat IS 'REQ-243: 公開用の緯度（hidden=NULL / precise=生値 / それ以外=round(_,3)）。';
COMMENT ON COLUMN posts.display_lng IS 'REQ-243: 公開用の経度（display_lat と同ロジック）。';

-- FR-002: is_anonymous=false の場合 user_id が必須
ALTER TABLE posts DROP CONSTRAINT IF EXISTS chk_user_id_required;
ALTER TABLE posts ADD CONSTRAINT chk_user_id_required
  CHECK (is_anonymous = true OR user_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_posts_created_at    ON posts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_municipality  ON posts (municipality);
CREATE INDEX IF NOT EXISTS idx_posts_species       ON posts (species);
CREATE INDEX IF NOT EXISTS idx_posts_info_type     ON posts (info_type);
CREATE INDEX IF NOT EXISTS idx_posts_municipality_species_created ON posts (municipality, species, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_species_info_type ON posts (species, info_type);
CREATE INDEX IF NOT EXISTS idx_posts_reporter_ip_created ON posts (reporter_ip, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_is_flagged    ON posts (is_flagged);
CREATE INDEX IF NOT EXISTS idx_posts_weather       ON posts (weather);

-- updated_at 自動更新トリガー
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_updated_at ON posts;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON posts FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- IP アドレス取得ユーティリティ (REQ-139 Phase 1)
-- cf-connecting-ip を最優先 → x-forwarded-for の末尾採用 → x-real-ip フォールバック。
-- クライアント偽装可能な x-forwarded-for の「先頭」は採用しない。
CREATE OR REPLACE FUNCTION public.extract_request_ip() RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  headers   JSONB := COALESCE(current_setting('request.headers', true)::jsonb, '{}'::jsonb);
  xff       TEXT;
  parts     TEXT[];
  candidate TEXT;
BEGIN
  candidate := btrim(COALESCE(headers ->> 'cf-connecting-ip', ''));
  IF candidate <> '' THEN
    RETURN candidate;
  END IF;

  xff := COALESCE(headers ->> 'x-forwarded-for', '');
  IF btrim(xff) <> '' THEN
    parts := string_to_array(xff, ',');
    candidate := btrim(parts[array_length(parts, 1)]);
    IF candidate <> '' THEN
      RETURN candidate;
    END IF;
  END IF;

  candidate := btrim(COALESCE(headers ->> 'x-real-ip', ''));
  IF candidate <> '' THEN
    RETURN candidate;
  END IF;

  RETURN NULL;
END;
$$;

-- REQ-212: 現在リクエストの JWT app_metadata.role が admin かを返す共通ヘルパ。
-- 通報 / コメント / いいね のレート制限トリガーで admin を素通りさせるのに使う
-- （check_post_rate_limit と同じく request.jwt.claims を参照。auth.users 参照不要で軽量）。
-- claims が無い / 壊れている場合は false（= 非 admin として通常制限を適用）。
CREATE OR REPLACE FUNCTION public.req_is_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text;
BEGIN
  BEGIN
    v_role := (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb
                -> 'app_metadata' ->> 'role');
  EXCEPTION WHEN OTHERS THEN
    RETURN false;
  END;
  RETURN v_role = 'admin';
END;
$$;

-- 匿名投稿時の IP アドレス自動記録
CREATE OR REPLACE FUNCTION public.set_post_reporter_ip() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.user_id IS NULL AND NEW.reporter_ip IS NULL THEN
    NEW.reporter_ip := public.extract_request_ip();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_post_reporter_ip_trigger ON posts;
CREATE TRIGGER set_post_reporter_ip_trigger
  BEFORE INSERT ON posts FOR EACH ROW
  EXECUTE FUNCTION public.set_post_reporter_ip();

-- posts: RLS
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN CREATE POLICY "public_read" ON posts FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "public_insert" ON posts FOR INSERT WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "owner_update" ON posts FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "owner_delete" ON posts FOR DELETE USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "admin_all_posts" ON posts FOR ALL USING ( (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' ) WITH CHECK ( (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' ); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 余分な管理ポリシー削除 (統合版に移行するため)
DROP POLICY IF EXISTS "admin_delete_posts" ON posts;

-- REQ-001: 投稿レートリミット（DB レベル）
CREATE OR REPLACE FUNCTION check_post_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recent_count INTEGER;
BEGIN
  IF (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role') = 'admin' THEN
    RETURN NEW;
  END IF;
  IF NEW.user_id IS NOT NULL THEN
    SELECT COUNT(*) INTO recent_count FROM posts
    WHERE user_id = NEW.user_id AND created_at > NOW() - INTERVAL '24 hours';
    IF recent_count >= 5 THEN
      RAISE EXCEPTION '24時間以内の投稿上限（5件）に達しました';
    END IF;
  END IF;
  IF NEW.user_id IS NULL THEN
    SELECT COUNT(*) INTO recent_count FROM posts
    WHERE user_id IS NULL AND created_at > NOW() - INTERVAL '1 minute';
    IF recent_count >= 3 THEN
      RAISE EXCEPTION '投稿が集中しています。しばらくお待ちください';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_post_rate_limit ON posts;
CREATE TRIGGER enforce_post_rate_limit
  BEFORE INSERT ON posts FOR EACH ROW
  EXECUTE FUNCTION check_post_rate_limit();

-- REQ-002: is_official の更新を管理者のみに制限
CREATE OR REPLACE FUNCTION protect_official_flag()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  jwt_claims jsonb;
BEGIN
  -- REQ-208: 兄弟関数 protect_post_status と JWT 無し挙動をそろえる。
  -- claims のパース失敗（不正な JSON 等）は素通り。JWT 無し / 空 claims も素通りとし、
  -- service_role 判定はその後に行う。これにより「JWT 無しセッション」での分岐が
  -- protect_post_status と一致し、トリガー族の挙動統一（REQ-168 の目的）を完遂する。
  BEGIN
    jwt_claims := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb;
  EXCEPTION WHEN OTHERS THEN
    RETURN NEW;
  END;

  -- JWT 無し または service_role は素通り（Edge Function の自動承認・hash 書込み等）
  IF jwt_claims IS NULL OR jwt_claims = '{}'::jsonb THEN
    RETURN NEW;
  END IF;
  -- REQ-168: service_role（信頼済みバックエンド鍵）は他の保護トリガー
  -- (protect_post_status / protect_post_insert_columns) と同様に素通りさせる。
  -- これが無いと service_role でも is_official が FALSE 強制され、トリガー族で挙動が不整合になる。
  IF (jwt_claims ->> 'role') = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF (jwt_claims -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'admin' THEN
      NEW.is_official := FALSE;
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.is_official IS DISTINCT FROM NEW.is_official THEN
    IF (jwt_claims -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'admin' THEN
      NEW.is_official := OLD.is_official;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_official_flag ON posts;
CREATE TRIGGER enforce_official_flag
  BEFORE INSERT OR UPDATE ON posts FOR EACH ROW
  EXECUTE FUNCTION protect_official_flag();

-- REQ-004: is_anonymous をイミュータブルに
CREATE OR REPLACE FUNCTION protect_anonymous_flag()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.is_anonymous IS DISTINCT FROM NEW.is_anonymous THEN
    NEW.is_anonymous := OLD.is_anonymous;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_anonymous_immutable ON posts;
CREATE TRIGGER enforce_anonymous_immutable
  BEFORE UPDATE ON posts FOR EACH ROW
  EXECUTE FUNCTION protect_anonymous_flag();

-- ===================================================
-- 2. reports テーブル（通報機能）
-- ===================================================
CREATE TABLE IF NOT EXISTS reports (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  post_id     UUID        NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  reason      TEXT        NOT NULL CHECK (reason IN ('spam', 'wrong_location', 'inappropriate', 'other')),
  comment     TEXT,
  reporter_ip TEXT,
  resolved    BOOLEAN     DEFAULT FALSE
);

COMMENT ON TABLE reports IS '投稿への通報';

ALTER TABLE reports ADD COLUMN IF NOT EXISTS resolved BOOLEAN DEFAULT FALSE;

-- REQ-133: comment 長さは CHECK 制約でも担保（DB 直叩き対策）
ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_comment_length;
ALTER TABLE reports ADD CONSTRAINT reports_comment_length
  CHECK (comment IS NULL OR char_length(comment) <= 500);

-- reports: RLS
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- REQ-133: INSERT 経路は 1 本に統一。public_insert_reports (WITH CHECK true) は廃止。
DROP POLICY IF EXISTS "public_insert_reports"    ON reports;
DROP POLICY IF EXISTS "validated_insert_reports" ON reports;
CREATE POLICY "validated_insert_reports" ON reports
  FOR INSERT
  WITH CHECK (
    post_id IS NOT NULL
    AND reason IN ('spam', 'wrong_location', 'inappropriate', 'other')
    AND (comment IS NULL OR char_length(comment) <= 500)
  );
DO $$ BEGIN CREATE POLICY "admin_all_reports" ON reports FOR ALL TO authenticated USING ( (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' ) WITH CHECK ( (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' ); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP POLICY IF EXISTS "admin_read_reports" ON reports;
DROP POLICY IF EXISTS "admin_update_reports" ON reports;
DROP POLICY IF EXISTS "admin_delete_reports" ON reports;

-- 通報3件以上で自動フラグ
CREATE OR REPLACE FUNCTION public.flag_post_on_reports() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  report_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO report_count FROM public.reports WHERE post_id = NEW.post_id AND resolved = FALSE;
  IF report_count >= 3 THEN UPDATE public.posts SET is_flagged = TRUE WHERE id = NEW.post_id; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_flag_post_on_reports ON reports;
CREATE TRIGGER trigger_flag_post_on_reports
  AFTER INSERT ON reports FOR EACH ROW
  EXECUTE FUNCTION public.flag_post_on_reports();

-- REQ-212: 通報の reporter_ip をサーバー側 IP で自動記録（posts.set_post_reporter_ip と同設計）。
-- ReportModal はクライアントから reporter_ip を送らない。IP 単位の通報スロットルの信頼性確保のため、
-- クライアント送信値は破棄してサーバー側 IP（extract_request_ip）に上書きする。
CREATE OR REPLACE FUNCTION public.set_report_reporter_ip()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.reporter_ip := public.extract_request_ip();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_report_reporter_ip_trigger ON reports;
CREATE TRIGGER set_report_reporter_ip_trigger
  BEFORE INSERT ON reports FOR EACH ROW
  EXECUTE FUNCTION public.set_report_reporter_ip();

-- REQ-212: 通報レート制限（最終防衛線）。flag_post_on_reports（未解決 3 件で is_flagged）の
-- 通報スパム悪用（任意投稿の不正フラグ化＝検閲攻撃 / AC-02）を防ぐ。
--   (a) 同一 IP × 同一 post の未解決通報は 1 回まで（連打で is_flagged を立てさせない）
--   (b) 同一 IP からの通報は 1 時間に 10 件まで（横断スパム抑止）
-- admin は素通り。reporter_ip 不明（IP 取得不能）はスロットル不能のため素通り（fail-open）。
-- set_report_reporter_ip の後に走る必要があるため、トリガー名を昇順で後ろになるよう zzz_ 接頭辞。
CREATE OR REPLACE FUNCTION public.check_report_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  dup_count    integer;
  recent_count integer;
BEGIN
  IF public.req_is_admin() THEN
    RETURN NEW;
  END IF;
  IF NEW.reporter_ip IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO dup_count FROM public.reports
  WHERE post_id = NEW.post_id
    AND reporter_ip = NEW.reporter_ip
    AND resolved = FALSE;
  IF dup_count >= 1 THEN
    RAISE EXCEPTION 'この投稿はすでに通報済みです';
  END IF;

  SELECT COUNT(*) INTO recent_count FROM public.reports
  WHERE reporter_ip = NEW.reporter_ip
    AND created_at > NOW() - INTERVAL '1 hour';
  IF recent_count >= 10 THEN
    RAISE EXCEPTION '通報が集中しています。しばらくお待ちください';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zzz_enforce_report_rate_limit ON reports;
CREATE TRIGGER zzz_enforce_report_rate_limit
  BEFORE INSERT ON reports FOR EACH ROW
  EXECUTE FUNCTION public.check_report_rate_limit();

CREATE INDEX IF NOT EXISTS idx_reports_reporter_ip_created ON reports (reporter_ip, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_post_reporter_ip    ON reports (post_id, reporter_ip);

-- ===================================================
-- 3. comments テーブル（コメント機能）
-- ===================================================
CREATE TABLE IF NOT EXISTS comments (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  post_id     UUID        NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  content     TEXT        NOT NULL CHECK (char_length(content) <= 500),
  is_admin    BOOLEAN     DEFAULT FALSE NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id, created_at ASC);

-- comments: RLS
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN CREATE POLICY "public_read_comments" ON comments FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "auth_insert_comments" ON comments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "owner_delete_comments" ON comments FOR DELETE USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- is_admin 偽装防止: 非管理者が is_admin = TRUE を INSERT しても強制的に FALSE に上書き
CREATE OR REPLACE FUNCTION public.enforce_comment_is_admin()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'admin' THEN
    NEW.is_admin := FALSE;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS enforce_comment_is_admin ON comments;
CREATE TRIGGER enforce_comment_is_admin
  BEFORE INSERT ON comments FOR EACH ROW EXECUTE FUNCTION enforce_comment_is_admin();

-- コメントバッジ付与関数
CREATE OR REPLACE FUNCTION check_comment_badges() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    INSERT INTO user_badges (user_id, badge_id) VALUES (NEW.user_id, 'first_comment') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_comment_check_badges ON comments;
CREATE TRIGGER on_comment_check_badges
  AFTER INSERT ON comments FOR EACH ROW
  EXECUTE FUNCTION check_comment_badges();

-- REQ-212: コメントレート制限（user_id 単位）。auth_insert_comments で認証必須のため user_id で十分。
-- コメントは notify-comment（メール送信）を誘発するため、連投・通知 flooding を抑える。admin は素通り。
CREATE OR REPLACE FUNCTION public.check_comment_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  burst_count integer;
  daily_count integer;
BEGIN
  IF public.req_is_admin() THEN
    RETURN NEW;
  END IF;
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO burst_count FROM public.comments
  WHERE user_id = NEW.user_id AND created_at > NOW() - INTERVAL '1 minute';
  IF burst_count >= 5 THEN
    RAISE EXCEPTION 'コメントが集中しています。しばらくお待ちください';
  END IF;

  SELECT COUNT(*) INTO daily_count FROM public.comments
  WHERE user_id = NEW.user_id AND created_at > NOW() - INTERVAL '24 hours';
  IF daily_count >= 100 THEN
    RAISE EXCEPTION '24時間以内のコメント上限に達しました';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_comment_rate_limit ON comments;
CREATE TRIGGER enforce_comment_rate_limit
  BEFORE INSERT ON comments FOR EACH ROW
  EXECUTE FUNCTION public.check_comment_rate_limit();

CREATE INDEX IF NOT EXISTS idx_comments_user_created ON comments (user_id, created_at DESC);

-- ============================================================
-- 4. likes テーブル（いいね機能）
-- ============================================================
CREATE TABLE IF NOT EXISTS likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(post_id, user_id)
);

-- likes: RLS
ALTER TABLE likes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN CREATE POLICY "Public read likes" ON likes FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Auth users can like" ON likes FOR INSERT WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Auth users can unlike" ON likes FOR DELETE USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- REQ-212: いいねレート制限（user_id 単位・バーストのみ）。UNIQUE(post_id,user_id) で二重 like は
-- 防げるが、多数 post への連打は抑止されない。UI 操作の現実的上限を超える連打のみ弾く。admin は素通り。
CREATE OR REPLACE FUNCTION public.check_like_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  burst_count integer;
BEGIN
  IF public.req_is_admin() THEN
    RETURN NEW;
  END IF;
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO burst_count FROM public.likes
  WHERE user_id = NEW.user_id AND created_at > NOW() - INTERVAL '1 minute';
  IF burst_count >= 30 THEN
    RAISE EXCEPTION 'いいねが集中しています。しばらくお待ちください';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_like_rate_limit ON likes;
CREATE TRIGGER enforce_like_rate_limit
  BEFORE INSERT ON likes FOR EACH ROW
  EXECUTE FUNCTION public.check_like_rate_limit();

CREATE INDEX IF NOT EXISTS idx_likes_user_created ON likes (user_id, created_at DESC);

-- ============================================================
-- 5. audit_logs テーブル（管理者操作の監査ログ）
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  -- REQ-149: login_failed は admin が確定しない / target が UUID で表せないため nullable。
  -- 退会した会員の記録者欄だけ空にし、監査ログの行は残す（security-hardening 要件5）。
  admin_id    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  action      TEXT        NOT NULL CHECK (action IN ('delete_post', 'delete_comment', 'resolve_report', 'grant_admin', 'revoke_admin')),
  target_type TEXT        NOT NULL CHECK (target_type IN ('post', 'comment', 'report', 'user')),
  target_id   UUID,
  details     JSONB
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs (action);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- REQ-020 / REQ-134: audit_logs は append-only。admin であっても UPDATE/DELETE 不可。
-- drift 源だった `admin_all_audit_logs` (FOR ALL) は廃止し、SELECT と INSERT を別ポリシーで明示。
DROP POLICY IF EXISTS "admin_all_audit_logs"   ON audit_logs;
DO $$ BEGIN CREATE POLICY "admin_read_audit_logs" ON audit_logs FOR SELECT TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "admin_insert_audit_logs" ON audit_logs FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE audit_logs IS '管理者操作の監査ログ。整合性保護のため UPDATE/DELETE 不可 (REQ-020 / REQ-134)';

-- ===================================================
-- 6. Storage バケット（写真アップロード用）
-- ===================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'post-photos',
  'post-photos',
  true,
  5242880, -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO NOTHING;

-- Storage ポリシー（認証ユーザーのみアップロード可、削除は admin または自分のパスのみ）
DROP POLICY IF EXISTS "public_upload"              ON storage.objects;
DROP POLICY IF EXISTS "restricted_upload"          ON storage.objects;
DROP POLICY IF EXISTS "authenticated_upload"       ON storage.objects;
DROP POLICY IF EXISTS "admin_delete_photos"        ON storage.objects;
DROP POLICY IF EXISTS "owner_delete_photos"        ON storage.objects;
DROP POLICY IF EXISTS "owner_or_admin_delete_photos" ON storage.objects;

-- REQ-135: 自分の uid フォルダ配下のみ INSERT 可
DO $$ BEGIN CREATE POLICY "authenticated_upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'post-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND lower(storage.extension(name)) IN ('jpg', 'jpeg', 'png', 'webp', 'heic')
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "public_read_photos" ON storage.objects FOR SELECT USING (bucket_id = 'post-photos'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "owner_or_admin_delete_photos" ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'post-photos'
  AND (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    OR name LIKE concat(auth.uid()::text, '/%')
  )
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 7. 管理者用機能（ユーザーリストビュー、ロール付与RPC）
-- ============================================================
-- REQ-221: security_invoker = true を付与し、他ビュー（posts_public / survey_request_timeline /
--          ai_call_logs_daily）と設計を揃える（Splinter 0010_security_definer_view を解消）。
--          security_invoker により、ビューは「ビューの所有者」ではなく「問い合わせ元ロール」の
--          権限で auth.users を読むため、定義者権限での意図せぬ昇格を避ける。auth.users 由来列の
--          露出は下の REVOKE と get_admin_user_list() 経由限定で引き続き保護する。
CREATE OR REPLACE VIEW public.admin_user_list
WITH (security_invoker = true) AS
SELECT
  id,
  email,
  created_at,
  last_sign_in_at,
  (raw_app_meta_data->>'role') = 'admin' AS is_admin
FROM auth.users
ORDER BY created_at DESC;

-- 一般ユーザーからのアクセス権を取り消し、get_admin_user_list() SECURITY DEFINER 関数経由のみに制限
REVOKE SELECT ON public.admin_user_list FROM authenticated;
REVOKE SELECT ON public.admin_user_list FROM anon;

-- admin ロールのみが呼び出せるユーザーリスト取得関数
CREATE OR REPLACE FUNCTION public.get_admin_user_list()
RETURNS TABLE (
  id              UUID,
  email           TEXT,
  created_at      TIMESTAMPTZ,
  last_sign_in_at TIMESTAMPTZ,
  is_admin        BOOLEAN
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;
  RETURN QUERY
    SELECT u.id,
           u.email::text,
           u.created_at,
           u.last_sign_in_at,
           ((u.raw_app_meta_data->>'role') = 'admin')::boolean AS is_admin
    FROM auth.users u ORDER BY u.created_at DESC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_admin_user_list() TO authenticated;

CREATE OR REPLACE FUNCTION public.set_user_admin_role(target_user_id UUID, grant_admin BOOLEAN)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role TEXT;
BEGIN
  -- 呼び出し元が管理者かチェック
  SELECT raw_app_meta_data->>'role' INTO caller_role
  FROM auth.users WHERE id = auth.uid();

  -- REQ-214/REQ-221: caller_role が NULL（role キー未設定の一般ユーザー、または admin 剥奪後）
  -- の場合、`caller_role != 'admin'` は NULL（=偽）と評価され例外が発火せず、role を持たない
  -- ユーザーが他者を admin に昇格できる権限昇格バグになる。IS DISTINCT FROM で NULL も非 admin
  -- として正しく弾く。
  IF caller_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION '管理者権限が必要です';
  END IF;

  -- 自分自身の権限は変更不可
  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION '自分自身の管理者権限は変更できません';
  END IF;

  IF grant_admin THEN
    UPDATE auth.users
    SET raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role": "admin"}'::jsonb
    WHERE id = target_user_id;
  ELSE
    UPDATE auth.users
    SET raw_app_meta_data = raw_app_meta_data - 'role'
    WHERE id = target_user_id;
  END IF;
END;
$$;

-- ===================================================
-- 8. 投稿審査ワークフロー（モデレーション）
-- ===================================================

-- 8-1. posts に審査ステータスカラムを追加
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS rejection_message TEXT
    CHECK (rejection_message IS NULL OR char_length(rejection_message) <= 200),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_posts_status ON posts (status);
CREATE INDEX IF NOT EXISTS idx_posts_status_created ON posts (status, created_at DESC);

-- 8-2. 初回マイグレーション時のみ: 既存投稿をすべて approved に設定
-- ※ ai_analyzed_at が NULL = AI判定前の既存データのみ対象（再実行時の誤承認を防止）
-- 初期データ更新は AI 用の列の定義後に行う（空DBでの初期化順序）。

-- 8-3. RLS: 公開閲覧は approved のみ（投稿者本人・管理者は全ステータス閲覧可）
DROP POLICY IF EXISTS "public_read" ON posts;
DO $$ BEGIN
  CREATE POLICY "moderated_read" ON posts FOR SELECT USING (
    status = 'approved'
    OR auth.uid() = user_id
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 8-4. 匿名投稿を廃止: 認証ユーザーのみINSERT可
DROP POLICY IF EXISTS "public_insert" ON posts;
DO $$ BEGIN
  CREATE POLICY "auth_insert" ON posts FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 8-5. status/rejection系カラムはユーザーが自分で変更できないよう保護
CREATE OR REPLACE FUNCTION protect_post_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'admin' THEN
    NEW.status          := OLD.status;
    NEW.rejection_reason  := OLD.rejection_reason;
    NEW.rejection_message := OLD.rejection_message;
    NEW.reviewed_at     := OLD.reviewed_at;
    NEW.reviewed_by     := OLD.reviewed_by;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS enforce_post_status ON posts;
CREATE TRIGGER enforce_post_status
  BEFORE UPDATE ON posts FOR EACH ROW EXECUTE FUNCTION protect_post_status();

-- 8-5b. REQ-179 / REQ-208: reporter_ip（PII＝投稿者IP）の列レベル保護について。
--   ⚠ 実際の REVOKE/GRANT 文はこの位置ではなく **ファイル末尾**（"REQ-179: reporter_ip 列レベル保護"
--     ブロック）で実行する。理由: 保護は「reporter_ip を除く posts 全列」に列単位 SELECT を貼り直す
--     方式（下記セマンティクス参照）で、posts には本ファイルのこの行より後でも列が ADD される
--     （audio_url / location_source / experiment_assignments / survey_method / survey_site_id 等）。
--     全列が出揃ってから列挙しないと後発列に SELECT が付かないため、posts の全 ALTER の後で実行する。
--
-- ⚠ PostgreSQL の列権限セマンティクス（重要・過去の実装誤りの是正）:
--   「テーブル全体 GRANT SELECT のあとに REVOKE SELECT (reporter_ip)」では列を保護できない。
--   テーブルレベルの SELECT 付与は全列をカバーし、後続の列単位 REVOKE はそれを分解しない
--   （列だけ剥がしたつもりでもテーブル付与が残り続け、reporter_ip は依然 SELECT 可能）。
--   実際 information_schema にも SELECT(reporter_ip) が残り、anon の `SELECT reporter_ip` も成功する。
--   旧実装（列 REVOKE のみ）は no-op で、本番でも reporter_ip が読めてしまっていた（migration
--   20260615000001 では保護できておらず、20260616000005 で是正）。詳細はファイル末尾の実装ブロック参照。

-- 8-6. audit_logs の action 許可値（trigger_* / login_* を含む最新版・REQ-149 まで反映）
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_action_check;
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_action_check
  CHECK (action IN (
    'delete_post', 'delete_comment', 'resolve_report',
    'grant_admin', 'revoke_admin',
    'approve_post', 'reject_post', 'toggle_official',
    'trigger_delete_post', 'trigger_status_change',
    'trigger_delete_comment', 'trigger_role_change',
    'login_success', 'login_failed',
    -- REQ-234: 研究採用イベント
    'adopt_research', 'unadopt_research'
  ));

-- ===================================================
-- 9. AI 画像判定カラム
-- ===================================================
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS ai_result JSONB,
  ADD COLUMN IF NOT EXISTS ai_analyzed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auto_approved BOOLEAN NOT NULL DEFAULT FALSE;

-- 初期データ更新。参照する列が存在してから実行する。
UPDATE posts SET status = 'approved'
  WHERE reviewed_at IS NULL AND status = 'pending' AND ai_analyzed_at IS NULL;


-- REQ-168: 以下は migration で posts に追加されたが schema.sql の定義に未反映だった列。
-- protect_post_status() がこれらの NEW/OLD を参照するため、schema.sql 単独適用（CI rls-tests）でも
-- 列が存在するよう補完してドリフトを解消する。型・デフォルトは各 migration と一致させる。
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS ai_failure_count integer NOT NULL DEFAULT 0,  -- REQ-125 (20260512000001)
  ADD COLUMN IF NOT EXISTS audio_hash text,                             -- REQ-079 (20260424000001)
  ADD COLUMN IF NOT EXISTS image_hashes text[],                         -- REQ-079 (20260424000001)
  ADD COLUMN IF NOT EXISTS audio_duration_ms int;                       -- REQ-083 (20260425000001)

CREATE INDEX IF NOT EXISTS idx_posts_ai_analyzed ON posts (ai_analyzed_at)
  WHERE ai_analyzed_at IS NOT NULL;

-- REQ-231: 逆ジオコーディングで付与する地理メタデータ列（全列 NULL 許容・後方互換）。
-- migration 20260615000004 と同期。字レベル地名・近傍水系・水辺フラグ・標高・付与メタ。
-- 付与は Edge Function enrich-place（service_role）が書く。付与失敗でも投稿は成立（fail-open）。
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS locality        TEXT,
  ADD COLUMN IF NOT EXISTS water_body      TEXT,
  ADD COLUMN IF NOT EXISTS is_on_water     BOOLEAN,
  ADD COLUMN IF NOT EXISTS elevation_m     DECIMAL(7,1),
  ADD COLUMN IF NOT EXISTS geo_enriched_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS geo_source      TEXT;
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_geo_source_check;
ALTER TABLE posts ADD CONSTRAINT posts_geo_source_check
  CHECK (geo_source IS NULL OR geo_source IN ('nominatim','opencage','geoapify','onwater','opentopodata','cache'));
COMMENT ON COLUMN posts.locality IS 'REQ-231: 字・大字・町丁目レベルの地名（Nominatim suburb/neighbourhood/hamlet/quarter 等）';
COMMENT ON COLUMN posts.water_body IS 'REQ-231: 近傍水系/河川/湖沼名';
COMMENT ON COLUMN posts.is_on_water IS 'REQ-231: true=水上 / false=陸上 / NULL=判定不能（OnWater 等）';
COMMENT ON COLUMN posts.elevation_m IS 'REQ-231: 標高（m）。任意・Open Topo Data（CORS 不可のためサーバー側のみ）';
COMMENT ON COLUMN posts.geo_enriched_at IS 'REQ-231: 付与日時。二重 webhook 配信の冪等スキップに使う';
COMMENT ON COLUMN posts.geo_source IS 'REQ-231: 付与の情報源。出典追跡・再付与用';
CREATE INDEX IF NOT EXISTS idx_posts_geo_enriched ON posts (geo_enriched_at) WHERE geo_enriched_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_posts_is_on_water ON posts (is_on_water) WHERE is_on_water IS NOT NULL;

-- REQ-234: 研究採用イベント列（is_official=マップ公開 とは意味を分離）。migration 20260615000006 と同期。
-- 採用更新は管理者/サービスロールのみ（protect_post_status で OLD 固定）。notified_at は 1 回通知の冪等マーカー。
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS research_adopted_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS research_adopted_notified_at TIMESTAMPTZ;
COMMENT ON COLUMN posts.research_adopted_at IS
  'REQ-234: 研究/集計に採用した日時。is_official（マップ公開）とは別の研究貢献イベント。管理者/サービスロールのみ更新可';
COMMENT ON COLUMN posts.research_adopted_notified_at IS
  'REQ-234: 採用通知を送信した日時。投稿あたり 1 回のみ送るための冪等マーカー（NFR-234-02）';
CREATE INDEX IF NOT EXISTS idx_posts_research_adopted ON posts (research_adopted_at) WHERE research_adopted_at IS NOT NULL;

-- 9-1. protect_post_status トリガー (REQ-034 / REQ-079 / REQ-083 / REQ-136 統合版)
--       service_role / admin は素通り。一般ユーザーの UPDATE では下記 20 列を OLD に固定。
--       schema.sql を正本とし、以後の migration で `CREATE OR REPLACE` する場合も
--       本定義を上書きするか、追記カラムを REQ ベースで明示すること。
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

  -- JWT なし または service_role は許可（Edge Function の自動承認）
  IF jwt_claims IS NULL OR jwt_claims = '{}'::jsonb THEN
    RETURN NEW;
  END IF;
  IF (jwt_claims ->> 'role') = 'service_role' THEN
    RETURN NEW;
  END IF;

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
    -- 位置精度 (REQ-172): INSERT 時の値は本人の測位として許容するが、UPDATE では改竄禁止
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
    -- 研究採用 (REQ-234): 管理者/サービスロール専用列。一般ユーザー改竄禁止。
    NEW.research_adopted_at          := OLD.research_adopted_at;
    NEW.research_adopted_notified_at := OLD.research_adopted_notified_at;
    -- 位置公開レベル (REQ-243 / REQ-329): 投稿者ができるのは「非公開（hidden）にする」ことだけ。
    -- 公開へ戻す・精度を上げる（coarsened → precise 等）は管理者だけ。管理者が伏せた記録も戻せない。
    IF NEW.location_disclosure IS DISTINCT FROM 'hidden' THEN
      NEW.location_disclosure   := OLD.location_disclosure;
    END IF;
    -- 所有権 (二重防御。policy でも守られるがトリガー側でも明示)
    -- ただし退会（auth.users の削除）だけは通す。外部キー ON DELETE SET NULL が、投稿の user_id を NULL にする
    -- 更新を行う。これまではここで旧値に戻され、投稿が 1 件でもある会員は退会できなかった
    -- （security-hardening 要件5）。通すのは「旧い持ち主が auth.users からもう消えている」ときだけ。
    -- 生きている持ち主の投稿を NULL や他人へ書き換える更新は、従来どおり旧値に戻す。
    IF NOT (NEW.user_id IS NULL AND OLD.user_id IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = OLD.user_id)) THEN
      NEW.user_id               := OLD.user_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS enforce_post_status ON posts;
CREATE TRIGGER enforce_post_status
  BEFORE UPDATE ON posts FOR EACH ROW EXECUTE FUNCTION protect_post_status();
COMMENT ON FUNCTION protect_post_status() IS
  'REQ-034 / REQ-079 / REQ-083 / REQ-136 / REQ-231 / REQ-234 / REQ-329: 一般ユーザー UPDATE 時、status/運用制御/AI/hash/音声/気象/調査/地理メタデータ/研究採用/所有権カラムを OLD に固定。公開レベルは hidden への変更だけを許す（一方向）。admin / service_role は素通り。';

-- 9-2. INSERT 時も運用制御カラム・公開レベル・サーバ付与地理メタデータを一般ユーザーから保護
--       （REQ-034 / REQ-243 / REQ-244）。service_role / admin は任意の値を設定できる。
CREATE OR REPLACE FUNCTION protect_post_insert_columns()
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

  -- 一般ユーザーが INSERT 時に運用制御カラムを指定してきても強制リセット
  IF (jwt_claims -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'admin' THEN
    NEW.status            := 'pending';
    NEW.rejection_reason  := NULL;
    NEW.rejection_message := NULL;
    NEW.reviewed_at       := NULL;
    NEW.reviewed_by       := NULL;
    NEW.auto_approved     := FALSE;
    NEW.is_official       := FALSE;
    NEW.is_flagged        := FALSE;
    NEW.ai_result         := NULL;
    NEW.ai_analyzed_at    := NULL;
    -- security-hardening 要件6: 研究採用（日時・通知済み日時）と AI 失敗回数は、運用側（管理者・service_role）が
    -- 決める値。新規投稿で申告させない。UPDATE では protect_post_status が旧値に固定していたが、INSERT には
    -- 抜けがあり、「採用済み・通知済み」を偽って、後の正規の採用通知を止められた。
    NEW.research_adopted_at          := NULL;
    NEW.research_adopted_notified_at := NULL;
    NEW.ai_failure_count             := 0;
    -- REQ-243 / REQ-329: 公開レベルは種ごとの既定（無ければ coarsened）。ただし投稿者が
    -- 'hidden'（位置を非公開）を選んだときだけはそれを尊重する。「より伏せる」方向にしか動かない。
    NEW.location_disclosure := CASE
      WHEN NEW.location_disclosure = 'hidden' THEN 'hidden'
      ELSE COALESCE(
        (SELECT sld.default_disclosure FROM species_location_defaults sld WHERE sld.species = NEW.species),
        'coarsened'
      )
    END;
    -- REQ-244 FR-244-01: サーバ付与専用の地理メタデータ列は一般ユーザー INSERT で常に NULL 化する。
    -- これを怠ると、攻撃者が geo_enriched_at を先置きして enrich-place の冪等ガード
    -- （IF NEW.geo_enriched_at IS NOT NULL THEN RETURN NEW）を発火させ、偽の locality/water_body/
    -- elevation_m を付与処理にバイパスされたまま永続化できる。付与は必ず service_role トリガー経由へ戻す。
    NEW.locality        := NULL;
    NEW.water_body      := NULL;
    NEW.is_on_water     := NULL;
    NEW.elevation_m     := NULL;
    NEW.geo_enriched_at := NULL;
    NEW.geo_source      := NULL;
    -- REQ-244 FR-244-02: municipality は許可リスト（秋田県 25 市町村）以外を正規化（NULL 化）する。
    -- 許可リストの正本は src/lib/constants.ts の MUNICIPALITIES（両者を同期させること）。
    -- ハード CHECK ではなくトリガー正規化にしたのは、既存在庫に許可外の値があっても migration が
    -- 失敗せず、admin / service_role の正規化・修正経路（pass-through）も潰さないため。
    IF NEW.municipality IS NOT NULL AND NEW.municipality NOT IN (
      '秋田市', '能代市', '横手市', '大館市', '男鹿市', '湯沢市',
      '鹿角市', '由利本荘市', '潟上市', '大仙市', '北秋田市',
      'にかほ市', '仙北市', '小坂町', '上小阿仁村', '藤里町',
      '三種町', '八峰町', '五城目町', '八郎潟町', '井川町',
      '大潟村', '美郷町', '羽後町', '東成瀬村'
    ) THEN
      NEW.municipality := NULL;
    END IF;
    -- reporter_ip は set_post_reporter_ip トリガーが後続で正しい値を入れるため上書きしない
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS enforce_post_insert_columns ON posts;
CREATE TRIGGER enforce_post_insert_columns
  BEFORE INSERT ON posts FOR EACH ROW EXECUTE FUNCTION protect_post_insert_columns();
COMMENT ON FUNCTION protect_post_insert_columns() IS
  'REQ-034 / REQ-243 / REQ-244 / REQ-329: 一般ユーザー INSERT 時、運用制御列（status/is_official 等）・サーバ付与地理メタデータ列（locality/water_body/is_on_water/elevation_m/geo_enriched_at/geo_source）を強制リセットし、municipality を許可リストへ正規化する。公開レベルは種の既定で上書きするが、投稿者が hidden を選んだときだけ尊重する。admin / service_role は素通り。';

-- 投稿承認時のバッジ自動付与
CREATE OR REPLACE FUNCTION check_and_grant_badges() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID; v_post_count BIGINT; v_species_count BIGINT; v_municipality_count BIGINT; v_absence_count BIGINT;
  -- REQ-235: 品質連動バッジ用の集計。承認済み投稿のみを母集合とする（v_post_count と同じガード）。
  v_high_accuracy_count BIGINT; v_structured_count BIGINT; v_precise_loc_count BIGINT;
BEGIN
  IF NEW.status <> 'approved' OR (TG_OP = 'UPDATE' AND OLD.status = 'approved') THEN RETURN NEW; END IF;
  v_user_id := NEW.user_id;
  IF v_user_id IS NULL THEN RETURN NEW; END IF;

  SELECT COUNT(*) INTO v_post_count FROM posts WHERE user_id = v_user_id AND status = 'approved';
  IF v_post_count >= 1 THEN INSERT INTO user_badges (user_id, badge_id) VALUES (v_user_id, 'first_post') ON CONFLICT DO NOTHING; END IF;
  IF v_post_count >= 10 THEN INSERT INTO user_badges (user_id, badge_id) VALUES (v_user_id, 'posts_10') ON CONFLICT DO NOTHING; END IF;
  IF v_post_count >= 50 THEN INSERT INTO user_badges (user_id, badge_id) VALUES (v_user_id, 'posts_50') ON CONFLICT DO NOTHING; END IF;
  IF v_post_count >= 100 THEN INSERT INTO user_badges (user_id, badge_id) VALUES (v_user_id, 'posts_100') ON CONFLICT DO NOTHING; END IF;

  SELECT COUNT(DISTINCT species) INTO v_species_count FROM posts WHERE user_id = v_user_id AND status = 'approved';
  IF v_species_count >= 2 THEN INSERT INTO user_badges (user_id, badge_id) VALUES (v_user_id, 'multi_species') ON CONFLICT DO NOTHING; END IF;

  SELECT COUNT(DISTINCT municipality) INTO v_municipality_count FROM posts WHERE user_id = v_user_id AND status = 'approved' AND municipality IS NOT NULL;
  IF v_municipality_count >= 3 THEN INSERT INTO user_badges (user_id, badge_id) VALUES (v_user_id, 'multi_municipality') ON CONFLICT DO NOTHING; END IF;

  SELECT COUNT(*) INTO v_absence_count FROM posts WHERE user_id = v_user_id AND status = 'approved' AND info_type = 'absence';
  IF v_absence_count >= 5 THEN INSERT INTO user_badges (user_id, badge_id) VALUES (v_user_id, 'absence_reporter') ON CONFLICT DO NOTHING; END IF;

  IF NEW.auto_approved = true AND (NEW.ai_result->>'confidence')::numeric >= 0.95 THEN
    INSERT INTO user_badges (user_id, badge_id) VALUES (v_user_id, 'ai_perfect') ON CONFLICT DO NOTHING;
  END IF;

  -- REQ-235: 品質連動バッジ（量・いいね偏重の是正）。すべて承認済み（status='approved'）が母集合。
  -- (a) 検証済み投稿: 承認済み投稿数そのものを「検証された貢献」として称える（posts_* の量とは別軸）。
  IF v_post_count >= 25 THEN INSERT INTO user_badges (user_id, badge_id) VALUES (v_user_id, 'verified_25') ON CONFLICT DO NOTHING; END IF;

  -- (b) 高精度同定: auto_approved かつ AI 信頼度 0.9 以上の承認済み投稿が10件。
  SELECT COUNT(*) INTO v_high_accuracy_count FROM posts
    WHERE user_id = v_user_id AND status = 'approved' AND auto_approved = true
      AND (ai_result->>'confidence')::numeric >= 0.9;
  IF v_high_accuracy_count >= 10 THEN INSERT INTO user_badges (user_id, badge_id) VALUES (v_user_id, 'high_accuracy_10') ON CONFLICT DO NOTHING; END IF;

  -- (c) 定点観察者: survey_method='structured'（REQ-174 定点反復調査）の承認済み投稿が10件。
  SELECT COUNT(*) INTO v_structured_count FROM posts
    WHERE user_id = v_user_id AND status = 'approved' AND survey_method = 'structured';
  IF v_structured_count >= 10 THEN INSERT INTO user_badges (user_id, badge_id) VALUES (v_user_id, 'structured_observer') ON CONFLICT DO NOTHING; END IF;

  -- (d) 高精度測位: GPS 水平精度 30m 以内（REQ-172 / GPS_ACCURACY_GOOD_M）の承認済み投稿が20件。
  SELECT COUNT(*) INTO v_precise_loc_count FROM posts
    WHERE user_id = v_user_id AND status = 'approved' AND accuracy IS NOT NULL AND accuracy <= 30;
  IF v_precise_loc_count >= 20 THEN INSERT INTO user_badges (user_id, badge_id) VALUES (v_user_id, 'precise_locator') ON CONFLICT DO NOTHING; END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_post_approved_check_badges ON posts;
CREATE TRIGGER on_post_approved_check_badges
  AFTER UPDATE ON posts FOR EACH ROW
  EXECUTE FUNCTION check_and_grant_badges();

-- ===================================================
-- 10. AUTH 事前チェック関数 (Email)
-- ===================================================
-- REQ-292: 「呼び出し元がサーバー側か」を判定する共通ヘルパ（anon GRANT された RPC の fail-closed 化）。
--   ⚠ current_user / CURRENT_ROLE は使えない: SECURITY DEFINER 関数の内部では所有者（postgres）に
--     すり替わるため、呼び出し元の判定に使うと誰から呼ばれても postgres に見える。
--   独立した 2 段のガードを併用する（どちらか一方が破れても閉じたままにする）:
--     (1) role GUC: PostgREST はリクエストごとに SET LOCAL ROLE anon|authenticated|service_role を発行する。
--         role GUC は SECURITY DEFINER でも書き換わらない（postgres 16 で実測確認済み）。直 DB 接続
--         （GoTrue Auth Hook / pg_cron / psql）では既定値 'none' のまま。
--     (2) request.jwt.claims: PostgREST は必ずセットする（anon キーでも {"role":"anon"}）。直 DB 接続では NULL。
CREATE OR REPLACE FUNCTION public._req292_is_server_caller()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_claims jsonb;
  v_role   text := current_setting('role', true);
BEGIN
  IF v_role IN ('anon', 'authenticated') THEN
    RETURN false;
  END IF;
  v_claims := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb;
  IF v_claims IS NULL THEN
    RETURN true;
  END IF;
  RETURN (v_claims ->> 'role') = 'service_role';
EXCEPTION WHEN others THEN
  RETURN false;  -- claims が壊れた JSON 等でパースできない場合は信頼しない（fail-closed）
END;
$$;
REVOKE ALL ON FUNCTION public._req292_is_server_caller() FROM PUBLIC;
REVOKE ALL ON FUNCTION public._req292_is_server_caller() FROM anon, authenticated;
COMMENT ON FUNCTION public._req292_is_server_caller() IS
  'REQ-292: 呼び出し元がサーバー側（Auth Hook / cron / service_role / 直 DB 接続）かを返す内部ヘルパ。PostgREST 経由の anon / authenticated は false。claims 破損時は false（fail-closed）。';

CREATE OR REPLACE FUNCTION public.check_email_exists(lookup_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- REQ-292 FR-292-05: メール存在確認オラクルを閉じる。サーバー側呼び出し元のみ。
  IF NOT public._req292_is_server_caller() THEN
    RAISE EXCEPTION 'REQ-292: check_email_exists is server-side only'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- メールアドレスが存在すれば true, 見つからなければ false
  RETURN EXISTS (
    SELECT 1 FROM auth.users WHERE lower(email) = lower(btrim(coalesce(lookup_email, '')))
  );
END;
$$;

-- REQ-292 FR-292-05(a): メール存在確認オラクルの閉塞（20260730000001）。
--   ★ REQ-241 の受容根拠は誤りだった: REQ-241（20260703000003:162）は「列挙リスクの残余は Turnstile
--     （REQ-212）＋ Auth レート制限で受容」と記録したが、**その 2 つはいずれも
--     POST /rest/v1/rpc/check_email_exists の直叩きには掛からない**。
--       - Turnstile はブラウザ上のウィジェットで、token は supabase.auth.signUp() に渡される。RPC
--         呼び出しには介在しない（site key 未設定なら captchaEnabled=false で完全 no-op でもある）。
--       - Auth レート制限は `/auth/v1/*` に対する制限であり PostgREST の `/rest/v1/rpc/*` には効かない。
--     結果、公開 anon キーだけで任意の辞書を回し登録ユーザーの在・不在を確認できるオラクルが公開状態
--     にあった（本番は実在市民のメールを扱うため、外部メールリストとの突合＝名寄せに直結する）。
--   対処: フロントの事前チェック（AuthModal）を廃止し、重複判定は signUp 後の identities 空判定
--     （Supabase Auth の統一エラー）に一本化。本関数は anon / authenticated から EXECUTE を剥奪し、
--     本体も _req292_is_server_caller() で fail-closed 化した（関数自体は互換のため残す）。
REVOKE EXECUTE ON FUNCTION public.check_email_exists(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_email_exists(TEXT) FROM anon, authenticated;
COMMENT ON FUNCTION public.check_email_exists(TEXT) IS
  'REQ-241 / REQ-292: 非推奨。REQ-292 で anon/authenticated の EXECUTE を剥奪し本体もサーバー側限定にした（メール存在確認オラクルの閉塞）。REQ-241 が受容根拠にした Turnstile ＋ Auth レート制限は RPC 直叩き経路に掛からず、根拠として誤りだった。サインアップの重複判定は signUp 後の identities 空判定に一本化した。';

-- ===================================================
-- 10-1. 監査ログ取得 RPC
-- ===================================================
CREATE OR REPLACE FUNCTION public.get_audit_logs(p_limit INTEGER DEFAULT 20, p_offset INTEGER DEFAULT 0, p_action TEXT DEFAULT NULL, p_from TIMESTAMPTZ DEFAULT NULL, p_to TIMESTAMPTZ DEFAULT NULL, p_admin_id UUID DEFAULT NULL)
RETURNS TABLE (id UUID, created_at TIMESTAMPTZ, admin_id UUID, admin_email TEXT, action TEXT, target_type TEXT, target_id UUID, details JSONB, total_count BIGINT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'Permission denied'; END IF;
  -- REQ-149: login_failed は admin_id=NULL のため LEFT JOIN にしないと監査一覧から欠落する。
  RETURN QUERY SELECT al.id, al.created_at, al.admin_id, u.email::text AS admin_email, al.action, al.target_type, al.target_id, al.details, COUNT(*) OVER () AS total_count
    FROM audit_logs al LEFT JOIN auth.users u ON u.id = al.admin_id
    WHERE (p_action IS NULL OR al.action = p_action) AND (p_from IS NULL OR al.created_at >= p_from) AND (p_to IS NULL OR al.created_at <= p_to) AND (p_admin_id IS NULL OR al.admin_id = p_admin_id)
    ORDER BY al.created_at DESC LIMIT p_limit OFFSET p_offset;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_audit_logs(INTEGER, INTEGER, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, UUID) TO authenticated;

-- ===================================================
-- 10-2. ユーザー活動取得 RPC
-- ===================================================
CREATE OR REPLACE FUNCTION public.get_user_activity(p_user_id UUID) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE result JSON;
BEGIN
  IF (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'Permission denied'; END IF;
  SELECT json_build_object(
    'post_count',    (SELECT COUNT(*) FROM posts WHERE user_id = p_user_id),
    'comment_count', (SELECT COUNT(*) FROM comments WHERE user_id = p_user_id),
    'report_count',  (SELECT COUNT(*) FROM reports JOIN posts ON reports.post_id = posts.id WHERE posts.user_id = p_user_id),
    'recent_posts',  (SELECT COALESCE(json_agg(row_to_json(p)), '[]') FROM (SELECT id, created_at, municipality, species, info_type FROM posts WHERE user_id = p_user_id ORDER BY created_at DESC LIMIT 5) p),
    'recent_comments', (SELECT COALESCE(json_agg(row_to_json(c)), '[]') FROM (SELECT id, created_at, content, post_id FROM comments WHERE user_id = p_user_id ORDER BY created_at DESC LIMIT 5) c)
  ) INTO result;
  RETURN result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_user_activity(UUID) TO authenticated;

-- ===================================================
-- 10-3. ランキング RPC
-- ===================================================
CREATE OR REPLACE FUNCTION get_user_ranking(p_limit INTEGER DEFAULT 20, p_offset INTEGER DEFAULT 0, p_period TEXT DEFAULT 'all')
RETURNS TABLE (rank BIGINT, user_id UUID, display_name TEXT, avatar_emoji TEXT, post_count BIGINT, badge_count BIGINT, total_count BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY WITH post_stats AS (
      SELECT p.user_id, COUNT(*) AS post_count FROM posts p WHERE p.status = 'approved' AND p.user_id IS NOT NULL
      AND (p_period = 'all' OR (p_period = 'month' AND p.created_at >= date_trunc('month', now())) OR (p_period = 'year' AND p.created_at >= date_trunc('year', now()))) GROUP BY p.user_id
    ), badge_stats AS (SELECT ub.user_id, COUNT(*) AS badge_count FROM user_badges ub GROUP BY ub.user_id)
    SELECT ROW_NUMBER() OVER (ORDER BY ps.post_count DESC, COALESCE(bs.badge_count, 0) DESC)::BIGINT AS rank, ps.user_id, COALESCE(up.display_name, '名無し調査員')::TEXT, COALESCE(up.avatar_emoji, '🦞')::TEXT, ps.post_count, COALESCE(bs.badge_count, 0)::BIGINT, COUNT(*) OVER ()::BIGINT AS total_count
    FROM post_stats ps JOIN user_profiles up ON up.id = ps.user_id AND up.is_public = true LEFT JOIN badge_stats bs ON bs.user_id = ps.user_id ORDER BY ps.post_count DESC, COALESCE(bs.badge_count, 0) DESC LIMIT p_limit OFFSET p_offset;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_user_ranking(INTEGER, INTEGER, TEXT) TO authenticated, anon;

-- REQ-171: 発見の多様性 RPC（投稿数競争に代わるエンゲージ指標。Bonter 2023）。migration 20260603000003 と同期。
CREATE OR REPLACE FUNCTION get_user_diversity(p_limit INTEGER DEFAULT 50, p_offset INTEGER DEFAULT 0)
RETURNS TABLE (
  user_id UUID, display_name TEXT, avatar_emoji TEXT,
  info_type_coverage INTEGER, species_count INTEGER, municipality_count INTEGER, diversity_score INTEGER
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  WITH d AS (
    SELECT p.user_id,
      COUNT(DISTINCT p.info_type)::int AS info_type_coverage,
      COUNT(DISTINCT p.species)::int   AS species_count,
      COUNT(DISTINCT p.municipality) FILTER (WHERE p.municipality IS NOT NULL)::int AS municipality_count
    FROM posts p
    WHERE p.status = 'approved' AND p.user_id IS NOT NULL
    GROUP BY p.user_id
  )
  SELECT d.user_id,
    COALESCE(up.display_name, '名無し調査員')::text,
    COALESCE(up.avatar_emoji, '🦞')::text,
    d.info_type_coverage, d.species_count, d.municipality_count,
    (d.info_type_coverage + d.species_count + d.municipality_count)::int AS diversity_score
  FROM d JOIN user_profiles up ON up.id = d.user_id AND up.is_public = true
  ORDER BY d.info_type_coverage DESC, d.municipality_count DESC, d.species_count DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_user_diversity(INTEGER, INTEGER) TO authenticated, anon;

-- REQ-235: 品質連動ランキング RPC（量・いいね偏重の是正）。migration 20260615000005 と同期。
-- 「検証済み投稿数」を量、「承認率・定点率・GPS良好率・AI平均信頼度」を質としてペアで返す（Goodhart 対策）。
-- 既存 get_user_ranking / get_user_diversity と同じく is_public=true のみ・SECURITY DEFINER・集計値のみ（生 PII を返さない）・anon/authenticated GRANT。
CREATE OR REPLACE FUNCTION get_user_quality(p_limit INTEGER DEFAULT 50, p_offset INTEGER DEFAULT 0)
RETURNS TABLE (
  user_id UUID, display_name TEXT, avatar_emoji TEXT,
  verified_count BIGINT,        -- 承認済み（検証済み）投稿数＝量指標
  total_count BIGINT,           -- 全投稿数（承認率の分母）
  approval_rate NUMERIC,        -- 承認率 = verified_count / total_count（0..1）
  structured_count BIGINT,      -- 承認済みのうち定点反復調査（structured, REQ-174）
  structured_rate NUMERIC,      -- 定点率 = structured_count / verified_count（0..1）
  gps_good_count BIGINT,        -- 承認済みのうち GPS 精度 30m 以内（REQ-172）
  gps_good_rate NUMERIC,        -- GPS良好率 = gps_good_count / verified_count（0..1）
  avg_confidence NUMERIC,       -- 承認済みの AI 信頼度平均（NULL=AI 値なし）
  quality_score NUMERIC         -- 並べ替え用の合成スコア（量×質）
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  WITH q AS (
    SELECT p.user_id,
      COUNT(*) FILTER (WHERE p.status = 'approved')::bigint AS verified_count,
      COUNT(*)::bigint AS total_count,
      COUNT(*) FILTER (WHERE p.status = 'approved' AND p.survey_method = 'structured')::bigint AS structured_count,
      COUNT(*) FILTER (WHERE p.status = 'approved' AND p.accuracy IS NOT NULL AND p.accuracy <= 30)::bigint AS gps_good_count,
      avg((p.ai_result->>'confidence')::numeric) FILTER (WHERE p.status = 'approved' AND (p.ai_result->>'confidence') IS NOT NULL) AS avg_confidence
    FROM posts p
    WHERE p.user_id IS NOT NULL
    GROUP BY p.user_id
  )
  SELECT q.user_id,
    COALESCE(up.display_name, '名無し調査員')::text,
    COALESCE(up.avatar_emoji, '🦞')::text,
    q.verified_count,
    q.total_count,
    round(q.verified_count::numeric / NULLIF(q.total_count, 0), 4) AS approval_rate,
    q.structured_count,
    round(q.structured_count::numeric / NULLIF(q.verified_count, 0), 4) AS structured_rate,
    q.gps_good_count,
    round(q.gps_good_count::numeric / NULLIF(q.verified_count, 0), 4) AS gps_good_rate,
    round(q.avg_confidence, 4) AS avg_confidence,
    -- 合成スコア: 検証済み件数を質係数（定点率/GPS率/承認率の平均）で重み付け。量だけでは上がらない。
    round(
      q.verified_count
      * (1 + COALESCE(q.structured_count::numeric / NULLIF(q.verified_count, 0), 0)
           + COALESCE(q.gps_good_count::numeric / NULLIF(q.verified_count, 0), 0)
           + COALESCE(q.verified_count::numeric / NULLIF(q.total_count, 0), 0)),
      2
    ) AS quality_score
  FROM q JOIN user_profiles up ON up.id = q.user_id AND up.is_public = true
  WHERE q.verified_count > 0
  ORDER BY quality_score DESC, q.verified_count DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_user_quality(INTEGER, INTEGER) TO authenticated, anon;
COMMENT ON FUNCTION public.get_user_quality(INTEGER, INTEGER) IS
  'REQ-235: 品質連動ランキング。検証済み投稿数（量）と承認率/定点率/GPS良好率/AI平均信頼度（質）をペアで返す。いいね偏重を避け Goodhart 対策。';

-- REQ-173: 空間バイアス補正ナッジ用。直近 p_days 日の市区町村別件数。migration 20260603000004 と同期。
CREATE OR REPLACE FUNCTION public.get_undersurveyed_areas(p_days integer DEFAULT 90)
RETURNS TABLE (municipality text, recent_count bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT municipality, count(*)::bigint AS recent_count
  FROM posts
  WHERE status = 'approved'
    AND municipality IS NOT NULL
    AND created_at >= now() - make_interval(days => p_days)
  GROUP BY municipality;
$$;
GRANT EXECUTE ON FUNCTION public.get_undersurveyed_areas(integer) TO anon, authenticated;

-- ===================================================
-- 10-4. ユーザープロフィール取得 RPC
-- ===================================================
CREATE OR REPLACE FUNCTION get_user_profile(p_user_id UUID) RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_profile JSON;
BEGIN
  SELECT json_build_object(
    'id', up.id, 'display_name', COALESCE(up.display_name, '名無し調査員'), 'avatar_emoji', COALESCE(up.avatar_emoji, '🦞'), 'bio', up.bio, 'is_public', up.is_public, 'created_at', up.created_at,
    'post_count', (SELECT COUNT(*) FROM posts WHERE user_id = p_user_id AND status = 'approved'),
    'comment_count', (SELECT COUNT(*) FROM comments WHERE user_id = p_user_id),
    'municipality_count', (SELECT COUNT(DISTINCT municipality) FROM posts WHERE user_id = p_user_id AND status = 'approved' AND municipality IS NOT NULL),
    'badges', COALESCE((SELECT json_agg(json_build_object('id', bd.id, 'name', bd.name, 'icon', bd.icon, 'category', bd.category, 'description', bd.description, 'earned_at', ub.earned_at) ORDER BY bd.sort_order) FROM user_badges ub JOIN badge_definitions bd ON bd.id = ub.badge_id WHERE ub.user_id = p_user_id), '[]'::json),
    'recent_posts', COALESCE((SELECT json_agg(json_build_object('id', p.id, 'created_at', p.created_at, 'municipality', p.municipality, 'species', p.species, 'info_type', p.info_type, 'photos', p.photos) ORDER BY p.created_at DESC) FROM (SELECT * FROM posts WHERE user_id = p_user_id AND status = 'approved' ORDER BY created_at DESC LIMIT 10) p), '[]'::json)
  ) INTO v_profile FROM user_profiles up WHERE up.id = p_user_id AND (up.is_public = true OR up.id = (SELECT auth.uid()));
  RETURN v_profile;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_user_profile(UUID) TO authenticated, anon;

-- ===================================================
-- 10-5. 市区町村別投稿数集計 RPC (REQ-143)
-- ===================================================
CREATE OR REPLACE FUNCTION public.get_municipality_post_counts()
RETURNS TABLE (municipality text, post_count bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT municipality, count(*)::bigint AS post_count
  FROM posts
  WHERE status = 'approved' AND municipality IS NOT NULL
  GROUP BY municipality
  ORDER BY post_count DESC;
$$;
GRANT EXECUTE ON FUNCTION public.get_municipality_post_counts() TO anon, authenticated;
COMMENT ON FUNCTION public.get_municipality_post_counts() IS
  'REQ-143: approved 投稿の市区町村別件数を集計して返す RPC。SECURITY INVOKER で RLS を尊重する。';

CREATE INDEX IF NOT EXISTS idx_posts_approved_municipality
  ON public.posts (municipality)
  WHERE status = 'approved' AND municipality IS NOT NULL;

-- ===================================================
-- 10-6. 管理ダッシュボード集計 RPC (REQ-154)
-- 種別/情報種別/月次/市区町村の集計を Postgres 側で行い、全行転送を廃止する。
-- SECURITY INVOKER で RLS を尊重（管理者は全ステータス、非管理者は approved のみ）。
-- ===================================================
CREATE OR REPLACE FUNCTION public.get_admin_post_stats(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_max_months integer DEFAULT 12
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  v_to        timestamptz := coalesce(p_to, now());
  v_from      timestamptz := coalesce(p_from, date_trunc('month', v_to) - (p_max_months - 1) * interval '1 month');
  v_to_excl   timestamptz := v_to + interval '1 day';
  v_month_start timestamptz := date_trunc('month', v_from);
  v_month_end   timestamptz := date_trunc('month', v_to);
BEGIN
  SELECT jsonb_build_object(
    'species_counts', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('species', species, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb)
      FROM (SELECT species, count(*) AS cnt FROM posts
            WHERE created_at >= v_from AND created_at < v_to_excl GROUP BY species) s
    ),
    'info_type_counts', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('info_type', info_type, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb)
      FROM (SELECT info_type, count(*) AS cnt FROM posts
            WHERE created_at >= v_from AND created_at < v_to_excl GROUP BY info_type) i
    ),
    'municipality_counts', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('municipality', municipality, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb)
      FROM (SELECT municipality, count(*) AS cnt FROM posts
            WHERE created_at >= v_from AND created_at < v_to_excl AND municipality IS NOT NULL
            GROUP BY municipality) m
    ),
    'monthly', (
      SELECT coalesce(jsonb_agg(
               jsonb_build_object('month', to_char(g.m, 'YYYY-MM-DD'), 'count', coalesce(mc.cnt, 0)) ORDER BY g.m
             ), '[]'::jsonb)
      FROM generate_series(v_month_start, v_month_end, interval '1 month') AS g(m)
      LEFT JOIN (
        SELECT date_trunc('month', created_at) AS mon, count(*) AS cnt FROM posts
        WHERE created_at >= v_from AND created_at < v_to_excl GROUP BY 1
      ) mc ON mc.mon = g.m
    )
  ) INTO result;
  RETURN result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_admin_post_stats(timestamptz, timestamptz, integer) TO authenticated;
COMMENT ON FUNCTION public.get_admin_post_stats(timestamptz, timestamptz, integer) IS
  'REQ-154: 管理ダッシュボードの種別/情報種別/月次/市区町村集計を返す RPC。SECURITY INVOKER で RLS を尊重。';

-- ═══ REQ-243: 正確座標 RPC（所有者/管理者）と公開レベル管理 RPC（管理者）。migration 20260703000001 と同期 ═══
-- 所有者が自分の投稿の正確座標を取得（編集フロー等）。auth.uid()=user_id のときのみ返す。
CREATE OR REPLACE FUNCTION public.get_my_post_location(p_post_id uuid)
RETURNS TABLE(lat numeric, lng numeric, accuracy numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.lat, p.lng, p.accuracy
  FROM posts p
  WHERE p.id = p_post_id AND p.user_id = auth.uid() AND auth.uid() IS NOT NULL;
$$;
REVOKE EXECUTE ON FUNCTION public.get_my_post_location(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_post_location(uuid) TO authenticated;
COMMENT ON FUNCTION public.get_my_post_location(uuid) IS
  'REQ-243: 投稿所有者が自分の投稿の正確座標を取得する（auth.uid()=user_id のときのみ）。';

-- 管理者が任意投稿の正確座標を一括取得（審査・CSV・地図確認）。管理者以外には空を返す。
CREATE OR REPLACE FUNCTION public.get_admin_post_locations(p_ids uuid[])
RETURNS TABLE(id uuid, lat numeric, lng numeric, accuracy numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (auth.jwt() -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'admin' THEN
    RETURN;
  END IF;
  RETURN QUERY SELECT p.id, p.lat, p.lng, p.accuracy FROM posts p WHERE p.id = ANY(p_ids);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_admin_post_locations(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_admin_post_locations(uuid[]) TO authenticated;
COMMENT ON FUNCTION public.get_admin_post_locations(uuid[]) IS
  'REQ-243: 管理者が投稿の正確座標を一括取得（審査/CSV/地図確認）。管理者クレーム以外は空を返す。';

-- 管理者が記録単位で公開レベルを設定・変更する。
CREATE OR REPLACE FUNCTION public.set_post_location_disclosure(p_post_id uuid, p_level text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (auth.jwt() -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'admin only' USING ERRCODE = '42501';
  END IF;
  IF p_level NOT IN ('precise', 'coarsened', 'hidden') THEN
    RAISE EXCEPTION 'invalid disclosure level: %', p_level USING ERRCODE = '22023';
  END IF;
  UPDATE posts SET location_disclosure = p_level WHERE id = p_post_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.set_post_location_disclosure(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_post_location_disclosure(uuid, text) TO authenticated;
COMMENT ON FUNCTION public.set_post_location_disclosure(uuid, text) IS
  'REQ-243 FR-243-01b: 管理者が投稿記録の公開レベルを設定する（admin クレーム必須）。';

-- 管理者が種ごとの既定公開レベルを設定・変更する。
CREATE OR REPLACE FUNCTION public.set_species_location_default(p_species text, p_level text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (auth.jwt() -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'admin only' USING ERRCODE = '42501';
  END IF;
  IF p_level NOT IN ('precise', 'coarsened', 'hidden') THEN
    RAISE EXCEPTION 'invalid disclosure level: %', p_level USING ERRCODE = '22023';
  END IF;
  INSERT INTO species_location_defaults (species, default_disclosure, updated_at, updated_by)
  VALUES (p_species, p_level, now(), auth.uid())
  ON CONFLICT (species) DO UPDATE
    SET default_disclosure = EXCLUDED.default_disclosure, updated_at = now(), updated_by = auth.uid();
END;
$$;
REVOKE EXECUTE ON FUNCTION public.set_species_location_default(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_species_location_default(text, text) TO authenticated;
COMMENT ON FUNCTION public.set_species_location_default(text, text) IS
  'REQ-243 FR-243-01b: 管理者が種ごとの既定公開レベルを設定する（admin クレーム必須）。';

-- ===================================================
-- 10-8. 管理者ログインのサーバー側レート制限 + 監査 (REQ-149)
-- extract_request_ip() で IP をサーバー側取得し (email_hash, ip) 単位でロック判定。
-- RLS 有効 + ポリシー無し → SECURITY DEFINER 関数経由のみアクセス可。
-- ===================================================
CREATE TABLE IF NOT EXISTS public.admin_login_attempts (
  email_hash        text        NOT NULL,
  ip                text        NOT NULL DEFAULT '',
  attempt_count     integer     NOT NULL DEFAULT 0,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  locked_until      timestamptz,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (email_hash, ip)
);
ALTER TABLE public.admin_login_attempts ENABLE ROW LEVEL SECURITY;
-- REQ-221: 内部専用テーブル（フロントは .from() しない）。RLS 有効・ポリシー 0 件で、
--   アクセスは admin_login_check / admin_login_record（SECURITY DEFINER）経由のみ。
--   Supabase 既定 GRANT（anon: SELECT/INSERT, authenticated: ALL）は不要なため剥がす（多層防御）。
--   live DB では既定 GRANT が後から効くため、本 REVOKE は migration 20260616000004 でも再確定する。
REVOKE ALL ON public.admin_login_attempts FROM anon, authenticated;

-- REQ-292（20260730000001）: 認可欠陥の修復。
--   問題A: p_success は呼び出し側の申告以外に根拠が無く、anon キーで {"p_success":true} を 1 回投げる
--          だけで admin_login_attempts の行が DELETE され attempt_count が 0 に戻った（ロック無制限回避）。
--   問題B: カウンタが増えるのはフロントが admin_login_record(...,false) を呼んだときだけで、
--          `/auth/v1/token` 直叩きでは記録関数が呼ばれず**サーバー側ロックが一度も発火しなかった**。
--   問題C: SECURITY DEFINER が audit_logs の admin 限定 INSERT ポリシーをバイパスするため、anon が
--          任意 email_hash / attempt_count の login_failed 行と admin_id=NULL の login_success 行を
--          無制限に注入できた（append-only ＝ 管理者にも消せない恒久汚染＋ストレージ DoS）。
--   対処: (1) anon EXECUTE を剥奪、(2) 本体を fail-closed 化、(3) login_success は auth.uid() と
--         メール一致が必須（FR-292-03）、(4) 失敗記録はサーバー側呼び出し元専用、
--         (5) Auth Hook 関数 admin_login_password_attempt を新設して直叩き経路も記録する。
CREATE OR REPLACE FUNCTION public.admin_login_check(p_email text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_ip   text := coalesce(public.extract_request_ip(), '');
  v_hash text := md5(lower(coalesce(p_email, '')));
  v_lock timestamptz;
BEGIN
  -- REQ-292 FR-292-02: 副作用は無いが「任意メールのロック状態問い合わせ」＝管理者メールの当て推量に
  -- 使えるため、サーバー側呼び出し元のみに限定する（フロントからは呼ばない）。
  IF NOT public._req292_is_server_caller() THEN
    RAISE EXCEPTION 'REQ-292: admin_login_check is server-side only'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT locked_until INTO v_lock FROM admin_login_attempts WHERE email_hash = v_hash AND ip = v_ip;
  IF v_lock IS NOT NULL AND v_lock > now() THEN
    RETURN jsonb_build_object('locked', true, 'retry_after_seconds', ceil(extract(epoch FROM (v_lock - now())))::int);
  END IF;
  RETURN jsonb_build_object('locked', false, 'retry_after_seconds', 0);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_login_record(p_email text, p_success boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_ip      text := coalesce(public.extract_request_ip(), '');
  v_hash    text;
  v_headers jsonb := coalesce(current_setting('request.headers', true)::jsonb, '{}'::jsonb);
  v_ua      text := v_headers ->> 'user-agent';
  v_uid     uuid := auth.uid();
  v_email   text := lower(btrim(coalesce(p_email, '')));
  v_self    text;
  v_count   int := 0;
  v_locked  timestamptz;
  c_max     constant int := 5;
  c_window  constant interval := interval '15 minutes';
  c_lock    constant interval := interval '15 minutes';
  c_dedup   constant interval := interval '60 seconds';
BEGIN
  IF v_email = '' THEN
    RAISE EXCEPTION 'REQ-292: p_email is required' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  v_hash := md5(v_email);

  -- 成功記録: 本人（auth.uid()）による自己申告のみ（FR-292-03）。
  --   anon は auth.uid()=NULL で到達不能 → 問題A が閉じる。他人のメールでカウンタを消せない。
  --   admin_id=NULL の login_success 行が構造的に作れない → 問題C の後半が閉じる。
  IF p_success THEN
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'REQ-292: login_success requires an authenticated session'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    SELECT lower(u.email) INTO v_self FROM auth.users u WHERE u.id = v_uid;
    IF v_self IS NULL OR v_self <> v_email THEN
      RAISE EXCEPTION 'REQ-292: p_email does not match the authenticated user'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- ip 条件は付けない: Auth Hook 経路の行は ip='' で記録されるため ip 一致では消えず残ってしまう。
    DELETE FROM admin_login_attempts WHERE email_hash = v_hash;
    -- Auth Hook が同じ成功を記録済みなら二重に積まない（60 秒の冪等ウィンドウ）。
    IF NOT EXISTS (
      SELECT 1 FROM audit_logs
      WHERE action = 'login_success' AND admin_id = v_uid AND created_at > now() - c_dedup
    ) THEN
      INSERT INTO audit_logs (admin_id, action, target_type, target_id, details)
      VALUES (v_uid, 'login_success', 'user', v_uid,
              jsonb_build_object('ip', v_ip, 'user_agent', v_ua, 'source', 'client_rpc'));
    END IF;
    RETURN jsonb_build_object('locked', false);
  END IF;

  -- 失敗記録: サーバー側イベント専用（問題C の前半を閉じる）。
  IF NOT public._req292_is_server_caller() THEN
    RAISE EXCEPTION 'REQ-292: login_failed can only be recorded server-side'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  INSERT INTO admin_login_attempts (email_hash, ip, attempt_count, window_started_at, updated_at)
  VALUES (v_hash, v_ip, 1, now(), now())
  ON CONFLICT (email_hash, ip) DO UPDATE SET
    attempt_count = CASE WHEN admin_login_attempts.window_started_at < now() - c_window THEN 1 ELSE admin_login_attempts.attempt_count + 1 END,
    window_started_at = CASE WHEN admin_login_attempts.window_started_at < now() - c_window THEN now() ELSE admin_login_attempts.window_started_at END,
    updated_at = now()
  RETURNING attempt_count INTO v_count;
  IF v_count >= c_max THEN
    v_locked := now() + c_lock;
    UPDATE admin_login_attempts SET locked_until = v_locked WHERE email_hash = v_hash AND ip = v_ip;
  END IF;
  INSERT INTO audit_logs (admin_id, action, target_type, target_id, details)
  VALUES (NULL, 'login_failed', 'user', NULL, jsonb_build_object('ip', v_ip, 'email_hash', v_hash, 'attempt_count', v_count, 'reason', 'invalid_credentials', 'source', 'server_rpc'));
  RETURN jsonb_build_object('locked', v_count >= c_max,
    'retry_after_seconds', CASE WHEN v_locked IS NOT NULL THEN ceil(extract(epoch FROM (v_locked - now())))::int ELSE 0 END,
    'attempt_count', v_count);
END; $$;

-- REQ-292 FR-292-01(a): Supabase Password Verification Attempt Hook。
--   GoTrue がパスワード検証の直後に呼ぶため `/auth/v1/token` 直叩きでも必ず通り、「フロントが自発的に
--   申告したときだけ記録される」という問題B の本質が解消する（有効化は Dashboard / config.toml 側の操作）。
--   ペイロードは {"user_id","valid"} のみで email も IP も含まれない（IP は '' になる）。
--   ⚠ 常に decision=continue を返す（reject は返さない）: IP が無いためカウンタが「メール単位・全 IP
--     共通」になり、reject を有効にすると未認証の第三者が管理者メールで 5 回失敗させるだけで正規管理者を
--     ロックアウトできる（管理者 DoS）。総当たり上限は Supabase Auth 自身の /auth/v1/token レート制限に
--     委ね、本フックは「試行が偽造不能な形で監査ログに残り検知できる」ことを担保範囲とする。
--   ⚠ fail-open: フックが例外を投げると全ユーザーのパスワードログインが失敗するため、本体全体を
--     EXCEPTION WHEN others で包み、いかなる内部エラーでも continue を返す。
CREATE OR REPLACE FUNCTION public.admin_login_password_attempt(event jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid    uuid;
  v_valid  boolean;
  v_email  text;
  v_hash   text;
  v_ip     text := coalesce(public.extract_request_ip(), '');
  v_count  int := 0;
  c_max    constant int := 5;
  c_window constant interval := interval '15 minutes';
  c_lock   constant interval := interval '15 minutes';
  c_dedup  constant interval := interval '60 seconds';
  c_ok     constant jsonb := jsonb_build_object('decision', 'continue');
BEGIN
  -- PostgREST 経由（anon / authenticated）で呼ばれた場合は副作用を起こさず素通りさせる。
  -- これが無いと、Supabase 既定の一括 GRANT EXECUTE が復活した際に anon が
  -- {"user_id":"<管理者>","valid":true} を投げてカウンタを消せる＝問題A の再来になる。
  IF NOT public._req292_is_server_caller() THEN
    RETURN c_ok;
  END IF;
  v_uid   := NULLIF(event #>> '{user_id}', '')::uuid;
  v_valid := coalesce((event #>> '{valid}')::boolean, false);
  IF v_uid IS NULL THEN RETURN c_ok; END IF;
  SELECT lower(u.email) INTO v_email FROM auth.users u WHERE u.id = v_uid;
  IF v_email IS NULL OR v_email = '' THEN RETURN c_ok; END IF;
  v_hash := md5(v_email);

  IF v_valid THEN
    DELETE FROM admin_login_attempts WHERE email_hash = v_hash;
    IF NOT EXISTS (
      SELECT 1 FROM audit_logs
      WHERE action = 'login_success' AND admin_id = v_uid AND created_at > now() - c_dedup
    ) THEN
      INSERT INTO audit_logs (admin_id, action, target_type, target_id, details)
      VALUES (v_uid, 'login_success', 'user', v_uid, jsonb_build_object('ip', v_ip, 'source', 'auth_hook'));
    END IF;
    RETURN c_ok;
  END IF;

  INSERT INTO admin_login_attempts (email_hash, ip, attempt_count, window_started_at, updated_at)
  VALUES (v_hash, v_ip, 1, now(), now())
  ON CONFLICT (email_hash, ip) DO UPDATE SET
    attempt_count = CASE WHEN admin_login_attempts.window_started_at < now() - c_window THEN 1 ELSE admin_login_attempts.attempt_count + 1 END,
    window_started_at = CASE WHEN admin_login_attempts.window_started_at < now() - c_window THEN now() ELSE admin_login_attempts.window_started_at END,
    updated_at = now()
  RETURNING attempt_count INTO v_count;
  IF v_count >= c_max THEN
    UPDATE admin_login_attempts SET locked_until = now() + c_lock WHERE email_hash = v_hash AND ip = v_ip;
  END IF;
  -- email_hash はサーバー側で auth.users から導出しているため偽造できない（問題C との差）。
  INSERT INTO audit_logs (admin_id, action, target_type, target_id, details)
  VALUES (NULL, 'login_failed', 'user', NULL, jsonb_build_object('ip', v_ip, 'email_hash', v_hash, 'attempt_count', v_count, 'reason', 'invalid_credentials', 'source', 'auth_hook'));
  RETURN c_ok;
EXCEPTION WHEN others THEN
  RETURN c_ok;  -- fail-open: 監査記録に失敗してもログインは止めない
END; $$;

-- REQ-292 FR-292-02: anon の EXECUTE を剥奪する。
--   admin_login_record の authenticated は「本人の login_success 自己申告」のために残す
--   （p_email が auth.uid() のメールと一致しないと本体が 42501 を返すため他人の行は作れない）。
--   admin_login_check は用途が消えたため authenticated も剥がす。
REVOKE EXECUTE ON FUNCTION public.admin_login_check(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_login_check(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_login_record(text, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_login_record(text, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_login_record(text, boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_login_password_attempt(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_login_password_attempt(jsonb) FROM anon, authenticated;
-- supabase_auth_admin はローカル CI の擬似環境には存在しないため存在確認してから GRANT する（冪等）。
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA public TO supabase_auth_admin';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.admin_login_password_attempt(jsonb) TO supabase_auth_admin';
  END IF;
END $$;

COMMENT ON FUNCTION public.admin_login_check(text) IS
  'REQ-149 / REQ-292: 管理者ログインのロック状態読み取り。REQ-292 で anon/authenticated の EXECUTE を剥奪し、本体もサーバー側呼び出し元限定にした（任意メールのロック状態問い合わせ＝メール当て推量を封じる）。フロントからは呼ばない。';
COMMENT ON FUNCTION public.admin_login_record(text, boolean) IS
  'REQ-149 / REQ-292: ログイン試行の記録。REQ-292 で anon EXECUTE を剥奪し、p_success=true は auth.uid() とメール一致が必須（admin_id NULL の login_success を作れない）、p_success=false は service_role / Auth Hook 等のサーバー側呼び出し元専用にした。';
COMMENT ON FUNCTION public.admin_login_password_attempt(jsonb) IS
  'REQ-292 FR-292-01(a): Supabase Password Verification Attempt Hook。/auth/v1/token 直叩きも含む全パスワード認証試行を admin_login_attempts と audit_logs に記録する。常に decision=continue（reject は返さない: ペイロードに IP が無くメール単位ロックになるため管理者ロックアウト DoS を招く）。例外は握り潰して fail-open（フックのエラーは全ユーザーのログイン障害になる）。';

-- ===================================================
-- 11. 不在確認（absence）機能
-- ===================================================

-- info_type CHECK 制約を更新（absence を追加）
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_info_type_check;
ALTER TABLE posts ADD CONSTRAINT posts_info_type_check
  CHECK (info_type IN ('sighting', 'capture', 'trace', 'damage', 'absence'));

-- 調査時間カラムを追加（任意・不在確認時に使用）
ALTER TABLE posts ADD COLUMN IF NOT EXISTS
  survey_duration_minutes INTEGER
    CHECK (survey_duration_minutes > 0 AND survey_duration_minutes <= 480);

COMMENT ON COLUMN posts.survey_duration_minutes IS '調査時間（分）。不在確認（absence）時に任意入力。最大480分（8時間）。';

-- ===================================================
-- 12. ユーザープロフィール・バッジ・ランキング (GAME-001)
-- ===================================================

-- user_profiles テーブル
CREATE TABLE IF NOT EXISTS user_profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name  TEXT CHECK (display_name IS NULL OR char_length(display_name) BETWEEN 1 AND 20),
  avatar_emoji  TEXT DEFAULT '🦞',
  bio           TEXT CHECK (bio IS NULL OR char_length(bio) <= 100),
  is_public     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE user_profiles IS 'ユーザー公開プロフィール（バッジ・ランキング用）';

-- REQ-088: 調査依頼系の通知 opt-in（migration 20260425000004 と同期）
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS notify_survey_request  BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_response_digest BOOLEAN NOT NULL DEFAULT true;

-- REQ-234: ライフサイクルメールの購読カテゴリ + 配信停止トークン（migration 20260615000006 と同期）。
-- 配信停止トークンは auth.users.id を直載せしない不透明なランダム値（列挙・推測耐性 / NFR-234-03）。
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS notify_research_adopted BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_dormant_reengage BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_weekly_digest    BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS unsubscribe_token       UUID NOT NULL DEFAULT gen_random_uuid();
COMMENT ON COLUMN user_profiles.notify_research_adopted IS 'REQ-234: 研究採用通知の opt-in フラグ';
COMMENT ON COLUMN user_profiles.notify_dormant_reengage IS 'REQ-234: 休眠復帰メール（14 日無活動）の opt-in フラグ';
COMMENT ON COLUMN user_profiles.notify_weekly_digest IS 'REQ-234: 週次ダイジェストの opt-in フラグ';
COMMENT ON COLUMN user_profiles.unsubscribe_token IS 'REQ-234: List-Unsubscribe 用の不透明な配信停止トークン（auth.users.id を直載せしない / NFR-234-03）';
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_unsubscribe_token ON user_profiles (unsubscribe_token);

-- REQ-237: Web Push のカテゴリ別 opt-in（メール=REQ-234 とは別チャネル / migration 20260615000007 と同期）。
-- 既定 false: 許諾はブラウザ許諾を取って初めて有効化する明示オプトイン前提（FR-237-04）。
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS notify_push_post_status BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_push_comment     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_push_nearby      BOOLEAN NOT NULL DEFAULT false;
COMMENT ON COLUMN user_profiles.notify_push_post_status IS 'REQ-237: 投稿の承認/却下を Web Push で受け取る opt-in（FR-237-06）';
COMMENT ON COLUMN user_profiles.notify_push_comment IS 'REQ-237: 自分の投稿へのコメントを Web Push で受け取る opt-in';
COMMENT ON COLUMN user_profiles.notify_push_nearby IS 'REQ-237: 周辺/地域の新着を Web Push で受け取る opt-in';

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "public_profiles_viewable" ON user_profiles FOR SELECT USING (is_public = true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "own_profile_viewable" ON user_profiles FOR SELECT USING (auth.uid() = id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "own_profile_editable" ON user_profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "own_profile_insertable" ON user_profiles FOR INSERT WITH CHECK (auth.uid() = id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 新規ユーザー登録時に自動で user_profiles を作成（Google OAuth 等）
-- REQ-221: SECURITY DEFINER 関数は search_path を固定し、スキーマ解決の乗っ取りを防ぐ
--          （Splinter 0011_function_search_path_mutable）。
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, display_name, avatar_emoji)
  VALUES (
    NEW.id,
    LEFT(
      COALESCE(
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'name',
        '名無し'
      ),
      20
    ),
    '🦞'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- 旧トリガーを削除（マイグレーション版との重複を解消）
DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

DROP TRIGGER IF EXISTS set_profile_updated_at ON user_profiles;
CREATE TRIGGER set_profile_updated_at
  BEFORE UPDATE ON user_profiles FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- badge_definitions テーブル
CREATE TABLE IF NOT EXISTS badge_definitions (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL,
  icon        TEXT NOT NULL,
  category    TEXT NOT NULL CHECK (category IN ('posting', 'quality', 'community', 'special')),
  sort_order  INTEGER DEFAULT 0
);

ALTER TABLE badge_definitions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "badge_defs_viewable" ON badge_definitions FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO badge_definitions (id, name, description, icon, category, sort_order) VALUES
  ('first_post',         'はじめての投稿',     '初めて投稿が承認された',                    '🌱', 'posting',   10),
  ('posts_10',           '調査員',             '承認済み投稿10件達成',                       '🔍', 'posting',   20),
  ('posts_50',           'ベテラン調査員',      '承認済み投稿50件達成',                       '🏅', 'posting',   30),
  ('posts_100',          'マスター調査員',      '承認済み投稿100件達成',                      '🏆', 'posting',   40),
  ('multi_species',      '両生類ハンター',      'アメリカザリガニとウシガエル両方を投稿',     '🐸', 'quality',   50),
  ('multi_municipality', '広域調査員',         '3つ以上の市区町村で投稿',                    '🗺️', 'quality',   60),
  ('first_comment',      'コメンテーター',      '初めてコメントした',                         '💬', 'community', 70),
  ('absence_reporter',   '不在確認員',         '不在確認を5件以上投稿',                      '✅', 'special',   80),
  ('ai_perfect',         'AI太鼓判',           'AI信頼度95%以上で自動承認',                  '🤖', 'quality',   90),
  -- REQ-235: 品質連動バッジ（量・いいね偏重を是正し「検証された貢献」を称える / Goodhart 対策）。
  ('verified_25',        '検証済み調査員',      '審査を通過した検証済み投稿が25件',           '🔬', 'quality',  100),
  ('high_accuracy_10',   '高精度同定者',        'AI信頼度90%以上での自動承認が10件',          '🎯', 'quality',  110),
  ('structured_observer','定点観察者',          '定点反復調査（structured）の投稿が10件',     '📍', 'quality',  120),
  ('precise_locator',    '高精度測位者',        'GPS精度30m以内の高精度な位置情報が20件',     '🛰️', 'quality',  130)
ON CONFLICT (id) DO NOTHING;

-- user_badges テーブル
CREATE TABLE IF NOT EXISTS user_badges (
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_id   TEXT REFERENCES badge_definitions(id),
  earned_at  TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, badge_id)
);

ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "badges_viewable" ON user_badges FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ===================================================
-- 12-1. 貢献レベル / 経験値（XP）エンジン (REQ-248)
--   DB 権威・改竄不能・品質連動の進行エンジン。バッジ / ランキング / 機能解放 / コレクションが
--   参照する「唯一の進行の正」。承認遷移（pending→approved）でのみ XP を加算し、未承認 / 却下 /
--   いいねは決して報酬にしない（Goodhart 対策・check_and_grant_badges と同一ガード / schema.sql:1073）。
--   migration 20260703000004_contribution_level_xp_engine.sql と同一定義（REQ-003 ドリフトゼロ）。
-- ===================================================

-- (A) レベル曲線（単一ソース / FR-248-03）。src/lib/constants.ts の XP_LEVEL_COEFF / xpForLevel /
--     levelForXp と厳密同期する。
--     xp_for_level(L) = XP_LEVEL_COEFF * (L-1) * L  （L>=1・整数・単調増加）
--       例: L1=0, L2=50, L3=150, L4=300, L5=500, L10=2250, L20=9500。
--       隣接レベル差 = 50*L（線形増加＝低レベルは軽く上位ほど重い）。REQ-249 の機能解放・
--       REQ-250 の水槽容量はこのレベル値にマップする。
CREATE OR REPLACE FUNCTION xp_for_level(p_level integer)
RETURNS bigint LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN p_level <= 1 THEN 0::bigint
              ELSE 25::bigint * (p_level - 1)::bigint * p_level::bigint END;
$$;
COMMENT ON FUNCTION xp_for_level(integer) IS
  'REQ-248 FR-248-03: レベル曲線の単一ソース。xp_for_level(L)=25*(L-1)*L。src/lib/constants.ts の xpForLevel と同期。';

--     level_for_xp(xp): xp_for_level(L) <= xp を満たす最大 L（>=1）。閉形式 + 整数補正で float 誤差を吸収。
CREATE OR REPLACE FUNCTION level_for_xp(p_xp bigint)
RETURNS integer LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE v_level integer;
BEGIN
  IF p_xp IS NULL OR p_xp <= 0 THEN RETURN 1; END IF;
  -- L = floor((C + sqrt(C^2 + 4*C*xp)) / (2C)), C=25 → floor((25 + sqrt(625 + 100*xp)) / 50)
  v_level := floor((25 + sqrt(625 + 100 * p_xp::numeric)) / 50)::integer;
  IF v_level < 1 THEN v_level := 1; END IF;
  -- 境界での取りこぼし / 行き過ぎを整数比較で補正（sqrt の丸め誤差対策）。
  WHILE xp_for_level(v_level + 1) <= p_xp LOOP v_level := v_level + 1; END LOOP;
  WHILE v_level > 1 AND xp_for_level(v_level) > p_xp LOOP v_level := v_level - 1; END LOOP;
  RETURN v_level;
END;
$$;
COMMENT ON FUNCTION level_for_xp(bigint) IS
  'REQ-248 FR-248-03: 累積 XP からレベルを算出（xp_for_level の逆関数・整数補正）。src/lib/constants.ts の levelForXp と同期。';

-- (B) XP 係数の単一ソース（品質連動 / FR-248-01）。トリガーとバックフィルの双方がこの関数を呼ぶ（DRY）。
--     係数はここだけで調整する（運用調整可能な定数）。すべて「承認済み投稿」への加点であり、
--     いいね・pending・rejected には一切加点しない（Goodhart 対策）。
CREATE OR REPLACE FUNCTION xp_for_post(
  p_auto_approved         boolean,   -- posts.auto_approved
  p_confidence            numeric,   -- posts.ai_result->>'confidence'
  p_survey_method         text,      -- posts.survey_method（'structured'=定点観察 REQ-174）
  p_accuracy              numeric,   -- posts.accuracy（GPS 水平精度 m・REQ-172）
  p_info_type             text,      -- posts.info_type（'absence'=不在確認＝価値ある負データ）
  p_is_first_species      boolean,   -- そのユーザー初の当該 species 承認投稿か（初回発見・図鑑の種＝REQ-250）
  p_is_first_info_type    boolean,   -- そのユーザー初の当該 info_type 承認投稿か
  p_is_first_municipality boolean    -- そのユーザー初の当該 municipality 承認投稿か
) RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT 10                                                                              -- XP_BASE: 承認済み投稿1件の基本
       + CASE WHEN p_auto_approved AND COALESCE(p_confidence, 0) >= 0.9 THEN 5 ELSE 0 END -- +5 高精度同定（自動承認×信頼度0.9+）
       + CASE WHEN p_survey_method = 'structured' THEN 5 ELSE 0 END                        -- +5 定点観察（REQ-174）
       + CASE WHEN p_accuracy IS NOT NULL AND p_accuracy <= 30 THEN 3 ELSE 0 END           -- +3 GPS 良好（30m 以内・REQ-172）
       + CASE WHEN p_info_type = 'absence' THEN 4 ELSE 0 END                               -- +4 不在確認（負データ）
       + CASE WHEN p_is_first_species THEN 15 ELSE 0 END                                   -- +15 初回発見: 種
       + CASE WHEN p_is_first_info_type THEN 10 ELSE 0 END                                 -- +10 初回発見: 情報種別
       + CASE WHEN p_is_first_municipality THEN 12 ELSE 0 END;                             -- +12 初回発見: 市区町村
$$;
COMMENT ON FUNCTION xp_for_post(boolean, numeric, text, numeric, text, boolean, boolean, boolean) IS
  'REQ-248 FR-248-01: 承認済み投稿1件あたりの XP（基本+品質+初回発見）。係数の単一ソース。award_xp_on_approval と recompute_all_progress が共用。';

-- (C) 日次 XP 上限（ファーミング抑止 / FR-248-02）。同一ユーザーが1日に得られる XP の上限。
--     量産で稼ぐ動機を断つ。初回発見ボーナスが自然逓減する設計と併せ、反復投稿の旨味を小さくする。
CREATE OR REPLACE FUNCTION xp_daily_cap()
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = public AS $$ SELECT 120; $$;   -- XP_DAILY_CAP
COMMENT ON FUNCTION xp_daily_cap() IS
  'REQ-248 FR-248-02: 1日あたり XP 上限（ファーミング抑止）。src/lib/constants.ts の XP_DAILY_CAP と同期。';

-- (D) 進行テーブル（DB 権威・改竄不能 / FR-248-04）。書き込みは award_xp_on_approval トリガーと
--     recompute_all_progress 関数のみ。INSERT/UPDATE ポリシーを作らない＝一般ユーザーは書けない
--     （user_badges と同一パターン / schema.sql:1740-1741）。
CREATE TABLE IF NOT EXISTS user_progress (
  user_id       UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  xp            BIGINT NOT NULL DEFAULT 0 CHECK (xp >= 0),
  level         INT NOT NULL DEFAULT 1 CHECK (level >= 1),
  -- FR-248-02: 日次上限の判定用。daily_xp_date が当日でなければ 0 とみなしてリセットする（遅延リセット）。
  daily_xp      BIGINT NOT NULL DEFAULT 0 CHECK (daily_xp >= 0),
  daily_xp_date DATE,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE user_progress IS
  'REQ-248: 貢献レベル/XP（DB 権威・改竄不能）。書き込みは award_xp_on_approval / recompute_all_progress のみ（INSERT/UPDATE ポリシー無し＝user_badges と同パターン）。';

ALTER TABLE user_progress ENABLE ROW LEVEL SECURITY;
-- SELECT: 本人 OR 公開プロフィール（ランキング RPC と同じ is_public 準拠 / NFR-248-02）。
-- 書き込みポリシーは意図的に作らない（トリガー / SECURITY DEFINER 関数のみが書ける）。
DO $$ BEGIN
  CREATE POLICY "progress_viewable" ON user_progress FOR SELECT USING (
    (SELECT auth.uid()) = user_id
    OR EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = user_progress.user_id AND up.is_public = true)
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- (E) XP 付与トリガー関数（FR-248-01 / FR-248-04 / NFR-248-01）。承認遷移でのみ発火。
--     check_and_grant_badges とは独立した兄弟トリガー（相互非干渉）。XP 付与の失敗は
--     承認本体をロールバックさせない（best-effort・EXCEPTION で握って承認は必ず通す）。
CREATE OR REPLACE FUNCTION award_xp_on_approval()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id           uuid;
  v_is_first_species  boolean;
  v_is_first_info     boolean;
  v_is_first_muni     boolean;
  v_award             integer;
  v_cap               integer := xp_daily_cap();
  v_used_today        bigint;
  v_grant             bigint;
BEGIN
  -- 承認遷移（pending→approved）でのみ発火（check_and_grant_badges と同一ガード / schema.sql:1073）。
  IF NEW.status <> 'approved' OR (TG_OP = 'UPDATE' AND OLD.status = 'approved') THEN RETURN NEW; END IF;
  v_user_id := NEW.user_id;
  IF v_user_id IS NULL THEN RETURN NEW; END IF;

  BEGIN
    -- 初回発見判定: この投稿を含めて承認済みが1件なら初回（承認済みのみ母集合＝Goodhart 対策）。
    SELECT COUNT(*) = 1 INTO v_is_first_species
      FROM posts WHERE user_id = v_user_id AND status = 'approved' AND species = NEW.species;
    SELECT COUNT(*) = 1 INTO v_is_first_info
      FROM posts WHERE user_id = v_user_id AND status = 'approved' AND info_type = NEW.info_type;
    IF NEW.municipality IS NULL THEN
      v_is_first_muni := false;
    ELSE
      SELECT COUNT(*) = 1 INTO v_is_first_muni
        FROM posts WHERE user_id = v_user_id AND status = 'approved' AND municipality = NEW.municipality;
    END IF;

    v_award := xp_for_post(
      NEW.auto_approved, (NEW.ai_result->>'confidence')::numeric, NEW.survey_method,
      NEW.accuracy, NEW.info_type, v_is_first_species, v_is_first_info, v_is_first_muni
    );

    -- 日次上限（FR-248-02）。当日すでに付与した分を差し引いた残量だけ付与する。
    SELECT CASE WHEN daily_xp_date = CURRENT_DATE THEN daily_xp ELSE 0 END
      INTO v_used_today FROM user_progress WHERE user_id = v_user_id;
    v_used_today := COALESCE(v_used_today, 0);
    v_grant := LEAST(v_award, GREATEST(0, v_cap - v_used_today));
    IF v_grant <= 0 THEN RETURN NEW; END IF;

    INSERT INTO user_progress (user_id, xp, level, daily_xp, daily_xp_date, updated_at)
    VALUES (v_user_id, v_grant, level_for_xp(v_grant), v_grant, CURRENT_DATE, now())
    ON CONFLICT (user_id) DO UPDATE SET
      xp            = user_progress.xp + v_grant,
      level         = level_for_xp(user_progress.xp + v_grant),
      daily_xp      = CASE WHEN user_progress.daily_xp_date = CURRENT_DATE
                           THEN user_progress.daily_xp + v_grant ELSE v_grant END,
      daily_xp_date = CURRENT_DATE,
      updated_at    = now();
  EXCEPTION WHEN OTHERS THEN
    -- NFR-248-01: XP 付与のいかなる失敗も承認本体を壊さない。警告のみ残す。
    RAISE WARNING 'award_xp_on_approval failed for user %: %', v_user_id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_post_approved_award_xp ON posts;
CREATE TRIGGER on_post_approved_award_xp
  AFTER UPDATE ON posts FOR EACH ROW
  EXECUTE FUNCTION award_xp_on_approval();

-- (F) バックフィル / 再計算（NFR-248-03）。既存ユーザーのレベルを承認済み投稿から遡って算出する。
--     係数変更時の再計算にも使う。トリガーと同じ xp_for_post / xp_daily_cap / level_for_xp を用い、
--     日次上限は「承認済み投稿の作成日」ごとに適用する。権限: JWT 無し（migration / 直 DB）または
--     service_role / admin のみ（一般ユーザーは実行不可 / protect_post_insert_columns と同じ判定思想）。
CREATE OR REPLACE FUNCTION recompute_all_progress()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE jwt_claims jsonb;
BEGIN
  BEGIN
    jwt_claims := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb;
  EXCEPTION WHEN OTHERS THEN jwt_claims := NULL;
  END;
  IF jwt_claims IS NOT NULL AND jwt_claims <> '{}'::jsonb THEN
    IF (jwt_claims ->> 'role') IS DISTINCT FROM 'service_role'
       AND (jwt_claims -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'admin' THEN
      RAISE EXCEPTION 'Permission denied';
    END IF;
  END IF;

  WITH approved AS (
    SELECT p.user_id,
      COALESCE(p.created_at, now())::date AS d,
      xp_for_post(
        p.auto_approved,
        (p.ai_result->>'confidence')::numeric,
        p.survey_method,
        p.accuracy,
        p.info_type,
        ROW_NUMBER() OVER (PARTITION BY p.user_id, p.species      ORDER BY p.created_at, p.id) = 1,
        ROW_NUMBER() OVER (PARTITION BY p.user_id, p.info_type    ORDER BY p.created_at, p.id) = 1,
        p.municipality IS NOT NULL
          AND ROW_NUMBER() OVER (PARTITION BY p.user_id, p.municipality ORDER BY p.created_at, p.id) = 1
      ) AS xp
    FROM posts p
    WHERE p.status = 'approved' AND p.user_id IS NOT NULL
  ),
  daily AS (
    SELECT user_id, d, LEAST(SUM(xp), xp_daily_cap())::bigint AS capped
    FROM approved GROUP BY user_id, d
  ),
  totals AS (
    SELECT user_id, SUM(capped)::bigint AS total_xp FROM daily GROUP BY user_id
  )
  INSERT INTO user_progress (user_id, xp, level, daily_xp, daily_xp_date, updated_at)
  SELECT user_id, total_xp, level_for_xp(total_xp), 0, NULL, now()
  FROM totals
  ON CONFLICT (user_id) DO UPDATE SET
    xp = EXCLUDED.xp, level = EXCLUDED.level, updated_at = now();
END;
$$;
COMMENT ON FUNCTION recompute_all_progress() IS
  'REQ-248 NFR-248-03: 承認済み投稿から xp/level を遡って再計算（バックフィル / 係数変更時）。日次上限は作成日ごとに適用。migration が一度だけ呼ぶ。';

-- (G) 参照 RPC（FR-248-05）。集計のみ・生 PII を返さない・is_public 準拠。
--     xp / level / 現レベル内の獲得 XP / 次レベルまでの必要 XP / 検証済み（承認）投稿数を返す。
CREATE OR REPLACE FUNCTION get_user_progress(p_user_id UUID)
RETURNS TABLE (
  xp                bigint,
  level             integer,
  xp_into_level     bigint,   -- 現レベル開始点からの獲得 XP（プログレスバーの分子）
  xp_for_next_level bigint,   -- 現レベルの XP 幅（プログレスバーの分母。次レベルまでの必要総量）
  approved_count    bigint    -- 検証済み（承認）投稿数
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  -- 未ログイン（auth.uid() が NULL）のとき、比較は NULL になり `IF NOT v_is_owner` が素通りして
  -- 非公開プロフィールを返していた。NULL は「本人ではない」に畳む（security-hardening 要件2）。
  v_is_owner  boolean := COALESCE(p_user_id = (SELECT auth.uid()), false);
  v_is_public boolean;
  v_xp        bigint;
  v_level     integer;
BEGIN
  SELECT COALESCE(up.is_public, false) INTO v_is_public FROM user_profiles up WHERE up.id = p_user_id;
  -- 非公開プロフィールを本人以外が参照しても行を返さない（get_user_profile と同じプライバシー方針）。
  IF NOT v_is_owner AND NOT COALESCE(v_is_public, false) THEN RETURN; END IF;

  SELECT COALESCE(pr.xp, 0), COALESCE(pr.level, 1) INTO v_xp, v_level
    FROM user_progress pr WHERE pr.user_id = p_user_id;
  IF v_xp IS NULL THEN v_xp := 0; v_level := 1; END IF;
  -- 保険: 保存 level が xp と不整合でも表示は必ず整合させる。
  v_level := level_for_xp(v_xp);

  RETURN QUERY SELECT
    v_xp,
    v_level,
    v_xp - xp_for_level(v_level),
    xp_for_level(v_level + 1) - xp_for_level(v_level),
    (SELECT COUNT(*) FROM posts WHERE user_id = p_user_id AND status = 'approved')::bigint;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_user_progress(UUID) TO authenticated, anon;
COMMENT ON FUNCTION public.get_user_progress(UUID) IS
  'REQ-248 FR-248-05: 貢献レベル/XP の参照 RPC（集計のみ・is_public 準拠）。xp/level/xp_into_level/xp_for_next_level/approved_count を返す。';

-- ===================================================
-- 12-2. コレクション / 図鑑 / 水槽 (REQ-250 Part A)
--   観察の成果を「所有できるコレクション」として DB 権威で貯める。承認済み投稿から種ごとの図鑑カードを
--   埋め（種 × info_type × 市区町村 × 初観察）、水槽（ビオトープ）に泳がせる土台。REQ-249 の
--   FEATURE_UNLOCKS.collection（enforcement='server'）のサーバー強制（トリガーのみ書き込み + RLS）を実装する。
--   承認済み投稿でのみ前進（Goodhart 対策・award_xp_on_approval と同一ガード / schema.sql:1856）。
--   migration 20260703000005_crayfish_collection_dex_aquarium.sql と同一定義（REQ-003 ドリフトゼロ）。
-- ===================================================

-- (A) コレクション状態テーブル（DB 権威・改竄不能 / FR-250-01 / FR-250-02）。種ごとに 1 行。
--     承認済み投稿から導出し、書き込みは update_collection_on_approval トリガーと
--     recompute_all_collections 関数のみ（INSERT/UPDATE ポリシー無し = user_progress と同一パターン）。
CREATE TABLE IF NOT EXISTS user_collection (
  user_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  species             TEXT        NOT NULL CHECK (species IN ('american', 'bullfrog')),  -- posts.species と同じ 2 種
  first_observed_at   TIMESTAMPTZ,                          -- はじめて承認観察した日時（observed_at 優先・無ければ created_at）
  info_types_seen     TEXT[]      NOT NULL DEFAULT '{}',    -- その種で観察済みの info_type 集合（重複なし・図鑑の埋まり具合）
  municipalities_seen TEXT[]      NOT NULL DEFAULT '{}',    -- その種で観察済みの市区町村集合（重複なし）
  verified_count      BIGINT      NOT NULL DEFAULT 0 CHECK (verified_count >= 0),  -- その種の検証済み（承認）観察数
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, species)
);
COMMENT ON TABLE user_collection IS
  'REQ-250: コレクション（図鑑/水槽）状態。承認済み投稿から導出（DB 権威・改竄不能）。書き込みは update_collection_on_approval / recompute_all_collections のみ（INSERT/UPDATE ポリシー無し = user_progress と同パターン）。';

CREATE INDEX IF NOT EXISTS idx_user_collection_user ON user_collection(user_id);

ALTER TABLE user_collection ENABLE ROW LEVEL SECURITY;
-- SELECT: 本人 OR 公開プロフィール（get_user_progress と同じ is_public 準拠 / FR-250-02）。
-- 書き込みポリシーは意図的に作らない（トリガー / SECURITY DEFINER 関数のみが書ける = サーバー強制）。
DO $$ BEGIN
  CREATE POLICY "collection_viewable" ON user_collection FOR SELECT USING (
    (SELECT auth.uid()) = user_id
    OR EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = user_collection.user_id AND up.is_public = true)
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- (B) コレクション前進トリガー（FR-250-01 / FR-250-02 / NFR-250-04）。承認遷移でのみ発火。
--     award_xp_on_approval と独立した兄弟トリガー（相互非干渉）。失敗は承認本体をロールバックさせない。
CREATE OR REPLACE FUNCTION update_collection_on_approval()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid;
  v_first   timestamptz;
BEGIN
  -- 承認遷移（pending→approved）でのみ発火（check_and_grant_badges と同一ガード / schema.sql:1073）。
  IF NEW.status <> 'approved' OR (TG_OP = 'UPDATE' AND OLD.status = 'approved') THEN RETURN NEW; END IF;
  v_user_id := NEW.user_id;
  IF v_user_id IS NULL THEN RETURN NEW; END IF;

  BEGIN
    v_first := COALESCE(NEW.observed_at, NEW.created_at, now());

    INSERT INTO user_collection (
      user_id, species, first_observed_at, info_types_seen, municipalities_seen, verified_count, updated_at
    ) VALUES (
      v_user_id, NEW.species, v_first,
      ARRAY[NEW.info_type],
      CASE WHEN NEW.municipality IS NULL THEN '{}'::text[] ELSE ARRAY[NEW.municipality] END,
      1, now()
    )
    ON CONFLICT (user_id, species) DO UPDATE SET
      first_observed_at   = LEAST(user_collection.first_observed_at, EXCLUDED.first_observed_at),
      info_types_seen     = CASE WHEN NEW.info_type = ANY(user_collection.info_types_seen)
                                 THEN user_collection.info_types_seen
                                 ELSE array_append(user_collection.info_types_seen, NEW.info_type) END,
      municipalities_seen = CASE WHEN NEW.municipality IS NULL
                                   OR NEW.municipality = ANY(user_collection.municipalities_seen)
                                 THEN user_collection.municipalities_seen
                                 ELSE array_append(user_collection.municipalities_seen, NEW.municipality) END,
      verified_count      = user_collection.verified_count + 1,
      updated_at          = now();
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'update_collection_on_approval failed for user %: %', v_user_id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_post_approved_update_collection ON posts;
CREATE TRIGGER on_post_approved_update_collection
  AFTER UPDATE ON posts FOR EACH ROW
  EXECUTE FUNCTION update_collection_on_approval();

-- (C) バックフィル / 再計算（NFR-250-04）。既存ユーザーのコレクションを承認済み投稿から遡って算出する。
--     権限: JWT 無し（migration / 直 DB）または service_role / admin のみ（recompute_all_progress と同判定）。
CREATE OR REPLACE FUNCTION recompute_all_collections()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE jwt_claims jsonb;
BEGIN
  BEGIN
    jwt_claims := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb;
  EXCEPTION WHEN OTHERS THEN jwt_claims := NULL;
  END;
  IF jwt_claims IS NOT NULL AND jwt_claims <> '{}'::jsonb THEN
    IF (jwt_claims ->> 'role') IS DISTINCT FROM 'service_role'
       AND (jwt_claims -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'admin' THEN
      RAISE EXCEPTION 'Permission denied';
    END IF;
  END IF;

  INSERT INTO user_collection (
    user_id, species, first_observed_at, info_types_seen, municipalities_seen, verified_count, updated_at
  )
  SELECT
    p.user_id,
    p.species,
    MIN(COALESCE(p.observed_at, p.created_at, now()))       AS first_observed_at,
    array_agg(DISTINCT p.info_type)                        AS info_types_seen,
    array_remove(array_agg(DISTINCT p.municipality), NULL) AS municipalities_seen,
    COUNT(*)::bigint                                       AS verified_count,
    now()
  FROM posts p
  WHERE p.status = 'approved' AND p.user_id IS NOT NULL
  GROUP BY p.user_id, p.species
  ON CONFLICT (user_id, species) DO UPDATE SET
    first_observed_at   = EXCLUDED.first_observed_at,
    info_types_seen     = EXCLUDED.info_types_seen,
    municipalities_seen = EXCLUDED.municipalities_seen,
    verified_count      = EXCLUDED.verified_count,
    updated_at          = now();
END;
$$;
COMMENT ON FUNCTION recompute_all_collections() IS
  'REQ-250 NFR-250-04: 承認済み投稿からコレクションを遡って再計算（バックフィル）。migration が一度だけ呼ぶ。';

-- (D) 参照 RPC（FR-250-01）。集計のみ・is_public 準拠（get_user_progress と同じプライバシー方針）。
--     水槽の容量・デコレーションは DB 権威の level（get_user_progress）からクライアントが算出する
--     （useUnlocks と同思想: 定数マップ × 改竄不能な level）。
CREATE OR REPLACE FUNCTION get_user_collection(p_user_id UUID)
RETURNS TABLE (
  species             text,
  first_observed_at   timestamptz,
  info_types_seen     text[],
  municipalities_seen text[],
  verified_count      bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  -- 未ログイン（auth.uid() が NULL）のとき、比較は NULL になり `IF NOT v_is_owner` が素通りして
  -- 非公開プロフィールを返していた。NULL は「本人ではない」に畳む（security-hardening 要件2）。
  v_is_owner  boolean := COALESCE(p_user_id = (SELECT auth.uid()), false);
  v_is_public boolean;
BEGIN
  SELECT COALESCE(up.is_public, false) INTO v_is_public FROM user_profiles up WHERE up.id = p_user_id;
  IF NOT v_is_owner AND NOT COALESCE(v_is_public, false) THEN RETURN; END IF;

  RETURN QUERY
    SELECT uc.species, uc.first_observed_at, uc.info_types_seen, uc.municipalities_seen, uc.verified_count
    FROM user_collection uc
    WHERE uc.user_id = p_user_id
    ORDER BY uc.first_observed_at NULLS LAST, uc.species;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_user_collection(UUID) TO authenticated, anon;
COMMENT ON FUNCTION public.get_user_collection(UUID) IS
  'REQ-250 FR-250-01: コレクション（図鑑）状態の参照 RPC（集計のみ・is_public 準拠）。種ごとの初観察/情報種別集合/市区町村集合/検証済み数を返す。';

-- ===================================================
-- 調査依頼テーブル
-- ===================================================
CREATE TABLE IF NOT EXISTS survey_requests (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at       TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lat              DECIMAL(10, 7) NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng              DECIMAL(10, 7) NOT NULL CHECK (lng BETWEEN -180 AND 180),
  municipality     TEXT,
  species          TEXT        NOT NULL CHECK (species IN ('american', 'bullfrog', 'unknown')),
  reason           TEXT        NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 300),
  urgency          TEXT        NOT NULL DEFAULT 'normal' CHECK (urgency IN ('normal', 'urgent')),
  status           TEXT        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'responded', 'closed')),
  response_count   INTEGER     NOT NULL DEFAULT 0,
  closed_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_survey_requests_created ON survey_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_survey_requests_status ON survey_requests(status);
CREATE INDEX IF NOT EXISTS idx_survey_requests_municipality ON survey_requests(municipality);

-- REQ-243: 公開用の粗化生成列（常に round(_,3) ≒ 111m）。生 lat/lng の anon 直読みは列 GRANT で塞ぐ。
ALTER TABLE survey_requests ADD COLUMN IF NOT EXISTS display_lat DECIMAL(10,7)
  GENERATED ALWAYS AS (round(lat, 3)) STORED;
ALTER TABLE survey_requests ADD COLUMN IF NOT EXISTS display_lng DECIMAL(10,7)
  GENERATED ALWAYS AS (round(lng, 3)) STORED;
COMMENT ON COLUMN survey_requests.display_lat IS 'REQ-243: 公開用の粗化緯度（round(_,3)）。anon/authenticated はこの列のみ参照可。';
COMMENT ON COLUMN survey_requests.display_lng IS 'REQ-243: 公開用の粗化経度（round(_,3)）。';

ALTER TABLE survey_requests ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "survey_requests_viewable" ON survey_requests FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "survey_requests_insertable" ON survey_requests FOR INSERT WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "survey_requests_owner_update" ON survey_requests FOR UPDATE USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "survey_requests_owner_delete" ON survey_requests FOR DELETE USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 調査依頼レート制限（1日3件まで）
-- REQ-221: SECURITY DEFINER 関数は search_path を固定（Splinter 0011）。
CREATE OR REPLACE FUNCTION check_survey_request_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
$$;

DROP TRIGGER IF EXISTS enforce_survey_request_rate ON survey_requests;
CREATE TRIGGER enforce_survey_request_rate
  BEFORE INSERT ON survey_requests
  FOR EACH ROW EXECUTE FUNCTION check_survey_request_rate_limit();

-- REQ-208: survey_requests の列固定トリガー（posts.protect_post_status と同設計の多層防御）。
--   背景: survey_requests は行レベルの所有者判定 (survey_requests_owner_update) だけで、
--   posts のような列固定が無く、所有者が response_count（集計キャッシュ）や status / created_at /
--   user_id を直接改竄できた。本トリガーで一般所有者の UPDATE を「クローズ操作のみ」に絞り、
--   集計値・識別子・不変フィールドを OLD に固定する。
--
--   方針（posts と統一）:
--     - service_role / admin は素通り（バックエンド鍵・管理者運用）。
--     - JWT 無し / 空 claims / claims パース失敗も素通り（protect_post_status と同じ判定順）。
--     - 他トリガーからのカスケード更新（pg_trigger_depth() > 1）は素通り。
--       → sync_survey_response_count（response_count 同期）と mark_survey_request_responded
--         （status='responded' 自動遷移）は migration で追加される AFTER トリガー内の UPDATE で、
--         呼び出し元 JWT（一般ユーザー）のまま発火するため、深さで内部更新を許可して
--         「response_count の唯一の更新者は集計トリガー」を担保する。直接 UPDATE は深さ 1。
--     - 一般所有者の直接 UPDATE では: user_id / created_at / response_count / lat / lng /
--       municipality / species / reason / urgency を OLD 固定。status はクローズ（'closed'）のみ許可し、
--       それ以外への変更は OLD に戻す。closed_at は設定可（クローズ操作の一部）。
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

-- posts に調査依頼リンク用カラム追加
ALTER TABLE posts ADD COLUMN IF NOT EXISTS
  survey_request_id UUID REFERENCES survey_requests(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_posts_survey_request ON posts(survey_request_id)
  WHERE survey_request_id IS NOT NULL;

-- 空DBでも参照先の表・列の作成後にSQL関数を定義する。
-- ===================================================
-- 10-7. 調査依頼詳細の集約取得 RPC (REQ-157)
-- 本体 + 投稿者プロフィール + 関連投稿（承認済み最大10件）を 1 往復で返す。
-- SECURITY INVOKER で RLS を尊重（user_profiles は公開/本人のみ可視 = 旧挙動と一致）。
-- ===================================================
CREATE OR REPLACE FUNCTION public.get_survey_request_detail(p_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'request', to_jsonb(sr) || jsonb_build_object(
      'user_profiles', (
        SELECT jsonb_build_object('display_name', up.display_name, 'avatar_emoji', up.avatar_emoji)
        FROM user_profiles up WHERE up.id = sr.user_id
      )
    ),
    'related_posts', (
      SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.created_at DESC), '[]'::jsonb)
      FROM (
        -- REQ-243: 生 lat/lng は列 GRANT 剥奪で INVOKER でも読めないため粗化列 display_* を返す。
        SELECT id, created_at, species, info_type, municipality, comment, photos, user_id,
               display_lat AS lat, display_lng AS lng
        FROM posts
        WHERE survey_request_id = p_id AND status = 'approved'
        ORDER BY created_at DESC
        LIMIT 10
      ) p
    )
  )
  FROM (
    -- REQ-243: 調査依頼の座標も粗化（display_*）で返す。user_id は所有者判定に残す。
    SELECT id, user_id, display_lat AS lat, display_lng AS lng, municipality, species, reason,
           urgency, status, created_at, closed_at, response_count
    FROM survey_requests WHERE id = p_id
  ) sr;
$$;
GRANT EXECUTE ON FUNCTION public.get_survey_request_detail(uuid) TO anon, authenticated;
COMMENT ON FUNCTION public.get_survey_request_detail(uuid) IS
  'REQ-157/REQ-243: 調査依頼詳細を 1 往復で返す RPC。SECURITY INVOKER で RLS 尊重。座標は粗化（display_*）で返す。';


-- ===================================================
-- アカウント自己削除 RPC（退会機能）
-- ===================================================
-- SECURITY DEFINER: auth.users への DELETE は anon key では不可のため
-- 呼び出し元が認証済みかつ自分自身のみ削除可能
CREATE OR REPLACE FUNCTION delete_own_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 認証チェック
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION '認証が必要です';
  END IF;

  -- auth.users から削除（CASCADE で user_profiles, user_badges, likes, survey_requests が削除）
  -- posts.user_id, comments.user_id は ON DELETE SET NULL で匿名化
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION delete_own_account() TO authenticated;

-- ===================================================
-- 音声投稿関連（REQ-069〜073）
-- ===================================================

-- REQ-070: post-audio Storage バケット
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'post-audio',
  'post-audio',
  true,
  1048576, -- 1MB
  ARRAY['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "authenticated_upload_audio"  ON storage.objects;
DROP POLICY IF EXISTS "public_read_audio"           ON storage.objects;
DROP POLICY IF EXISTS "owner_or_admin_delete_audio" ON storage.objects;

-- REQ-135: 自分の uid フォルダ配下のみ INSERT 可
DO $$ BEGIN CREATE POLICY "authenticated_upload_audio" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'post-audio'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND lower(storage.extension(name)) IN ('webm', 'mp4', 'm4a', 'mp3', 'ogg')
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "public_read_audio" ON storage.objects FOR SELECT USING (
  bucket_id = 'post-audio'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "owner_or_admin_delete_audio" ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'post-audio'
  AND (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    OR name LIKE concat(auth.uid()::text, '/%')
  )
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- REQ-071: posts.audio_url カラム + 制約 + インデックス
ALTER TABLE posts ADD COLUMN IF NOT EXISTS audio_url TEXT;

ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_audio_url_length;
ALTER TABLE posts ADD CONSTRAINT posts_audio_url_length
  CHECK (audio_url IS NULL OR char_length(audio_url) <= 500);

ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_audio_url_format;
ALTER TABLE posts ADD CONSTRAINT posts_audio_url_format
  CHECK (audio_url IS NULL OR audio_url ~ '^https?://');

CREATE INDEX IF NOT EXISTS idx_posts_has_audio ON posts ((audio_url IS NOT NULL))
  WHERE audio_url IS NOT NULL;

COMMENT ON COLUMN posts.audio_url IS 'Supabase Storage (post-audio) の publicUrl。鳴き声投稿時に使用。NULL=音声なし。';

-- ════════════════════════════════════════════════════════════════════════════
-- REQ-175: 介入評価・実験計測基盤（experiments / experiment_assignments / 集計RPC）
--   migration 20260603000002_experiments.sql と同期（REQ-003 方針）。
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS experiments (
  key                TEXT PRIMARY KEY,
  description        TEXT,
  enabled            BOOLEAN NOT NULL DEFAULT false,
  rollout_percentage INTEGER NOT NULL DEFAULT 0 CHECK (rollout_percentage BETWEEN 0 AND 100),
  variants           TEXT[]  NOT NULL DEFAULT ARRAY['control','treatment'],
  seed               TEXT    NOT NULL DEFAULT gen_random_uuid()::text,
  started_at         TIMESTAMPTZ,
  ended_at           TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS experiment_assignments (
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  experiment_key TEXT NOT NULL REFERENCES experiments(key) ON DELETE CASCADE,
  variant        TEXT NOT NULL,
  assigned_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, experiment_key)
);

ALTER TABLE posts ADD COLUMN IF NOT EXISTS location_source TEXT
  CHECK (location_source IS NULL OR location_source IN ('gps','manual','exif'));
ALTER TABLE posts ADD COLUMN IF NOT EXISTS experiment_assignments JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public._experiment_bucket(p_seed text, p_subject text)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT (abs(('x' || substr(md5(p_seed || ':' || p_subject), 1, 8))::bit(32)::int) % 100);
$$;

CREATE OR REPLACE FUNCTION public.get_my_experiment_variants()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_rec record;
  v_variant text;
  v_bucket int;
  v_result jsonb := '{}'::jsonb;
BEGIN
  IF v_uid IS NULL THEN RETURN '{}'::jsonb; END IF;
  FOR v_rec IN SELECT * FROM experiments WHERE enabled = true LOOP
    v_bucket := public._experiment_bucket(v_rec.seed, v_uid::text);
    IF v_bucket < v_rec.rollout_percentage THEN
      v_variant := COALESCE(v_rec.variants[2], 'treatment');
    ELSE
      v_variant := COALESCE(v_rec.variants[1], 'control');
    END IF;
    INSERT INTO experiment_assignments(user_id, experiment_key, variant)
      VALUES (v_uid, v_rec.key, v_variant)
      ON CONFLICT (user_id, experiment_key)
      DO UPDATE SET variant = EXCLUDED.variant, assigned_at = now();
    v_result := v_result || jsonb_build_object(v_rec.key, v_variant);
  END LOOP;
  RETURN v_result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_my_experiment_variants() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_experiment_metrics(
  p_experiment_key text,
  p_from timestamptz DEFAULT NULL,
  p_to   timestamptz DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_claims jsonb;
  v_to       timestamptz := coalesce(p_to, now());
  v_from     timestamptz := coalesce(p_from, v_to - interval '180 days');
  v_to_excl  timestamptz := v_to + interval '1 day';
  v_started  timestamptz;
  result jsonb;
BEGIN
  v_claims := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb;
  IF v_claims IS NULL
     OR (v_claims ->> 'role') IS DISTINCT FROM 'service_role'
        AND (v_claims -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'forbidden: admin only';
  END IF;

  SELECT started_at INTO v_started FROM experiments WHERE key = p_experiment_key;

  WITH base AS (
    SELECT p.user_id, p.created_at, p.photos, p.accuracy,
           (p.experiment_assignments ->> p_experiment_key) AS variant,
           CASE WHEN v_started IS NULL OR p.created_at >= v_started THEN 'post' ELSE 'pre' END AS period
    FROM posts p
    WHERE p.created_at >= v_from AND p.created_at < v_to_excl
      AND p.experiment_assignments ? p_experiment_key
  ),
  per_user AS (
    SELECT variant, period, user_id, count(*) AS c
    FROM base GROUP BY variant, period, user_id
  ),
  cells AS (
    SELECT b.variant, b.period,
      count(*)                                                                   AS post_count,
      count(DISTINCT b.user_id)                                                  AS n_users,
      avg(CASE WHEN b.photos IS NOT NULL AND array_length(b.photos,1) > 0 THEN 1.0 ELSE 0.0 END) AS photo_rate,
      avg(CASE WHEN b.accuracy IS NOT NULL THEN 1.0 ELSE 0.0 END)                AS gps_rate,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY b.accuracy) FILTER (WHERE b.accuracy IS NOT NULL) AS accuracy_median
    FROM base b GROUP BY b.variant, b.period
  ),
  rep AS (
    SELECT variant, period,
      (count(*) FILTER (WHERE c >= 2))::numeric / NULLIF(count(*),0) AS repeat_rate
    FROM per_user GROUP BY variant, period
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'variant', cells.variant, 'period', cells.period,
    'post_count', cells.post_count, 'n_users', cells.n_users,
    'photo_rate', round(coalesce(cells.photo_rate,0)::numeric, 4),
    'gps_rate', round(coalesce(cells.gps_rate,0)::numeric, 4),
    'accuracy_median', cells.accuracy_median,
    'repeat_rate', round(coalesce(rep.repeat_rate,0)::numeric, 4)
  ) ORDER BY cells.variant, cells.period), '[]'::jsonb)
  INTO result
  FROM cells LEFT JOIN rep ON rep.variant = cells.variant AND rep.period = cells.period;

  RETURN result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_experiment_metrics(text, timestamptz, timestamptz) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- REQ-174: 定点観察（structured）プロトコル。migration 20260603000005 と同期。
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS survey_sites (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  lat          DECIMAL(10,7) NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng          DECIMAL(10,7) NOT NULL CHECK (lng BETWEEN -180 AND 180),
  municipality TEXT,
  species      TEXT CHECK (species IS NULL OR species IN ('american','bullfrog')),
  notes        TEXT CHECK (notes IS NULL OR char_length(notes) <= 500),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_survey_sites_user ON survey_sites (user_id);
ALTER TABLE posts ADD COLUMN IF NOT EXISTS survey_method TEXT
  CHECK (survey_method IS NULL OR survey_method IN ('structured','opportunistic'));
ALTER TABLE posts ADD COLUMN IF NOT EXISTS survey_site_id UUID REFERENCES survey_sites(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_posts_survey_site ON posts (survey_site_id) WHERE survey_site_id IS NOT NULL;
ALTER TABLE survey_sites ENABLE ROW LEVEL SECURITY;
-- REQ-243: 定点観察地点（自宅近傍の蓋然性）は公開しない。所有者と管理者（survey_sites_admin_all）のみ SELECT 可。
DROP POLICY IF EXISTS "survey_sites_select_all" ON survey_sites;
DO $$ BEGIN
  CREATE POLICY "survey_sites_select_own" ON survey_sites FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "survey_sites_insert_own" ON survey_sites FOR INSERT TO authenticated
    WITH CHECK (user_id = (SELECT auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "survey_sites_update_own" ON survey_sites FOR UPDATE TO authenticated
    USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "survey_sites_delete_own" ON survey_sites FOR DELETE TO authenticated
    USING (user_id = (SELECT auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "survey_sites_admin_all" ON survey_sites FOR ALL TO authenticated
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
    WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- REQ-231 (FR-231-07): 定点サイトの水系・水辺種別（任意・eDNA 文脈）。migration 20260615000004 と同期。
ALTER TABLE survey_sites
  ADD COLUMN IF NOT EXISTS water_body  TEXT,
  ADD COLUMN IF NOT EXISTS water_type  TEXT;
ALTER TABLE survey_sites DROP CONSTRAINT IF EXISTS survey_sites_water_type_check;
ALTER TABLE survey_sites ADD CONSTRAINT survey_sites_water_type_check
  CHECK (water_type IS NULL OR water_type IN ('lentic','lotic','unknown'));
COMMENT ON COLUMN survey_sites.water_body IS 'REQ-231: 定点サイトの近傍水系名（任意）';
COMMENT ON COLUMN survey_sites.water_type IS 'REQ-231: 水辺種別 lentic=止水 / lotic=流水 / unknown=不明';

ALTER TABLE experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE experiment_assignments ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "admin_all_experiments" ON experiments FOR ALL TO authenticated
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
    WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "own_select_assignments" ON experiment_assignments FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "admin_all_assignments" ON experiment_assignments FOR ALL TO authenticated
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
    WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- REQ-233: 卒研 KPI ダッシュボード集計 RPC
--   （North Star + ガードレール + KGI サマリー / 獲得月コホート継続率 /
--     承認ファネル + 量×質カウンター指標）
--   migration 20260615000003_research_kpi_rpcs.sql と同期（REQ-003 方針）。
--
-- 共通方針:
--   - すべて admin 限定。get_experiment_metrics（schema.sql 上方）と同一の
--     JWT claims 検査（service_role か app_metadata.role='admin' のみ通す）。
--   - SECURITY DEFINER SET search_path = public（PII 列保護 RLS を跨ぐため明示認可必須）。
--   - 集計値のみを返す。reporter_ip 等の PII 列（REQ-179）や user_id 個票は返さない。
--   - 期間引数で posts 全期間スキャンを抑える（NFR-233-05）。
--   - KPI 定義・閾値は docs/runbooks/kpi-weekly-review.md の KPI Register と一致させる（NFR-233-04）。
-- ════════════════════════════════════════════════════════════════════════════

-- REQ-233 共通: admin 判定（SECURITY DEFINER 内で明示）。
-- service_role（バックエンド鍵）または app_metadata.role='admin' のみ許可。
CREATE OR REPLACE FUNCTION public._kpi_assert_admin()
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_claims jsonb;
BEGIN
  v_claims := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb;
  IF v_claims IS NULL
     OR (v_claims ->> 'role') IS DISTINCT FROM 'service_role'
        AND (v_claims -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'forbidden: admin only';
  END IF;
END;
$$;
COMMENT ON FUNCTION public._kpi_assert_admin() IS
  'REQ-233: KPI 集計 RPC 共通の admin 認可。get_experiment_metrics と同一判定。';

-- FR-233-02 / AC-02: 獲得月コホート × 経過月の継続率マトリクス。
--   コホート = ユーザーの初投稿月（min(created_at) を date_trunc('month')）。
--   経過月 m の保持率 = (そのコホートで「初投稿月 + m ヶ月」の月に再投稿したユニークユーザー数)
--                        / (コホート人数)。M0 は定義上 1.0（コホート全員）。
--   全体平均ではなくコホート別カーブを返し、生存者バイアスを排する（KPI ノート方針）。
--   p_months: 集計対象とする「直近の獲得コホート数」（既定 12）。
CREATE OR REPLACE FUNCTION public.get_retention_cohorts(p_months integer DEFAULT 12)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_months integer := greatest(1, least(coalesce(p_months, 12), 24));
  v_first_cohort date := (date_trunc('month', now()) - ((v_months - 1) * interval '1 month'))::date;
  result jsonb;
BEGIN
  PERFORM public._kpi_assert_admin();

  WITH first_post AS (
    -- ユーザーごとの初投稿月（獲得コホート）
    SELECT user_id, date_trunc('month', min(created_at))::date AS cohort_month
    FROM posts
    WHERE user_id IS NOT NULL
    GROUP BY user_id
  ),
  in_window AS (
    SELECT * FROM first_post WHERE cohort_month >= v_first_cohort
  ),
  activity AS (
    -- 各ユーザーが投稿した月（重複排除）と、初投稿月からの経過月数
    SELECT DISTINCT f.user_id, f.cohort_month,
      (extract(year  from age(date_trunc('month', p.created_at), f.cohort_month)) * 12
     + extract(month from age(date_trunc('month', p.created_at), f.cohort_month)))::int AS m
    FROM in_window f
    JOIN posts p ON p.user_id = f.user_id
    WHERE p.created_at >= f.cohort_month
  ),
  sizes AS (
    SELECT cohort_month, count(*) AS cohort_size
    FROM in_window GROUP BY cohort_month
  ),
  retained AS (
    SELECT cohort_month, m, count(DISTINCT user_id) AS retained_users
    FROM activity
    WHERE m >= 0 AND m < v_months
    GROUP BY cohort_month, m
  )
  SELECT jsonb_build_object(
    'max_months', v_months,
    'cohorts', coalesce(jsonb_agg(
      jsonb_build_object(
        'cohort', to_char(s.cohort_month, 'YYYY-MM'),
        'size', s.cohort_size,
        'retention', (
          SELECT coalesce(jsonb_agg(
            jsonb_build_object(
              'm', r.m,
              'users', r.retained_users,
              'rate', round((r.retained_users::numeric) / NULLIF(s.cohort_size, 0), 4)
            ) ORDER BY r.m), '[]'::jsonb)
          FROM retained r WHERE r.cohort_month = s.cohort_month
        )
      ) ORDER BY s.cohort_month
    ), '[]'::jsonb)
  ) INTO result
  FROM sizes s;

  RETURN result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_retention_cohorts(integer) TO authenticated;
COMMENT ON FUNCTION public.get_retention_cohorts(integer) IS
  'REQ-233 FR-233-02: 獲得月コホート×経過月の保持率マトリクス（admin限定・集計のみ）。';

-- FR-233-03 / FR-233-04 / AC-03 / AC-04: 承認ファネル（Supabase 側の段）＋ 量×質カウンター指標。
--   - 承認ファネル: posts.status 別件数（completed=全行 → approved/pending/rejected）。
--     「完了→承認」の歩留まり（承認率）と却下率（ガードレール）を返す。GA4 側の段
--     （閲覧→投稿開始→完了）は本 RPC の範囲外（runbook の探索定義に従う）。
--   - 量×質ペア（Goodhart 対策）: 量（投稿数・承認数）と必ず並べる。
--       完全率   = 必須/推奨項目（写真添付・accuracy 非NULL・species/info_type は NOT NULL 制約で常に充足）
--                  が揃った投稿の割合。
--       正確率   = accuracy が閾値（p_accuracy_threshold m, 既定=GPS_ACCURACY_GOOD_M=30）以内の割合。
--                  分母を「測位あり(accuracy 非NULL)」と「全投稿」の両方で返す。
--   - 1 提出あたり AI コスト（トークン）: ai_call_logs のトークン量 ÷ 承認投稿数。
--     ※USD 概算単価はモデル別でクライアント側（AdminAiCostPage と同一表）で適用するため、
--       ここではトークン合計と承認数のみ返し、円換算ロジックを DB に固定しない。
CREATE OR REPLACE FUNCTION public.get_kpi_quality_funnel(
  p_from timestamptz DEFAULT NULL,
  p_to   timestamptz DEFAULT NULL,
  p_accuracy_threshold numeric DEFAULT 30
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_to        timestamptz := coalesce(p_to, now());
  v_from      timestamptz := coalesce(p_from, v_to - interval '90 days');
  v_to_excl   timestamptz := v_to + interval '1 day';
  v_thresh    numeric := coalesce(p_accuracy_threshold, 30);
  result jsonb;
BEGIN
  PERFORM public._kpi_assert_admin();

  WITH base AS (
    SELECT status, photos, accuracy
    FROM posts
    WHERE created_at >= v_from AND created_at < v_to_excl
  ),
  agg AS (
    SELECT
      count(*)                                              AS total,
      count(*) FILTER (WHERE status = 'approved')           AS approved,
      count(*) FILTER (WHERE status = 'pending')            AS pending,
      count(*) FILTER (WHERE status = 'rejected')           AS rejected,
      -- 完全率: 写真添付あり AND accuracy 非NULL（species/info_type は NOT NULL 制約で常に充足）
      count(*) FILTER (
        WHERE photos IS NOT NULL AND array_length(photos, 1) > 0 AND accuracy IS NOT NULL
      )                                                     AS complete,
      count(*) FILTER (WHERE photos IS NOT NULL AND array_length(photos, 1) > 0) AS has_photo,
      count(*) FILTER (WHERE accuracy IS NOT NULL)          AS has_accuracy,
      count(*) FILTER (WHERE accuracy IS NOT NULL AND accuracy <= v_thresh) AS within_thresh
    FROM base
  ),
  ai AS (
    SELECT
      coalesce(sum(input_tokens), 0)  AS input_tokens,
      coalesce(sum(output_tokens), 0) AS output_tokens,
      count(*)                        AS ai_calls
    FROM ai_call_logs
    WHERE created_at >= v_from AND created_at < v_to_excl
  )
  SELECT jsonb_build_object(
    'accuracy_threshold_m', v_thresh,
    'funnel', jsonb_build_object(
      'completed', agg.total,
      'approved',  agg.approved,
      'pending',   agg.pending,
      'rejected',  agg.rejected,
      'approval_rate', round(agg.approved::numeric / NULLIF(agg.total, 0), 4),
      'rejection_rate', round(agg.rejected::numeric / NULLIF(agg.total, 0), 4)
    ),
    'completeness', jsonb_build_object(
      'count', agg.total,            -- 量（分母）
      'complete', agg.complete,      -- 質（分子）
      'rate', round(agg.complete::numeric / NULLIF(agg.total, 0), 4),
      'photo_rate', round(agg.has_photo::numeric / NULLIF(agg.total, 0), 4),
      'accuracy_present_rate', round(agg.has_accuracy::numeric / NULLIF(agg.total, 0), 4)
    ),
    'accuracy', jsonb_build_object(
      'count', agg.total,                  -- 量（全投稿）
      'within_threshold', agg.within_thresh, -- 質（閾値内）
      'rate_of_all', round(agg.within_thresh::numeric / NULLIF(agg.total, 0), 4),
      'rate_of_measured', round(agg.within_thresh::numeric / NULLIF(agg.has_accuracy, 0), 4),
      'measured', agg.has_accuracy
    ),
    'cost_per_submission', jsonb_build_object(
      'approved', agg.approved,            -- 量（承認数 = 分母）
      'ai_calls', ai.ai_calls,
      'input_tokens', ai.input_tokens,
      'output_tokens', ai.output_tokens,
      'tokens_per_approved',
        round((ai.input_tokens + ai.output_tokens)::numeric / NULLIF(agg.approved, 0), 2)
    )
  ) INTO result
  FROM agg, ai;

  RETURN result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_kpi_quality_funnel(timestamptz, timestamptz, numeric) TO authenticated;
COMMENT ON FUNCTION public.get_kpi_quality_funnel(timestamptz, timestamptz, numeric) IS
  'REQ-233 FR-233-03/04: 承認ファネル（status別）＋量×質カウンター指標（完全率/正確率/1提出あたりトークン）。admin限定・集計のみ。';

-- FR-233-01 / FR-233-05 / AC-01 / AC-05: NSM + ガードレール + KGI サマリー（WoW 付き）。
--   - NSM（先行・価値・1つ固定）: 直近 7 日に 2 回以上承認投稿した「アクティブ投稿者数」
--     （WAU 相当・価値を受け取った参加の量）。前週（その前の 7 日）と比較し WoW を返す。
--   - ガードレール（counter-metric）: 直近 7 日の却下率・完全率（量×質の歯止め）。
--   - KGI（遅行・成果）: 累積有効観測レコード数（status='approved' の累計）と継続投稿者総数
--     （これまでに 2 回以上承認投稿したユニークユーザー数）。
--   ※ NSM は 1 つだけ（KPI ノート: NSM を 2 つ持たない）。
CREATE OR REPLACE FUNCTION public.get_kpi_summary(p_accuracy_threshold numeric DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_now    timestamptz := now();
  v_w0     timestamptz := v_now - interval '7 days';   -- 今週の開始（直近7日）
  v_w1     timestamptz := v_now - interval '14 days';  -- 前週の開始
  v_thresh numeric := coalesce(p_accuracy_threshold, 30);
  v_nsm_now  bigint;
  v_nsm_prev bigint;
  result jsonb;
BEGIN
  PERFORM public._kpi_assert_admin();

  -- NSM: 期間内に approved 投稿を 2 回以上したユニークユーザー数
  SELECT count(*) INTO v_nsm_now FROM (
    SELECT user_id FROM posts
    WHERE status = 'approved' AND user_id IS NOT NULL
      AND created_at >= v_w0 AND created_at < v_now
    GROUP BY user_id HAVING count(*) >= 2
  ) a;
  SELECT count(*) INTO v_nsm_prev FROM (
    SELECT user_id FROM posts
    WHERE status = 'approved' AND user_id IS NOT NULL
      AND created_at >= v_w1 AND created_at < v_w0
    GROUP BY user_id HAVING count(*) >= 2
  ) b;

  SELECT jsonb_build_object(
    'accuracy_threshold_m', v_thresh,
    'nsm', jsonb_build_object(
      'label', 'weekly_active_contributors',
      'value', v_nsm_now,
      'prev', v_nsm_prev,
      'wow', CASE WHEN v_nsm_prev = 0 THEN NULL
                  ELSE round((v_nsm_now - v_nsm_prev)::numeric / v_nsm_prev, 4) END,
      'delta', v_nsm_now - v_nsm_prev
    ),
    'guardrails', jsonb_build_object(
      -- 却下率（直近7日, 全status分母）
      'rejection_rate', (
        SELECT round(
          count(*) FILTER (WHERE status = 'rejected')::numeric / NULLIF(count(*), 0), 4)
        FROM posts WHERE created_at >= v_w0 AND created_at < v_now
      ),
      -- 完全率（直近7日: 写真添付 AND accuracy 非NULL）
      'completeness_rate', (
        SELECT round(
          count(*) FILTER (
            WHERE photos IS NOT NULL AND array_length(photos, 1) > 0 AND accuracy IS NOT NULL
          )::numeric / NULLIF(count(*), 0), 4)
        FROM posts WHERE created_at >= v_w0 AND created_at < v_now
      ),
      -- 正確率（直近7日: 全投稿分母, 閾値内）
      'accuracy_rate', (
        SELECT round(
          count(*) FILTER (WHERE accuracy IS NOT NULL AND accuracy <= v_thresh)::numeric
            / NULLIF(count(*), 0), 4)
        FROM posts WHERE created_at >= v_w0 AND created_at < v_now
      ),
      'posts_this_week', (
        SELECT count(*) FROM posts WHERE created_at >= v_w0 AND created_at < v_now
      )
    ),
    'kgi', jsonb_build_object(
      -- 累積有効観測レコード数（approved 累計）
      'cumulative_approved', (
        SELECT count(*) FROM posts WHERE status = 'approved'
      ),
      -- 継続投稿者総数（これまでに approved 投稿を 2 回以上したユニークユーザー数）
      'repeat_contributors', (
        SELECT count(*) FROM (
          SELECT user_id FROM posts
          WHERE status = 'approved' AND user_id IS NOT NULL
          GROUP BY user_id HAVING count(*) >= 2
        ) c
      )
    )
  ) INTO result;

  RETURN result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_kpi_summary(numeric) TO authenticated;
COMMENT ON FUNCTION public.get_kpi_summary(numeric) IS
  'REQ-233 FR-233-01/05: NSM(週次アクティブ投稿者)+ガードレール+KGI サマリー（WoW付き）。admin限定・集計のみ。';

-- NFR-233-01: コホート/継続率算出で user_id ごとの初投稿月・経過月集計を高速化する複合インデックス。
CREATE INDEX IF NOT EXISTS idx_posts_user_created ON posts (user_id, created_at)
  WHERE user_id IS NOT NULL;
-- 承認カウンター（status='approved' の user_id 集計・累計）を高速化。
CREATE INDEX IF NOT EXISTS idx_posts_status_user ON posts (status, user_id)
  WHERE user_id IS NOT NULL;

-- ════════════════════════════════════════════════════════════════════════════
-- REQ-253: AI 判定の信頼性エビデンス化（精度統計）。migration 20260708000001 と同期。
--   AI 信頼度（ai_result.confidence）を 4 ビンに分け、各ビンで人手判定の結果
--   （approved/rejected/pending）・自動承認数・承認率・的中率（AI 検出種＝確定種）を集計する。
--   「正解(truth)」は status（人手/自動の確定）＋承認済み投稿の species を真値とみなす運用プロキシ
--   （真の適合率/再現率はラベル付き検証セットが必要）。承認率は auto_approved を含み上振れするため
--   summary.human_reviewed（reviewed_by 非 NULL）に独立検証の的中率を併記する。
--   兄弟 KPI RPC と同一: admin 限定（_kpi_assert_admin）・SECURITY DEFINER・集計のみ・PII 非露出。
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_ai_accuracy_stats()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  result jsonb;
BEGIN
  PERFORM public._kpi_assert_admin();

  WITH scored AS (
    -- confidence は数値のみ採用（NULL・非数値文字列は除外＝null 頑健）。
    SELECT
      CASE WHEN (p.ai_result->>'confidence') ~ '^[0-9]+(\.[0-9]+)?$'
           THEN (p.ai_result->>'confidence')::numeric END AS conf,
      p.status,
      p.auto_approved,
      p.reviewed_by,
      p.species,
      (p.ai_result->>'detected_species') AS detected
    FROM posts p
    WHERE p.ai_result IS NOT NULL
  ),
  binned AS (
    SELECT
      CASE
        WHEN conf < 0.5 THEN 0   -- 〜50%
        WHEN conf < 0.7 THEN 1   -- 50〜70%
        WHEN conf < 0.9 THEN 2   -- 70〜90%
        ELSE 3                   -- 90〜100%
      END AS bin,
      status, auto_approved, reviewed_by, species, detected, conf
    FROM scored
    WHERE conf IS NOT NULL
  ),
  agg AS (
    SELECT
      bin,
      count(*)::bigint                                             AS total,
      count(*) FILTER (WHERE status = 'approved')::bigint          AS approved,
      count(*) FILTER (WHERE status = 'rejected')::bigint          AS rejected,
      count(*) FILTER (WHERE status = 'pending')::bigint           AS pending,
      count(*) FILTER (WHERE auto_approved)::bigint                AS auto_approved,
      -- 的中: 承認済みで AI 検出種＝確定種（detected NULL は不一致扱い＝カウントしない）。
      count(*) FILTER (WHERE status = 'approved' AND detected = species)::bigint AS matched
    FROM binned
    GROUP BY bin
  ),
  -- 固定 4 ビン（空ビンも 0 で必ず現れるよう LEFT JOIN の左側に置く）。
  labels(bin, key, lo, hi) AS (
    VALUES (0, 'lt50', 0.0, 0.5), (1, 'c50_70', 0.5, 0.7),
           (2, 'c70_90', 0.7, 0.9), (3, 'c90_100', 0.9, 1.0)
  )
  SELECT jsonb_build_object(
    'bins', (
      SELECT coalesce(jsonb_agg(
        jsonb_build_object(
          'key', l.key,
          'min', l.lo,
          'max', l.hi,
          'total',         coalesce(a.total, 0),
          'approved',      coalesce(a.approved, 0),
          'rejected',      coalesce(a.rejected, 0),
          'pending',       coalesce(a.pending, 0),
          'auto_approved', coalesce(a.auto_approved, 0),
          -- 承認率 = 承認 ÷（承認＋却下）。保留は未判定なので分母から除外。
          'approval_rate', round(coalesce(a.approved, 0)::numeric
                             / NULLIF(coalesce(a.approved, 0) + coalesce(a.rejected, 0), 0), 4),
          -- 的中率 = 的中 ÷ 承認。承認 0 のビンは NULL。
          'match_rate',    round(coalesce(a.matched, 0)::numeric
                             / NULLIF(coalesce(a.approved, 0), 0), 4)
        ) ORDER BY l.bin
      ), '[]'::jsonb)
      FROM labels l LEFT JOIN agg a ON a.bin = l.bin
    ),
    'summary', (
      SELECT jsonb_build_object(
        'total',         count(*),
        'approved',      count(*) FILTER (WHERE status = 'approved'),
        'rejected',      count(*) FILTER (WHERE status = 'rejected'),
        'pending',       count(*) FILTER (WHERE status = 'pending'),
        'auto_approved', count(*) FILTER (WHERE auto_approved),
        'approval_rate', round(count(*) FILTER (WHERE status = 'approved')::numeric
                           / NULLIF(count(*) FILTER (WHERE status IN ('approved', 'rejected')), 0), 4),
        'match_rate',    round(count(*) FILTER (WHERE status = 'approved' AND detected = species)::numeric
                           / NULLIF(count(*) FILTER (WHERE status = 'approved'), 0), 4),
        'avg_confidence', round(avg(conf), 4),
        -- 人手レビュー分（reviewed_by 非 NULL）＝自動承認を除いた独立検証の的中率。
        'human_reviewed', jsonb_build_object(
          'count',    count(*) FILTER (WHERE reviewed_by IS NOT NULL),
          'approved', count(*) FILTER (WHERE reviewed_by IS NOT NULL AND status = 'approved'),
          'rejected', count(*) FILTER (WHERE reviewed_by IS NOT NULL AND status = 'rejected'),
          'match_rate', round(
            count(*) FILTER (WHERE reviewed_by IS NOT NULL AND status = 'approved' AND detected = species)::numeric
            / NULLIF(count(*) FILTER (WHERE reviewed_by IS NOT NULL AND status = 'approved'), 0), 4)
        )
      )
      FROM binned
    )
  ) INTO result;

  RETURN result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_ai_accuracy_stats() TO authenticated;
COMMENT ON FUNCTION public.get_ai_accuracy_stats() IS
  'REQ-253: AI 信頼度ビン別の承認/的中率（admin限定・集計のみ・PII非露出）。承認率=承認/(承認+却下)、的中率=承認かつAI検出種=確定種/承認。';

-- ════════════════════════════════════════════════════════════════════════════
-- REQ-231: geo_cache — 逆ジオコーディング結果の DB 永続キャッシュ（FR-231-04）。
--   migration 20260615000004 と同期。
--   - キーは丸め座標（NFR-231-06: 個人特定可能な細かい座標を残さない。≒100m グリッド）。
--   - 同一グリッドは外部 API（Nominatim 等）を再コールせず付与（規約「キャッシュ推奨」/ AC-03(c)）。
--   - 地名はほぼ不変なので TTL は長め（fetched_at で経過判定。Edge Function 側 既定 365 日）。
--   - RLS 有効 + ポリシー無し = anon/authenticated 全拒否。Edge Function は service_role で RLS バイパス。
--   ※ posts INSERT → pg_net → Edge Function enrich-place の起動トリガーは Vault 依存のため
--     migration 側にのみ定義する（schema.sql 単独適用＝CI rls-tests では vault スキーマが無いため）。
--     AI 解析 webhook（REQ-073）と同じ「pg_net トリガーは migration のみ」方針に揃える。
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS geo_cache (
  grid_key    TEXT          PRIMARY KEY,
  lat         DECIMAL(10,7) NOT NULL,
  lng         DECIMAL(10,7) NOT NULL,
  locality    TEXT,
  water_body  TEXT,
  is_on_water BOOLEAN,
  elevation_m DECIMAL(7,1),
  geo_source  TEXT,
  fetched_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE geo_cache IS
  'REQ-231: 逆ジオコーディング結果の DB 永続キャッシュ（座標グリッド単位）。Nominatim 規約「キャッシュ推奨」と外部 API コスト削減（REQ-218）に資する。service_role のみアクセス可。';
COMMENT ON COLUMN geo_cache.grid_key IS
  'REQ-231: lat,lng を 3 桁丸め（≒100m）したキー。NFR-231-06: 個人特定可能な細かい座標を残さない';
ALTER TABLE geo_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON geo_cache FROM anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- REQ-234: ライフサイクルメール（研究採用通知・休眠復帰・週次ダイジェスト）
--   migration 20260615000006 と同期。pg_net / pg_cron トリガー（call_lifecycle_edge_function /
--   run_*_batch / cron.schedule）は Vault/cron 依存のため migration 側にのみ定義する
--   （schema.sql 単独適用＝CI rls-tests では vault/pg_cron が無いため。REQ-231 と同方針）。
-- ════════════════════════════════════════════════════════════════════════════

-- ガードレール計測テーブル（送信/配信停止/bounce/complaint をカテゴリ別に記録 / FR-234-10）。
CREATE TABLE IF NOT EXISTS lifecycle_email_log (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  category    TEXT        NOT NULL CHECK (category IN ('research_adopted', 'dormant_reengage', 'weekly_digest')),
  event       TEXT        NOT NULL CHECK (event IN ('sent', 'unsubscribed', 'bounced', 'complained')),
  user_id     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  post_id     UUID        REFERENCES posts(id) ON DELETE SET NULL,
  meta        JSONB
);
COMMENT ON TABLE lifecycle_email_log IS
  'REQ-234: ライフサイクルメールの送信/配信停止/bounce/complaint をカテゴリ別に記録（ガードレール計測 / FR-234-10）。PII 最小・service_role のみ。';
CREATE INDEX IF NOT EXISTS idx_lifecycle_email_log_cat_created ON lifecycle_email_log (category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lifecycle_email_log_user_cat ON lifecycle_email_log (user_id, category, created_at DESC);
ALTER TABLE lifecycle_email_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON lifecycle_email_log FROM anon, authenticated;

-- 最終活動日時ビュー（休眠判定 + ヘルススコア土台 / FR-234-07）。auth.users 参照のため service_role のみ。
CREATE OR REPLACE VIEW user_last_active AS
SELECT
  u.id AS user_id,
  GREATEST(
    COALESCE(u.last_sign_in_at, 'epoch'::timestamptz),
    COALESCE(up.updated_at,     'epoch'::timestamptz),
    COALESCE(p.last_post_at,    'epoch'::timestamptz),
    COALESCE(c.last_comment_at, 'epoch'::timestamptz)
  ) AS last_active_at,
  u.last_sign_in_at,
  p.last_post_at,
  c.last_comment_at
FROM auth.users u
LEFT JOIN user_profiles up ON up.id = u.id
LEFT JOIN (
  SELECT user_id, max(created_at) AS last_post_at FROM posts WHERE user_id IS NOT NULL GROUP BY user_id
) p ON p.user_id = u.id
LEFT JOIN (
  SELECT user_id, max(created_at) AS last_comment_at FROM comments WHERE user_id IS NOT NULL GROUP BY user_id
) c ON c.user_id = u.id;
COMMENT ON VIEW user_last_active IS
  'REQ-234: ユーザの最終活動日時（投稿/コメント/サインイン/プロフィール更新の最大）。休眠判定・ヘルススコアの土台。auth.users 参照のため service_role のみ。';
REVOKE ALL ON user_last_active FROM anon, authenticated;

-- 配信停止トークン → 購読フラグ状態（user_id は露出しない / NFR-234-03）。anon GRANT。
CREATE OR REPLACE FUNCTION public.resolve_unsubscribe_token(p_token uuid)
RETURNS TABLE (found boolean, notify_research_adopted boolean, notify_dormant_reengage boolean, notify_weekly_digest boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT true, up.notify_research_adopted, up.notify_dormant_reengage, up.notify_weekly_digest
  FROM public.user_profiles up WHERE up.unsubscribe_token = p_token LIMIT 1;
$$;
COMMENT ON FUNCTION public.resolve_unsubscribe_token(uuid) IS
  'REQ-234: 配信停止トークン→購読フラグ状態。user_id は露出しない（PII / NFR-234-03）。anon GRANT。';
GRANT EXECUTE ON FUNCTION public.resolve_unsubscribe_token(uuid) TO anon, authenticated;

-- 配信停止の適用（1 カテゴリ or 全ライフサイクル）。ログイン不要・トークン検証のみ（FR-234-03）。
CREATE OR REPLACE FUNCTION public.apply_unsubscribe(p_token uuid, p_category text DEFAULT 'all')
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid;
BEGIN
  SELECT id INTO v_uid FROM public.user_profiles WHERE unsubscribe_token = p_token LIMIT 1;
  IF v_uid IS NULL THEN RETURN false; END IF;
  IF p_category = 'research_adopted' THEN
    UPDATE public.user_profiles SET notify_research_adopted = false WHERE id = v_uid;
  ELSIF p_category = 'dormant_reengage' THEN
    UPDATE public.user_profiles SET notify_dormant_reengage = false WHERE id = v_uid;
  ELSIF p_category = 'weekly_digest' THEN
    UPDATE public.user_profiles SET notify_weekly_digest = false WHERE id = v_uid;
  ELSE
    UPDATE public.user_profiles SET notify_research_adopted = false, notify_dormant_reengage = false, notify_weekly_digest = false WHERE id = v_uid;
  END IF;
  INSERT INTO public.lifecycle_email_log (category, event, user_id, meta)
  VALUES (
    CASE WHEN p_category IN ('research_adopted', 'dormant_reengage', 'weekly_digest') THEN p_category ELSE 'weekly_digest' END,
    'unsubscribed', v_uid, jsonb_build_object('source', 'list_unsubscribe', 'requested', p_category)
  );
  RETURN true;
END;
$$;
COMMENT ON FUNCTION public.apply_unsubscribe(uuid, text) IS
  'REQ-234: 配信停止トークンで 1 カテゴリ or 全ライフサイクルメールを opt-out（ワンクリック着地点 / FR-234-03）。';
GRANT EXECUTE ON FUNCTION public.apply_unsubscribe(uuid, text) TO anon, authenticated;

-- 休眠ユーザ抽出（14 日無活動 + opt-in + 再送下限）。service_role 専用・座標/IP/メールは返さない。
CREATE OR REPLACE FUNCTION public.get_dormant_users(p_dormant_days integer DEFAULT 14, p_resend_min_days integer DEFAULT 30, p_limit integer DEFAULT 200)
RETURNS TABLE (user_id uuid, last_active_at timestamptz, municipality text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  -- municipality は user_profiles には無い（posts のカラム）。そのユーザーが投稿した
  -- 承認済み投稿の市区町村のうち最頻値を「代表地域」として導出する（同数はアルファベット順で 1 つ／
  -- 承認済み投稿が無ければ NULL）。EF（notify-dormant-reengage）はこれを「あなたの地域 ◯◯」に使う。
  SELECT la.user_id, la.last_active_at, m.municipality
  FROM public.user_last_active la
  JOIN public.user_profiles up ON up.id = la.user_id
  LEFT JOIN LATERAL (
    SELECT p.municipality
    FROM public.posts p
    WHERE p.user_id = la.user_id
      AND p.status = 'approved'
      AND p.municipality IS NOT NULL
    GROUP BY p.municipality
    ORDER BY count(*) DESC, p.municipality ASC
    LIMIT 1
  ) m ON true
  WHERE up.notify_dormant_reengage = true
    AND COALESCE(la.last_post_at,    'epoch'::timestamptz) < now() - make_interval(days => p_dormant_days)
    AND COALESCE(la.last_comment_at, 'epoch'::timestamptz) < now() - make_interval(days => p_dormant_days)
    AND COALESCE(la.last_sign_in_at, 'epoch'::timestamptz) < now() - make_interval(days => p_dormant_days)
    AND NOT EXISTS (
      SELECT 1 FROM public.lifecycle_email_log lel
      WHERE lel.user_id = la.user_id AND lel.category = 'dormant_reengage' AND lel.event = 'sent'
        AND lel.created_at > now() - make_interval(days => p_resend_min_days)
    )
  ORDER BY la.last_active_at ASC LIMIT p_limit;
$$;
COMMENT ON FUNCTION public.get_dormant_users(integer, integer, integer) IS
  'REQ-234: 14 日無活動 + opt-in + 再送下限を満たす休眠ユーザを抽出（FR-234-06）。service_role 専用。';
-- REQ-298 FR-298-06: PUBLIC からも明示的に剥がす。冒頭の ALTER DEFAULT PRIVILEGES ...
--   REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC は **no-op** で（pg_default_acl に行が作られない。
--   2026-08-03 に PostgreSQL 16 で実測）、FROM anon だけでは PUBLIC 経由の EXECUTE が残る。
REVOKE EXECUTE ON FUNCTION public.get_dormant_users(integer, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_dormant_users(integer, integer, integer) FROM anon, authenticated;

-- 週次ダイジェスト対象（opt-in・市区町村あり・直近週未送信）。service_role 専用。
CREATE OR REPLACE FUNCTION public.get_weekly_digest_recipients(p_limit integer DEFAULT 500)
RETURNS TABLE (user_id uuid, municipality text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  -- municipality は posts から導出（user_profiles には無い）。承認済み投稿の市区町村の最頻値を
  -- 代表地域とし、代表地域が決まらない（＝承認済み投稿が無い）ユーザは対象外（NULL を除外）。
  SELECT up.id, m.municipality
  FROM public.user_profiles up
  JOIN LATERAL (
    SELECT p.municipality
    FROM public.posts p
    WHERE p.user_id = up.id
      AND p.status = 'approved'
      AND p.municipality IS NOT NULL
    GROUP BY p.municipality
    ORDER BY count(*) DESC, p.municipality ASC
    LIMIT 1
  ) m ON true
  WHERE up.notify_weekly_digest = true
    AND NOT EXISTS (
      SELECT 1 FROM public.lifecycle_email_log lel
      WHERE lel.user_id = up.id AND lel.category = 'weekly_digest' AND lel.event = 'sent'
        AND lel.created_at > now() - interval '6 days'
    )
  LIMIT p_limit;
$$;
COMMENT ON FUNCTION public.get_weekly_digest_recipients(integer) IS
  'REQ-234: 週次ダイジェスト対象（opt-in・市区町村あり・直近週未送信）。service_role 専用。';
REVOKE EXECUTE ON FUNCTION public.get_weekly_digest_recipients(integer) FROM anon, authenticated;

-- 市区町村の直近 1 週間の集計（件数・種別内訳）。座標/PII を返さない（NFR-234-03）。
CREATE OR REPLACE FUNCTION public.get_municipality_weekly_digest(p_municipality text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'municipality', p_municipality,
    'total', COALESCE((SELECT count(*) FROM public.posts WHERE municipality = p_municipality AND status = 'approved' AND created_at > now() - interval '7 days'), 0),
    'by_species', COALESCE((SELECT jsonb_object_agg(species, cnt) FROM (SELECT species, count(*)::int AS cnt FROM public.posts WHERE municipality = p_municipality AND status = 'approved' AND created_at > now() - interval '7 days' GROUP BY species) s), '{}'::jsonb),
    'by_info_type', COALESCE((SELECT jsonb_object_agg(info_type, cnt) FROM (SELECT info_type, count(*)::int AS cnt FROM public.posts WHERE municipality = p_municipality AND status = 'approved' AND created_at > now() - interval '7 days' GROUP BY info_type) i), '{}'::jsonb)
  );
$$;
COMMENT ON FUNCTION public.get_municipality_weekly_digest(text) IS
  'REQ-234: 市区町村の直近 1 週間の承認済み投稿集計（件数・種別内訳）。座標/PII を返さない（NFR-234-03）。';
REVOKE EXECUTE ON FUNCTION public.get_municipality_weekly_digest(text) FROM anon, authenticated;

-- 投稿を研究採用に設定/解除。admin/service_role 限定・audit 記録・新規採用時のみ 1 回通知（FR-234-04/05）。
-- 通知起動は call_notify_research_adopted（migration 側で定義。schema 単独適用では存在しないため動的呼び出しでガード）。
CREATE OR REPLACE FUNCTION public.adopt_post_research(p_post_id uuid, p_adopt boolean DEFAULT true)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  jwt_claims jsonb; v_role text; v_actor uuid; v_user_id uuid; v_was timestamptz;
BEGIN
  BEGIN
    jwt_claims := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb;
  EXCEPTION WHEN OTHERS THEN jwt_claims := NULL; END;
  v_role := COALESCE(jwt_claims ->> 'role', '');
  IF v_role <> 'service_role' AND (jwt_claims -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'forbidden: admin or service_role required';
  END IF;
  SELECT user_id, research_adopted_at INTO v_user_id, v_was FROM public.posts WHERE id = p_post_id;
  IF NOT FOUND THEN RETURN false; END IF;
  IF p_adopt THEN
    UPDATE public.posts SET research_adopted_at = COALESCE(research_adopted_at, now()) WHERE id = p_post_id;
  ELSE
    UPDATE public.posts SET research_adopted_at = NULL, research_adopted_notified_at = NULL WHERE id = p_post_id;
  END IF;
  BEGIN v_actor := NULLIF(jwt_claims ->> 'sub', '')::uuid; EXCEPTION WHEN OTHERS THEN v_actor := NULL; END;
  INSERT INTO public.audit_logs (admin_id, action, target_type, target_id, details)
  VALUES (v_actor, CASE WHEN p_adopt THEN 'adopt_research' ELSE 'unadopt_research' END, 'post', p_post_id, jsonb_build_object('was_adopted', v_was IS NOT NULL));
  -- 新規採用（未通知）かつ非匿名なら通知起動（migration 側の pg_net ラッパ。schema 単独では未定義のため EXECUTE で安全に no-op）。
  IF p_adopt AND v_was IS NULL AND v_user_id IS NOT NULL THEN
    BEGIN
      EXECUTE 'SELECT public.call_notify_research_adopted($1)' USING jsonb_build_object('post_id', p_post_id);
    EXCEPTION WHEN undefined_function THEN NULL; END;
  END IF;
  RETURN true;
END;
$$;
COMMENT ON FUNCTION public.adopt_post_research(uuid, boolean) IS
  'REQ-234: 投稿を研究採用に設定/解除。admin/service_role 限定・audit 記録・新規採用時のみ 1 回通知（FR-234-04/05）。';
REVOKE EXECUTE ON FUNCTION public.adopt_post_research(uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.adopt_post_research(uuid, boolean) TO authenticated;

-- ライフサイクルメール送信記録（研究採用は notified_at を 1 回セット / 冪等）。service_role 専用。
CREATE OR REPLACE FUNCTION public.record_lifecycle_email(p_category text, p_user_id uuid, p_post_id uuid DEFAULT NULL, p_set_research_notified boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.lifecycle_email_log (category, event, user_id, post_id) VALUES (p_category, 'sent', p_user_id, p_post_id);
  IF p_set_research_notified AND p_post_id IS NOT NULL THEN
    UPDATE public.posts SET research_adopted_notified_at = COALESCE(research_adopted_notified_at, now()) WHERE id = p_post_id;
  END IF;
END;
$$;
COMMENT ON FUNCTION public.record_lifecycle_email(text, uuid, uuid, boolean) IS
  'REQ-234: ライフサイクルメール送信を記録し、研究採用は notified_at を 1 回セット（冪等 / NFR-234-02）。service_role 専用。';
-- REQ-298 FR-298-06: PUBLIC からも明示的に剥がす。冒頭の ALTER DEFAULT PRIVILEGES ...
--   REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC は **no-op** で（pg_default_acl に行が作られない。
--   2026-08-03 に PostgreSQL 16 で実測）、FROM anon だけでは PUBLIC 経由の EXECUTE が残る。
REVOKE EXECUTE ON FUNCTION public.record_lifecycle_email(text, uuid, uuid, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_lifecycle_email(text, uuid, uuid, boolean) FROM anon, authenticated;

-- カテゴリ別の配信停止率/苦情率（直近 N 日）。閾値超過時の頻度調整に使う（FR-234-10）。
CREATE OR REPLACE FUNCTION public.get_lifecycle_unsubscribe_rate(p_days integer DEFAULT 30)
RETURNS TABLE (category text, sent_count bigint, unsub_count bigint, complaint_count bigint, unsubscribe_rate numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT cat.category,
    COALESCE(s.sent_count, 0), COALESCE(u.unsub_count, 0), COALESCE(c.complaint_count, 0),
    round(COALESCE(u.unsub_count, 0)::numeric / NULLIF(COALESCE(s.sent_count, 0), 0), 4)
  FROM (VALUES ('research_adopted'), ('dormant_reengage'), ('weekly_digest')) AS cat(category)
  LEFT JOIN (SELECT category, count(*) AS sent_count FROM public.lifecycle_email_log WHERE event = 'sent' AND created_at > now() - make_interval(days => p_days) GROUP BY category) s ON s.category = cat.category
  LEFT JOIN (SELECT category, count(*) AS unsub_count FROM public.lifecycle_email_log WHERE event = 'unsubscribed' AND created_at > now() - make_interval(days => p_days) GROUP BY category) u ON u.category = cat.category
  LEFT JOIN (SELECT category, count(*) AS complaint_count FROM public.lifecycle_email_log WHERE event = 'complained' AND created_at > now() - make_interval(days => p_days) GROUP BY category) c ON c.category = cat.category;
$$;
COMMENT ON FUNCTION public.get_lifecycle_unsubscribe_rate(integer) IS
  'REQ-234: カテゴリ別の配信停止率/苦情率（直近 N 日）。閾値超過時に頻度を下げる運用判断に使う（FR-234-10）。admin 集計用。';
REVOKE EXECUTE ON FUNCTION public.get_lifecycle_unsubscribe_rate(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_lifecycle_unsubscribe_rate(integer) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- REQ-237: Web Push 購読（即時リエンゲージ・チャネル / migration 20260615000007 と同期）。
--   VAPID 秘密鍵は DB に置かない（Edge Secrets / NFR-237-01）。本テーブルは購読の保管のみ。
--   pg_net ラッパ call_send_push は migration 側にのみ定義（CI rls-tests に vault/pg_net が無いため）。
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint       text        NOT NULL,
  p256dh         text        NOT NULL,
  auth           text        NOT NULL,
  user_agent     text,
  enabled        boolean     NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  last_seen_at   timestamptz NOT NULL DEFAULT now(),
  last_failed_at timestamptz,
  CONSTRAINT push_subscriptions_user_endpoint_key UNIQUE (user_id, endpoint)
);
COMMENT ON TABLE public.push_subscriptions IS
  'REQ-237: Web Push（PushManager）の購読。本人のみ読み書き（RLS）。送信は service_role が RLS バイパスで参照。';
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON public.push_subscriptions (user_id) WHERE enabled = true;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "own_push_sub_select" ON public.push_subscriptions FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "own_push_sub_insert" ON public.push_subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "own_push_sub_update" ON public.push_subscriptions FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "own_push_sub_delete" ON public.push_subscriptions FOR DELETE USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 送信対象の有効購読を返す（service_role 専用 / FR-237-05）。
CREATE OR REPLACE FUNCTION public.get_push_subscriptions_for_user(p_user_id uuid)
RETURNS TABLE (id uuid, endpoint text, p256dh text, auth text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ps.id, ps.endpoint, ps.p256dh, ps.auth
  FROM public.push_subscriptions ps
  WHERE ps.user_id = p_user_id AND ps.enabled = true;
$$;
COMMENT ON FUNCTION public.get_push_subscriptions_for_user(uuid) IS
  'REQ-237: ユーザの有効な Push 購読を返す（送信用 / FR-237-05）。service_role 専用。';
-- REQ-298 FR-298-06: PUBLIC からも明示的に剥がす。冒頭の ALTER DEFAULT PRIVILEGES ...
--   REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC は **no-op** で（pg_default_acl に行が作られない。
--   2026-08-03 に PostgreSQL 16 で実測）、FROM anon だけでは PUBLIC 経由の EXECUTE が残る。
REVOKE EXECUTE ON FUNCTION public.get_push_subscriptions_for_user(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_push_subscriptions_for_user(uuid) FROM anon, authenticated;

-- 失効購読（送信 410/404）を無効化（AC-06 / NFR-237-03）。service_role 専用。
CREATE OR REPLACE FUNCTION public.deactivate_push_subscription(p_endpoint text)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.push_subscriptions SET enabled = false, last_failed_at = now() WHERE endpoint = p_endpoint;
END;
$$;
COMMENT ON FUNCTION public.deactivate_push_subscription(text) IS
  'REQ-237: 送信で 410/404 が返った endpoint を無効化（再送対象から外す / AC-06）。service_role 専用。';
REVOKE EXECUTE ON FUNCTION public.deactivate_push_subscription(text) FROM anon, authenticated;

-- 無効化から N 日経過した購読を物理削除（NFR-237-03）。service_role 専用。
CREATE OR REPLACE FUNCTION public.prune_disabled_push_subscriptions(p_days integer DEFAULT 30)
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_deleted integer;
BEGIN
  DELETE FROM public.push_subscriptions
    WHERE enabled = false AND last_failed_at IS NOT NULL AND last_failed_at < now() - make_interval(days => p_days);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;
COMMENT ON FUNCTION public.prune_disabled_push_subscriptions(integer) IS
  'REQ-237: 無効化から N 日経過した Push 購読を刈り込む（NFR-237-03）。service_role 専用。';
REVOKE EXECUTE ON FUNCTION public.prune_disabled_push_subscriptions(integer) FROM anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- REQ-215 FR-215-07(b): AI 自動承認/却下の濫用検知（異常検知）の集計関数（正本反映）
--
--   ザリダスは「ユーザー投稿を AI が人手レビュー無しで自動承認/却下する」点が設計の肝であり、
--   その権威化された自動判定の濫用/暴走を**定期集計(pg_cron)で検知**し管理者へ通知する
--   （通知配線 = notify-ai-anomaly Edge Function / pg_net + pg_cron は migration 側に置く。
--    本ファイルには集計関数のみ正本反映する）。
--
--   依存テーブル ai_call_logs / admin_alerts は migration 由来で schema.sql には無いが、
--   plpgsql 関数本体は CREATE 時にテーブル参照を検証しない（遅延束縛）ため、CI の
--   `psql -f schema.sql` / 型生成は安全に通る（get_kpi_quality_funnel と同じ前提）。
--
--   admin_alerts.alert_type の許可値 'ai_anomaly' 追加と pg_cron スケジュールは
--   supabase/migrations/20260616000003_ai_anomaly_detection.sql を参照（schema.sql には
--   admin_alerts テーブル定義自体が無いため、CHECK 制約はそちらが正本）。
--
--   集計対象は既存 ai_call_logs / posts のみ（analyze-image / analyze-audio にフックを足さない
--   = 事後集計方式 / REQ-215 制約）。PII 最小（REQ-211）: 件数・率・user_id(集計キー)と
--   ハッシュ化済み reporter_ip の件数のみ返し、平文メール/座標/IP は返さない。
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.detect_ai_anomalies(
  p_window_minutes integer DEFAULT 60,
  p_min_samples integer DEFAULT 20,
  p_auto_approve_rate_threshold numeric DEFAULT 0.90,
  p_per_actor_call_threshold integer DEFAULT 50,
  p_total_call_threshold integer DEFAULT 500
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since                 timestamptz := now() - make_interval(mins => GREATEST(p_window_minutes, 1));
  v_total_calls           bigint;
  v_analyzed_posts        bigint;
  v_auto_approved         bigint;
  v_auto_approve_rate     numeric;
  v_max_user_calls        bigint := 0;
  v_top_user_id           uuid;
  v_max_ip_posts          bigint := 0;
  v_signals               jsonb := '[]'::jsonb;
BEGIN
  -- REQ-241 FR-241-01: 認可ゲート（本体の最初の文）。兄弟 KPI RPC（get_retention_cohorts /
  --   get_kpi_quality_funnel / get_kpi_summary）と同型。_kpi_assert_admin は request.jwt.claims の
  --   role='service_role' または app_metadata.role='admin' のみ通す。GRANT は authenticated のままで
  --   実チェックは本ゲートが担う。service_role を許可するため notify-ai-anomaly Edge Function
  --   （run_ai_anomaly_check → pg_net → service_role 鍵で detect_ai_anomalies を rpc 呼び出し）の
  --   cron パスは壊れない。
  PERFORM public._kpi_assert_admin();

  -- (1) 窓内 AI 呼び出し総数（コスト/頻度の指標。status 不問）。
  SELECT count(*) INTO v_total_calls
  FROM public.ai_call_logs
  WHERE created_at >= v_since
    AND function_name IN ('analyze-image', 'analyze-audio');

  -- (2) auto-approve 率（分母 = 窓内に AI 分析された投稿。分子 = auto_approved かつ人手なし）。
  SELECT
    count(*),
    count(*) FILTER (WHERE auto_approved = true AND reviewed_by IS NULL)
  INTO v_analyzed_posts, v_auto_approved
  FROM public.posts
  WHERE ai_analyzed_at IS NOT NULL
    AND ai_analyzed_at >= v_since;

  IF v_analyzed_posts >= GREATEST(p_min_samples, 1) THEN
    v_auto_approve_rate := round(v_auto_approved::numeric / NULLIF(v_analyzed_posts, 0), 4);
  ELSE
    v_auto_approve_rate := NULL;  -- 標本が少なすぎる窓は評価しない（誤検知防止）。
  END IF;

  -- (3) 単一ユーザーに集中した AI 呼び出し（ai_call_logs→posts.user_id を user 単位に畳む）。
  SELECT per_user.user_id, per_user.n
  INTO v_top_user_id, v_max_user_calls
  FROM (
    SELECT p.user_id, count(*) AS n
    FROM public.ai_call_logs c
    JOIN public.posts p ON p.id = c.post_id
    WHERE c.created_at >= v_since
      AND c.function_name IN ('analyze-image', 'analyze-audio')
      AND p.user_id IS NOT NULL
    GROUP BY p.user_id
  ) per_user
  ORDER BY per_user.n DESC
  LIMIT 1;
  v_max_user_calls := COALESCE(v_max_user_calls, 0);

  -- (4) 単一 reporter_ip(ハッシュ化済み) に集中した AI 分析投稿数（平文 IP は持たない）。
  SELECT COALESCE(max(per_ip.n), 0) INTO v_max_ip_posts
  FROM (
    SELECT reporter_ip, count(*) AS n
    FROM public.posts
    WHERE ai_analyzed_at IS NOT NULL
      AND ai_analyzed_at >= v_since
      AND reporter_ip IS NOT NULL
    GROUP BY reporter_ip
  ) per_ip;

  -- (5) signals 判定（閾値超過のみ積む）。
  IF v_auto_approve_rate IS NOT NULL
     AND v_auto_approve_rate >= p_auto_approve_rate_threshold THEN
    v_signals := v_signals || jsonb_build_array('high_auto_approve_rate');
  END IF;
  IF v_max_user_calls >= p_per_actor_call_threshold THEN
    v_signals := v_signals || jsonb_build_array('user_call_spike');
  END IF;
  IF v_max_ip_posts >= p_per_actor_call_threshold THEN
    v_signals := v_signals || jsonb_build_array('ip_call_spike');
  END IF;
  IF v_total_calls >= p_total_call_threshold THEN
    v_signals := v_signals || jsonb_build_array('high_call_volume');
  END IF;

  RETURN jsonb_build_object(
    'window_minutes', GREATEST(p_window_minutes, 1),
    'since', v_since,
    'thresholds', jsonb_build_object(
      'min_samples', GREATEST(p_min_samples, 1),
      'auto_approve_rate', p_auto_approve_rate_threshold,
      'per_actor_calls', p_per_actor_call_threshold,
      'total_calls', p_total_call_threshold
    ),
    'metrics', jsonb_build_object(
      'total_calls', v_total_calls,
      'analyzed_posts', v_analyzed_posts,
      'auto_approved', v_auto_approved,
      'auto_approve_rate', v_auto_approve_rate,
      'max_user_calls', v_max_user_calls,
      'top_user_id', v_top_user_id,
      'max_ip_posts', v_max_ip_posts
    ),
    'signals', v_signals,
    'anomaly', jsonb_array_length(v_signals) > 0
  );
END;
$$;
COMMENT ON FUNCTION public.detect_ai_anomalies(integer, integer, numeric, integer, integer) IS
  'REQ-215 FR-215-07(b): 直近ウィンドウの AI 自動承認率 / 単一 actor の呼び出し頻度 / 総呼び出し数の異常を集計し signals を返す。既存 ai_call_logs / posts のみ参照（analyze-* にフックを足さない）。PII 最小（user_id 集計キーとハッシュ IP 件数のみ）。service_role / admin 用。';
-- REQ-298 FR-298-06: PUBLIC からも明示的に剥がす。冒頭の ALTER DEFAULT PRIVILEGES ...
--   REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC は **no-op** で（pg_default_acl に行が作られない。
--   2026-08-03 に PostgreSQL 16 で実測）、FROM anon だけでは PUBLIC 経由の EXECUTE が残る。
REVOKE EXECUTE ON FUNCTION public.detect_ai_anomalies(integer, integer, numeric, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.detect_ai_anomalies(integer, integer, numeric, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.detect_ai_anomalies(integer, integer, numeric, integer, integer) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- REQ-179: reporter_ip 列レベル保護（posts の全 ALTER の後＝ファイル末尾で実行）
--   posts.reporter_ip（PII＝投稿者IP）を anon / authenticated から読めなくする。
--   詳細・セマンティクスの解説は上部「8-5b」コメント参照。実装をここに置く理由は、
--   posts へ後発で追加される列（audio_url / location_source / experiment_assignments /
--   survey_method / survey_site_id 等）も列単位 SELECT 付与の対象に含めるため
--   （全列が出揃ってから information_schema を列挙する）。
--
--   方式: テーブルレベル SELECT を剥がし、reporter_ip を除く全列に列単位 SELECT を貼り直す。
--     → reporter_ip を含むクエリは permission denied（42501）、含まない通常取得は従来どおり成功。
--   冪等: 何度実行しても安全。列の増減に自動追随。
--
--   ⚠ live DB / CI rls-tests では Supabase 既定の `GRANT SELECT ON ALL TABLES ... TO
--     anon/authenticated` が schema/migration の「後」に効くため、本ブロックだけでは
--     テーブルレベル SELECT が復活して reporter_ip が再露出する。そのため本番は migration
--     20260616000005 が既定 GRANT の後に再確定し、CI（ci.yml rls-tests）も一括 GRANT の
--     「後」に同 migration（または本ブロック相当）を再適用する必要がある。
-- REQ-243 追補: 生座標も同技法で保護する。posts では reporter_ip に加え lat/lng/accuracy を、
--   survey_requests では lat/lng を anon/authenticated から隠す（display_* 生成列のみ公開）。
--   所有者/管理者の正確座標は get_my_post_location / get_admin_post_locations RPC 経由で取得する。
DO $reporter_ip_protect$
DECLARE
  v_cols text;
BEGIN
  -- 1) posts: テーブルレベル SELECT を剥がし、保護列を除く全列に列単位 SELECT を貼り直す。
  EXECUTE 'REVOKE SELECT ON public.posts FROM anon, authenticated';
  SELECT string_agg(format('%I', column_name), ', ' ORDER BY ordinal_position)
    INTO v_cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'posts'
    AND column_name NOT IN ('reporter_ip', 'lat', 'lng', 'accuracy');
  IF v_cols IS NOT NULL THEN
    EXECUTE format('GRANT SELECT (%s) ON public.posts TO anon, authenticated', v_cols);
  END IF;

  -- 2) survey_requests: 生 lat/lng を隠す（display_lat/lng・user_id 等は残す）。
  IF to_regclass('public.survey_requests') IS NOT NULL THEN
    EXECUTE 'REVOKE SELECT ON public.survey_requests FROM anon, authenticated';
    SELECT string_agg(format('%I', column_name), ', ' ORDER BY ordinal_position)
      INTO v_cols
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'survey_requests'
      AND column_name NOT IN ('lat', 'lng');
    IF v_cols IS NOT NULL THEN
      EXECUTE format('GRANT SELECT (%s) ON public.survey_requests TO anon, authenticated', v_cols);
    END IF;
  END IF;
END
$reporter_ip_protect$;

-- REQ-325: 回答は公開プロフィールから分離し、本人だけに公開する。
CREATE TABLE IF NOT EXISTS public.user_onboarding (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  region text NOT NULL CHECK (region IN ('akita_city', 'north', 'central', 'south', 'other')),
  seen_crayfish text NOT NULL CHECK (seen_crayfish IN ('yes', 'no', 'maybe')),
  onboarded_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_onboarding ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY onboarding_select_own ON public.user_onboarding
    FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY onboarding_insert_own ON public.user_onboarding
    FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY onboarding_update_own ON public.user_onboarding
    FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- DELETE ポリシーなし。退会時は auth.users の cascade で削除する。
REVOKE ALL ON public.user_onboarding FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.user_onboarding TO authenticated;

DROP TRIGGER IF EXISTS set_onboarding_updated_at ON public.user_onboarding;
CREATE TRIGGER set_onboarding_updated_at
  BEFORE UPDATE ON public.user_onboarding FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- ════════════════════════════════════════════════════════════════════════════
-- REQ-329: 非公開（hidden）投稿の地名退避 ＋ 非公開スポット（クイック保存）。
--   migration 20260926000001 と同期。投稿者による hidden の選択は上の
--   protect_post_insert_columns / protect_post_status（9-1 / 9-2）に反映済み。
-- ════════════════════════════════════════════════════════════════════════════
-- ────────────────────────────────────────────────────────────────────────────
-- 3. 非公開（hidden）投稿の地名退避
--    locality / water_body は「〇〇沼」のように場所を特定できる。hidden の投稿ではこれを
--    管理者専用の post_hidden_geo へ移し、posts の公開列を NULL にする。
--    FK を DEFERRABLE にしているのは、BEFORE INSERT（まだ posts 行が無い時点）でも退避できるようにするため。
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.post_hidden_geo (
  post_id    uuid PRIMARY KEY
               REFERENCES public.posts(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  locality   text,
  water_body text,
  stashed_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.post_hidden_geo IS
  'REQ-329: 位置非公開（hidden）の投稿から退避した字名・水系名。管理者だけが読める。公開へ戻すと posts へ復元される。';

ALTER TABLE public.post_hidden_geo ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY post_hidden_geo_admin_read ON public.post_hidden_geo
    FOR SELECT TO authenticated
    USING (((SELECT auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- 書き込みはトリガー（SECURITY DEFINER）だけ。利用者からは存在ごと見えない。
REVOKE ALL ON public.post_hidden_geo FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.post_hidden_geo TO authenticated;

CREATE OR REPLACE FUNCTION public.stash_hidden_post_geo()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_locality   text;
  v_water_body text;
BEGIN
  IF NEW.location_disclosure = 'hidden' THEN
    -- 非公開のまま地名が書かれる（enrich-place の付与・非公開化の瞬間）: 退避して公開列を空にする
    IF NEW.locality IS NOT NULL OR NEW.water_body IS NOT NULL THEN
      INSERT INTO public.post_hidden_geo AS h (post_id, locality, water_body)
      VALUES (NEW.id, NEW.locality, NEW.water_body)
      ON CONFLICT (post_id) DO UPDATE
        SET locality   = COALESCE(EXCLUDED.locality, h.locality),
            water_body = COALESCE(EXCLUDED.water_body, h.water_body),
            stashed_at = now();
      NEW.locality   := NULL;
      NEW.water_body := NULL;
    END IF;
  ELSIF TG_OP = 'UPDATE' AND OLD.location_disclosure = 'hidden' THEN
    -- 非公開の解除（管理者だけが行える）: 退避してあった地名を戻す
    DELETE FROM public.post_hidden_geo WHERE post_id = NEW.id
      RETURNING locality, water_body INTO v_locality, v_water_body;
    IF FOUND THEN
      NEW.locality   := COALESCE(NEW.locality, v_locality);
      NEW.water_body := COALESCE(NEW.water_body, v_water_body);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.stash_hidden_post_geo() FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION public.stash_hidden_post_geo() IS
  'REQ-329: hidden の投稿の locality / water_body を post_hidden_geo へ退避して公開列を NULL にする。hidden を解除すると復元する。';

-- 名前を zz_ にして、同じ BEFORE トリガー群（enforce_* / set_*）の後に走らせる
-- （一般ユーザーの UPDATE で protect_post_status が地名を OLD に戻した「後」の値を見るため）。
DROP TRIGGER IF EXISTS zz_stash_hidden_post_geo ON public.posts;
CREATE TRIGGER zz_stash_hidden_post_geo
  BEFORE INSERT OR UPDATE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.stash_hidden_post_geo();

-- 既存の hidden 投稿に残っている地名を退避する（一度きり・何度流しても同じ結果）。
INSERT INTO public.post_hidden_geo (post_id, locality, water_body)
SELECT id, locality, water_body
FROM public.posts
WHERE location_disclosure = 'hidden'
  AND (locality IS NOT NULL OR water_body IS NOT NULL)
ON CONFLICT (post_id) DO NOTHING;
UPDATE public.posts
SET locality = NULL, water_body = NULL
WHERE location_disclosure = 'hidden'
  AND (locality IS NOT NULL OR water_body IS NOT NULL);

-- ────────────────────────────────────────────────────────────────────────────
-- 4. private_spots: 名前を付けて位置を非公開で保存する（クイック保存）
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.private_spots (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
  note        text CHECK (note IS NULL OR char_length(note) <= 500),
  lat         numeric(10,7) NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng         numeric(10,7) NOT NULL CHECK (lng BETWEEN -180 AND 180),
  accuracy    numeric(7,1) CHECK (accuracy IS NULL OR accuracy >= 0),
  recorded_at timestamptz NOT NULL DEFAULT now()
                CHECK (recorded_at <= now() + interval '1 day'),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.private_spots IS
  'REQ-329: 名前付きで非公開保存した地点（クイック保存）。本人と管理者だけが読める。posts・公開データセットとは無関係。';
COMMENT ON COLUMN public.private_spots.recorded_at IS
  'REQ-329: 記録した日時（端末の時刻）。オフラインで保存して後から送る場合があるため created_at と分ける。';
CREATE INDEX IF NOT EXISTS idx_private_spots_user_created ON public.private_spots (user_id, created_at DESC);

ALTER TABLE public.private_spots ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY private_spots_select_own_or_admin ON public.private_spots
    FOR SELECT TO authenticated
    USING (
      (SELECT auth.uid()) = user_id
      OR ((SELECT auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY private_spots_insert_own ON public.private_spots
    FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY private_spots_update_own ON public.private_spots
    FOR UPDATE TO authenticated
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY private_spots_delete_own_or_admin ON public.private_spots
    FOR DELETE TO authenticated
    USING (
      (SELECT auth.uid()) = user_id
      OR ((SELECT auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- anon には一切触らせない（whether 層で閉じる）。退会時は auth.users の cascade で消える。
REVOKE ALL ON public.private_spots FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.private_spots TO authenticated;

-- UPDATE では所有者と作成日時を固定する（名前・メモの変更だけを想定）。
CREATE OR REPLACE FUNCTION public.protect_private_spot_columns()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.user_id    := OLD.user_id;
  NEW.created_at := OLD.created_at;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.protect_private_spot_columns() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS enforce_private_spot_columns ON public.private_spots;
CREATE TRIGGER enforce_private_spot_columns
  BEFORE UPDATE ON public.private_spots
  FOR EACH ROW EXECUTE FUNCTION public.protect_private_spot_columns();

-- 保存のしすぎを DB で止める（1 時間 60 件・1 人 2000 件）。管理者は素通り。
CREATE OR REPLACE FUNCTION public.check_private_spot_rate_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_recent integer;
  v_total  integer;
BEGIN
  IF (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'role') = 'admin' THEN
    RETURN NEW;
  END IF;
  SELECT count(*) INTO v_recent FROM public.private_spots
  WHERE user_id = NEW.user_id AND created_at > now() - interval '1 hour';
  IF v_recent >= 60 THEN
    RAISE EXCEPTION '非公開スポットの保存上限（1時間あたり60件）に達しました' USING ERRCODE = 'P0001';
  END IF;
  SELECT count(*) INTO v_total FROM public.private_spots WHERE user_id = NEW.user_id;
  IF v_total >= 2000 THEN
    RAISE EXCEPTION '非公開スポットの保存上限（1人2000件）に達しました' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.check_private_spot_rate_limit() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS enforce_private_spot_rate_limit ON public.private_spots;
CREATE TRIGGER enforce_private_spot_rate_limit
  BEFORE INSERT ON public.private_spots
  FOR EACH ROW EXECUTE FUNCTION public.check_private_spot_rate_limit();

-- ════════════════════════════════════════════════════════════════════════════
-- REQ-330: 調査計画（survey_plans / survey_plan_stops / survey_stop_posts）と希少種の非公開記録
--   （rare_sightings）＋ 非公開の写真置き場 rare-photos。migration 20261001000001 と同期。
--   権限の型は上の private_spots（REQ-329）を写す: SELECT は本人か管理者、INSERT・UPDATE は本人、
--   DELETE は本人か管理者。anon には GRANT 自体を付けない。posts・公開 RPC・公開データセットはこの 4 表を
--   参照しない（scripts/check-private-tables-not-public.mjs が CI で見張る）。
-- ════════════════════════════════════════════════════════════════════════════
-- ────────────────────────────────────────────────────────────────────────────
-- 1. survey_plans: 調査計画
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.survey_plans (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 60),
  planned_on  date NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Tokyo')::date),
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'done', 'archived')),
  note        text CHECK (note IS NULL OR char_length(note) <= 500),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.survey_plans IS
  'REQ-330: 調査計画。本人と管理者だけが読める。家で計画して現地で使うため端末ではなく DB に置く。';
COMMENT ON COLUMN public.survey_plans.planned_on IS
  'REQ-330: 予定日。既定は日本時間の今日。';
CREATE INDEX IF NOT EXISTS idx_survey_plans_user_planned ON public.survey_plans (user_id, planned_on DESC);
CREATE INDEX IF NOT EXISTS idx_survey_plans_user_created ON public.survey_plans (user_id, created_at DESC);

-- ────────────────────────────────────────────────────────────────────────────
-- 2. survey_plan_stops: 計画の地点
--    座標は複製して持つ（元の非公開スポットを消しても計画は壊れない）。source_id は外部キーにしない。
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.survey_plan_stops (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id     uuid NOT NULL REFERENCES public.survey_plans(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sort_order  integer NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 9999),
  name        text CHECK (name IS NULL OR char_length(btrim(name)) BETWEEN 1 AND 60),
  note        text CHECK (note IS NULL OR char_length(note) <= 500),
  lat         numeric(10,7) NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng         numeric(10,7) NOT NULL CHECK (lng BETWEEN -180 AND 180),
  source      text NOT NULL CHECK (source IN ('pin', 'private_spot', 'survey_request', 'current_location')),
  source_id   uuid,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'skipped')),
  visited_at  timestamptz CHECK (visited_at IS NULL OR visited_at <= now() + interval '1 day'),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  -- 元の id を持つのは非公開スポットと調査依頼から足した地点だけ（ピン・現在地は持たない）
  CONSTRAINT survey_plan_stops_source_id_matches
    CHECK ((source_id IS NOT NULL) = (source = 'private_spot' OR source = 'survey_request'))
);
COMMENT ON TABLE public.survey_plan_stops IS
  'REQ-330: 調査計画の地点。本人と管理者だけが読める。座標は複製して持ち、元のスポットとは外部キーで結ばない。';
COMMENT ON COLUMN public.survey_plan_stops.visited_at IS
  'REQ-330: 済み・飛ばしにした端末の時刻。圏外で溜めて後から送る場合があるため updated_at と分ける。';
CREATE INDEX IF NOT EXISTS idx_survey_plan_stops_plan_order ON public.survey_plan_stops (plan_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_survey_plan_stops_user_created ON public.survey_plan_stops (user_id, created_at DESC);

-- ────────────────────────────────────────────────────────────────────────────
-- 3. survey_stop_posts: 地点と投稿のつながり
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.survey_stop_posts (
  stop_id     uuid NOT NULL REFERENCES public.survey_plan_stops(id) ON DELETE CASCADE,
  post_id     uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('sighting', 'absence')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (stop_id, post_id)
);
COMMENT ON TABLE public.survey_stop_posts IS
  'REQ-330: 調査地点から作った投稿のつながり。本人と管理者だけが読める。地点も投稿も自分のものに限る。作るか消すかだけ（UPDATE なし）。';
CREATE INDEX IF NOT EXISTS idx_survey_stop_posts_post ON public.survey_stop_posts (post_id);

-- ────────────────────────────────────────────────────────────────────────────
-- 4. rare_sightings: 希少種の記録
--    種は形式だけ検査し、一覧はコードの定数 1 か所（src/features/fieldwork/constants.ts）に置く。
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rare_sightings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id       uuid NOT NULL,
  stop_id         uuid REFERENCES public.survey_plan_stops(id) ON DELETE SET NULL,
  species_key     text NOT NULL CHECK (species_key ~ '^[a-z][a-z0-9_]{0,39}$'),
  species_label   text CHECK (species_label IS NULL OR char_length(btrim(species_label)) BETWEEN 1 AND 60),
  count           integer CHECK (count IS NULL OR count BETWEEN 0 AND 100000),
  note            text CHECK (note IS NULL OR char_length(note) <= 500),
  lat             numeric(10,7) NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng             numeric(10,7) NOT NULL CHECK (lng BETWEEN -180 AND 180),
  accuracy        numeric(7,1) CHECK (accuracy IS NULL OR accuracy >= 0),
  location_source text NOT NULL CHECK (location_source IN ('gps', 'map')),
  observed_at     timestamptz NOT NULL DEFAULT now() CHECK (observed_at <= now() + interval '1 day'),
  photo_paths     text[] NOT NULL DEFAULT '{}'::text[] CHECK (cardinality(photo_paths) <= 3),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rare_sightings_other_needs_label CHECK (species_key <> 'other' OR species_label IS NOT NULL),
  -- 応答が途切れたあとの再送で 2 行入らないように、端末で作る id で弾く（REQ-329 の非公開スポットの穴を作らない）
  CONSTRAINT rare_sightings_user_client_key UNIQUE (user_id, client_id)
);
COMMENT ON TABLE public.rare_sightings IS
  'REQ-330: 希少種の記録。本人と管理者だけが読める。posts・公開データセット・集計 RPC とは無関係。写真は非公開の rare-photos に置く。';
COMMENT ON COLUMN public.rare_sightings.client_id IS
  'REQ-330: 端末で作る uuid。同じ送信の二重登録を UNIQUE (user_id, client_id) で弾く。';
COMMENT ON COLUMN public.rare_sightings.location_source IS
  'REQ-330: 位置の取り方。gps=現在地（accuracy も保存）、map=地点や地図の座標。';
COMMENT ON COLUMN public.rare_sightings.photo_paths IS
  'REQ-330: rare-photos 内のパス（3 つまで）。どれも <自分の user_id>/ で始まる（トリガーで検査）。';
CREATE INDEX IF NOT EXISTS idx_rare_sightings_user_created ON public.rare_sightings (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rare_sightings_stop ON public.rare_sightings (stop_id) WHERE stop_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. RLS（private_spots と同じ型。管理者の判定も同じ式）
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.survey_plans      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.survey_plan_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.survey_stop_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rare_sightings    ENABLE ROW LEVEL SECURITY;

-- survey_plans
DO $$ BEGIN
  CREATE POLICY survey_plans_select_own_or_admin ON public.survey_plans
    FOR SELECT TO authenticated
    USING (
      (SELECT auth.uid()) = user_id
      OR ((SELECT auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY survey_plans_insert_own ON public.survey_plans
    FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY survey_plans_update_own ON public.survey_plans
    FOR UPDATE TO authenticated
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY survey_plans_delete_own_or_admin ON public.survey_plans
    FOR DELETE TO authenticated
    USING (
      (SELECT auth.uid()) = user_id
      OR ((SELECT auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- survey_plan_stops（INSERT は「その計画が自分のもの」も確かめる）
DO $$ BEGIN
  CREATE POLICY survey_plan_stops_select_own_or_admin ON public.survey_plan_stops
    FOR SELECT TO authenticated
    USING (
      (SELECT auth.uid()) = user_id
      OR ((SELECT auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY survey_plan_stops_insert_own ON public.survey_plan_stops
    FOR INSERT TO authenticated
    WITH CHECK (
      (SELECT auth.uid()) = user_id
      AND EXISTS (
        SELECT 1 FROM public.survey_plans p
        WHERE p.id = survey_plan_stops.plan_id AND p.user_id = (SELECT auth.uid())
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY survey_plan_stops_update_own ON public.survey_plan_stops
    FOR UPDATE TO authenticated
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY survey_plan_stops_delete_own_or_admin ON public.survey_plan_stops
    FOR DELETE TO authenticated
    USING (
      (SELECT auth.uid()) = user_id
      OR ((SELECT auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- survey_stop_posts（INSERT は「地点も投稿も自分のもの」。UPDATE のポリシーと権限は付けない）
DO $$ BEGIN
  CREATE POLICY survey_stop_posts_select_own_or_admin ON public.survey_stop_posts
    FOR SELECT TO authenticated
    USING (
      (SELECT auth.uid()) = user_id
      OR ((SELECT auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY survey_stop_posts_insert_own ON public.survey_stop_posts
    FOR INSERT TO authenticated
    WITH CHECK (
      (SELECT auth.uid()) = user_id
      AND EXISTS (
        SELECT 1 FROM public.survey_plan_stops s
        WHERE s.id = survey_stop_posts.stop_id AND s.user_id = (SELECT auth.uid())
      )
      AND EXISTS (
        SELECT 1 FROM public.posts p
        WHERE p.id = survey_stop_posts.post_id AND p.user_id = (SELECT auth.uid())
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY survey_stop_posts_delete_own_or_admin ON public.survey_stop_posts
    FOR DELETE TO authenticated
    USING (
      (SELECT auth.uid()) = user_id
      OR ((SELECT auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- rare_sightings（地点を付けるなら自分の地点だけ）
DO $$ BEGIN
  CREATE POLICY rare_sightings_select_own_or_admin ON public.rare_sightings
    FOR SELECT TO authenticated
    USING (
      (SELECT auth.uid()) = user_id
      OR ((SELECT auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY rare_sightings_insert_own ON public.rare_sightings
    FOR INSERT TO authenticated
    WITH CHECK (
      (SELECT auth.uid()) = user_id
      AND (
        stop_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.survey_plan_stops s
          WHERE s.id = rare_sightings.stop_id AND s.user_id = (SELECT auth.uid())
        )
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY rare_sightings_update_own ON public.rare_sightings
    FOR UPDATE TO authenticated
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK (
      (SELECT auth.uid()) = user_id
      AND (
        stop_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.survey_plan_stops s
          WHERE s.id = rare_sightings.stop_id AND s.user_id = (SELECT auth.uid())
        )
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY rare_sightings_delete_own_or_admin ON public.rare_sightings
    FOR DELETE TO authenticated
    USING (
      (SELECT auth.uid()) = user_id
      OR ((SELECT auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- anon には一切触らせない（whether 層で閉じる）。退会時は auth.users の cascade で消える。
REVOKE ALL ON public.survey_plans      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.survey_plan_stops FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.survey_stop_posts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.rare_sightings    FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.survey_plans      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.survey_plan_stops TO authenticated;
GRANT SELECT, INSERT, DELETE         ON public.survey_stop_posts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rare_sightings    TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. UPDATE で所有者・端末 ID・作成日時（地点は計画も）を旧値に戻す（protect_private_spot_columns と同じ形）
--    updated_at は既存の update_updated_at に任せる。
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.protect_survey_plan_columns()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.user_id    := OLD.user_id;
  NEW.created_at := OLD.created_at;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.protect_survey_plan_columns() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS enforce_survey_plan_columns ON public.survey_plans;
CREATE TRIGGER enforce_survey_plan_columns
  BEFORE UPDATE ON public.survey_plans
  FOR EACH ROW EXECUTE FUNCTION public.protect_survey_plan_columns();

CREATE OR REPLACE FUNCTION public.protect_survey_plan_stop_columns()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.user_id    := OLD.user_id;
  NEW.plan_id    := OLD.plan_id;
  NEW.created_at := OLD.created_at;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.protect_survey_plan_stop_columns() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS enforce_survey_plan_stop_columns ON public.survey_plan_stops;
CREATE TRIGGER enforce_survey_plan_stop_columns
  BEFORE UPDATE ON public.survey_plan_stops
  FOR EACH ROW EXECUTE FUNCTION public.protect_survey_plan_stop_columns();

CREATE OR REPLACE FUNCTION public.protect_rare_sighting_columns()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.user_id    := OLD.user_id;
  NEW.client_id  := OLD.client_id;
  NEW.created_at := OLD.created_at;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.protect_rare_sighting_columns() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS enforce_rare_sighting_columns ON public.rare_sightings;
CREATE TRIGGER enforce_rare_sighting_columns
  BEFORE UPDATE ON public.rare_sightings
  FOR EACH ROW EXECUTE FUNCTION public.protect_rare_sighting_columns();

DROP TRIGGER IF EXISTS set_survey_plans_updated_at ON public.survey_plans;
CREATE TRIGGER set_survey_plans_updated_at
  BEFORE UPDATE ON public.survey_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
DROP TRIGGER IF EXISTS set_survey_plan_stops_updated_at ON public.survey_plan_stops;
CREATE TRIGGER set_survey_plan_stops_updated_at
  BEFORE UPDATE ON public.survey_plan_stops
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
DROP TRIGGER IF EXISTS set_rare_sightings_updated_at ON public.rare_sightings;
CREATE TRIGGER set_rare_sightings_updated_at
  BEFORE UPDATE ON public.rare_sightings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
-- 7. 写真のパスは自分のフォルダ（<user_id>/ファイル名）だけ。他人の写真を自分の記録に結び付けさせない。
--    UPDATE では旧行の所有者で照合する（トリガーの発火順に頼らず、所有者の書き換えで検査をすり抜けさせない）。
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_rare_sighting_photo_paths()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_owner uuid;
  v_path  text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_owner := OLD.user_id;
  ELSE
    v_owner := NEW.user_id;
  END IF;
  IF NEW.photo_paths IS NULL THEN
    RETURN NEW;  -- NOT NULL 制約が拒否する
  END IF;
  FOREACH v_path IN ARRAY NEW.photo_paths LOOP
    IF v_path IS NULL OR v_path !~ ('^' || v_owner::text || '/[A-Za-z0-9][A-Za-z0-9._-]{0,199}$') THEN
      RAISE EXCEPTION '写真は自分のフォルダ（%/）にあるものだけ付けられます', v_owner USING ERRCODE = '42501';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.check_rare_sighting_photo_paths() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS zz_check_rare_sighting_photo_paths ON public.rare_sightings;
CREATE TRIGGER zz_check_rare_sighting_photo_paths
  BEFORE INSERT OR UPDATE ON public.rare_sightings
  FOR EACH ROW EXECUTE FUNCTION public.check_rare_sighting_photo_paths();

-- ────────────────────────────────────────────────────────────────────────────
-- 8. 上限（private_spots と同じ書き方。管理者は素通り）
--    計画: 1日30件・1人1000件 / 地点: 1時間300件・1計画100件 / 希少種: 1時間60件・1人5000件
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_survey_plan_rate_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_recent integer;
  v_total  integer;
BEGIN
  IF (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'role') = 'admin' THEN
    RETURN NEW;
  END IF;
  SELECT count(*) INTO v_recent FROM public.survey_plans
  WHERE user_id = NEW.user_id AND created_at > now() - interval '1 day';
  IF v_recent >= 30 THEN
    RAISE EXCEPTION '調査計画の作成上限（1日あたり30件）に達しました' USING ERRCODE = 'P0001';
  END IF;
  SELECT count(*) INTO v_total FROM public.survey_plans WHERE user_id = NEW.user_id;
  IF v_total >= 1000 THEN
    RAISE EXCEPTION '調査計画の作成上限（1人1000件）に達しました' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.check_survey_plan_rate_limit() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS enforce_survey_plan_rate_limit ON public.survey_plans;
CREATE TRIGGER enforce_survey_plan_rate_limit
  BEFORE INSERT ON public.survey_plans
  FOR EACH ROW EXECUTE FUNCTION public.check_survey_plan_rate_limit();

CREATE OR REPLACE FUNCTION public.check_survey_plan_stop_rate_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_recent  integer;
  v_in_plan integer;
BEGIN
  IF (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'role') = 'admin' THEN
    RETURN NEW;
  END IF;
  SELECT count(*) INTO v_recent FROM public.survey_plan_stops
  WHERE user_id = NEW.user_id AND created_at > now() - interval '1 hour';
  IF v_recent >= 300 THEN
    RAISE EXCEPTION '調査地点の追加上限（1時間あたり300件）に達しました' USING ERRCODE = 'P0001';
  END IF;
  SELECT count(*) INTO v_in_plan FROM public.survey_plan_stops WHERE plan_id = NEW.plan_id;
  IF v_in_plan >= 100 THEN
    RAISE EXCEPTION '1つの計画に入れられる地点は100か所までです' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.check_survey_plan_stop_rate_limit() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS enforce_survey_plan_stop_rate_limit ON public.survey_plan_stops;
CREATE TRIGGER enforce_survey_plan_stop_rate_limit
  BEFORE INSERT ON public.survey_plan_stops
  FOR EACH ROW EXECUTE FUNCTION public.check_survey_plan_stop_rate_limit();

CREATE OR REPLACE FUNCTION public.check_rare_sighting_rate_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_recent integer;
  v_total  integer;
BEGIN
  IF (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'role') = 'admin' THEN
    RETURN NEW;
  END IF;
  SELECT count(*) INTO v_recent FROM public.rare_sightings
  WHERE user_id = NEW.user_id AND created_at > now() - interval '1 hour';
  IF v_recent >= 60 THEN
    RAISE EXCEPTION '希少種の記録の上限（1時間あたり60件）に達しました' USING ERRCODE = 'P0001';
  END IF;
  SELECT count(*) INTO v_total FROM public.rare_sightings WHERE user_id = NEW.user_id;
  IF v_total >= 5000 THEN
    RAISE EXCEPTION '希少種の記録の上限（1人5000件）に達しました' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.check_rare_sighting_rate_limit() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS enforce_rare_sighting_rate_limit ON public.rare_sightings;
CREATE TRIGGER enforce_rare_sighting_rate_limit
  BEFORE INSERT ON public.rare_sightings
  FOR EACH ROW EXECUTE FUNCTION public.check_rare_sighting_rate_limit();

-- ────────────────────────────────────────────────────────────────────────────
-- 9. 地点の並べ替え（本人用 RPC）
--    計画の地点を全部、新しい順に渡すと sort_order を 0 から振り直す。1 回の取引で済むので、
--    途中で切れて順番が重なることがない。SECURITY INVOKER なので RLS がそのまま効く
--    （他人の計画は見えず、管理者も他人の計画は並べ替えられない）。
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reorder_survey_plan_stops(p_plan_id uuid, p_stop_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_n       integer := COALESCE(cardinality(p_stop_ids), 0);
  v_total   integer;
  v_updated integer;
BEGIN
  IF v_n = 0 THEN
    RAISE EXCEPTION '並べ替える地点がありません' USING ERRCODE = '22023';
  END IF;
  IF v_n <> (SELECT count(DISTINCT x) FROM unnest(p_stop_ids) AS x) THEN
    RAISE EXCEPTION '同じ地点が2回入っています' USING ERRCODE = '22023';
  END IF;
  SELECT count(*) INTO v_total FROM public.survey_plan_stops WHERE plan_id = p_plan_id;
  IF v_total <> v_n THEN
    RAISE EXCEPTION '計画の地点が変わっています。読み込み直してください' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.survey_plan_stops AS s
     SET sort_order = t.ord - 1
    FROM unnest(p_stop_ids) WITH ORDINALITY AS t(stop_id, ord)
   WHERE s.id = t.stop_id AND s.plan_id = p_plan_id;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> v_n THEN
    RAISE EXCEPTION '並べ替えられない地点があります' USING ERRCODE = '42501';
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.reorder_survey_plan_stops(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reorder_survey_plan_stops(uuid, uuid[]) TO authenticated;
COMMENT ON FUNCTION public.reorder_survey_plan_stops(uuid, uuid[]) IS
  'REQ-330: 計画の地点を渡された順に並べ直す（sort_order を 0 から振り直す）。SECURITY INVOKER で本人の計画だけ。';

-- ────────────────────────────────────────────────────────────────────────────
-- 10. 写真置き場 rare-photos（非公開）
--     post-photos は誰でも一覧できる（public_read_photos）ので、希少種の写真は絶対にそこへ置かない。
--     表示は期限付きの署名 URL（createSignedUrl）だけ。UPDATE のポリシーは付けない。
--     既に公開で作られていても非公開へ戻す（ON CONFLICT DO UPDATE）。
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'rare-photos',
  'rare-photos',
  false,
  5242880, -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public             = false,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "rare_photos_insert_own" ON storage.objects;
CREATE POLICY "rare_photos_insert_own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'rare-photos'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    AND lower(storage.extension(name)) IN ('jpg', 'jpeg', 'png', 'webp')
  );
DROP POLICY IF EXISTS "rare_photos_select_own_or_admin" ON storage.objects;
CREATE POLICY "rare_photos_select_own_or_admin" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'rare-photos'
    AND (
      (storage.foldername(name))[1] = (SELECT auth.uid())::text
      OR ((SELECT auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin'
    )
  );
DROP POLICY IF EXISTS "rare_photos_delete_own_or_admin" ON storage.objects;
CREATE POLICY "rare_photos_delete_own_or_admin" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'rare-photos'
    AND (
      (storage.foldername(name))[1] = (SELECT auth.uid())::text
      OR ((SELECT auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin'
    )
  );
-- 注: Supabase ホストでは storage.objects の所有者が supabase_storage_admin のため、
--   COMMENT ON POLICY は "must be owner" で失敗する（20260513000007 と同じ）。説明はこのコメントに残す。
--   rare_photos_insert_own          : パスの 1 段目が自分の uid のときだけ。拡張子 jpg/jpeg/png/webp。
--   rare_photos_select_own_or_admin : 自分のフォルダか管理者だけ（署名 URL の発行にも要る）。
--   rare_photos_delete_own_or_admin : 自分のフォルダか管理者だけ。


-- Water discovery and private photo reports (20261008100350).
-- Water discovery: private reports/photos, and a separate coarse public projection.
-- Reapplicable after Supabase default grants; no existing private table is changed.
CREATE TABLE IF NOT EXISTS public.community_water_bodies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80 AND char_length(name) <= 80),
  lat numeric(7,3) NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng numeric(7,3) NOT NULL CHECK (lng BETWEEN -180 AND 180),
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.community_water_bodies IS
  'Reviewed public water locations. Only a checked name and coordinates rounded to three decimals; no report, owner, note or photo reference.';
CREATE INDEX IF NOT EXISTS idx_community_water_bodies_position ON public.community_water_bodies (lat, lng);

CREATE TABLE IF NOT EXISTS public.water_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id uuid NOT NULL,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80 AND char_length(name) <= 80),
  note text CHECK (note IS NULL OR char_length(note) <= 1000),
  lat numeric(10,7) NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng numeric(10,7) NOT NULL CHECK (lng BETWEEN -180 AND 180),
  photo_paths text[] NOT NULL CHECK (cardinality(photo_paths) BETWEEN 1 AND 3),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  public_name text CHECK (public_name IS NULL OR (char_length(btrim(public_name)) BETWEEN 1 AND 80 AND char_length(public_name) <= 80)),
  published_water_body_id uuid UNIQUE REFERENCES public.community_water_bodies(id),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT water_reports_user_client_key UNIQUE (user_id, client_id),
  CONSTRAINT water_reports_publication_matches CHECK ((status = 'accepted') = (published_water_body_id IS NOT NULL)),
  CONSTRAINT water_reports_review_time_matches CHECK ((status = 'pending') = (reviewed_at IS NULL))
);
COMMENT ON TABLE public.water_reports IS
  'Private unmapped-water reports, visible only to the owner and administrators. Photos remain private after review.';
CREATE INDEX IF NOT EXISTS idx_water_reports_user_created ON public.water_reports (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_water_reports_status_created ON public.water_reports (status, created_at DESC);

ALTER TABLE public.water_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_water_bodies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS water_reports_select_own_or_admin ON public.water_reports;
CREATE POLICY water_reports_select_own_or_admin ON public.water_reports FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id OR ((SELECT auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');
DROP POLICY IF EXISTS water_reports_insert_own_pending ON public.water_reports;
CREATE POLICY water_reports_insert_own_pending ON public.water_reports FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id AND status = 'pending'
    AND public_name IS NULL AND published_water_body_id IS NULL AND reviewed_at IS NULL AND reviewed_by IS NULL);
DROP POLICY IF EXISTS water_reports_delete_own_or_admin ON public.water_reports;
CREATE POLICY water_reports_delete_own_or_admin ON public.water_reports FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id OR ((SELECT auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');
DROP POLICY IF EXISTS community_water_bodies_public_read ON public.community_water_bodies;
CREATE POLICY community_water_bodies_public_read ON public.community_water_bodies FOR SELECT TO anon, authenticated USING (true);
REVOKE ALL ON public.water_reports FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.water_reports TO authenticated;
REVOKE ALL ON public.community_water_bodies FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.community_water_bodies TO anon, authenticated;

-- Validate on INSERT even for admin callers. Direct UPDATE is never granted: review uses the RPC.
CREATE OR REPLACE FUNCTION public.check_water_report_input()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_path text;
BEGIN
  IF NEW.status <> 'pending' OR NEW.public_name IS NOT NULL OR NEW.published_water_body_id IS NOT NULL
     OR NEW.reviewed_at IS NOT NULL OR NEW.reviewed_by IS NOT NULL THEN
    RAISE EXCEPTION 'A new water report must be pending and unreviewed' USING ERRCODE = '42501';
  END IF;
  NEW.created_at := now();
  IF NEW.photo_paths IS NULL OR cardinality(NEW.photo_paths) NOT BETWEEN 1 AND 3 THEN
    RAISE EXCEPTION 'Water reports require one to three photos' USING ERRCODE = '23514';
  END IF;
  FOREACH v_path IN ARRAY NEW.photo_paths LOOP
    IF v_path IS NULL OR v_path !~ ('^' || NEW.user_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$') THEN
      RAISE EXCEPTION 'Water report photos must be JPEG paths in the owner folder' USING ERRCODE = '42501';
    END IF;
  END LOOP;
  IF cardinality(NEW.photo_paths) <> (SELECT count(DISTINCT p) FROM unnest(NEW.photo_paths) AS p) THEN
    RAISE EXCEPTION 'Water report photos must be distinct' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.check_water_report_input() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS water_reports_validate_input ON public.water_reports;
CREATE TRIGGER water_reports_validate_input BEFORE INSERT ON public.water_reports FOR EACH ROW EXECUTE FUNCTION public.check_water_report_input();

CREATE OR REPLACE FUNCTION public.check_water_report_rate_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- BEFORE triggers run before INSERT's RLS WITH CHECK. Never count another owner's private rows.
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM NEW.user_id THEN
    RAISE EXCEPTION 'Water report owner must match the authenticated user' USING ERRCODE = '42501';
  END IF;
  -- Serialize concurrent submissions by one owner. Retried client IDs still reach the UNIQUE error.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(NEW.user_id::text, 330081));
  IF EXISTS (SELECT 1 FROM public.water_reports WHERE user_id = NEW.user_id AND client_id = NEW.client_id) THEN RETURN NEW; END IF;
  IF (SELECT count(*) FROM public.water_reports WHERE user_id = NEW.user_id) >= 1000 THEN
    RAISE EXCEPTION 'Water report user limit exceeded' USING ERRCODE = 'P0001';
  END IF;
  IF (SELECT count(*) FROM public.water_reports WHERE user_id = NEW.user_id AND created_at >= now() - interval '1 hour') >= 20 THEN
    RAISE EXCEPTION 'Water report hourly limit exceeded' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.check_water_report_rate_limit() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS water_reports_rate_limit ON public.water_reports;
CREATE TRIGGER water_reports_rate_limit BEFORE INSERT ON public.water_reports FOR EACH ROW EXECUTE FUNCTION public.check_water_report_rate_limit();

-- Extend both existing audit enums, retaining all current actions.
ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_action_check;
ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_action_check CHECK (action IN (
  'delete_post', 'delete_comment', 'resolve_report', 'grant_admin', 'revoke_admin',
  'approve_post', 'reject_post', 'toggle_official', 'trigger_delete_post', 'trigger_status_change',
  'trigger_delete_comment', 'trigger_role_change', 'login_success', 'login_failed',
  'adopt_research', 'unadopt_research', 'review_water_report'
));
ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_target_type_check;
ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_target_type_check CHECK (target_type IN ('post', 'comment', 'report', 'user', 'water_report'));

CREATE OR REPLACE FUNCTION public.review_water_report(p_id uuid, p_status text, p_public_name text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_report public.water_reports%ROWTYPE; v_public_id uuid; v_name text; v_actor uuid;
BEGIN
  v_actor := auth.uid();
  IF v_actor IS NULL OR (auth.jwt() -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Administrator required' USING ERRCODE = '42501';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('accepted', 'rejected') THEN
    RAISE EXCEPTION 'Review status must be accepted or rejected' USING ERRCODE = '22023';
  END IF;
  v_name := btrim(p_public_name);
  IF p_status = 'accepted' AND (v_name IS NULL OR char_length(v_name) NOT BETWEEN 1 AND 80) THEN
    RAISE EXCEPTION 'A checked public name is required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_report FROM public.water_reports WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  v_public_id := v_report.published_water_body_id;
  IF p_status = 'accepted' THEN
    v_public_id := COALESCE(v_public_id, gen_random_uuid());
    INSERT INTO public.community_water_bodies (id, name, lat, lng)
      VALUES (v_public_id, v_name, round(v_report.lat, 3), round(v_report.lng, 3))
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, lat = EXCLUDED.lat, lng = EXCLUDED.lng;
  END IF;
  UPDATE public.water_reports SET status = p_status,
    public_name = CASE WHEN p_status = 'accepted' THEN v_name ELSE public_name END,
    published_water_body_id = CASE WHEN p_status = 'accepted' THEN v_public_id ELSE NULL END,
    reviewed_at = now(), reviewed_by = v_actor WHERE id = p_id;
  IF p_status = 'rejected' AND v_public_id IS NOT NULL THEN
    DELETE FROM public.community_water_bodies WHERE id = v_public_id;
  END IF;
  INSERT INTO public.audit_logs (admin_id, action, target_type, target_id, details)
    VALUES (v_actor, 'review_water_report', 'water_report', p_id,
      jsonb_build_object('previous_status', v_report.status, 'status', p_status));
  RETURN true;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.review_water_report(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_water_report(uuid, text, text) TO authenticated;

-- Account deletion or a report withdrawal must not leave its public projection behind.
CREATE OR REPLACE FUNCTION public.delete_water_report_publication()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF OLD.published_water_body_id IS NOT NULL THEN
    DELETE FROM public.community_water_bodies WHERE id = OLD.published_water_body_id;
  END IF;
  RETURN OLD;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.delete_water_report_publication() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS water_reports_delete_publication ON public.water_reports;
CREATE TRIGGER water_reports_delete_publication AFTER DELETE ON public.water_reports FOR EACH ROW EXECUTE FUNCTION public.delete_water_report_publication();

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('water-report-photos', 'water-report-photos', false, 5242880, ARRAY['image/jpeg'])
  ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;
DROP POLICY IF EXISTS water_report_photos_insert_own ON storage.objects;
CREATE POLICY water_report_photos_insert_own ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'water-report-photos' AND name ~ ('^' || (SELECT auth.uid())::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$')
);
DROP POLICY IF EXISTS water_report_photos_select_own_or_admin ON storage.objects;
CREATE POLICY water_report_photos_select_own_or_admin ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'water-report-photos' AND ((storage.foldername(name))[1] = (SELECT auth.uid())::text
    OR ((SELECT auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
);
DROP POLICY IF EXISTS water_report_photos_delete_own_or_admin ON storage.objects;
CREATE POLICY water_report_photos_delete_own_or_admin ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'water-report-photos' AND ((storage.foldername(name))[1] = (SELECT auth.uid())::text
    OR ((SELECT auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
);

-- ===================================================
-- security-hardening 要件3: created_at の固定（回数制限の回避を防ぐ）
--   migration 20261021120200 と同じ内容。理由はそちらを参照。
-- ===================================================
CREATE OR REPLACE FUNCTION public.pin_created_at_on_client_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_claims jsonb;
BEGIN
  -- 一般ユーザー（anon / authenticated）の書き込みだけを対象にする。service_role・postgres（移行・
  -- 取り込み・Edge Function）は、過去の日時を入れる正当な理由があるので触らない。
  -- SECURITY INVOKER にしてあるので、current_user は本当の実行者になる。
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;
  BEGIN
    v_claims := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb;
  EXCEPTION WHEN OTHERS THEN
    v_claims := NULL;
  END;
  -- 管理者は、データの取り込みで過去の日時を入れることがある（回数制限も管理者は対象外）。
  IF (v_claims -> 'app_metadata' ->> 'role') = 'admin' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := now();
  ELSE
    NEW.created_at := OLD.created_at;
  END IF;
  RETURN NEW;
END;
$$;
COMMENT ON FUNCTION public.pin_created_at_on_client_write() IS
  'security-hardening 要件3: 一般ユーザーの INSERT は created_at を受付時刻にし、UPDATE は旧値に戻す。回数制限は created_at で数えるため、過去の日時を申告されると数えられずに回避できた。観察日は observed_at が持つ。';

DROP TRIGGER IF EXISTS aaa_pin_created_at ON public.posts;
CREATE TRIGGER aaa_pin_created_at BEFORE INSERT OR UPDATE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.pin_created_at_on_client_write();
DROP TRIGGER IF EXISTS aaa_pin_created_at ON public.comments;
CREATE TRIGGER aaa_pin_created_at BEFORE INSERT OR UPDATE ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.pin_created_at_on_client_write();
DROP TRIGGER IF EXISTS aaa_pin_created_at ON public.likes;
CREATE TRIGGER aaa_pin_created_at BEFORE INSERT OR UPDATE ON public.likes
  FOR EACH ROW EXECUTE FUNCTION public.pin_created_at_on_client_write();
DROP TRIGGER IF EXISTS aaa_pin_created_at ON public.reports;
CREATE TRIGGER aaa_pin_created_at BEFORE INSERT OR UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.pin_created_at_on_client_write();
DROP TRIGGER IF EXISTS aaa_pin_created_at ON public.survey_requests;
CREATE TRIGGER aaa_pin_created_at BEFORE INSERT OR UPDATE ON public.survey_requests
  FOR EACH ROW EXECUTE FUNCTION public.pin_created_at_on_client_write();
DROP TRIGGER IF EXISTS aaa_pin_created_at ON public.private_spots;
CREATE TRIGGER aaa_pin_created_at BEFORE INSERT OR UPDATE ON public.private_spots
  FOR EACH ROW EXECUTE FUNCTION public.pin_created_at_on_client_write();
DROP TRIGGER IF EXISTS aaa_pin_created_at ON public.rare_sightings;
CREATE TRIGGER aaa_pin_created_at BEFORE INSERT OR UPDATE ON public.rare_sightings
  FOR EACH ROW EXECUTE FUNCTION public.pin_created_at_on_client_write();
DROP TRIGGER IF EXISTS aaa_pin_created_at ON public.survey_plans;
CREATE TRIGGER aaa_pin_created_at BEFORE INSERT OR UPDATE ON public.survey_plans
  FOR EACH ROW EXECUTE FUNCTION public.pin_created_at_on_client_write();
DROP TRIGGER IF EXISTS aaa_pin_created_at ON public.survey_plan_stops;
CREATE TRIGGER aaa_pin_created_at BEFORE INSERT OR UPDATE ON public.survey_plan_stops
  FOR EACH ROW EXECUTE FUNCTION public.pin_created_at_on_client_write();

-- ===================================================
-- security-hardening 要件9: コメント通知メールの送信済みの印
--   migration 20261021120600 と同じ内容。理由はそちらを参照。
-- ===================================================
CREATE TABLE IF NOT EXISTS public.comment_notification_claims (
  comment_id uuid        PRIMARY KEY REFERENCES public.comments(id) ON DELETE CASCADE,
  claimed_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.comment_notification_claims IS
  'security-hardening 要件9: コメント通知メールの送信済みの印（1 コメント 1 通）。Edge Function notify-comment が、送る前に挿入して「先取り」し、重複なら送らない。サーバー専用（RLS 有効・ポリシーなし）。';
ALTER TABLE public.comment_notification_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.comment_notification_claims FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.comment_notification_claims TO service_role;

-- ===================================================
-- 関数の既定の権限（security-hardening 要件1 / REQ-316 FR-316-05）
--   これから作る関数は、明示の GRANT が無ければ匿名・ログイン済みから実行できない。
--   既に在る関数の権限は、migration 20261021120000_req316_function_execute_default_closed.sql が確定する
--   （CI の rls-tests は、一括 GRANT の後にそれを当て直して検査する）。
--   ファイルの末尾に置く理由は、先頭の注記を参照。
-- ===================================================
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO service_role;
