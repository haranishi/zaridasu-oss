-- REQ-298 FR-298-07: pg_net webhook ラッパ 7 本の回帰テスト
--
-- 検証対象（migration 20260717000001_webhook_secret_headers.sql。schema.sql には**無い**）:
--   private.edge_webhook_headers(text)                  x-webhook-secret ヘッダ生成（REQ-270 の中核）
--   public.call_lifecycle_edge_function(text, jsonb)    ライフサイクルメール3本の起動
--   public.call_notify_survey_request(jsonb)            調査依頼通知の起動
--   public.call_send_push(jsonb)                        Web Push の起動
--   public.run_ai_anomaly_check()                       AI異常検知 cron
--   private.call_ai_edge_function(text, jsonb)          AI解析（analyze-image / analyze-audio）の起動
--   private.trigger_enrich_place()                      逆ジオコーディングの起動（posts INSERT トリガ）
--
-- なぜ必要か:
--   7 本とも `EXCEPTION WHEN OTHERS THEN NULL` の fail-soft 設計で、壊れても無言で no-op になる。
--   REQ-270 と同型の事故（secret ヘッダが載らない／呼び先の関数名が実在しない）が再発しても
--   誰も気づけない。ラッパは vault / pg_net を前提とするため schema.sql に載っておらず、
--   CI カバレッジが 0 だった。
--
-- 検証観点:
--   AC-1  Vault に secret が**ある**とき、edge_webhook_headers の戻り値に x-webhook-secret が載る
--   AC-2  Vault に secret が**無い**とき、載らない。かつ例外を投げない（grace period / fail-soft）
--   AC-3  各ラッパが叩く URL のパス `/functions/v1/<name>` が supabase/functions/ の実在ディレクトリ名と一致する
--         （REQ-285 FR-285-07「Edge Function 名の実在確認」を DB 側から補完する肝）
--   GUARD 7 本が存在すること／secret を含む edge_webhook_headers が anon・authenticated から実行できないこと
--
-- harness 前提（.github/workflows/ci.yml rls-tests）:
--   本テストは vault / pg_net の**スタブ**（supabase/ci/pgnet_vault_stub.sql）を適用し、その上に
--   実 migration 20260717000001 を適用した状態で走ることを前提とする。storage RLS（REQ-169）と
--   同じ「スタブ＋実 migration」方式で、ラッパ定義をテスト側にコピーしない＝定義のドリフトを防ぐ。
--   スタブが適用されていないと本テストは冒頭 2 本で落ちる（＝CI ステップの入れ忘れが即分かる）。
--
--   スタブの限界（ここで検証できないこと）は supabase/ci/pgnet_vault_stub.sql の冒頭に記載。
--   要点だけ再掲すると、確認できるのは「**どんな引数で net.http_post が呼ばれたか**」までで、
--   実際に HTTP が 200 で返るか・Edge 側が secret を受理するかは対象外（→ REQ-285 FR-285-08）。
--
-- 実行方法: CI の pg_prove（.github/workflows/ci.yml rls-tests）
--   ※ 素の `supabase test db` では vault / pg_net が本物になるため net._stub_calls が無く実行できない。

BEGIN;
SELECT plan(35);

-- private.call_ai_edge_function は fail-soft 経路で意図的に RAISE WARNING するため、
-- TAP ストリームを汚さないようメッセージを抑止する（アサーション自体には影響しない）。
SET LOCAL client_min_messages = ERROR;

-- ───────────────────────────────────────────────────────────────────────────
-- 0. harness 前提の明示: vault / pg_net スタブが適用されていること
-- ───────────────────────────────────────────────────────────────────────────
SELECT has_table('vault', '_stub_secrets',
  'harness: vault スタブが適用されている（supabase/ci/pgnet_vault_stub.sql）');
SELECT has_table('net', '_stub_calls',
  'harness: pg_net スタブが適用されている（supabase/ci/pgnet_vault_stub.sql）');

-- ───────────────────────────────────────────────────────────────────────────
-- 1. GUARD: ラッパ 7 本が存在する（migration の適用漏れ・シグネチャ変更の検知）
-- ───────────────────────────────────────────────────────────────────────────
SELECT has_function('private', 'edge_webhook_headers', ARRAY['text'],
  '7本(1/7): private.edge_webhook_headers(text) が存在する');
SELECT has_function('public', 'call_lifecycle_edge_function', ARRAY['text', 'jsonb'],
  '7本(2/7): public.call_lifecycle_edge_function(text, jsonb) が存在する');
