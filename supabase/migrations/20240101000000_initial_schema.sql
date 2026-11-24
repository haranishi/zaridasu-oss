-- ===================================================
-- ザリダス: Supabase 初期データベーススキーマ（統合版）
-- 複数に分かれていたマイグレーションを1つのファイルに統合しています
-- ===================================================

-- UUID 拡張
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ===================================================
-- 1. ユーザープロフィール・バッジ定義
-- ===================================================
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

CREATE TABLE IF NOT EXISTS badge_definitions (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL,
  icon        TEXT NOT NULL,
  category    TEXT NOT NULL CHECK (category IN ('posting', 'quality', 'community', 'special')),
  sort_order  INTEGER DEFAULT 0
);
COMMENT ON TABLE badge_definitions IS 'バッジ定義マスター';

CREATE TABLE IF NOT EXISTS user_badges (
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_id   TEXT REFERENCES badge_definitions(id),
  earned_at  TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, badge_id)
);
COMMENT ON TABLE user_badges IS 'ユーザー獲得バッジ';

-- 初期バッジデータ投入
INSERT INTO badge_definitions (id, name, description, icon, category, sort_order) VALUES
  ('first_post',         'はじめての投稿',     '初めて投稿が承認された',                    '🌱', 'posting',   10),
  ('posts_10',           '調査員',             '承認済み投稿10件達成',                       '🔍', 'posting',   20),
  ('posts_50',           'ベテラン調査員',      '承認済み投稿50件達成',                       '🏅', 'posting',   30),
  ('posts_100',          'マスター調査員',      '承認済み投稿100件達成',                      '🏆', 'posting',   40),
  ('multi_species',      '両生類ハンター',      'アメリカザリガニとウシガエル両方を投稿',     '🐸', 'quality',   50),
  ('multi_municipality', '広域調査員',         '3つ以上の市区町村で投稿',                    '🗺️', 'quality',   60),
  ('first_comment',      'コメンテーター',      '初めてコメントした',                         '💬', 'community', 70),
  ('absence_reporter',   '不在確認員',         '不在確認を5件以上投稿',                      '✅', 'special',   80),
  ('ai_perfect',         'AI太鼓判',           'AI信頼度95%以上で自動承認',                  '🤖', 'quality',   90)
ON CONFLICT (id) DO NOTHING;


-- ===================================================
-- 2. posts テーブル
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
  
  -- 審査・モデレーション・AI判定
  status            TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason  TEXT,
  rejection_message TEXT        CHECK (rejection_message IS NULL OR char_length(rejection_message) <= 200),
  reviewed_at       TIMESTAMPTZ,
  reviewed_by       UUID        REFERENCES auth.users(id),
  ai_result         JSONB,
  ai_analyzed_at    TIMESTAMPTZ,
  auto_approved     BOOLEAN     NOT NULL DEFAULT FALSE,
  
  -- 追加情報
  survey_duration_minutes INTEGER CHECK (survey_duration_minutes > 0 AND survey_duration_minutes <= 480)
);

COMMENT ON TABLE  posts IS 'アメリカザリガニ・ウシガエル出没・分布情報';
COMMENT ON COLUMN posts.weather IS 'WMOコードから変換した天気カテゴリ（Open-Meteo API）';
COMMENT ON COLUMN posts.survey_duration_minutes IS '調査時間（分）。不在確認（absence）時に任意入力。最大480分（8時間）。';

