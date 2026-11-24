## 受入基準

- **AC-01（pgTAP: anon から実行不可）**: `supabase/tests/` に新規 pgTAP を追加し、`anon` ロールで以下が権限エラーになることを assert する。
  ```sql
  SET LOCAL ROLE anon;
  SELECT throws_ok(
    $$ SELECT public.admin_login_record('victim@example.com', true) $$,
    '42501',  -- insufficient_privilege
    NULL,
    'anon から admin_login_record は実行できない'
  );
  SELECT throws_ok(
    $$ SELECT public.check_email_exists('victim@example.com') $$,
    '42501', NULL,
    'anon から check_email_exists は実行できない'
  );
  ```
  併せて `has_function_privilege('anon', 'public.admin_login_record(text, boolean)', 'EXECUTE')` が **false** であることを assert する（GRANT の有無を直接検査し、将来の `db reset` で既定 GRANT が復活しても検知できるようにする）。
- **AC-02（audit_logs への注入経路が閉じている）**: `anon` として `admin_login_record` を呼べないため `audit_logs` の行数が増えないことを pgTAP で確認する（呼び出し前後の `count(*)` 一致、または AC-01 の throws で到達しないこと）。
- **AC-03（ロックが実際に機能する）**: FR-292-01 (a) を選んだ場合、`/auth/v1/token` を直接 5 回失敗させた後に 6 回目がロックされる（またはサーバー側の記録が 5 件残る）ことを実測で確認する。(b) を選んだ場合は、代替のブルートフォース対策が何によって担保されるかを本要件に追記し、その動作を確認する。
- **AC-04（管理者ログインの正常系）**: 正しい資格情報で `/admin` にログインできる。`audit_logs` に `login_success` が `admin_id` 非 NULL で 1 件記録される。失敗時は `login_failed` が記録される。
- **AC-05（サインアップの正常系）**: 未登録メールでサインアップでき、**登録済みメールでは重複が検知されてユーザーに伝わる**（FR-292-05 (a) なら `signUp` 後の `identities` 空判定経由）。
- **AC-06（GRANT の実測）**: 本番相当の DB で `SELECT has_function_privilege('anon', p.oid, 'EXECUTE') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('admin_login_record','admin_login_check','check_email_exists');` が対象について false を返す。
- **AC-07（drift なし）**: `npm run schema:check` がパスし、`supabase/schema.sql` と migration の内容が一致する。
- **AC-08**: `lint` / `type-check` / 既存 652 テストがパスする。既存 pgTAP（`rls_audit_logs.sql` 等）もパスする。
- **AC-09（i18n）**: フロントの文言を追加・変更した場合、追加した i18n キーが **ja / en / ko / zh の 4 言語すべてに存在し `npm run i18n:check` がパスする**（FR-292-05 (a) は既存キー `auth.errors.alreadyRegistered` の再利用で済む見込みだが、エラー表示の分岐を変える場合は新キーが必要になりうる）。
