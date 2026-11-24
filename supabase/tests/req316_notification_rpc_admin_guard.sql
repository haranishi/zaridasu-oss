-- Real migrations are applied by CI before this test. Do not repair ACLs here.
BEGIN;
SELECT plan(41);

INSERT INTO public.ai_call_logs(function_name, model, input_tokens, output_tokens, status)
VALUES ('analyze-image', 'fixture-model', 12, 3, 'success');

SELECT ok(NOT has_function_privilege('anon', f, 'EXECUTE'), 'anon denied: ' || f)
FROM unnest(ARRAY[
  'public.call_lifecycle_edge_function(text,jsonb)', 'public.call_send_push(jsonb)',
  'public.call_notify_survey_request(jsonb)', 'public.call_notify_research_adopted(jsonb)',
  'public.run_dormant_reengage_batch()', 'public.run_weekly_digest_batch()',
  'public.run_ai_anomaly_check()'
]) AS functions(f);
SELECT ok(NOT has_function_privilege('authenticated', f, 'EXECUTE'), 'authenticated denied: ' || f)
FROM unnest(ARRAY[
  'public.call_lifecycle_edge_function(text,jsonb)', 'public.call_send_push(jsonb)',
  'public.call_notify_survey_request(jsonb)', 'public.call_notify_research_adopted(jsonb)',
  'public.run_dormant_reengage_batch()', 'public.run_weekly_digest_batch()',
  'public.run_ai_anomaly_check()'
]) AS functions(f);
SELECT ok(has_function_privilege('service_role', f, 'EXECUTE'), 'service retained: ' || f)
FROM unnest(ARRAY[
  'public.call_lifecycle_edge_function(text,jsonb)', 'public.call_send_push(jsonb)',
  'public.call_notify_survey_request(jsonb)', 'public.call_notify_research_adopted(jsonb)',
  'public.run_dormant_reengage_batch()', 'public.run_weekly_digest_batch()',
  'public.run_ai_anomaly_check()'
]) AS functions(f);

SELECT ok(NOT has_function_privilege('anon', 'public.get_ai_cost_summary(integer)', 'EXECUTE'), 'cost RPC denies anon');
SELECT ok(has_function_privilege('authenticated', 'public.get_ai_cost_summary(integer)', 'EXECUTE'), 'admin UI role can reach cost guard');
SELECT ok(has_function_privilege('service_role', 'public.get_ai_cost_summary(integer)', 'EXECUTE'), 'cost service permission retained');

SET LOCAL ROLE anon;
SELECT throws_ok($test$SELECT public.call_lifecycle_edge_function('notify-weekly-digest', '{}'::jsonb)$test$,
  '42501', NULL, 'anon cannot execute internal notification RPC');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT throws_ok($test$SELECT public.call_send_push('{}'::jsonb)$test$,
  '42501', NULL, 'authenticated cannot execute push RPC');
SET LOCAL request.jwt.claims = '{}';
SELECT throws_ok('SELECT public.get_ai_cost_summary(30)', '42501', 'forbidden', 'missing metadata denied');
SET LOCAL request.jwt.claims = '{"role":"authenticated","app_metadata":{"role":null}}';
SELECT throws_ok('SELECT public.get_ai_cost_summary(30)', '42501', 'forbidden', 'null admin role denied');
SET LOCAL request.jwt.claims = '{"role":"authenticated","app_metadata":{"role":"user"}}';
SELECT throws_ok('SELECT public.get_ai_cost_summary(30)', '42501', 'forbidden', 'ordinary user denied');
SET LOCAL request.jwt.claims = '{"role":"authenticated","app_metadata":{"role":"admin"}}';
SELECT is(public.get_ai_cost_summary(30)->>'period_days', '30', 'admin keeps the existing JSON contract');
SELECT is(public.get_ai_cost_summary(30), jsonb_build_object(
  'period_days', 30, 'total_calls', 1, 'total_input_tokens', 12, 'total_output_tokens', 3,
  'by_function', jsonb_build_object('analyze-image', jsonb_build_object('calls', 1, 'input_tokens', 12, 'output_tokens', 3)),
  'by_model', jsonb_build_object('fixture-model', jsonb_build_object('calls', 1, 'input_tokens', 12, 'output_tokens', 3)),
  'daily', jsonb_build_array(jsonb_build_object('date', current_date, 'calls', 1, 'input_tokens', 12, 'output_tokens', 3))
), 'admin receives the unchanged complete aggregation contract');
RESET ROLE;

-- No actual network: CI's net.http_post records calls in a local fixture table.
TRUNCATE net._stub_calls;
INSERT INTO vault._stub_secrets(name, decrypted_secret)
VALUES ('edge_function_service_role_key', 'placeholder-service-key'), ('webhook_secret', 'placeholder-webhook-key')
ON CONFLICT (name) DO UPDATE SET decrypted_secret = EXCLUDED.decrypted_secret;
SET LOCAL app.settings.supabase_url = 'https://fixture.invalid';
SET LOCAL ROLE service_role;
SELECT throws_ok($test$SELECT public.call_lifecycle_edge_function('../send-push', '{}'::jsonb)$test$,
  '22023', 'unsupported lifecycle function', 'unapproved destination rejected before fail-soft');
SELECT throws_ok($test$SELECT public.call_lifecycle_edge_function(NULL, '{}'::jsonb)$test$,
  '22023', 'unsupported lifecycle function', 'null destination rejected');
SELECT lives_ok($test$SELECT public.run_weekly_digest_batch()$test$, 'internal service may start approved batch');
SELECT lives_ok($test$SELECT public.run_dormant_reengage_batch()$test$, 'internal service may start dormant batch');
SELECT lives_ok($test$SELECT public.call_notify_research_adopted('{"fixture":true}'::jsonb)$test$, 'internal service may notify research adoption');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM net._stub_calls), 3, 'only approved calls reached the dummy sink');
SELECT is((SELECT jsonb_agg(jsonb_build_object('url', url, 'body', body) ORDER BY id) FROM net._stub_calls),
  '[{"url":"https://fixture.invalid/functions/v1/notify-weekly-digest","body":{}},
    {"url":"https://fixture.invalid/functions/v1/notify-dormant-reengage","body":{}},
    {"url":"https://fixture.invalid/functions/v1/notify-research-adopted","body":{"fixture":true}}]'::jsonb,
  'all three wrappers preserve their exact destination and payload');
SELECT ok(has_function_privilege('anon', 'public.get_user_profile(uuid)', 'EXECUTE'), 'public profile remains public');
SELECT ok(has_function_privilege('anon', 'public.get_user_ranking(integer,integer,text)', 'EXECUTE'), 'ranking remains public');
SELECT ok(has_function_privilege('authenticated', 'public.get_user_ranking(integer,integer,text)', 'EXECUTE'), 'signed-in users retain ranking access');

SELECT * FROM finish();
ROLLBACK;
