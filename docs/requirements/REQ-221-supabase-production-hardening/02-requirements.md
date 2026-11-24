## 要件

### 機能要件

- [ ] FR-221-01: **最小権限の土台をコードで明示する。** `supabase/schema.sql`（本番正本）に、`public` スキーマの不要権限を閉じる設定を追加する：
  ```sql
  REVOKE CREATE ON SCHEMA public FROM PUBLIC;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
  ```
  あわせて、現状 CI（`ci.yml:211-219`）が手で再現している anon/authenticated/service_role へのテーブル GRANT を、**テーブルごとの明示 GRANT として schema.sql 側に持つか**を判断する。最低限、(a) `audit_logs`・`admin_login_attempts`・`experiment_assignments` 等の内部テーブルに対し anon/authenticated への不要な GRANT を与えない方針を確定し、(b) 本番実 DB の実権限（`information_schema.role_table_grants`）を点検した結果を記録する。**適用前に必ずステージング/CI で全 RLS テスト（`pg_prove`）と E2E が回帰しないことを確認**する（既定 GRANT に依存している箇所を壊さないため）。

- [ ] FR-221-02: **`SECURITY DEFINER` 関数の `search_path` を全数固定する。** 未固定の 2 関数を新規 migration（連番 `2026MMDD0000NN_*.sql`、直近は `supabase/migrations/20260603000006_seed_experiments.sql`）と `supabase/schema.sql` の両方で `SET search_path = public`（または `= ''` + 完全修飾）に揃える：
  - `handle_new_user()`（`schema.sql:1115/1134`）
  - `check_survey_request_rate_limit()`（`schema.sql:1213/1227`）
  `CREATE OR REPLACE FUNCTION ... LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ ... $$;` の形にし、migration と schema.sql のドリフトを作らない。他の `SECURITY DEFINER` 関数は固定済みである旨を本 REQ に明記し、回帰防止のため「新規 `SECURITY DEFINER` 関数は `SET search_path` 必須」をレビュー観点に追加する。

- [ ] FR-221-03: **ビューの `security_invoker` を統一する。** `admin_user_list`（`schema.sql:445`）に `WITH (security_invoker = true)`（または `ALTER VIEW ... SET (security_invoker = true)`）を付与し、他ビュー（`posts_public`・`survey_request_timeline`・`ai_call_logs_daily`）と設計を揃える。`auth.users` 由来列の露出は引き続き `REVOKE SELECT ... FROM anon, authenticated`（`schema.sql:456-457`）＋ `get_admin_user_list()` 経由に限定する方針を維持・明記する。Advisor が `0010`/`0002` を意図的 acknowledge とする場合は、その理由（REVOKE 済み・関数経由限定）をコメント/ADR に残す。

- [ ] FR-221-04: **Exposed schemas を最小化する方針を決める。** `supabase/config.toml` の `[api] schemas`（現状 `["public", "graphql_public"]`）について、(a) 外部公開不要の内部テーブル（`audit_logs`・`admin_login_attempts`・`ai_call_logs` 系・`experiment_assignments` 等）を `private`（既に一部利用＝`20260421000001_*.sql:18`）など非公開スキーマへ寄せる案、または (b) 当該テーブルへの anon/authenticated GRANT を確実に外し Data API から実質到達不能にする案、のいずれかを選び、移行コスト（既存クエリ・RLS テスト・型生成 `supabase gen types`）と合わせて記録する。アプリが直接 `from('...')` する公開テーブルは `public` のまま維持する。**本 FR は方針決定＋低リスク分の実施**とし、大規模なスキーマ移設は別 REQ に切り出してよい（卒研 PF として現実的に）。

- [ ] FR-221-05: **ダッシュボード側プロジェクト設定のチェックリストを定義し、本番値を点検・記録する。** 少なくとも以下を項目化し、現状値と是正後の値を残す（設定は IaC 化できないため運用チェックリストとして本 REQ もしくは runbook に保持）：
  - SSL Enforcement（Enforce SSL on incoming connections）= 有効
  - Network Restrictions（DB 直接接続の許可 IP）= 必要範囲に限定（Vercel/管理者からの接続要件と整合）
  - Exposed schemas（Data API）= FR-221-04 の決定と一致／不要なら Data API 無効化を検討
  - アカウント/組織 MFA = 有効、かつ Owner を複数（ロックアウト対策）
  - PITR/バックアップ = 有効・復元テスト済み（**詳細は REQ-217 と相互参照、本 REQ では参照確認のみ**）
  - 本番 SMTP = 設定済み（**メール到達性 SPF/DKIM/DMARC は REQ-219 と相互参照**）

- [ ] FR-221-06: **Security Advisor（Splinter）検知ゼロを恒常運用に乗せる。** `02_notes/Security_Research/runbooks/Supabase_RLS監査手順.md` の手順（Advisors → Security Advisor を Rerun → lint slug を意味で読む → SQL で裏取り）を本 REQ のチェックリストとして取り込み、**リリース前に SECURITY カテゴリの ERROR/WARN が 0 件であること**をリリース条件として明文化する。点検対象 slug は最低限 `0013_rls_disabled_in_public` / `0007_policy_exists_rls_disabled` / `0008_rls_enabled_no_policy` / `0010_security_definer_view` / `0011_function_search_path_mutable` / `0002_auth_users_exposed`（+ 余裕があれば `0014_extension_in_public`）。意図的に残す警告がある場合は「理由・対象・判断者・再評価期日」を記録する acknowledge 運用を定める。

- [ ] FR-221-07: **Advisor 検知ゼロを CI ゲートに接続する（実装は CI 系 REQ 側）。** 可能なら `supabase db lint`（または Splinter 相当）を CI で実行し SECURITY 重大度の検出で fail させる案を REQ-180（CI 品質ゲート）/ REQ-210（CI 監査）に連携項目として渡す。本 REQ では「何を/どの重大度で落とすか（合格基準）」を定義し、ゲートのジョブ実装そのものは CI 系 REQ で受ける（重複回避）。CLI での自動 lint が現実的でない場合は、リリースチェックリスト上の手動 Advisor 確認を必須ステップとして残す。

### 非機能要件（該当する場合のみ）

- [ ] NFR-221-01: **回帰ゼロ。** FR-221-01〜03 の DB 変更後、`npm run schema:check`（`package.json:24`、schema/型同期）と CI の rls-tests（`ci.yml:148-216`、`pg_prove`）・既存 E2E が全て green であること。GRANT の明示化で anon/authenticated が必要な公開テーブルにアクセスできなくなる回帰が無いこと（CI の手動 GRANT 〔`ci.yml:211-219`〕と本番方針の整合を取る）。
- [ ] NFR-221-02: **冪等性・ドリフト防止。** 追加する SQL は冪等（`CREATE OR REPLACE` / `ALTER VIEW ... SET` / `REVOKE`〔再実行可〕）で、schema.sql と migration の定義を一致させること（過去 migration は改変しない。新規連番で追補）。
- [ ] NFR-221-03: **再現性のある点検手順。** ダッシュボード設定・Advisor 確認は runbook 化し、誰が見ても同じ手順で「合格/不合格」を判定できること（`runbooks/Supabase_RLS監査手順.md` の様式を踏襲、項目チェック表を併設）。
- [ ] NFR-221-04: **秘密値を残さない。** project ref・DB パスワード・service_role キー・許可 IP の生値はドキュメントに書かず、設定場所（ダッシュボードのパス）と「設定済みか」のみを記録すること。
