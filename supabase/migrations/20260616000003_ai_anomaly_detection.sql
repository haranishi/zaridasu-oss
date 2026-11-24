-- ════════════════════════════════════════════════════════════════════════════
-- REQ-215 FR-215-07(b): AI 自動承認/却下の濫用検知（異常検知）+ 管理者通知配線
--
--   ザリダスは「ユーザー投稿を AI が人手レビュー無しで自動承認/却下する」点が設計の肝。
--   この migration は、その権威化された自動判定の**濫用/暴走を定期集計(pg_cron)で検知**し、
--   閾値超過時に notify-ai-anomaly Edge Function 経由で管理者へ通知する土台を作る。
--
-- 本 migration が作るもの:
--   1. admin_alerts.alert_type CHECK に 'ai_anomaly' を追加（既存 'gemini_key_failure' は維持）
--   2. 集計関数 detect_ai_anomalies(): 直近ウィンドウの
--        - auto-approve 率（AI 分析された投稿のうち auto_approved=true の割合）
--        - 単一ユーザー/IP に集中した AI 呼び出し頻度
--        - AI 呼び出し総数（コスト観点・REQ-218 AI_COST_ALERT_CALLS_PER_HOUR と整合）
--      を集計し、閾値超過の「signals」を JSON で返す（既存テーブルのみ参照・冪等）。
--   3. run_ai_anomaly_check(): notify-ai-anomaly を pg_net で起動する薄いラッパ（fail-soft）
--   4. pg_cron: 15 分ごとに run_ai_anomaly_check() を実行
--
-- 重要な制約:
--   - 集計対象は既存 ai_call_logs / posts のみ（analyze-image / analyze-audio にフックを足さない）。
--     検知は「事後集計方式」（REQ-215 制約 1）。
--   - 閾値は関数引数 + Edge Function 側 env で調整可能（安全側の既定値を本関数に置く）。
--   - PII 最小（REQ-211）: 集計関数は件数・率・user_id（集計キー）のみ返し、メール/座標/IP 平文は返さない。
--     IP 集中は posts.reporter_ip（ハッシュ化済み列）の件数集計のみ。
--   - pg_net / pg_cron は本番ダッシュボード依存。未有効環境（CI / ローカル）では no-op で安全に
--     失敗する（fail-soft / 既存 20260425000004 / 20260615000006 と同方針。schema.sql 単独適用＝
--     CI rls-tests では pg_cron / pg_net / vault が無いため、cron 登録は本 migration 側のみ）。
--   - 集計関数 detect_ai_anomalies() は schema.sql にも正本反映する（plpgsql 本体は CREATE 時に
--     テーブル参照を検証しないため、CI の psql -f schema.sql / 型生成は安全に通る）。
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. admin_alerts.alert_type に 'ai_anomaly' を追加（重複通知抑制の状態を gemini_key_failure
--    と同じテーブルで管理する）。既存値は壊さない。
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.admin_alerts DROP CONSTRAINT IF EXISTS admin_alerts_alert_type_check;
ALTER TABLE public.admin_alerts ADD CONSTRAINT admin_alerts_alert_type_check
  CHECK (alert_type IN ('gemini_key_failure', 'ai_anomaly'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. 集計関数 detect_ai_anomalies(): 直近ウィンドウの AI 自動判定の異常を集計し JSON を返す。
--
--    引数（すべて省略可・安全側の既定）:
--      p_window_minutes              集計窓（分）。既定 60。
--      p_min_samples                 auto-approve 率を評価する最小標本数（少数で誤検知しない）。既定 20。
--      p_auto_approve_rate_threshold auto-approve 率の異常閾値（0..1）。既定 0.90。
--      p_per_actor_call_threshold    単一ユーザー/IP の AI 呼び出し回数の異常閾値。既定 50。
--      p_total_call_threshold        窓内 AI 呼び出し総数の異常閾値（コスト観点）。既定 500
--                                    （= REQ-218 AI_COST_ALERT_CALLS_PER_HOUR の既定と一致）。
--
--    集計対象（既存テーブルのみ。analyze-* にフックを足さない / REQ-215 制約 1）:
--      - AI 呼び出し: ai_call_logs（function_name in analyze-image/analyze-audio）。
--        status は問わず（呼び出し頻度＝コスト/濫用の指標）。
--      - auto-approve 率: ウィンドウ内に AI 分析された投稿（posts.ai_analyzed_at が窓内）のうち、
--        auto_approved=true かつ reviewed_by IS NULL（人手なし）の割合。
--      - 単一 actor 集中: ai_call_logs→posts.user_id 別の呼び出し回数の最大、および
--        posts.reporter_ip（ハッシュ化済み）別の AI 分析件数の最大。
--
--    返り値 jsonb:
--      { window_minutes, since, thresholds, metrics:{...}, signals:[...], anomaly:boolean }
--    signals は閾値超過した指標名の配列（空なら異常なし）。
--    PII 最小: 平文メール/座標/IP は返さない（top actor は user_id と件数のみ）。
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
  v_analyzed_posts        bigint;       -- 窓内に AI 分析された投稿数（auto-approve 率の分母）
  v_auto_approved         bigint;       -- うち auto_approved=true かつ人手なし
  v_auto_approve_rate     numeric;      -- 分母 < p_min_samples なら NULL（評価対象外）
  v_max_user_calls        bigint := 0;  -- 単一 user の AI 呼び出し回数 最大
  v_top_user_id           uuid;
  v_max_ip_posts          bigint := 0;  -- 単一 reporter_ip(ハッシュ) の AI 分析投稿数 最大
  v_signals               jsonb := '[]'::jsonb;
BEGIN
  -- (1) 窓内 AI 呼び出し総数（コスト/頻度の指標。status 不問）。
  SELECT count(*) INTO v_total_calls
  FROM public.ai_call_logs
  WHERE created_at >= v_since
    AND function_name IN ('analyze-image', 'analyze-audio');

  -- (2) auto-approve 率（分母 = 窓内に AI 分析された投稿）。
  --     ai_analyzed_at を窓判定に使い、auto_approved=true かつ reviewed_by IS NULL（人手なし）を分子に。
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
  --     件数最大の user の (user_id, n) を 1 行だけ取得（集計キーのみ・PII 最小）。
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

  -- (4) 単一 reporter_ip(ハッシュ化済み列) に集中した AI 分析投稿数（IP 単位の濫用。平文は持たない）。
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
      'top_user_id', v_top_user_id,   -- 集計キー（uuid）。メール/氏名は返さない。
      'max_ip_posts', v_max_ip_posts  -- ハッシュ化済み IP の件数のみ（平文 IP は返さない）。
    ),
    'signals', v_signals,
    'anomaly', jsonb_array_length(v_signals) > 0
  );