CREATE INDEX IF NOT EXISTS idx_posts_created_at    ON posts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_municipality  ON posts (municipality);
CREATE INDEX IF NOT EXISTS idx_posts_species       ON posts (species);
CREATE INDEX IF NOT EXISTS idx_posts_info_type     ON posts (info_type);
CREATE INDEX IF NOT EXISTS idx_posts_municipality_species_created ON posts (municipality, species, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_species_info_type ON posts (species, info_type);
CREATE INDEX IF NOT EXISTS idx_posts_reporter_ip_created ON posts (reporter_ip, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_is_flagged    ON posts (is_flagged);
CREATE INDEX IF NOT EXISTS idx_posts_weather       ON posts (weather);
CREATE INDEX IF NOT EXISTS idx_posts_status        ON posts (status);
CREATE INDEX IF NOT EXISTS idx_posts_status_created ON posts (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_ai_analyzed   ON posts (ai_analyzed_at) WHERE ai_analyzed_at IS NOT NULL;


-- ===================================================
-- 3. その他のエンティティ テーブル
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

CREATE TABLE IF NOT EXISTS comments (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  post_id     UUID        NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  content     TEXT        NOT NULL CHECK (char_length(content) <= 500),
  is_admin    BOOLEAN     DEFAULT FALSE NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id, created_at ASC);

CREATE TABLE IF NOT EXISTS likes (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     UUID        NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(post_id, user_id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  admin_id    UUID        NOT NULL REFERENCES auth.users(id),
  action      TEXT        NOT NULL CHECK (action IN ('delete_post', 'delete_comment', 'resolve_report', 'grant_admin', 'revoke_admin', 'approve_post', 'reject_post', 'toggle_official')),
  target_type TEXT        NOT NULL CHECK (target_type IN ('post', 'comment', 'report', 'user')),
  target_id   UUID        NOT NULL,
  details     JSONB
);
COMMENT ON TABLE audit_logs IS '管理者操作の監査ログ';
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs (action);


-- ===================================================
-- 4. RLS (Row Level Security)
-- ===================================================
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE badge_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- user_profiles
DO $$ BEGIN CREATE POLICY "public_profiles_viewable" ON user_profiles FOR SELECT USING (is_public = true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "own_profile_viewable" ON user_profiles FOR SELECT USING (auth.uid() = id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "own_profile_editable" ON user_profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- badge_definitions
DO $$ BEGIN CREATE POLICY "badge_defs_viewable" ON badge_definitions FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- user_badges
DO $$ BEGIN CREATE POLICY "badges_viewable" ON user_badges FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- posts
DO $$ BEGIN CREATE POLICY "moderated_read" ON posts FOR SELECT USING (status = 'approved' OR auth.uid() = user_id OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "auth_insert" ON posts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "owner_update" ON posts FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "owner_delete" ON posts FOR DELETE USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "admin_all_posts" ON posts FOR ALL TO authenticated USING ( (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' ) WITH CHECK ( (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' ); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- reports
DO $$ BEGIN CREATE POLICY "public_insert_reports" ON reports FOR INSERT WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "admin_all_reports" ON reports FOR ALL TO authenticated USING ( (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' ) WITH CHECK ( (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' ); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- comments
DO $$ BEGIN CREATE POLICY "public_read_comments" ON comments FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "auth_insert_comments" ON comments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "owner_delete_comments" ON comments FOR DELETE USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "admin_all_comments" ON comments FOR ALL TO authenticated USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- likes
DO $$ BEGIN CREATE POLICY "Public read likes" ON likes FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Auth users can like" ON likes FOR INSERT WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Auth users can unlike" ON likes FOR DELETE USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- audit_logs
DO $$ BEGIN CREATE POLICY "admin_all_audit_logs" ON audit_logs FOR ALL TO authenticated USING ( (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' ) WITH CHECK ( (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' ); EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ===================================================
-- 5. トリガー・制約用関数群
-- ===================================================

-- utils
CREATE OR REPLACE FUNCTION update_updated_at() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.extract_request_ip() RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  headers JSONB := COALESCE(current_setting('request.headers', true)::jsonb, '{}'::jsonb);
  ip_header TEXT;
BEGIN
  ip_header := COALESCE(headers ->> 'x-forwarded-for', headers ->> 'x-real-ip', headers ->> 'cf-connecting-ip');
  IF ip_header IS NULL OR btrim(ip_header) = '' THEN RETURN NULL; END IF;
  RETURN btrim(split_part(ip_header, ',', 1));
END;
$$;

-- user profiles
CREATE OR REPLACE FUNCTION handle_new_user() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, display_name, avatar_emoji)
  VALUES (
    NEW.id,
    LEFT(COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', '名無し'), 20),
    '🦞'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- posts protections
CREATE OR REPLACE FUNCTION public.set_post_reporter_ip() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.user_id IS NULL AND NEW.reporter_ip IS NULL THEN
    NEW.reporter_ip := public.extract_request_ip();
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_post_rate_limit() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  recent_count INTEGER;
  cutoff TIMESTAMPTZ;
  actor_ip TEXT;
  next_allowed TIMESTAMPTZ;
BEGIN
  IF (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role') = 'admin' THEN
    RETURN NEW;
  END IF;
  IF NEW.user_id IS NOT NULL THEN
    SELECT COUNT(*) INTO recent_count FROM public.posts WHERE user_id = NEW.user_id AND created_at > NOW() - INTERVAL '24 hours';
    IF recent_count >= 5 THEN
      SELECT MIN(created_at) + INTERVAL '24 hours' INTO next_allowed FROM public.posts WHERE user_id = NEW.user_id AND created_at > NOW() - INTERVAL '24 hours';
      RAISE EXCEPTION '24時間以内の投稿上限（5件）に達しました。次に投稿できる時刻: %', to_char(next_allowed, 'YYYY-MM-DD HH24:MI');
    END IF;
    RETURN NEW;
  END IF;
  actor_ip := COALESCE(NEW.reporter_ip, public.extract_request_ip());
  IF actor_ip IS NULL OR actor_ip = '' THEN
    SELECT COUNT(*) INTO recent_count FROM public.posts WHERE user_id IS NULL AND created_at > NOW() - INTERVAL '1 minute';
    IF recent_count >= 3 THEN RAISE EXCEPTION '投稿が集中しています。しばらくお待ちください。'; END IF;
    RETURN NEW;
  END IF;
  NEW.reporter_ip := actor_ip;
  SELECT COUNT(*) INTO recent_count FROM public.posts WHERE reporter_ip = actor_ip AND created_at > NOW() - INTERVAL '1 minute';
  IF recent_count >= 3 THEN
    SELECT MIN(created_at) + INTERVAL '1 minute' INTO next_allowed FROM public.posts WHERE reporter_ip = actor_ip AND created_at > NOW() - INTERVAL '1 minute';
    RAISE EXCEPTION '投稿が集中しています。次に投稿できる時刻: %', to_char(next_allowed, 'YYYY-MM-DD HH24:MI');
  END IF;
  SELECT COUNT(*) INTO recent_count FROM public.posts WHERE reporter_ip = actor_ip AND created_at > NOW() - INTERVAL '24 hours';
  IF recent_count >= 10 THEN
    SELECT MIN(created_at) + INTERVAL '24 hours' INTO next_allowed FROM public.posts WHERE reporter_ip = actor_ip AND created_at > NOW() - INTERVAL '24 hours';
    RAISE EXCEPTION '24時間以内の投稿上限（10件）に達しました。次に投稿できる時刻: %', to_char(next_allowed, 'YYYY-MM-DD HH24:MI');
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION protect_official_flag() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'admin' THEN
      NEW.is_official := FALSE;
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.is_official IS DISTINCT FROM NEW.is_official THEN
    IF (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'admin' THEN
      NEW.is_official := OLD.is_official;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION protect_anonymous_flag() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.is_anonymous IS DISTINCT FROM NEW.is_anonymous THEN
    NEW.is_anonymous := OLD.is_anonymous;
  END IF;
  RETURN NEW;
END;
$$;

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
  END IF;
  RETURN NEW;
END;
$$;

-- posts updates (reports connection)
CREATE OR REPLACE FUNCTION public.flag_post_on_reports() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  report_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO report_count FROM public.reports WHERE post_id = NEW.post_id AND resolved = FALSE;
  IF report_count >= 3 THEN UPDATE public.posts SET is_flagged = TRUE WHERE id = NEW.post_id; END IF;
  RETURN NEW;
END;
$$;

-- comments protection
CREATE OR REPLACE FUNCTION public.enforce_comment_is_admin() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'admin' THEN
    NEW.is_admin := FALSE;
  END IF;
  RETURN NEW;
END;
$$;

-- badges triggers
CREATE OR REPLACE FUNCTION check_and_grant_badges() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID; v_post_count BIGINT; v_species_count BIGINT; v_municipality_count BIGINT; v_absence_count BIGINT;
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

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION check_comment_badges() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    INSERT INTO user_badges (user_id, badge_id) VALUES (NEW.user_id, 'first_comment') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;


-- ===================================================
-- 6. トリガーのアタッチ
-- ===================================================
DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();

DROP TRIGGER IF EXISTS set_profile_updated_at ON user_profiles;
CREATE TRIGGER set_profile_updated_at BEFORE UPDATE ON user_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON posts;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON posts FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS set_post_reporter_ip_trigger ON posts;
CREATE TRIGGER set_post_reporter_ip_trigger BEFORE INSERT ON posts FOR EACH ROW EXECUTE FUNCTION public.set_post_reporter_ip();

DROP TRIGGER IF EXISTS enforce_post_rate_limit ON posts;
CREATE TRIGGER enforce_post_rate_limit BEFORE INSERT ON posts FOR EACH ROW EXECUTE FUNCTION public.check_post_rate_limit();

DROP TRIGGER IF EXISTS enforce_official_flag ON posts;
CREATE TRIGGER enforce_official_flag BEFORE INSERT OR UPDATE ON posts FOR EACH ROW EXECUTE FUNCTION protect_official_flag();

DROP TRIGGER IF EXISTS enforce_anonymous_immutable ON posts;
CREATE TRIGGER enforce_anonymous_immutable BEFORE UPDATE ON posts FOR EACH ROW EXECUTE FUNCTION protect_anonymous_flag();

DROP TRIGGER IF EXISTS enforce_post_status ON posts;
CREATE TRIGGER enforce_post_status BEFORE UPDATE ON posts FOR EACH ROW EXECUTE FUNCTION protect_post_status();

DROP TRIGGER IF EXISTS on_post_approved_check_badges ON posts;
CREATE TRIGGER on_post_approved_check_badges AFTER UPDATE ON posts FOR EACH ROW EXECUTE FUNCTION check_and_grant_badges();

DROP TRIGGER IF EXISTS trigger_flag_post_on_reports ON reports;
CREATE TRIGGER trigger_flag_post_on_reports AFTER INSERT ON reports FOR EACH ROW EXECUTE FUNCTION public.flag_post_on_reports();

DROP TRIGGER IF EXISTS enforce_comment_is_admin ON comments;
CREATE TRIGGER enforce_comment_is_admin BEFORE INSERT ON comments FOR EACH ROW EXECUTE FUNCTION public.enforce_comment_is_admin();

DROP TRIGGER IF EXISTS on_comment_check_badges ON comments;
CREATE TRIGGER on_comment_check_badges AFTER INSERT ON comments FOR EACH ROW EXECUTE FUNCTION check_comment_badges();


-- ===================================================
-- 7. その他のRPC (Remote Procedure Calls)
-- ===================================================

-- 管理者用ユーザーリスト
CREATE OR REPLACE VIEW public.admin_user_list AS
SELECT id, email, created_at, last_sign_in_at, (raw_app_meta_data->>'role') = 'admin' AS is_admin
FROM auth.users ORDER BY created_at DESC;
REVOKE SELECT ON public.admin_user_list FROM authenticated;
REVOKE SELECT ON public.admin_user_list FROM anon;

CREATE OR REPLACE FUNCTION public.get_admin_user_list() RETURNS TABLE (id UUID, email TEXT, created_at TIMESTAMPTZ, last_sign_in_at TIMESTAMPTZ, is_admin BOOLEAN) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'Permission denied'; END IF;
  RETURN QUERY SELECT u.id, u.email::text, u.created_at, u.last_sign_in_at, ((u.raw_app_meta_data->>'role') = 'admin')::boolean AS is_admin FROM auth.users u ORDER BY u.created_at DESC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_admin_user_list() TO authenticated;

CREATE OR REPLACE FUNCTION public.set_user_admin_role(target_user_id UUID, grant_admin BOOLEAN) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE caller_role TEXT;
BEGIN
  SELECT raw_app_meta_data->>'role' INTO caller_role FROM auth.users WHERE id = auth.uid();
  IF caller_role != 'admin' THEN RAISE EXCEPTION '管理者権限が必要です'; END IF;
  IF target_user_id = auth.uid() THEN RAISE EXCEPTION '自分自身の管理者権限は変更できません'; END IF;
  IF grant_admin THEN UPDATE auth.users SET raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role": "admin"}'::jsonb WHERE id = target_user_id;
  ELSE UPDATE auth.users SET raw_app_meta_data = raw_app_meta_data - 'role' WHERE id = target_user_id; END IF;
END;
$$;

-- 監査ログ取得
CREATE OR REPLACE FUNCTION public.get_audit_logs(p_limit INTEGER DEFAULT 20, p_offset INTEGER DEFAULT 0, p_action TEXT DEFAULT NULL, p_from TIMESTAMPTZ DEFAULT NULL, p_to TIMESTAMPTZ DEFAULT NULL, p_admin_id UUID DEFAULT NULL)
RETURNS TABLE (id UUID, created_at TIMESTAMPTZ, admin_id UUID, admin_email TEXT, action TEXT, target_type TEXT, target_id UUID, details JSONB, total_count BIGINT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'Permission denied'; END IF;
  RETURN QUERY SELECT al.id, al.created_at, al.admin_id, u.email::text AS admin_email, al.action, al.target_type, al.target_id, al.details, COUNT(*) OVER () AS total_count
    FROM audit_logs al JOIN auth.users u ON u.id = al.admin_id
    WHERE (p_action IS NULL OR al.action = p_action) AND (p_from IS NULL OR al.created_at >= p_from) AND (p_to IS NULL OR al.created_at <= p_to) AND (p_admin_id IS NULL OR al.admin_id = p_admin_id)
    ORDER BY al.created_at DESC LIMIT p_limit OFFSET p_offset;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_audit_logs(INTEGER, INTEGER, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, UUID) TO authenticated;

-- ユーザー活動
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

-- ランキング・プロフィール
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

-- Auth補助
CREATE OR REPLACE FUNCTION public.check_email_exists(lookup_email TEXT) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM auth.users WHERE email = lookup_email);
END;
$$;


-- ===================================================
-- 8. Storage バケット
-- ===================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES (
  'post-photos', 'post-photos', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']
) ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "public_upload" ON storage.objects;
DROP POLICY IF EXISTS "restricted_upload" ON storage.objects;
DROP POLICY IF EXISTS "authenticated_upload" ON storage.objects;
DROP POLICY IF EXISTS "admin_delete_photos" ON storage.objects;
DROP POLICY IF EXISTS "owner_delete_photos" ON storage.objects;
DROP POLICY IF EXISTS "owner_or_admin_delete_photos" ON storage.objects;

DO $$ BEGIN CREATE POLICY "authenticated_upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'post-photos' AND name ~ '\.(jpe?g|png|webp|heic)$'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "public_read_photos" ON storage.objects FOR SELECT USING (bucket_id = 'post-photos'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "owner_or_admin_delete_photos" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'post-photos' AND ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' OR name LIKE concat(auth.uid()::text, '/%'))); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
