-- REQ-149: 管理者ログインのサーバーサイド レート制限 + 監査ログ。
--
-- 背景: 旧実装のレート制限はクライアント sessionStorage のみで、DevTools / 別ブラウザ / SDK 直叩きで
-- 容易に迂回できた。また login_success / login_failed が audit_logs に一切記録されず、不正アクセスの
-- 試行・成功を事後追跡できなかった。
--
-- 方針: PostgREST の request.headers からサーバー側で IP を抽出する既存の extract_request_ip()（REQ-139）を
-- 再利用し、(email_hash, ip) 単位でカウント・ロックを Postgres 側に保持する。これによりクライアント
-- ストレージのリセットでは迂回できない。閾値は現状踏襲（15 分以内 5 回失敗で 15 分ロック）。
-- email は md5 でハッシュ化して保持し、パスワードは一切記録しない。

----------------------------------------------------------------------
-- 1. audit_logs: login 系 action を許可し、admin_id / target_id を nullable に
----------------------------------------------------------------------
-- 失敗ログインは admin が確定しない（auth.uid() = NULL）。成功時も target は user 自身のため、
-- admin_id / target_id を NULL 許容にする（既存の管理操作ログは引き続き非 NULL で記録される）。
ALTER TABLE public.audit_logs ALTER COLUMN admin_id DROP NOT NULL;
ALTER TABLE public.audit_logs ALTER COLUMN target_id DROP NOT NULL;

ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_action_check;
ALTER TABLE public.audit_logs
  ADD CONSTRAINT audit_logs_action_check
  CHECK (action IN (
    'delete_post', 'delete_comment', 'resolve_report',
    'grant_admin', 'revoke_admin',
    'approve_post', 'reject_post', 'toggle_official',
    'trigger_delete_post', 'trigger_status_change',
    'trigger_delete_comment', 'trigger_role_change',
    'login_success', 'login_failed'
  ));

----------------------------------------------------------------------
-- 2. ログイン試行カウンタ（サーバー側・(email_hash, ip) 単位）
----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_login_attempts (
  email_hash        text        NOT NULL,
  ip                text        NOT NULL DEFAULT '',
  attempt_count     integer     NOT NULL DEFAULT 0,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  locked_until      timestamptz,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (email_hash, ip)
);

-- RLS を有効化しポリシーを一切付けない → anon/authenticated からの直接 SELECT/INSERT は不可。
-- 操作は下記 SECURITY DEFINER 関数（テーブル所有者権限で RLS をバイパス）経由のみ。
ALTER TABLE public.admin_login_attempts ENABLE ROW LEVEL SECURITY;

