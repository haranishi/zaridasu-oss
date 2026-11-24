-- REQ-298 FR-298-06 / AC-05: 主要な SECURITY DEFINER 関数の EXECUTE 権限ガード（回帰テスト）
--
-- 検証対象（schema.sql の REVOKE 行と 1:1 対応。シグネチャは REVOKE 行の記載どおり）:
--   public.get_dormant_users(integer, integer, integer)                      -- schema.sql:3336 FROM anon, authenticated
--   public.record_lifecycle_email(text, uuid, uuid, boolean)                 -- schema.sql:3432 FROM anon, authenticated
--   public.get_push_subscriptions_for_user(uuid)                             -- schema.sql:3489 FROM anon, authenticated
--   public.detect_ai_anomalies(integer, integer, numeric, integer, integer)  -- schema.sql:3657 FROM anon（authenticated へは明示 GRANT あり）
--
-- 検証観点:
--   FR-298-06  上記 4 本について anon が EXECUTE を持たない
--   AC-05      schema.sql の関数 REVOKE 行を 1 行削除すると本テストが落ちる
--   過剰 REVOKE 防止  service_role は EXECUTE を保持（バックエンド / Edge Function 経路を壊していない）
--   authenticated は schema.sql の記述に忠実（3 本は不可・detect_ai_anomalies だけ可＝REQ-241 の admin 経路）
--
-- ★このテストの成立条件（他の権限テストと決定的に違う点）★
--   本テストは **テスト自身で REVOKE を打たない**。
--   supabase/tests/grant_hardening_internal_tables.sql や req292_anon_granted_rpc_authz.sql は、
--   トランザクション内で migration と同じ REVOKE を再適用してからアサートしている。あれは
--   「migration が確定させる最終状態」の検証としては正しいが、**schema.sql から REVOKE 行が
--   消えても必ず通ってしまう**（自分で REVOKE するのだから当然）。つまり AC-05 のガードにならない。
--   そこで本テストは harness が到達させた権限状態をそのままアサートする。
--
--   harness 前提（.github/workflows/ci.yml rls-tests / FR-298-05）:
--     (1) schema.sql を psql で適用（この時点で REVOKE は効いている）
--     (2) Supabase 既定の一括 GRANT
--         `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role`
--         → ここで (1) の関数 REVOKE がすべて打ち消される
--     (3) FR-298-05 のステップが schema.sql から
--         `grep -E '^REVOKE .* ON FUNCTION ' supabase/schema.sql`
--         で抽出した REVOKE 文を 1 文ずつ再適用し、最小権限を再確定する
--   したがって schema.sql の REVOKE 行を 1 行消すと、(3) の抽出結果から消える → 再適用されない →
--   (2) の一括 GRANT により anon が EXECUTE を持ったまま → **本テストが落ちる**（＝AC-05）。
--
--   なお PUBLIC 経由の抜け道は schema.sql:27
--   `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;`
--   で塞がれている。has_function_privilege は PUBLIC 経由の権限も含めて判定するため、
--   仮にこの既定権限剥奪が外れて PUBLIC に EXECUTE が戻れば、下の anon アサーションが落ちる。
--
-- 実行方法: `supabase test db` もしくは CI の pg_prove (.github/workflows/ci.yml rls-tests)
-- BEGIN / ROLLBACK で隔離し副作用は残さない（本テストは DDL も DML も行わない）。

BEGIN;
SELECT plan(21);

