-- REQ-241 FR-241-01 / AC-01: detect_ai_anomalies の管理者ゲート（_kpi_assert_admin）の自動テスト（pgTAP）
--
-- 検証内容:
--   1. 非 admin の authenticated は detect_ai_anomalies を呼べない（'forbidden: admin only' で拒否）。
--   2. admin（app_metadata.role='admin'）はゲートを通過し集計 jsonb を得る。
--   3. service_role（notify-ai-anomaly Edge Function = cron 経路）はゲートを通過する。
--
-- harness 前提（.github/workflows/ci.yml rls-tests）:
--   - CI は schema.sql を psql で適用 → 直後に `GRANT EXECUTE ON ALL FUNCTIONS ... TO
--     anon, authenticated, service_role` を一括付与する。したがって GRANT 層はこのテストの関心では
--     なく、**本体先頭の認可ゲート（_kpi_assert_admin）**が拒否/許可を決めることを検証する
--     （まさに REQ-241 の設計 = GRANT は authenticated のまま・実チェックはゲート）。
--   - detect_ai_anomalies が参照する ai_call_logs は migration 由来で schema.sql には無い
--     （schema.sql:2794 の注記どおり）。本テストは BEGIN/ROLLBACK 内で最小スタブを
--     `CREATE TABLE IF NOT EXISTS` し、行は入れない（許可経路が本体末尾まで完走できるようにする）。
--     ローカルのフル migration 環境では実テーブルが既にあり no-op。
--   - _kpi_assert_admin は request.jwt.claims のみを見る（DB ロールに依存しない）。ゲートは
--     detect_ai_anomalies（SECURITY DEFINER）内の PERFORM で実行され claims を参照する。
--
-- 実行方法: `supabase test db` もしくは CI の pg_prove（.github/workflows/ci.yml rls-tests）。
-- BEGIN / ROLLBACK で隔離し副作用は残さない。

BEGIN;
SELECT plan(4);

-- ───────────────────────────────────────────────────────────────────────────
-- セットアップ: admin / 一般ユーザー、JWT ヘルパー、ai_call_logs スタブ
-- ───────────────────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email, raw_app_meta_data)
VALUES
  ('a1111111-1111-1111-1111-111111111111', 'admin@test.local', '{"role":"admin"}'::jsonb),
  ('b2222222-2222-2222-2222-222222222222', 'user@test.local',  '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- JWT クレーム設定ヘルパー（rls_posts.sql / rls_survey_requests.sql と同形式）。
CREATE OR REPLACE FUNCTION _set_jwt(claims jsonb) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', claims::text, true);
END;$$;
-- 関数の EXECUTE は既定で閉じている（REQ-316）。この補助関数は、ログイン済み・匿名の権限に切り替えた後でも
-- 呼ぶので、明示で許可する。
GRANT EXECUTE ON FUNCTION _set_jwt(jsonb) TO PUBLIC;

-- ai_call_logs スタブ（本体が参照する列のみ。行は入れない）。schema.sql-only の CI で必要。
CREATE TABLE IF NOT EXISTS public.ai_call_logs (
  id            uuid,
  post_id       uuid,
  function_name text,
  created_at    timestamptz
);

-- ───────────────────────────────────────────────────────────────────────────
-- AC-01(a): 非 admin の authenticated は拒否される（ゲートが最初の文で発火）。
-- ───────────────────────────────────────────────────────────────────────────
SELECT _set_jwt('{"sub":"b2222222-2222-2222-2222-222222222222","role":"authenticated","app_metadata":{"role":"authenticated"}}'::jsonb);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$ SELECT public.detect_ai_anomalies() $$,
  'P0001',
  'forbidden: admin only',
  'AC-01a: 非 admin の authenticated は detect_ai_anomalies を呼べない（forbidden: admin only）'
);

RESET ROLE;

-- ───────────────────────────────────────────────────────────────────────────
-- AC-01(b): admin はゲートを通過し、集計 jsonb を得る。
-- ───────────────────────────────────────────────────────────────────────────
SELECT _set_jwt('{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated","app_metadata":{"role":"admin"}}'::jsonb);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$ SELECT public.detect_ai_anomalies() $$,
  'AC-01b-1: admin はゲートを通過して detect_ai_anomalies を実行できる'
);
SELECT ok(
  (public.detect_ai_anomalies() ? 'signals')
    AND (public.detect_ai_anomalies() ? 'anomaly'),
  'AC-01b-2: admin の返り値はゲート通過後の集計 jsonb（signals / anomaly キーを含む）'
);

RESET ROLE;

-- ───────────────────────────────────────────────────────────────────────────
-- AC-01(c): service_role（notify-ai-anomaly の cron 経路）はゲートを通過する。
--   run_ai_anomaly_check → pg_net → service_role 鍵で detect_ai_anomalies を rpc 呼び出し、を模す。
--   _kpi_assert_admin は claims.role='service_role' を許可するため cron は壊れない。
-- ───────────────────────────────────────────────────────────────────────────
SELECT _set_jwt('{"role":"service_role"}'::jsonb);
RESET ROLE;

SELECT lives_ok(
  $$ SELECT public.detect_ai_anomalies() $$,
  'AC-01c: service_role（cron: notify-ai-anomaly）はゲートを通過して detect_ai_anomalies を実行できる'
);

SELECT * FROM finish();
ROLLBACK;
