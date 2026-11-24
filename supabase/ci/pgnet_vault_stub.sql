-- REQ-298 FR-298-07: CI rls-tests 用の vault / pg_net 最小スタブ。
-- Supabase ホストには存在するが plain postgres には無い vault スキーマ（Supabase Vault 拡張）と
-- net スキーマ（pg_net 拡張）を、20260717000001_webhook_secret_headers.sql（pg_net webhook ラッパ 7 本）
-- をそのまま適用・実行できる最小構成で再現する。
-- 本番スキーマ（schema.sql / migrations）には含めない CI 専用 fixture。
-- pg_prove の対象 glob（supabase/tests/*.sql）の外に置くことでテストとして実行されないようにしている。
-- 位置づけは supabase/ci/storage_stub.sql と同じ（「CI に無いスキーマをスタブして実 migration を適用する」）。
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ⚠️ 本番の pg_net / Vault と違う点（このスタブで検証**できない**こと）
-- ─────────────────────────────────────────────────────────────────────────────
--   1. 非同期性を再現しない。
--      本物の net.http_post() は request_id を即返して終わり、実際の HTTP 送信は background
--      worker が行い、結果（status_code / body / error_msg）は後から net._http_response へ
--      遅延書き込みされる。本スタブは同期的に呼び出し引数を net._stub_calls へ記録するだけで、
--      net._http_response 相当のテーブルも持たない。
--   2. 「実際に 200 が返るか」は検証できない。
--      DNS/TLS/到達性・タイムアウト・リトライ・レート制限は一切再現しない。Edge Function 側が
--      x-webhook-secret を受理するか（REQ-240 requireWebhookSecret の突合）も当然検証できない。
--      ここで確認できるのは **どんな引数（url / headers / body）で呼ばれたか** までである。
--   3. 上記 1〜2 の限界（＝送出後に本当に届いたのか / 失敗していないか）は
--      REQ-285 FR-285-08「pg_net 失敗の可視化」が担う領域であり、本スタブの担当ではない。
--   4. Vault は暗号化しない。vault.decrypted_secrets は平文テーブルのビューで、
--      vault.create_secret() 等の Vault API も持たない（テストは _stub_secrets を直接触る）。
--   5. 所有者・権限が違う。本番の net / vault は supabase_admin 所有で anon などへの GRANT も
--      Supabase 側が管理する。本スタブは postgres 所有・最小 GRANT。ただし検証対象のラッパは
--      全て SECURITY DEFINER なので、この差はラッパの挙動に影響しない。
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. private スキーマ
--    ラッパ 7 本のうち 3 本（edge_webhook_headers / call_ai_edge_function /
--    trigger_enrich_place）は private スキーマに置かれるが、schema.sql に private の記述は
--    一切無い（本来の作成元 20260615000004 は先頭で CREATE EXTENSION pg_net を実行するため
--    plain postgres では適用できない）。ここで作らないと migration 適用が 3F000 で落ちる。
-- ─────────────────────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO postgres, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Supabase Vault スタブ
--    migration 側の参照形は 6 箇所すべて次の形（列は name / decrypted_secret のみ使う）:
--      SELECT decrypted_secret INTO v_x FROM vault.decrypted_secrets WHERE name = '...' LIMIT 1;
--    読まれる name は 'webhook_secret'（REQ-270 の共有シークレット）と
--    'edge_function_service_role_key'（Authorization: Bearer 用）の 2 つ。
-- ─────────────────────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS vault;

-- 実体。テストは「secret がある状態／無い状態」をこのテーブルへの INSERT / DELETE で切り替える。
CREATE TABLE IF NOT EXISTS vault._stub_secrets (
  name             text PRIMARY KEY,
  decrypted_secret text NOT NULL
);

-- Vault そのものが使えない環境（＝本番 CI / ローカルの実態: vault 拡張が無い）の再現用スイッチ。
-- GUC vault.stub_unavailable = 'true' の間、vault.decrypted_secrets への SELECT は例外を投げる。
-- ラッパ側の `EXCEPTION WHEN OTHERS THEN ... RETURN`（grace period 経路）を実際に通すために使う。
CREATE OR REPLACE FUNCTION vault._stub_guard() RETURNS boolean
LANGUAGE plpgsql STABLE
SET search_path = ''
AS $func$
BEGIN
  IF lower(coalesce(pg_catalog.current_setting('vault.stub_unavailable', true), 'false')) = 'true' THEN
    RAISE EXCEPTION 'vault stub: schema unavailable (simulated)' USING ERRCODE = '3F000';
  END IF;
  RETURN true;
END
$func$;

-- 本物は id / description / secret / key_id / nonce / created_at / updated_at 等も持つが、
-- migration が読むのは name / decrypted_secret だけなので最小構成に留める。
CREATE OR REPLACE VIEW vault.decrypted_secrets AS
  SELECT s.name, s.decrypted_secret
    FROM vault._stub_secrets s
   WHERE vault._stub_guard();

GRANT USAGE ON SCHEMA vault TO postgres, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. pg_net スタブ
--    migration 側の呼び出しは named argument（url := / body := / headers := /
--    timeout_milliseconds :=）なので、**引数名・型・DEFAULT を本物と厳密に一致させる**。
--    本物（pg_net 0.7 系）:
--      net.http_post(url text,
--                    body jsonb default '{}'::jsonb,
--                    params jsonb default '{}'::jsonb,
--                    headers jsonb default '{"Content-Type": "application/json"}'::jsonb,
--                    timeout_milliseconds int default 5000) returns bigint
--    ※ params は migration 側からは渡されないが、引数名の一致だけでなく「本物と同じ位置引数の
--       並び」を保つため残す（省略すると位置引数呼び出しの意味が変わり、スタブが本物より
--       寛容になってしまう）。
-- ─────────────────────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS net;

-- 送出内容の記録先。テストはここを読んで url / headers / body を突合する。
-- id が本物の request_id 相当（http_post の戻り値）。
CREATE TABLE IF NOT EXISTS net._stub_calls (
  id                   bigserial PRIMARY KEY,
  called_at            timestamptz NOT NULL DEFAULT now(),
  url                  text,
  body                 jsonb,
  params               jsonb,
  headers              jsonb,
  timeout_milliseconds integer
);

COMMENT ON TABLE net._stub_calls IS
  'REQ-298: CI 専用。net.http_post の呼び出し引数を記録する（実際の HTTP 送信は行わない）。';

CREATE OR REPLACE FUNCTION net.http_post(
  url                  text,
  body                 jsonb   DEFAULT '{}'::jsonb,
  params               jsonb   DEFAULT '{}'::jsonb,
  headers              jsonb   DEFAULT '{"Content-Type": "application/json"}'::jsonb,
  timeout_milliseconds integer DEFAULT 5000
) RETURNS bigint
LANGUAGE plpgsql VOLATILE
SET search_path = ''
AS $func$
DECLARE
  v_request_id bigint;
BEGIN
  -- ⚠️ 実際に HTTP は投げない。引数を記録して request_id 相当を返すだけ。
  INSERT INTO net._stub_calls (url, body, params, headers, timeout_milliseconds)
  VALUES (http_post.url, http_post.body, http_post.params,
          http_post.headers, http_post.timeout_milliseconds)
  RETURNING net._stub_calls.id INTO v_request_id;
  RETURN v_request_id;
END
$func$;

COMMENT ON FUNCTION net.http_post(text, jsonb, jsonb, jsonb, integer) IS
  'REQ-298: pg_net の同名関数のスタブ。引数を net._stub_calls へ記録し request_id 相当の bigint を返す。非同期送信・net._http_response は再現しない。';

GRANT USAGE ON SCHEMA net TO postgres, service_role;
GRANT EXECUTE ON FUNCTION net.http_post(text, jsonb, jsonb, jsonb, integer) TO postgres, service_role;
