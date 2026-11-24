-- =============================================================================
-- REQ-270 FR-270-01: pg_net 送出側に x-webhook-secret ヘッダを追加する
-- =============================================================================
-- 背景:
--   REQ-240 は Edge Function 側に requireWebhookSecret()（x-webhook-secret 検証）を
--   導入したが、DB 側の pg_net ラッパは Authorization: Bearer <service_role_key>
--   しか送っていなかった（x-webhook-secret を送る手段が無い）。このため運用手順
--   どおり WEBHOOK_SECRET を設定すると、pg_cron / DBトリガ起動の通知系10関数が
--   全て 401 で無言停止する（ラッパは fail-soft のためエラーも残らない）。
--
-- 本migration:
--   1. Vault の `webhook_secret` を読んで共通ヘッダ jsonb を組み立てるヘルパー
--      private.edge_webhook_headers(v_key) を新設する。
--      - Vault 未設定/未登録なら従来どおり x-webhook-secret 無しのヘッダを返す
--        （grace period 互換。CI/ローカルの挙動は不変）。
--      - 戻り値に secret を含むため anon/authenticated から EXECUTE を剥奪する。
--   2. 全 pg_net ラッパをヘルパー使用に置き換える（本文のその他のロジックは不変）。
--
-- 運用手順（本migration適用後 / REQ-270 FR-270-04）:
--   ① select vault.create_secret('<ランダム値>', 'webhook_secret');
--   ② Supabase secrets（Edge Function env）に同値の WEBHOOK_SECRET を設定
--   ③ Dashboard 設定の Database Webhook にも x-webhook-secret ヘッダを追加
--   ④ 動作確認後 WEBHOOK_SECRET_ENFORCE=true で grace period を閉じる
--
-- ※ schema.sql 側にラッパは定義されていない（CI rls-tests は vault/pg_net 無し）
--   ため、schema.sql の同期変更は不要（既存コメント準拠）。
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. 共通ヘッダビルダー
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION private.edge_webhook_headers(v_key text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_secret  text;
  v_headers jsonb;
BEGIN
  v_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || v_key
  );
  BEGIN
    SELECT decrypted_secret INTO v_secret
      FROM vault.decrypted_secrets WHERE name = 'webhook_secret' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_secret := NULL;  -- Vault 未設定環境（CI/ローカル）はヘッダ無し（grace period）
  END;
  IF v_secret IS NOT NULL AND length(trim(v_secret)) > 0 THEN
    v_headers := v_headers || jsonb_build_object('x-webhook-secret', v_secret);
  END IF;
  RETURN v_headers;
END;
$$;

COMMENT ON FUNCTION private.edge_webhook_headers(text) IS
  'REQ-270: pg_net ラッパ共通のヘッダビルダー。Vault の webhook_secret があれば x-webhook-secret を付与（無ければ grace period 互換）。secret を含むため anon/authenticated 実行不可。';

-- 戻り値に secret を含むため、SECURITY DEFINER 経由の内部呼び出し（ラッパ）以外から
-- 実行できないようにする。
REVOKE ALL ON FUNCTION private.edge_webhook_headers(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.edge_webhook_headers(text) FROM anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. ラッパ再定義（headers 組み立てのみ変更。他ロジックは各元migrationと同一）
-- ─────────────────────────────────────────────────────────────────────────────

-- 2-1. REQ-234: lifecycle（notify-weekly-digest / notify-dormant-reengage /
--      notify-research-adopted は本関数へ委譲）
CREATE OR REPLACE FUNCTION public.call_lifecycle_edge_function(p_fn text, p_payload jsonb)
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
    url := v_url || '/functions/v1/' || p_fn,
    headers := private.edge_webhook_headers(v_key),  -- REQ-270
    body := p_payload
  );
EXCEPTION WHEN OTHERS THEN
  NULL;  -- 起動失敗は本処理を止めない（fail-soft）
