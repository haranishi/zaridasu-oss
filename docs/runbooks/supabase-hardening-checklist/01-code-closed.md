## A. コードで既に閉じた分（確認のみ・再掲）

以下は REQ-221 で schema.sql / migration / config.toml に取り込み済み。リリースごとに作業する必要はないが、Security Advisor の結果と突き合わせるため何を閉じたかを把握しておく。

| 項目 | 何をしたか | 反映先 |
|---|---|---|
| 最小権限の土台 | `REVOKE CREATE ON SCHEMA public FROM PUBLIC;` ＋ `ALTER DEFAULT PRIVILEGES ... REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;` ＋ 既存関数の PUBLIC EXECUTE 剥奪 | `supabase/schema.sql`（冒頭「0. 最小権限の土台」）/ `supabase/migrations/20260616000001_supabase_hardening.sql` |
| `search_path` 全数固定 | `handle_new_user()` / `check_survey_request_rate_limit()` に `SET search_path = public, pg_temp`（Splinter `0011` 解消） | 同上。他の `SECURITY DEFINER` 関数は固定済み |
| ビュー invoker 統一 | `admin_user_list` を `security_invoker = true`（Splinter `0010`）。`auth.users` 由来列は REVOKE ＋ `get_admin_user_list()` 経由限定を維持 | 同上 |
| ★権限昇格バグ修正 | `set_user_admin_role`：`IF caller_role != 'admin'` → `IF caller_role IS DISTINCT FROM 'admin'`（NULL caller_role の取りこぼしを修正） | 同上。回帰テスト `supabase/tests/rls_set_user_admin_role.sql`（INV-01/INV-02） |
| Exposed schemas 最小化（低リスク分） | `config.toml [api] schemas` を `["public"]` に（未使用の `graphql_public` を除外） | `supabase/config.toml` |
| ★内部テーブルの不要 GRANT 剥奪（明確に安全な分のみ） | フロントが `.from()` しない内部専用テーブル/ビュー **4 件**から anon/authenticated の全 GRANT を REVOKE（多層防御）。対象: `admin_login_attempts`（RLS 有効・ポリシー0・DEFINER 関数経由のみ）/ `geo_cache`・`lifecycle_email_log`・`user_last_active`（service_role / DEFINER のみ。schema.sql で REVOKE 済みの意図を live DB に確定）。**判定基準と「runbook に残した分」は下記 C-3 を参照** | `supabase/schema.sql`（`admin_login_attempts` の REVOKE を追加。他 3 件は既存）/ `supabase/migrations/20260616000004_grant_hardening.sql`（live DB で確定。冪等）/ 回帰テスト `supabase/tests/grant_hardening_internal_tables.sql`（20 アサーション） |

> **新規 `SECURITY DEFINER` 関数を追加するときのレビュー観点**: 必ず `SET search_path = public, pg_temp`（または `= ''` + 完全修飾）を付ける。付け忘れは Splinter `0011` で恒常警告になる。
> **新規ビューを追加するときのレビュー観点**: `auth` スキーマ等を参照するビューは `WITH (security_invoker = true)` を付ける（Splinter `0010`）。

### A-1. コード反映の検証（ローカル/CI）

```bash
# schema.sql と型の同期
npm run schema:check

# pgTAP（CI rls-tests と同等。set_user_admin_role の INV-01..05 が全て ok になること）
#   ローカルに pg_prove がある場合:
#   supabase test db
#   または CI（.github/workflows/ci.yml の rls-tests ジョブ）の結果を確認する
```

✅ 合格基準: `schema:check` OK / `rls_set_user_admin_role.sql` が 5/5 ok（INV-01・INV-02 が TODO ではなく ok）/ `grant_hardening_internal_tables.sql` が 20/20 ok（内部テーブル 4 件が anon/authenticated 不可・ユーザー向けテーブルは不変）。

---