SELECT has_function('public', 'call_notify_survey_request', ARRAY['jsonb'],
  '7本(3/7): public.call_notify_survey_request(jsonb) が存在する');
SELECT has_function('public', 'call_send_push', ARRAY['jsonb'],
  '7本(4/7): public.call_send_push(jsonb) が存在する');
SELECT has_function('public', 'run_ai_anomaly_check', ARRAY[]::text[],
  '7本(5/7): public.run_ai_anomaly_check() が存在する');
SELECT has_function('private', 'call_ai_edge_function', ARRAY['text', 'jsonb'],
  '7本(6/7): private.call_ai_edge_function(text, jsonb) が存在する');
SELECT has_function('private', 'trigger_enrich_place', ARRAY[]::text[],
  '7本(7/7): private.trigger_enrich_place() が存在する');

-- ───────────────────────────────────────────────────────────────────────────
-- 2. GUARD: edge_webhook_headers は戻り値に secret を含むため anon/authenticated から実行不可
--    （REQ-270: REVOKE ALL ... FROM PUBLIC / anon, authenticated）
-- ───────────────────────────────────────────────────────────────────────────
SELECT ok(
  NOT has_function_privilege('anon', 'private.edge_webhook_headers(text)', 'EXECUTE'),
  'REQ-270: anon は edge_webhook_headers を実行できない（secret の漏洩経路を塞ぐ）'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'private.edge_webhook_headers(text)', 'EXECUTE'),
  'REQ-270: authenticated も edge_webhook_headers を実行できない'
);

-- ───────────────────────────────────────────────────────────────────────────
-- 3. AC-1: Vault に webhook_secret が**ある**場合 → x-webhook-secret が載る
-- ───────────────────────────────────────────────────────────────────────────
INSERT INTO vault._stub_secrets (name, decrypted_secret) VALUES
  ('webhook_secret',                 'req298-webhook-secret'),
  ('edge_function_service_role_key', 'req298-service-role-key');

SELECT is(
  private.edge_webhook_headers('req298-key') ->> 'x-webhook-secret',
  'req298-webhook-secret',
  'AC-1: Vault に secret があれば x-webhook-secret ヘッダに Vault の値が載る'
);
SELECT is(
  private.edge_webhook_headers('req298-key') ->> 'Authorization',
  'Bearer req298-key',
  'AC-1: Authorization: Bearer <service_role_key> は従来どおり載る（REQ-270 で壊していない）'
);
SELECT is(
  private.edge_webhook_headers('req298-key') ->> 'Content-Type',
  'application/json',
  'AC-1: Content-Type: application/json も従来どおり載る'
);

-- ───────────────────────────────────────────────────────────────────────────
-- 4. AC-2a: Vault に webhook_secret が**無い**場合（行が無い）
--     → 載らない・例外を投げない（grace period 互換。CI/ローカルの挙動は不変）
-- ───────────────────────────────────────────────────────────────────────────
DELETE FROM vault._stub_secrets WHERE name = 'webhook_secret';

SELECT lives_ok(
  $$ SELECT private.edge_webhook_headers('req298-key') $$,
  'AC-2a: webhook_secret 未登録でも例外を投げない（fail-soft）'
);
SELECT ok(
  NOT (private.edge_webhook_headers('req298-key') ? 'x-webhook-secret'),
  'AC-2a: webhook_secret 未登録なら x-webhook-secret ヘッダは載らない'
);
SELECT is(
  private.edge_webhook_headers('req298-key') ->> 'Authorization',
  'Bearer req298-key',
  'AC-2a: secret 無しでも Authorization は載る（grace period 中も Edge Function は起動できる）'
);

-- ───────────────────────────────────────────────────────────────────────────
-- 5. AC-2b: Vault スキーマ自体が使えない場合（＝vault 拡張が無い本番 CI / ローカルの実態）
--     → EXCEPTION WHEN OTHERS 経路を実際に通り、やはり例外を投げない
-- ───────────────────────────────────────────────────────────────────────────
SELECT set_config('vault.stub_unavailable', 'true', true);

SELECT lives_ok(
  $$ SELECT private.edge_webhook_headers('req298-key') $$,
  'AC-2b: vault 参照が例外になる環境でも edge_webhook_headers は例外を投げない（fail-soft）'
);
SELECT ok(
  NOT (private.edge_webhook_headers('req298-key') ? 'x-webhook-secret'),
  'AC-2b: vault 参照が例外になる環境では x-webhook-secret は載らない'
);

