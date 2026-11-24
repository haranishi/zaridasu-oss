-- ════════════════════════════════════════════════════════════════════════════
-- REQ-237: Web Push 通知基盤（再訪・リエンゲージ）
--   schema.sql と同期（REQ-003 / NFR-237-04 方針）。過去 migration は改変しない。
--   メール（REQ-234 / 20260615000006）と相補的な「即時」リエンゲージ・チャネルの DB 土台。
--
-- 本 migration が作るもの:
--   1. user_profiles: プッシュ購読カテゴリ列（メールと同じイベント軸 × Push チャネル / FR-237-06）
--   2. push_subscriptions: PushManager 購読の保存（user_id・endpoint・p256dh・auth・enabled・
--      created_at・last_seen_at・last_failed_at）。RLS で本人のみ読み書き（FR-237-03 / AC-01）。
--   3. RPC 群（SECURITY DEFINER + search_path 固定 / REQ-221）:
--      - get_push_subscriptions_for_user（service_role のみ・送信対象の有効購読を返す / FR-237-05）
--      - deactivate_push_subscription（失効 410/404 を無効化 / FR-237-03・NFR-237-03・AC-06）
--      - prune_disabled_push_subscriptions（無効購読の定期刈り込み / NFR-237-03）
--   4. pg_net ラッパ call_send_push（notify-* から Push を起動。Vault/pg_net 未設定は no-op / fail-soft）
--
-- 重要な制約:
--   - VAPID 秘密鍵はサーバー専用（NEXT_PUBLIC_ 厳禁 / NFR-237-01 / REQ-211）。DB には鍵を置かない
--     （Edge Function の Secrets で管理）。本 migration は購読の保管と配信の起動のみ。
--   - PII 最小（REQ-211 / NFR-237-01）: endpoint/p256dh/auth は購読本人と service_role のみ可視。
--   - pg_net / Vault は本番ダッシュボード依存。未有効環境では no-op で安全に失敗（fail-soft /
--     既存 20260425000004 / 20260615000004 / 20260615000006 と同方針）。
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. user_profiles: プッシュ購読カテゴリ（FR-237-06 / AC-03）。
--    メール側（notify_research_adopted / notify_dormant_reengage / notify_weekly_digest）と
--    同じイベント軸で Push チャネルの opt-in/out を別に持つ。既存 boolean NOT NULL DEFAULT の
--    様式に揃える。既定は false（許諾は明示オプトイン前提＝ブラウザ許諾を取って初めて有効化 / FR-237-04）。
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS notify_push_post_status boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_push_comment     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_push_nearby      boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.user_profiles.notify_push_post_status IS
  'REQ-237: 投稿の承認/却下を Web Push で受け取る opt-in（メール notify は REQ-234 とは別チャネル / FR-237-06）';
COMMENT ON COLUMN public.user_profiles.notify_push_comment IS
  'REQ-237: 自分の投稿へのコメントを Web Push で受け取る opt-in';
COMMENT ON COLUMN public.user_profiles.notify_push_nearby IS
  'REQ-237: 周辺/地域の新着を Web Push で受け取る opt-in';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. push_subscriptions: PushManager 購読の保存（FR-237-03 / AC-01）。
--    1 ユーザが複数端末/ブラウザを持つため (user_id, endpoint) の複合一意。
--    endpoint は push service の URL（PII 性は低いが本人と service_role のみ可視）。
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint      text        NOT NULL,
  -- 受信側公開鍵（base64url）。RFC8291 のペイロード暗号化に使う。
  p256dh        text        NOT NULL,
  -- 認証シークレット（base64url）。同上。
  auth          text        NOT NULL,
  -- 任意: UA 文字列の先頭（端末識別の補助・PII 最小のため最大長は短く）。
  user_agent    text,
  enabled       boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  -- 直近の送信失敗日時（410/404 で無効化された場合に記録 / AC-06）。
  last_failed_at timestamptz,
  CONSTRAINT push_subscriptions_user_endpoint_key UNIQUE (user_id, endpoint)
);
COMMENT ON TABLE public.push_subscriptions IS
  'REQ-237: Web Push（PushManager）の購読。本人のみ読み書き（RLS）。送信は service_role が RLS バイパスで参照。VAPID 鍵は DB に置かず Edge Secrets で管理（NFR-237-01）。';

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
  ON public.push_subscriptions (user_id) WHERE enabled = true;