----------------------------------------------------------------------
-- 3. ロック判定（signInWithPassword の前に呼ぶ）
----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_login_check(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ip   text := coalesce(public.extract_request_ip(), '');
  v_hash text := md5(lower(coalesce(p_email, '')));
  v_lock timestamptz;
BEGIN
  SELECT locked_until INTO v_lock
  FROM admin_login_attempts
  WHERE email_hash = v_hash AND ip = v_ip;

  IF v_lock IS NOT NULL AND v_lock > now() THEN
    RETURN jsonb_build_object('locked', true,
      'retry_after_seconds', ceil(extract(epoch FROM (v_lock - now())))::int);
  END IF;
  RETURN jsonb_build_object('locked', false, 'retry_after_seconds', 0);
END;
$$;

----------------------------------------------------------------------
-- 4. 試行結果の記録（signInWithPassword の後に呼ぶ）
----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_login_record(p_email text, p_success boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ip      text := coalesce(public.extract_request_ip(), '');
  v_hash    text := md5(lower(coalesce(p_email, '')));
  v_headers jsonb := coalesce(current_setting('request.headers', true)::jsonb, '{}'::jsonb);
  v_ua      text := v_headers ->> 'user-agent';
  v_count   int := 0;
  v_locked  timestamptz;
  c_max     constant int := 5;
  c_window  constant interval := interval '15 minutes';
  c_lock    constant interval := interval '15 minutes';
BEGIN
  IF p_success THEN
    DELETE FROM admin_login_attempts WHERE email_hash = v_hash AND ip = v_ip;
    -- 監査記録（パスワードは記録しない）
    INSERT INTO audit_logs (admin_id, action, target_type, target_id, details)
    VALUES (auth.uid(), 'login_success', 'user', auth.uid(),
            jsonb_build_object('ip', v_ip, 'user_agent', v_ua));
    RETURN jsonb_build_object('locked', false);
  END IF;

  -- 失敗: ウィンドウ内ならカウント加算、ウィンドウ超過ならリセット
  INSERT INTO admin_login_attempts (email_hash, ip, attempt_count, window_started_at, updated_at)
  VALUES (v_hash, v_ip, 1, now(), now())
  ON CONFLICT (email_hash, ip) DO UPDATE SET
    attempt_count = CASE WHEN admin_login_attempts.window_started_at < now() - c_window
                         THEN 1 ELSE admin_login_attempts.attempt_count + 1 END,
    window_started_at = CASE WHEN admin_login_attempts.window_started_at < now() - c_window
                             THEN now() ELSE admin_login_attempts.window_started_at END,
    updated_at = now()
  RETURNING attempt_count INTO v_count;

  IF v_count >= c_max THEN
    v_locked := now() + c_lock;
    UPDATE admin_login_attempts SET locked_until = v_locked
    WHERE email_hash = v_hash AND ip = v_ip;
  END IF;

  INSERT INTO audit_logs (admin_id, action, target_type, target_id, details)
  VALUES (NULL, 'login_failed', 'user', NULL,
          jsonb_build_object('ip', v_ip, 'email_hash', v_hash,
                             'attempt_count', v_count, 'reason', 'invalid_credentials'));

  RETURN jsonb_build_object(
    'locked', v_count >= c_max,
    'retry_after_seconds', CASE WHEN v_locked IS NOT NULL
                                THEN ceil(extract(epoch FROM (v_locked - now())))::int ELSE 0 END,
    'attempt_count', v_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_login_check(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_login_record(text, boolean) TO anon, authenticated;

----------------------------------------------------------------------
-- 5. get_audit_logs を LEFT JOIN に変更（login_failed は admin_id=NULL のため）
----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_audit_logs(p_limit INTEGER DEFAULT 20, p_offset INTEGER DEFAULT 0, p_action TEXT DEFAULT NULL, p_from TIMESTAMPTZ DEFAULT NULL, p_to TIMESTAMPTZ DEFAULT NULL, p_admin_id UUID DEFAULT NULL)
RETURNS TABLE (id UUID, created_at TIMESTAMPTZ, admin_id UUID, admin_email TEXT, action TEXT, target_type TEXT, target_id UUID, details JSONB, total_count BIGINT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'Permission denied'; END IF;
  RETURN QUERY SELECT al.id, al.created_at, al.admin_id, u.email::text AS admin_email, al.action, al.target_type, al.target_id, al.details, COUNT(*) OVER () AS total_count
    FROM audit_logs al LEFT JOIN auth.users u ON u.id = al.admin_id
    WHERE (p_action IS NULL OR al.action = p_action) AND (p_from IS NULL OR al.created_at >= p_from) AND (p_to IS NULL OR al.created_at <= p_to) AND (p_admin_id IS NULL OR al.admin_id = p_admin_id)
    ORDER BY al.created_at DESC LIMIT p_limit OFFSET p_offset;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_audit_logs(INTEGER, INTEGER, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, UUID) TO authenticated;

COMMENT ON FUNCTION public.admin_login_check(text) IS
  'REQ-149: 管理者ログインのサーバー側ロック判定。(email_hash, ip) 単位。signInWithPassword の前に呼ぶ。';
COMMENT ON FUNCTION public.admin_login_record(text, boolean) IS
  'REQ-149: 管理者ログイン試行の記録 + audit_logs(login_success/login_failed) 書き込み。IP は extract_request_ip() で取得。';