SELECT set_config('vault.stub_unavailable', 'false', true);

-- ───────────────────────────────────────────────────────────────────────────
-- 6. AC-3: 各ラッパを実際に呼び、スタブが記録した URL のパスを実在の Edge Function 名と突合
-- ───────────────────────────────────────────────────────────────────────────

-- 6-1. 期待される Edge Function 名 = `ls supabase/functions/` のディレクトリ名。
--      ※ _shared は共有モジュール置き場で Edge Function ではないので含めない。
--      ※ Edge Function を追加・改名したらこのリストも更新すること（更新漏れは AC-3 が落ちて分かる）。
CREATE TEMP TABLE req298_edge_function_dirs (name text PRIMARY KEY);
INSERT INTO req298_edge_function_dirs (name) VALUES
  ('analyze-audio'),
  ('analyze-image'),
  ('enrich-place'),
  ('health-gemini'),
  ('notify-ai-anomaly'),
  ('notify-comment'),
  ('notify-dormant-reengage'),
  ('notify-gemini-key-failure'),
  ('notify-post-status'),
  ('notify-research-adopted'),
  ('notify-survey-request'),
  ('notify-weekly-digest'),
  ('send-push'),
  ('social-announce');

-- 6-2. 記録された URL からパス部分（/functions/v1/ 以降）を取り出すビュー。
--      call_ai_edge_function だけ URL のホストが固定なので、ホストに依存しない取り出し方にする。
CREATE TEMP VIEW req298_calls AS
  SELECT id,
         url,
         headers,
         substring(url from '/functions/v1/(.*)$') AS fn
    FROM net._stub_calls;

-- 6-3. 実行。Vault に両方の secret を戻し、URL のベースをテスト用に固定する。
INSERT INTO vault._stub_secrets (name, decrypted_secret) VALUES
  ('webhook_secret', 'req298-webhook-secret')
ON CONFLICT (name) DO UPDATE SET decrypted_secret = EXCLUDED.decrypted_secret;
SELECT set_config('app.settings.supabase_url', 'https://req298.stub.local', true);

DELETE FROM net._stub_calls;

-- DO ブロックで呼ぶ（bare SELECT だと void の戻り値が TAP ストリームに混ざるため）。
-- 引数で関数名を受け取る 2 本（call_lifecycle_edge_function / call_ai_edge_function）には、
-- 実際の呼び出し元（20260615000006 / 20260421000001）が渡している名前をそのまま渡す。
DO $req298$
BEGIN
  PERFORM public.call_lifecycle_edge_function('notify-weekly-digest',    '{}'::jsonb);
  PERFORM public.call_lifecycle_edge_function('notify-dormant-reengage', '{}'::jsonb);
  PERFORM public.call_lifecycle_edge_function('notify-research-adopted', '{}'::jsonb);
  PERFORM public.call_notify_survey_request('{}'::jsonb);
  PERFORM public.call_send_push('{}'::jsonb);
  PERFORM public.run_ai_anomaly_check();
  PERFORM private.call_ai_edge_function('analyze-image', '{}'::jsonb);
  PERFORM private.call_ai_edge_function('analyze-audio', '{}'::jsonb);
END
$req298$;

-- trigger_enrich_place は TRIGGER 関数なので直接は呼べない。本番と同じ
-- 「posts への AFTER INSERT」で起動する（本番のトリガ enrich_place_on_insert は
-- migration 20260615000004 側の定義で schema.sql に無いため、ここで同等物を張る）。
CREATE TRIGGER req298_enrich_place_on_insert
  AFTER INSERT ON public.posts
  FOR EACH ROW EXECUTE FUNCTION private.trigger_enrich_place();

INSERT INTO posts (lat, lng, species, info_type)
VALUES (39.1234567, 140.1234567, 'american', 'sighting');

-- 6-4. アサーション
SELECT is(
  (SELECT count(*)::int FROM req298_calls),
  9,
  'AC-3: 9 回の起動（lifecycle×3 / survey / push / anomaly / AI×2 / enrich-place）が全て pg_net へ届く＝どれも無言で no-op していない'
);
SELECT is(
  (SELECT count(*)::int FROM req298_calls WHERE url !~ '^https://[^/]+/functions/v1/[a-z0-9-]+$'),
  0,
  'AC-3: 全ての URL が https://<host>/functions/v1/<name> の形になっている'
);