-- ───────────────────────────────────────────────────────────────────────────
-- 0. harness の健全性: 一括 GRANT ステップが実際に走っていること
--    これが無いと本テストは「そもそも誰も EXECUTE を持っていないから通った」という
--    空振り（vacuous pass）を検知できない。schema.sql:27 の ALTER DEFAULT PRIVILEGES により
--    アプリ関数には PUBLIC EXECUTE が付かないので、anon が EXECUTE を持つアプリ関数が
--    1 本でもあれば「一括 GRANT が走った」ことの証拠になる。
--    （pgTAP 自身の関数は拡張作成時の既定 PUBLIC EXECUTE を持つため pg_depend で除外する）
-- ───────────────────────────────────────────────────────────────────────────
SELECT cmp_ok(
  (SELECT count(*)::int
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
         WHERE d.objid = p.oid AND d.classid = 'pg_proc'::regclass AND d.deptype = 'e'
      )),
  '>', 0,
  'PRE: 一括 GRANT EXECUTE ON ALL FUNCTIONS が適用済み（anon が EXECUTE を持つアプリ関数が存在する）＝'
  || '以降の「anon は持たない」は REVOKE 再適用の結果であって GRANT 未実施の空振りではない'
);

-- ───────────────────────────────────────────────────────────────────────────
-- 1. 前提の健全性: 対象 4 関数が REVOKE 行どおりのシグネチャで実在すること
--    （リネーム・引数変更で has_function_privilege が別関数を見る／落ちるのを防ぐ）
-- ───────────────────────────────────────────────────────────────────────────
SELECT has_function('public', 'get_dormant_users', ARRAY['integer', 'integer', 'integer'],
  'PRE: public.get_dormant_users(integer, integer, integer) が存在する');
SELECT has_function('public', 'record_lifecycle_email', ARRAY['text', 'uuid', 'uuid', 'boolean'],
  'PRE: public.record_lifecycle_email(text, uuid, uuid, boolean) が存在する');
SELECT has_function('public', 'get_push_subscriptions_for_user', ARRAY['uuid'],
  'PRE: public.get_push_subscriptions_for_user(uuid) が存在する');
SELECT has_function('public', 'detect_ai_anomalies', ARRAY['integer', 'integer', 'numeric', 'integer', 'integer'],
  'PRE: public.detect_ai_anomalies(integer, integer, numeric, integer, integer) が存在する');

-- ───────────────────────────────────────────────────────────────────────────
-- 2. FR-298-06 本体: anon は 4 本いずれにも EXECUTE を持たない
--    （REVOKE 行を消すと一括 GRANT が残るのでここが落ちる＝AC-05）
-- ───────────────────────────────────────────────────────────────────────────
SELECT ok(
  NOT has_function_privilege('anon', 'public.get_dormant_users(integer, integer, integer)', 'EXECUTE'),
  'FR-298-06: anon は get_dormant_users に EXECUTE を持たない（休眠ユーザ一覧＝メール宛先の流出防止）'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.record_lifecycle_email(text, uuid, uuid, boolean)', 'EXECUTE'),
  'FR-298-06: anon は record_lifecycle_email に EXECUTE を持たない（送信記録の偽造・研究採用通知の書き換え防止）'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.get_push_subscriptions_for_user(uuid)', 'EXECUTE'),
  'FR-298-06: anon は get_push_subscriptions_for_user に EXECUTE を持たない（Push 購読の endpoint/鍵の流出防止）'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.detect_ai_anomalies(integer, integer, numeric, integer, integer)', 'EXECUTE'),
  'FR-298-06: anon は detect_ai_anomalies に EXECUTE を持たない（AI 運用メトリクスの外部露出防止）'
);

-- ───────────────────────────────────────────────────────────────────────────
-- 3. authenticated: schema.sql の REVOKE 行に忠実に期待値を変える（一律に書かない）
--      FROM anon, authenticated → 実行不可（3 本）
--      FROM anon のみ ＋ GRANT TO authenticated → 実行可（detect_ai_anomalies のみ。
--      REQ-241 で本体先頭の _kpi_assert_admin が admin か否かを判定する設計のため GRANT は残す）
-- ───────────────────────────────────────────────────────────────────────────
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.get_dormant_users(integer, integer, integer)', 'EXECUTE'),
  'schema.sql:3336 準拠: authenticated も get_dormant_users を実行できない（service_role 専用）'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.record_lifecycle_email(text, uuid, uuid, boolean)', 'EXECUTE'),
  'schema.sql:3432 準拠: authenticated も record_lifecycle_email を実行できない（service_role 専用）'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.get_push_subscriptions_for_user(uuid)', 'EXECUTE'),
  'schema.sql:3489 準拠: authenticated も get_push_subscriptions_for_user を実行できない（他人の購読を引ける口を塞ぐ）'
);
SELECT ok(
  has_function_privilege('authenticated', 'public.detect_ai_anomalies(integer, integer, numeric, integer, integer)', 'EXECUTE'),
  'schema.sql:3658 準拠: detect_ai_anomalies は authenticated へ GRANT のまま（REQ-241 の admin ゲートで判定する設計を壊さない）'
);

