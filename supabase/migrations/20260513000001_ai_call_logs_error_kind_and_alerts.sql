-- REQ-126 Phase 2/3:
--   1. ai_call_logs に error_kind カラム + 部分インデックスを追加し、
--      gemini_auth エラーをバナー / 通知向けに高速集計できるようにする。
--   2. admin_alerts テーブル + admin SELECT ポリシーを新設し、
--      notify-gemini-key-failure Edge Function の重複抑制状態を保持する。
--
-- 既存 ai_call_logs.error_kind を持たないレコードは NULL のまま残り、
-- アプリケーション側で aiResult.error_kind と整合性を取って書き込む。

------------------------------------------------------------------
-- 1. ai_call_logs.error_kind 追加
------------------------------------------------------------------

ALTER TABLE public.ai_call_logs
  ADD COLUMN IF NOT EXISTS error_kind text;

COMMENT ON COLUMN public.ai_call_logs.error_kind IS
  'REQ-126: AI 呼び出しエラーの種別 (image_fetch / gemini_auth / gemini_transient / gemini_api / json_parse / unknown)。バナー / 通知の集計を高速化する目的で保持。';

-- バナー / 通知の集計クエリ
--   SELECT COUNT(*) FROM ai_call_logs
--   WHERE error_kind = 'gemini_auth' AND created_at >= now() - interval '1 hour'
-- を部分インデックスで O(1) 近傍に保つ。
CREATE INDEX IF NOT EXISTS idx_ai_call_logs_gemini_auth_created
  ON public.ai_call_logs (created_at DESC)
  WHERE error_kind = 'gemini_auth';

------------------------------------------------------------------
-- 2. admin_alerts テーブル
------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.admin_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type text NOT NULL CHECK (alert_type IN ('gemini_key_failure')),
  triggered_at timestamptz NOT NULL DEFAULT now(),
  notified_at timestamptz,
  metadata jsonb,
  resolved_at timestamptz
);

COMMENT ON TABLE public.admin_alerts IS
  'REQ-126: 管理者向けシステムアラートの送信履歴。notify-gemini-key-failure などの Edge Function が重複通知を抑制するために notified_at を読み書きする。';

-- 同種アラートを「直近 N 時間」で絞り込む用途を高速化する。
CREATE INDEX IF NOT EXISTS idx_admin_alerts_type_triggered
  ON public.admin_alerts (alert_type, triggered_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_alerts_type_notified
  ON public.admin_alerts (alert_type, notified_at DESC)
  WHERE notified_at IS NOT NULL;

ALTER TABLE public.admin_alerts ENABLE ROW LEVEL SECURITY;

-- service_role は RLS bypass で書き込み可能。
-- 認証済みユーザーは admin のみ SELECT を許可する。
DO $$ BEGIN
  CREATE POLICY "admin_select_admin_alerts" ON public.admin_alerts
    FOR SELECT TO authenticated
    USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