END;
$$;
COMMENT ON FUNCTION public.call_lifecycle_edge_function(text, jsonb) IS
  'REQ-234/270: ライフサイクル Edge Function を pg_net で起動する薄いラッパ（x-webhook-secret 対応）。Vault/pg_net 未設定や失敗は no-op（fail-soft）。';

-- 2-2. REQ-171: notify-survey-request
CREATE OR REPLACE FUNCTION public.call_notify_survey_request(payload jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_url text;
  v_key text;
BEGIN
  -- pg_net が使える環境のみ実行。env vault 未設定なら no-op
  BEGIN
    SELECT decrypted_secret INTO v_key
      FROM vault.decrypted_secrets WHERE name = 'edge_function_service_role_key' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    RETURN;
  END;
  IF v_key IS NULL THEN RETURN; END IF;

  v_url := current_setting('app.settings.supabase_url', true);
  IF v_url IS NULL OR v_url = '' THEN
    v_url := 'https://project-not-configured.invalid';
  END IF;

  PERFORM net.http_post(
    url := v_url || '/functions/v1/notify-survey-request',
    headers := private.edge_webhook_headers(v_key),  -- REQ-270
    body := payload
  );
EXCEPTION WHEN OTHERS THEN
  -- 通知失敗は本処理を止めない
  NULL;
END;
$$;

-- 2-3. REQ-237: send-push
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
    headers := private.edge_webhook_headers(v_key),  -- REQ-270
    body := p_payload
  );
EXCEPTION WHEN OTHERS THEN
  NULL;  -- 起動失敗は本処理を止めない（fail-soft）
END;
$$;
COMMENT ON FUNCTION public.call_send_push(jsonb) IS
  'REQ-237/270: send-push Edge Function を pg_net で起動する薄いラッパ（x-webhook-secret 対応）。Vault/pg_net 未設定や失敗は no-op（fail-soft）。';

-- 2-4. REQ-215: notify-ai-anomaly（Edge 側は REQ-270 で requireWebhookSecret 追加済み）
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
    headers := private.edge_webhook_headers(v_key),  -- REQ-270
    body := '{}'::jsonb
  );
EXCEPTION WHEN OTHERS THEN
  NULL;  -- 起動失敗は本処理を止めない（fail-soft）
END;
$$;
COMMENT ON FUNCTION public.run_ai_anomaly_check() IS
  'REQ-215/270: notify-ai-anomaly Edge Function を pg_net で起動する薄いラッパ（x-webhook-secret 対応・fail-soft）。Vault/pg_net 未設定や失敗は no-op。';

-- 2-5. AI解析 webhook（analyze-image / analyze-audio）
create or replace function private.call_ai_edge_function(
  p_function_name text,
  p_record jsonb
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_service_key text;
  v_url text;
begin
  select decrypted_secret into v_service_key
  from vault.decrypted_secrets
  where name = 'edge_function_service_role_key'
  limit 1;

  if v_service_key is null then
    raise warning '[ai-webhook] edge_function_service_role_key not set in vault; skipping call to %', p_function_name;
    return;
  end if;

  v_url := 'https://project-not-configured.invalid/functions/v1/' || p_function_name;

  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('record', p_record),
    headers := private.edge_webhook_headers(v_service_key),  -- REQ-270
    timeout_milliseconds := 10000
  );
exception when others then
  raise warning '[ai-webhook] % failed: %', p_function_name, sqlerrm;
end;
$$;

comment on function private.call_ai_edge_function is
  'AI analysis Edge Function caller (REQ-270: x-webhook-secret 対応). Reads service_role_key from Vault. Failures are logged as warnings and do not abort the transaction.';

-- 2-6. REQ-231: enrich-place（posts INSERT トリガ）
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
    headers := private.edge_webhook_headers(v_service_key),  -- REQ-270
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
  'REQ-231/270: posts INSERT 後に enrich-place Edge Function を pg_net で非同期起動（x-webhook-secret 対応）。Vault/kill switch 未設定や失敗は no-op（fail-open）。';

COMMIT;