-- 2-b. RLS: 本人のみ読み書き（FR-237-03 / AC-01）。service_role は RLS バイパスで送信時に参照。
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "own_push_sub_select" ON public.push_subscriptions
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "own_push_sub_insert" ON public.push_subscriptions
    FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "own_push_sub_update" ON public.push_subscriptions
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "own_push_sub_delete" ON public.push_subscriptions
    FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RPC 群（SECURITY DEFINER + SET search_path / REQ-221）
-- ─────────────────────────────────────────────────────────────────────────────

-- 3-a. get_push_subscriptions_for_user: 送信対象の有効購読を返す（FR-237-05）。
--   service_role 専用（送信 Edge Function が呼ぶ）。本人以外のメール/PII は返さない（endpoint/鍵のみ）。
CREATE OR REPLACE FUNCTION public.get_push_subscriptions_for_user(p_user_id uuid)
RETURNS TABLE (id uuid, endpoint text, p256dh text, auth text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ps.id, ps.endpoint, ps.p256dh, ps.auth
  FROM public.push_subscriptions ps
  WHERE ps.user_id = p_user_id AND ps.enabled = true;
$$;
COMMENT ON FUNCTION public.get_push_subscriptions_for_user(uuid) IS
  'REQ-237: ユーザの有効な Push 購読を返す（送信用 / FR-237-05）。service_role 専用。';
REVOKE EXECUTE ON FUNCTION public.get_push_subscriptions_for_user(uuid) FROM anon, authenticated;

-- 3-b. deactivate_push_subscription: 失効購読（送信 410/404）を無効化（FR-237-03・AC-06・NFR-237-03）。
--   service_role 専用。物理削除ではなく enabled=false + last_failed_at で監査性を保つ
--   （刈り込みは prune_disabled_push_subscriptions が後で行う）。
CREATE OR REPLACE FUNCTION public.deactivate_push_subscription(p_endpoint text)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.push_subscriptions
    SET enabled = false, last_failed_at = now()
    WHERE endpoint = p_endpoint;
END;
$$;
COMMENT ON FUNCTION public.deactivate_push_subscription(text) IS
  'REQ-237: 送信で 410/404 が返った endpoint を無効化（再送対象から外す / AC-06）。service_role 専用。';
REVOKE EXECUTE ON FUNCTION public.deactivate_push_subscription(text) FROM anon, authenticated;

-- 3-c. prune_disabled_push_subscriptions: 無効化から N 日経過した購読を物理削除（NFR-237-03）。
--   service_role 専用。cron から定期実行する想定（任意・本番ダッシュボードで設定）。
CREATE OR REPLACE FUNCTION public.prune_disabled_push_subscriptions(p_days integer DEFAULT 30)
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.push_subscriptions
    WHERE enabled = false
      AND last_failed_at IS NOT NULL
      AND last_failed_at < now() - make_interval(days => p_days);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;
COMMENT ON FUNCTION public.prune_disabled_push_subscriptions(integer) IS
  'REQ-237: 無効化から N 日経過した Push 購読を刈り込む（NFR-237-03）。service_role 専用。';
REVOKE EXECUTE ON FUNCTION public.prune_disabled_push_subscriptions(integer) FROM anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. pg_net ラッパ call_send_push（notify-* / 周辺新着から Push を起動 / FR-237-05）。
--    既存 call_lifecycle_edge_function（20260615000006）と同パターン。
--    Vault / app.settings 未設定や pg_net 未有効では no-op（fail-soft / NFR-237-04）。
--    ※ migration 側にのみ定義（schema.sql 単独適用＝CI rls-tests では vault/pg_net が無いため）。
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.call_send_push(p_payload jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_url text;
  v_key text;
BEGIN
  BEGIN
    SELECT decrypted_secret INTO v_key
      FROM vault.decrypted_secrets WHERE name = 'edge_function_service_role_key' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    RETURN;  -- Vault 未設定環境（CI/ローカル）では no-op
  END;
  IF v_key IS NULL THEN RETURN; END IF;

  v_url := current_setting('app.settings.supabase_url', true);
  IF v_url IS NULL OR v_url = '' THEN
    v_url := 'https://project-not-configured.invalid';
  END IF;

  PERFORM net.http_post(
    url := v_url || '/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := p_payload
  );
EXCEPTION WHEN OTHERS THEN
  NULL;  -- 起動失敗は本処理を止めない（fail-soft）
END;
$$;
COMMENT ON FUNCTION public.call_send_push(jsonb) IS
  'REQ-237: send-push Edge Function を pg_net で起動する薄いラッパ。Vault/pg_net 未設定や失敗は no-op（fail-soft）。';

COMMIT;
