-- ===================================================
-- REQ-212: 公開エンドポイントの bot 対策・レート制限（DB トリガー層 = 最終防衛線）
--
-- 背景:
--   ザリダスは anon（publishable）キーで PostgREST を直接叩くクライアント直結構成で、
--   防御線はアプリではなく DB 側にある。既存のレート制限は posts（check_post_rate_limit）と
--   調査依頼（check_survey_request_rate_limit）のみで、通報 / コメント / いいね には頻度上限が
--   一切無かった（REQ-212 現状調査）。特に通報は flag_post_on_reports（同一 post への未解決
--   通報が 3 件で is_flagged=TRUE）を悪用すれば、bot が 1 投稿に通報を連打して任意投稿を
--   不正フラグ化（検閲攻撃 / AC-02）できる穴があった。
--
--   本マイグレーションは「DB に到達した手前で弾くエッジ層（middleware）」「人間性を確認する
--   CAPTCHA（Supabase Auth + Turnstile）」と多層化する中の **最終防衛線（DB トリガー）** を、
--   既存 posts/survey_requests のレート制限トリガーと**同設計**で reports / comments / likes に
--   追加する。エッジ層が無効化・バイパスされても DB 側で上限が強制される（NFR-212-01 多層性）。
--
--   設計方針（既存トリガー踏襲）:
--     - SECURITY DEFINER + SET search_path = public, pg_temp（Splinter 0011 / REQ-221 と同方針）
--     - admin（app_metadata.role='admin'）は素通り（check_post_rate_limit と同じ）
--     - BEFORE INSERT で RAISE EXCEPTION（上限超過時）。既存 RLS / CHECK / 列固定トリガーは壊さない
--     - 冪等（CREATE OR REPLACE FUNCTION / DROP TRIGGER IF EXISTS → CREATE TRIGGER）
--
--   schema.sql（本番正本）にも同一定義を反映済み（ドリフト防止）。過去マイグレーションは
--   改変せず、本連番で追補する。すべて再実行可能（冪等）。
-- ===================================================

-- ---------------------------------------------------
-- 共通ヘルパ: 現在リクエストの JWT app_metadata.role が admin か
--   check_post_rate_limit と同じく request.jwt.claims を参照する（auth.users 参照不要で軽量）。
--   claims が無い / 壊れている場合は false（= 非 admin として通常制限を適用）。
-- ---------------------------------------------------
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
COMMENT ON FUNCTION public.req_is_admin() IS
  'REQ-212: 現在リクエストの JWT app_metadata.role=admin 判定（レート制限トリガーの admin 素通り用）。';

-- ===================================================
-- 1. reports: reporter_ip 自動記録 + レート制限
--    通報は匿名可（validated_insert_reports は値検証のみ）。クライアント（ReportModal）は
--    reporter_ip を送らないため、posts の set_post_reporter_ip と同様にサーバー側で記録する。
-- ===================================================

-- reporter_ip をサーバー側 IP（extract_request_ip）で自動記録（クライアント送信値は信用しない）。
-- posts.set_post_reporter_ip と同設計。reporter_ip 列は既に存在（schema.sql / reports 定義）。
CREATE OR REPLACE FUNCTION public.set_report_reporter_ip()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- クライアントが渡した reporter_ip は常に破棄し、サーバー側で求めた IP に上書きする
  -- （IP 単位スロットルの信頼性確保 / なりすまし防止）。
  NEW.reporter_ip := public.extract_request_ip();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_report_reporter_ip_trigger ON reports;
CREATE TRIGGER set_report_reporter_ip_trigger
  BEFORE INSERT ON reports FOR EACH ROW
  EXECUTE FUNCTION public.set_report_reporter_ip();

-- 通報レート制限。set_report_reporter_ip の後に走るよう、トリガー名はアルファベット順で後ろに
-- なるよう接頭辞を付ける（Postgres は同一タイミングのトリガーを名前の昇順で実行する）。
--   ルール:
--     (a) 同一 IP は同一 post に未解決の通報を 2 回以上できない（連打で is_flagged を立てさせない）。
--         → flag_post_on_reports（未解決 3 件で is_flagged）は「異なる通報者 3 名」を要求する。
--     (b) 同一 IP からの通報は 1 時間に 10 件まで（横断スパム抑止）。
--   admin は素通り。reporter_ip が NULL（IP 取得不能）の場合はスロットル不能なので素通り
--   （fail-open。最終的な不正フラグは (a) の per-post 制約と flag の 3 件しきい値で抑止）。
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
    RETURN NEW;  -- IP 不明はスロットル不能。per-post 重複は IP 前提のため判定不可 → 素通り。
  END IF;

  -- (a) 同一 IP × 同一 post の未解決通報は 1 回まで（検閲攻撃 AC-02 の核）
  SELECT COUNT(*) INTO dup_count FROM public.reports
  WHERE post_id = NEW.post_id
    AND reporter_ip = NEW.reporter_ip
    AND resolved = FALSE;
  IF dup_count >= 1 THEN
    RAISE EXCEPTION 'この投稿はすでに通報済みです';
  END IF;

  -- (b) 同一 IP からの通報は 1 時間に 10 件まで（横断的な通報スパム抑止）
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

-- reporter_ip 単位の通報件数集計を高速化（per-post 重複 + 直近件数の両方で使う）。
CREATE INDEX IF NOT EXISTS idx_reports_reporter_ip_created ON reports (reporter_ip, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_post_reporter_ip    ON reports (post_id, reporter_ip);

-- ===================================================
-- 2. comments: レート制限（user_id 単位）
--    auth_insert_comments は authenticated 限定（auth.uid()=user_id）。匿名コメントは不可なので
--    user_id 単位で十分。コメントは notify-comment（メール送信）を誘発するため過剰送信を抑える。
-- ===================================================
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
    RETURN NEW;  -- 想定外（RLS で user_id 必須）。スロットル不能のため素通り。
  END IF;

  -- バースト: 直近 1 分で 5 件まで（連投・通知 flooding 抑止）
  SELECT COUNT(*) INTO burst_count FROM public.comments
  WHERE user_id = NEW.user_id AND created_at > NOW() - INTERVAL '1 minute';
  IF burst_count >= 5 THEN
    RAISE EXCEPTION 'コメントが集中しています。しばらくお待ちください';
  END IF;

  -- 日次: 24h で 100 件まで（正規ユーザーは到達しない高めの上限。bot 連投の頭打ち）
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

-- ===================================================
-- 3. likes: レート制限（user_id 単位・バーストのみ）
--    UNIQUE(post_id,user_id) で二重 like は防げるが、多数 post への連打は抑止されない。
-- ===================================================
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
    RETURN NEW;  -- likes.user_id は NOT NULL。防御的に素通り。
  END IF;

  -- 直近 1 分で 30 件まで（UI 操作の現実的上限を大きく超える連打のみ弾く）
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
