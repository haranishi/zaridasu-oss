## 背景

ザリダス（卒業研究の市民科学 Web アプリ）は Next.js 15 + Supabase（Postgres / RLS / Auth / Storage）+ Vercel の構成で、ブラウザから anon（publishable）キーで Data API（PostgREST）を直接叩く「クライアント直結」アーキテクチャを採る。この構成では「本当の防御線はアプリのコードではなく DB 側」であり、防御は多層（defense in depth）で重ねる必要がある。

これまでの REQ で **行/列/トリガーの防御**は整備されてきた：

- REQ-025（RLS ポリシー整理）/ REQ-034・REQ-208（posts・survey_requests の列固定トリガー）で、所有者でも管理系カラムを改竄できない多層防御。
- REQ-179（`posts.reporter_ip` の列レベル REVOKE）で PII 列を一般ロールから保護。
- RLS は posts / reports / comments / likes / audit_logs / user_profiles / survey_requests / storage.objects / admin_login_attempts ほかで有効（`supabase/schema.sql` の `ENABLE ROW LEVEL SECURITY` 群＝後述）。

一方で、それらの「一段下」「一段外」にあたる **(A) Supabase プロジェクト設定（ダッシュボード側）**、**(B) スキーマ全体の GRANT / `search_path` / `security_invoker` の網羅点検**、**(C) Security Advisor（Splinter）を検知ゼロで恒常運用する仕組み** は、まだ体系化されていない。本 REQ-221 はこの 3 点に集中する設定・運用ハードニングであり、既存 REQ（行/列/トリガー）とは守るレイヤーが異なる（→「影響範囲」「注意・境界」で明記）。

本 REQ の下敷きは Obsidian Security_Research ノート群：
- `02_notes/Security_Research/09_Supabase_Security.md`（クライアント直結の脅威モデル、anon キーの位置づけ、Production checklist）
- `02_notes/Security_Research/11_Database_Hardening.md`（RLS の一段下＝ロール/GRANT 最小化、スキーマ設計で内部テーブルを隠す、`SECURITY DEFINER` の `search_path` 固定、TLS/IP 制限）
- `02_notes/Security_Research/26_Supabase_Authorization_Testing.md`（認可の否定テスト）
- `02_notes/Security_Research/runbooks/Supabase_RLS監査手順.md`（Security Advisor / Splinter の lint slug 一覧と読み方、SQL での裏取り手順）

なお Splinter lint slug（`0013_rls_disabled_in_public` ほか）の意味は上記 runbook のステップ 2 の対応表に準拠する。

## 現状の問題

（ファイルパス:行番号、または「設定不在の事実」つき）

### 1. スキーマに最小権限の土台（`REVOKE CREATE ON SCHEMA public` / `ALTER DEFAULT PRIVILEGES`）が無い

- `supabase/schema.sql` 全体に `REVOKE CREATE ON SCHEMA public FROM PUBLIC` は**存在しない**（`grep -n "REVOKE CREATE ON SCHEMA" supabase/schema.sql` がヒットなし。`supabase/migrations/` 全体でも 0 件）。
- `ALTER DEFAULT PRIVILEGES`（これから作る関数/テーブルの自動付与を止める設定）も schema.sql・migrations 全体で**存在しない**（`grep -rn "ALTER DEFAULT PRIVILEGES"` ヒットなし）。
- schema.sql 側の `GRANT`/`REVOKE` は **関数の `GRANT EXECUTE` と `admin_user_list` への `REVOKE SELECT`（`supabase/schema.sql:456-457`）に限られ**、テーブルへの明示 GRANT が無い。つまりテーブルの可触範囲は **Supabase が自動付与する既定 GRANT（anon/authenticated に広めの権限）まかせ**で、明示的に絞られていない。
- これは CI 構成からも裏付けられる：`.github/workflows/ci.yml:211-219` の rls-tests ジョブは schema.sql 適用後に **Supabase の既定 GRANT を手で再現**している：
  ```yaml
  psql -c "GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;"
  psql -c "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;"
  psql -c "GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA public TO anon;"
  ...
  ```
  schema.sql 自体にこれらの GRANT が無いため、「GRANT がオブジェクトを触れるか（whether）を決め、RLS がどの行か（what rows）を決める」という二層のうち、**whether 側が暗黙の既定まかせ**になっている。RLS が 1 枚抜けたとき GRANT で被害を止める、という多層防御が成立しにくい。
  > 注: 既定権限は PostgreSQL のバージョン・作成方法・アップグレード履歴で異なり、Supabase の自動 GRANT も構成で変わり得る（11_Database_Hardening 参照）。本番の実 DB で `\dp`/`information_schema.role_table_grants` により実権限を確認したうえで明示制御へ寄せる必要がある。