-- ───────────────────────────────────────────────────────────────────────────
-- 4. 過剰 REVOKE 防止（対偶）: service_role は 4 本すべて EXECUTE を保持
--    REVOKE 対象を PUBLIC / service_role まで広げると Edge Function（cron / 通知送信）が
--    動かなくなる。ここが落ちたら「閉めすぎ」の合図。
-- ───────────────────────────────────────────────────────────────────────────
SELECT ok(
  has_function_privilege('service_role', 'public.get_dormant_users(integer, integer, integer)', 'EXECUTE'),
  'GUARD: service_role は get_dormant_users を実行可（休眠再訪メールの cron 経路を壊さない）'
);
SELECT ok(
  has_function_privilege('service_role', 'public.record_lifecycle_email(text, uuid, uuid, boolean)', 'EXECUTE'),
  'GUARD: service_role は record_lifecycle_email を実行可（送信記録の冪等書き込み経路を壊さない）'
);
SELECT ok(
  has_function_privilege('service_role', 'public.get_push_subscriptions_for_user(uuid)', 'EXECUTE'),
  'GUARD: service_role は get_push_subscriptions_for_user を実行可（Push 送信経路を壊さない）'
);
SELECT ok(
  has_function_privilege('service_role', 'public.detect_ai_anomalies(integer, integer, numeric, integer, integer)', 'EXECUTE'),
  'GUARD: service_role は detect_ai_anomalies を実行可（notify-ai-anomaly の cron 経路を壊さない）'
);

-- ───────────────────────────────────────────────────────────────────────────
-- 5. 実挙動: anon ロールでの呼び出しが 42501 insufficient_privilege になる
--    カタログ上の権限だけでなく、実際に PostgREST 相当の経路で弾かれることを確認する。
--    EXECUTE 権限チェックは関数本体の評価より前に走るため、本体が参照するテーブル
--    （ai_call_logs など schema.sql に無いもの）の有無に影響されない。
-- ───────────────────────────────────────────────────────────────────────────
-- set_config を bare SELECT で書くと戻り値が TAP ストリームに混ざるため DO ブロックで呼ぶ。
DO $req298$ BEGIN PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true); END $req298$;
SET LOCAL ROLE anon;

SELECT throws_ok(
  $$ SELECT public.get_dormant_users() $$,
  '42501', NULL,
  'FR-298-06: anon から get_dormant_users を呼ぶと 42501（PostgREST 経由でも到達できない）'
);
SELECT throws_ok(
  $$ SELECT public.record_lifecycle_email('dormant_reengage', '00000000-0000-0000-0000-000000000000'::uuid) $$,
  '42501', NULL,
  'FR-298-06: anon から record_lifecycle_email を呼ぶと 42501（送信記録を注入できない）'
);
SELECT throws_ok(
  $$ SELECT public.get_push_subscriptions_for_user('00000000-0000-0000-0000-000000000000'::uuid) $$,
  '42501', NULL,
  'FR-298-06: anon から get_push_subscriptions_for_user を呼ぶと 42501（購読情報を引けない）'
);
SELECT throws_ok(
  $$ SELECT public.detect_ai_anomalies() $$,
  '42501', NULL,
  'FR-298-06: anon から detect_ai_anomalies を呼ぶと 42501（admin ゲート到達より前に権限で弾かれる）'
);

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
