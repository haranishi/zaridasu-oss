-- ════════════════════════════════════════════════════════════════════════════
-- REQ-241: Supabase RPC 認可ゲート欠落・メール列挙・スキーマドリフトの是正（追補 migration）
--
--   既存ハードニング網（REQ-221）から個別に漏れた 3 件の逸脱を、既存パターンに合わせて塞ぐ。
--   すべて正本 supabase/schema.sql にも同内容を反映済み（schema:check で同期を検証）。冪等。
--
--   1. FR-241-01（最優先）: detect_ai_anomalies に管理者ゲートを追加。
--      SECURITY DEFINER + GRANT EXECUTE TO authenticated だが本体に認可チェックが無く、
--      ログイン済みの任意ユーザーが内部メトリクス（top_user_id / auto_approve_rate 等）を取得できた。
--      本体先頭に PERFORM public._kpi_assert_admin() を追加（兄弟 KPI RPC と同型）。
--      _kpi_assert_admin は request.jwt.claims の role='service_role' か app_metadata.role='admin' のみ
--      通すため、notify-ai-anomaly Edge Function（service_role 鍵）の cron パスは壊れない。
--      GRANT は authenticated のまま（実チェックはゲートが担う）。
--      ※ 20260616000003 が作るゲート無しの定義を本 migration の CREATE OR REPLACE が上書きする
--        （DR = migration-only rebuild でも最終状態はゲート有り）。
--
--   2. FR-241-02: check_email_exists に明示 GRANT を付与（PUBLIC 剥奪との二律背反を解消）。
--      サインアップのメール重複事前チェック（anon 呼び出し）を維持しつつ、REQ-221 の
--      「明示付与のみ実行可」に正式に載せる。列挙リスクの残余は Turnstile（REQ-212）＋
--      Auth レート制限で受容（runbook に根拠を明記）。
--
--   3. FR-241-03: post-audio ストレージバケットを migration にも作成（BCP/DR ドリフト解消）。
--      バケット定義は schema.sql:1908 のみに存在し、初期 migration 20240101000000 は post-photos しか
--      作らないため、migration-only 構築（supabase db push / DR）では post-audio が無く、
--      20260513000007 のアップロード RLS ポリシーが存在しないバケットを参照していた。
--      schema.sql と同一設定で冪等 INSERT を追加する。
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. FR-241-01: detect_ai_anomalies に管理者ゲートを追加（本体先頭に _kpi_assert_admin）。
--    引数・返り値・集計ロジックは 20260616000003 と同一。差分は認可ゲート 1 文のみ。
-- ─────────────────────────────────────────────────────────────────────────────
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
  -- REQ-241 FR-241-01: 認可ゲート（本体の最初の文）。get_retention_cohorts / get_kpi_summary 等と同型。
  --   service_role（notify-ai-anomaly の cron 経路）と admin JWT のみ許可。GRANT は authenticated のまま。
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
  'REQ-215 FR-215-07(b) / REQ-241 FR-241-01: 直近ウィンドウの AI 自動承認率 / 単一 actor の呼び出し頻度 / 総呼び出し数の異常を集計し signals を返す。本体先頭で _kpi_assert_admin()（service_role / admin のみ許可）を強制。既存 ai_call_logs / posts のみ参照。PII 最小（user_id 集計キーとハッシュ IP 件数のみ）。';

-- GRANT は authenticated のまま（実チェックは本体のゲート）。anon は明示 REVOKE。冪等。
REVOKE EXECUTE ON FUNCTION public.detect_ai_anomalies(integer, integer, numeric, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.detect_ai_anomalies(integer, integer, numeric, integer, integer) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. FR-241-02: check_email_exists に明示 GRANT（PUBLIC 剥奪との二律背反を解消）。
--    REQ-221 の ALTER DEFAULT PRIVILEGES ... REVOKE EXECUTE FROM PUBLIC 後は、明示 GRANT が無いと
--    anon から拒否される。サインアップのメール重複事前チェック（AuthModal.tsx / anon 呼び出し）を
--    維持するため anon, authenticated に明示付与し、挙動を決定論化する。
--    列挙リスクの残余は Turnstile（REQ-212）＋ Auth レート制限で受容（runbook に根拠）。
-- ─────────────────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.check_email_exists(TEXT) TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. FR-241-03: post-audio ストレージバケットを migration にも作成（DR ドリフト解消）。
--    schema.sql:1908 と同一設定（id/public/上限/MIME）。冪等（ON CONFLICT DO NOTHING）。
--    20260513000007 のアップロード RLS ポリシーが参照するバケットを migration 経路でも保証する。
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'post-audio',
  'post-audio',
  true,
  1048576, -- 1MB
  ARRAY['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg']
)
ON CONFLICT (id) DO NOTHING;

COMMIT;