### 2. `SECURITY DEFINER` 関数のうち 2 つが `SET search_path` 未固定（Splinter `0011_function_search_path_mutable`）

- `supabase/schema.sql` の `SECURITY DEFINER` 関数は大半が `SET search_path = public` 付きだが（`grep -c "SECURITY DEFINER"` = 30 に対し近傍 `search_path` を満たすものが大半）、以下 2 関数は**末尾 `$$ LANGUAGE plpgsql SECURITY DEFINER;` の形で `SET search_path` が無い**：
  - `handle_new_user()` — `supabase/schema.sql:1115`（本体）, `:1134`（`$$ LANGUAGE plpgsql SECURITY DEFINER;`）。`auth.users` の INSERT トリガーで `public.user_profiles` に書き込む。migration 側も未固定：`supabase/migrations/20240101000000_initial_schema.sql:236`、`supabase/migrations/20260321000001_fix_new_user_trigger.sql:12`。
  - `check_survey_request_rate_limit()` — `supabase/schema.sql:1213`（本体）, `:1227`（`$$ LANGUAGE plpgsql SECURITY DEFINER;`）。`auth.users` と `survey_requests` を参照する INSERT 前トリガー。migration 側も未固定：`supabase/migrations/20260321000002_fix_survey_request_rate_limit.sql:9`。
- どちらも所有者権限（高権限）で動くのに `search_path` が固定されていないため、スキーマ解決を乗っ取られうる典型パターン（11_Database_Hardening「`SECURITY DEFINER` 関数は権限昇格の罠」）。実害は限定的だが、Security Advisor では `0011` として恒常的に警告され、本 REQ が目指す「Advisor 検知ゼロ」の妨げになる。
- 他の `SECURITY DEFINER` 関数（`set_post_reporter_ip`・`get_admin_user_list`・`delete_own_account` ほか）は `SET search_path = public` 済み（`schema.sql:134,468,1248` ほか）であり、本問題は**この 2 関数に局所化**している点を正直に記す。

### 3. `admin_user_list` ビューが `security_invoker` 未設定で `auth.users` を参照（Splinter `0010` / `0002` 候補、現状は REVOKE で緩和）

- `supabase/schema.sql:445` の `CREATE OR REPLACE VIEW public.admin_user_list AS ... FROM auth.users` は **`WITH (security_invoker = true)` が付いていない**（同ビュー定義に `security_invoker` の指定なし＝`grep -n "admin_user_list" schema.sql` 周辺で確認）。Postgres の既定でビューは**作成者（owner）権限**で土台テーブルを読むため、Splinter の `0010_security_definer_view` に該当し、かつ `auth.users` の `email` 等を公開スキーマのビューで参照しているため `0002_auth_users_exposed` の観点にも触れる。
- ただし `supabase/schema.sql:456-457` で `REVOKE SELECT ON public.admin_user_list FROM authenticated; / FROM anon;` 済みで、一般ロールは当該ビューを読めない（取得は `get_admin_user_list()`〔admin 判定付き SECURITY DEFINER, `schema.sql:460-482`〕経由のみ）。よって**実害は緩和済み**だが、Advisor は REVOKE の有無に関わらず `0010` を検出しうるため、(a) ビューにも `security_invoker = true` を明示して設計意図を一致させるか、(b) Advisor 側で意図的 acknowledge（理由付き）として運用するかを決める必要がある。
- 他の本番ビュー（`posts_public`・`survey_request_timeline`・`ai_call_logs_daily`）は `WITH (security_invoker = true)` 済み（`supabase/migrations/20240101000001_*.sql:82`、`20260425000005_*.sql:87`、`20260424000003_*.sql:51`）であり、`admin_user_list` のみ未設定である点を明記する。