-- ★ 肝: 呼び先の関数名が supabase/functions/ に実在するディレクトリ名の集合に含まれる。
--    実在しない名前を叩いていたらここで落ちる（REQ-285 FR-285-07 の DB 側からの補完）。
SELECT set_has(
  $$ SELECT name FROM req298_edge_function_dirs $$,
  $$ SELECT DISTINCT fn FROM req298_calls $$,
  'AC-3(肝): 全ラッパの呼び先が supabase/functions/ に実在する Edge Function 名と一致する'
);

-- ラッパごとの内訳（どのラッパが壊れたか特定できるようにする）
SELECT is((SELECT count(*)::int FROM req298_calls WHERE fn = 'notify-weekly-digest'), 1,
  'AC-3: call_lifecycle_edge_function(''notify-weekly-digest'') → /functions/v1/notify-weekly-digest');
SELECT is((SELECT count(*)::int FROM req298_calls WHERE fn = 'notify-dormant-reengage'), 1,
  'AC-3: call_lifecycle_edge_function(''notify-dormant-reengage'') → /functions/v1/notify-dormant-reengage');
SELECT is((SELECT count(*)::int FROM req298_calls WHERE fn = 'notify-research-adopted'), 1,
  'AC-3: call_lifecycle_edge_function(''notify-research-adopted'') → /functions/v1/notify-research-adopted');
SELECT is((SELECT count(*)::int FROM req298_calls WHERE fn = 'notify-survey-request'), 1,
  'AC-3: call_notify_survey_request → /functions/v1/notify-survey-request');
SELECT is((SELECT count(*)::int FROM req298_calls WHERE fn = 'send-push'), 1,
  'AC-3: call_send_push → /functions/v1/send-push');
SELECT is((SELECT count(*)::int FROM req298_calls WHERE fn = 'notify-ai-anomaly'), 1,
  'AC-3: run_ai_anomaly_check → /functions/v1/notify-ai-anomaly');
SELECT is((SELECT count(*)::int FROM req298_calls WHERE fn = 'analyze-image'), 1,
  'AC-3: call_ai_edge_function(''analyze-image'') → /functions/v1/analyze-image');
SELECT is((SELECT count(*)::int FROM req298_calls WHERE fn = 'analyze-audio'), 1,
  'AC-3: call_ai_edge_function(''analyze-audio'') → /functions/v1/analyze-audio');
SELECT is((SELECT count(*)::int FROM req298_calls WHERE fn = 'enrich-place'), 1,
  'AC-3: trigger_enrich_place（posts AFTER INSERT） → /functions/v1/enrich-place');

-- AC-1 の経路版: ヘルパ単体ではなく、実際に送出されるヘッダに secret が載っていること。
-- 1 本でも edge_webhook_headers を経由し忘れたラッパがあればここで落ちる（REQ-270 の再発防止）。
SELECT is(
  (SELECT count(*)::int FROM req298_calls WHERE NOT (headers ? 'x-webhook-secret')),
  0,
  'AC-1(経路): 7 本すべての送出ヘッダに x-webhook-secret が載る（edge_webhook_headers 経由の徹底）'
);
SELECT is(
  (SELECT count(*)::int FROM req298_calls WHERE headers ->> 'Authorization' <> 'Bearer req298-service-role-key'),
  0,
  'GUARD: 7 本すべての送出ヘッダに Vault 由来の Authorization: Bearer が載る'
);

-- ───────────────────────────────────────────────────────────────────────────
-- 7. AC-2 の運用面: Vault に service_role_key が無い環境（CI / ローカル）では
--    例外を投げずに完全 no-op になる（fail-soft のもう一方の顔）
-- ───────────────────────────────────────────────────────────────────────────
DELETE FROM net._stub_calls;
DELETE FROM vault._stub_secrets;

SELECT lives_ok(
  $$ DO $inner$
     BEGIN
       PERFORM public.call_lifecycle_edge_function('notify-weekly-digest', '{}'::jsonb);
       PERFORM public.call_notify_survey_request('{}'::jsonb);
       PERFORM public.call_send_push('{}'::jsonb);
       PERFORM public.run_ai_anomaly_check();
       PERFORM private.call_ai_edge_function('analyze-image', '{}'::jsonb);
     END
     $inner$ $$,
  'AC-2: Vault に service_role_key が無くてもラッパは例外を投げない（CI/ローカルで本処理を止めない）'
);
SELECT is(
  (SELECT count(*)::int FROM req298_calls),
  0,
  'AC-2: Vault に service_role_key が無ければ pg_net は 1 度も呼ばれない（no-op）'
);

SELECT * FROM finish();
ROLLBACK;