END;
$$;

COMMENT ON FUNCTION public.detect_ai_anomalies(integer, integer, numeric, integer, integer) IS
  'REQ-215 FR-215-07(b): 直近ウィンドウの AI 自動承認率 / 単一 actor の呼び出し頻度 / 総呼び出し数の異常を集計し signals を返す。既存 ai_call_logs / posts のみ参照（analyze-* にフックを足さない）。PII 最小（user_id 集計キーとハッシュ IP 件数のみ）。service_role / admin 用。';

-- service_role は RLS バイパスで実行可能。admin は集計閲覧用に EXECUTE 許可。anon は拒否。
-- ⚠ REQ-241 FR-241-01: 本 migration 時点の detect_ai_anomalies は本体に認可ゲートが無く、GRANT が
--   authenticated のため任意のログイン済みユーザーが内部メトリクスを取得できた（逸脱）。是正は追補
--   migration 20260703000003_req241_authz_enumeration_hardening.sql が本体先頭に
--   PERFORM public._kpi_assert_admin() を追加する CREATE OR REPLACE で行う（正本 schema.sql も同期）。
--   ここ（歴史的 migration）は不変記録として原状のまま残す。
REVOKE EXECUTE ON FUNCTION public.detect_ai_anomalies(integer, integer, numeric, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.detect_ai_anomalies(integer, integer, numeric, integer, integer) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. pg_net ラッパ + 4. pg_cron 定期ジョブ（fail-soft。schema.sql には入れない＝migration 専用）。
--    既存 call_lifecycle_edge_function（20260615000006）/ call_notify_survey_request と同パターン。
--    Vault / app.settings 未設定や pg_net/pg_cron 未有効では no-op（NFR / CI 安全）。
-- ─────────────────────────────────────────────────────────────────────────────

-- notify-ai-anomaly を pg_net で叩く薄いラッパ。WEBHOOK_SECRET 相当の保護は Edge 側 env で行う
-- （本ラッパは service_role key を Authorization に付ける既存方式を踏襲）。
CREATE OR REPLACE FUNCTION public.run_ai_anomaly_check()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_url text;
  v_key text;
BEGIN
  BEGIN
    SELECT decrypted_secret INTO v_key
      FROM vault.decrypted_secrets WHERE name = 'edge_function_service_role_key' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    RETURN;  -- Vault 未設定環境（CI / ローカル）では no-op
  END;
  IF v_key IS NULL THEN RETURN; END IF;

  v_url := current_setting('app.settings.supabase_url', true);
  IF v_url IS NULL OR v_url = '' THEN
    v_url := 'https://project-not-configured.invalid';
  END IF;

  PERFORM net.http_post(
    url := v_url || '/functions/v1/notify-ai-anomaly',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := '{}'::jsonb
  );
EXCEPTION WHEN OTHERS THEN
  NULL;  -- 起動失敗は本処理を止めない（fail-soft）
END;
$$;
COMMENT ON FUNCTION public.run_ai_anomaly_check() IS
  'REQ-215 FR-215-07(b): notify-ai-anomaly Edge Function を pg_net で起動する薄いラッパ（fail-soft）。Vault/pg_net 未設定や失敗は no-op。';

-- pg_cron 登録（拡張が無い/未有効でも安全に no-op。既存 lifecycle / enrich-place と同方針）。
DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'REQ-215: pg_cron 拡張を有効化できません（権限/未対応環境）。AI 異常検知 cron はスキップ（fail-soft）。';
    RETURN;
  END;

  -- 既存の同名ジョブがあれば張り替え（冪等 / 二重発火防止）。
  BEGIN
    PERFORM cron.unschedule('ai_anomaly_check_15min');
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- 15 分ごとに AI 自動判定の異常をチェック（notify-ai-anomaly 側で重複通知を抑制）。
  BEGIN
    PERFORM cron.schedule('ai_anomaly_check_15min', '*/15 * * * *',
      $cron$ SELECT public.run_ai_anomaly_check(); $cron$);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'REQ-215: ai_anomaly_check cron 登録に失敗（fail-soft）。';
  END;
END
$$;

COMMIT;