### 4. Data API の Exposed schemas が最小化されておらず、内部テーブルも `public` に同居

- `supabase/config.toml` の `[api]` は `enabled = true` / `schemas = ["public", "graphql_public"]`。アプリが PostgREST で叩くテーブルは**すべて `public` に置かれ**（schema.sql の `CREATE TABLE` は計 13。posts/reports/comments/likes/audit_logs/user_profiles/badge_definitions/user_badges/survey_requests/admin_login_attempts/experiments/experiment_assignments/survey_sites 等が public）、外部公開する必要のないテーブル（例: `audit_logs`・`admin_login_attempts`・`experiment_assignments`・`ai_call_logs` 系）も Data API の到達範囲に同居している。RLS で守られてはいるが、「内部テーブルはスキーマ設計で API から隠す」（11_Database_Hardening）という一段外の防御が効いていない。
- `private` スキーマの概念は一部存在する（`supabase/migrations/20260421000001_ai_analysis_webhooks.sql:18` に `grant usage on schema private to postgres, service_role;`）が、Exposed schemas の体系的な最小化や「内部テーブルを `private` 等へ寄せる／不要なら Data API 無効化」という方針は未整理。

### 5. プロジェクト設定（ダッシュボード）の本番チェックがコードで追跡されていない

以下は IaC（config.toml）やコードに現れない**ダッシュボード側の設定**で、本番値が未確認/未強制（＝設定不在の事実）：

- **SSL Enforcement（Enforce SSL on incoming connections）**: 平文接続の拒否。config.toml はローカル開発用で本番強制を表さない。本番値は要確認(推測: 既定では未強制)。
- **Network Restrictions（DB 直接接続元の IP 制限）**: Postgres への直接接続を許可 IP に限定する設定。設定の有無は要確認。
- **アカウント / 組織の MFA**: `supabase/config.toml` に MFA 関連の記述は**無い**（`grep -i "mfa\|totp" config.toml` ヒットなし）。これはダッシュボード側のアカウント設定であり config では制御できない。Owner が単一だと退会/ロックアウト時に詰む点も含め、要点検。
- **PITR / バックアップ**: バックアップ運用は REQ-217（バックアップ/BCP, `docs/requirements/REQ-217-backup-bcp.md` 確認済み）が主管。本 REQ では「ハードニング点検項目として PITR 有効・復元テスト済みを参照する」にとどめ、詳細は REQ-217 と相互参照する（重複させない）。
- **SMTP（本番メール）**: `supabase/config.toml` で `[auth.email.smtp]` がコメントアウト（同ファイルの該当ブロック）であり、本番 SMTP は別途設定前提。メール認証（SPF/DKIM/DMARC）は REQ-219 が主管のため、本 REQ では「Auth 設定の点検項目として SMTP 構成済みを確認」に留め相互参照する。

### 6. Security Advisor（Splinter）を恒常的に回す仕組みが無い（CI/リリース条件化されていない）

- リポジトリ全体で Splinter / Security Advisor / `supabase db lint` への参照は**コード/CI に無い**（`grep -rn "splinter\|security advisor\|db lint" .github/ package.json scripts/` ヒットなし。`docs/requirements/REQ-210-*.md` で言及があるのみ）。
- CI（`.github/workflows/ci.yml`）には pg-tap による RLS/トリガー直接テスト（`ci.yml:148-216`、`pg_prove --ext .sql supabase/tests/`）はあるが、これは**個別 RLS の振る舞い検証**であり、Splinter の網羅 lint（`0013`/`0011`/`0010`/`0002`/`0007`/`0008` 等の検知ゼロ）を担保するものではない。
- 結果、上記 2〜4 のような Advisor 警告がリリース前に機械的に止められない。Advisor 検知ゼロをリリース/CI 条件にする案は REQ-180（CI 品質ゲート, `docs/requirements/REQ-180-ci-quality-gates.md`）/ REQ-210（CI: 依存監査・SAST・secret scanning）と**連携**して実現する（本 REQ はチェック項目と運用を定義し、ゲート実装は CI 系 REQ 側で受ける＝重複ではなく接続）。
