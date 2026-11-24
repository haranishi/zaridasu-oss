## C. Security Advisor（Splinter）を検知ゼロで恒常運用する

> 詳細な SQL 裏取り（RLS 未有効テーブル列挙・緩ポリシー抽出・ビュー invoker 確認・公開スキーマ確認）は Obsidian `runbooks/Supabase_RLS監査手順.md` のステップ 3 を使う（本書はリリース運用の観点に絞る）。

### C-1. Advisor を Rerun して SECURITY 警告を読む

1. Dashboard → **Advisors → Security Advisor**（経路は **要確認**。旧 Database → Advisors の場合あり）を開く。
2. **Rerun / Refresh** を押して最新化（直前の修正を反映するため必須。押し忘れると古い警告が残って見える）。
3. SECURITY カテゴリの ERROR / WARN を下表の slug で意味として読む。

| 重大度 | lint slug | 意味 | ザリダスでの状態 / 対応 |
|---|---|---|---|
| 🔴 | `0013_rls_disabled_in_public` | public テーブルで RLS 無効 = grant 次第で anon 全行可 | 既存 REQ で全テーブル RLS 有効。新テーブル追加時は必ず ENABLE + ポリシー |
| 🟠 | `0007_policy_exists_rls_disabled` | ポリシーはあるが RLS 無効 = 素通り | 同上。0 件を維持 |
| 🟡 | `0008_rls_enabled_no_policy` | RLS 有効だがポリシー 0 = API は何も返さない（安全側） | RLS 有効+ポリシー無しの内部テーブルは `SECURITY DEFINER` 関数経由設計（意図的）。意図的なら acknowledge |
| 🟡 | `0010_security_definer_view` | ビューが定義者権限で土台 RLS を迂回し得る | REQ-221 で `admin_user_list` を `security_invoker=true` 化。他ビューも済み |
| 🟡 | `0011_function_search_path_mutable` | 関数の search_path 未固定 | REQ-221 で全 `SECURITY DEFINER` 関数を固定 |
| 🟢 | `0002_auth_users_exposed` | `auth.users`（email 等）を公開スキーマで anon に露出 | `admin_user_list` は REVOKE + 関数経由限定。anon/authenticated は読めない。下記 acknowledge 参照 |
| 🟢 | `0014_extension_in_public` | 拡張が public に同居（衛生面） | 余裕があれば専用スキーマへ（任意） |

### C-2. acknowledge（意図的に残す警告）の運用

検知ゼロが理想だが、設計上意図的に残す警告は **理由・対象・判断者・再評価期日** を記録して acknowledge する（下表）。Advisor 上で acknowledge / mute できる場合はその機能も使う（経路は **要確認**）。

| slug | 対象 | 残す理由 | 判断者 | 再評価期日 |
|---|---|---|---|---|
| `0002_auth_users_exposed` / `0010`（残存する場合） | `public.admin_user_list` | `security_invoker=true` 化済み。さらに `REVOKE SELECT FROM anon, authenticated` で一般ロールは直接読めず、取得は admin 判定付き `get_admin_user_list()` 経由限定。Advisor は REVOKE/invoker 後も `auth.users` 参照を機械検知し得るため、実害無しと判断して acknowledge | （記入） | （例: 次回リリース時に再確認） |
| `0008_rls_enabled_no_policy` | RLS 有効・ポリシー無しの内部テーブル | API から何も返さない安全側。アクセスは `SECURITY DEFINER` 関数（admin 判定付き）経由に限定する設計 | （記入） | （記入） |

### C-3. テーブル GRANT の点検（migration 化した分 / 手動に残した分）

REQ-221 の残作業で、内部テーブルへの anon/authenticated 不要 GRANT のうち **「明確に安全な分のみ」をコード（migration）化** した。残りは安全確証が持てないため、引き続き本手順の手動点検に残す。

判定基準（コード化の前提・すべて満たす場合のみ migration 対象）:
1. フロントが `.from('<table>')` で直接クエリしない（`src/` 全体を grep で確認）。
2. アクセス経路が service_role（Edge Function）/ SECURITY DEFINER 関数 / トリガーのみ（これらは GRANT を跨ぐ）。
3. authenticated に**直接アクセスを許す RLS ポリシーが無い**（既定 GRANT が無くてもアプリの正規経路に無影響）。

#### C-3-(a) すでに migration 化した分（確認のみ・再掲）

`supabase/migrations/20260616000004_grant_hardening.sql` で以下を `REVOKE ALL ... FROM anon, authenticated`（冪等）。schema.sql にも正本反映済み。回帰テスト `supabase/tests/grant_hardening_internal_tables.sql`（anon/authenticated 不可 + ユーザー向けテーブル不変を 20 アサーションで検証）。

| 対象 | 種別 | 安全根拠（フロント非アクセス） |
|---|---|---|
| `admin_login_attempts` | table | `src/` に `.from()` 無し（唯一の出現は `AdminLoginPage.tsx` の **localStorage キー定数**でテーブル参照ではない）。RLS 有効・**ポリシー 0 件**。アクセスは `admin_login_check` / `admin_login_record`（SECURITY DEFINER）のみ |
| `geo_cache` | table | `src/` に `.from()` 無し。アクセスは Edge `enrich-place`（`SUPABASE_SERVICE_ROLE_KEY` = service_role / BYPASSRLS）のみ。RLS 有効・ポリシー 0 件 |
| `lifecycle_email_log` | table | `src/` に参照無し。書込みは `record_lifecycle_email` 等（DEFINER・EXECUTE は anon/authenticated から REVOKE 済み）、読取りは `notify-*` Edge（service_role）。RLS 有効・ポリシー 0 件 |
| `user_last_active` | view | `src/` に参照無し。`get_dormant_users` 等（DEFINER）/ `notify-dormant-reengage` Edge（service_role）のみ。`auth.users` 参照を含むため直接公開しない |

> 注: `geo_cache` / `lifecycle_email_log` / `user_last_active` は schema.sql で以前から `REVOKE ALL` 済みだが、**Supabase 既定 GRANT（プロジェクト作成時に付与）は schema/migration の後に効く**ため、schema.sql 内の REVOKE だけでは live DB に効かない。migration（既定 GRANT の後に適用）で再 REVOKE して初めて live DB 上で確定する。Docker 検証で「既定 GRANT 一括付与の後に本 REVOKE → 対象 4 件は anon/authenticated 権限ゼロ・ユーザー向けテーブルは不変」を確認済み。

#### C-3-(b) 安全のため手動点検に残した分（migration には入れない）

以下は内部テーブルだが、**authenticated に直接アクセスを許す RLS ポリシーがある／フロントが直接 `.from()` する**ため、REVOKE すると機能停止リスクがある。コード化せず、本番で実害が無いことを個別確認したうえで判断する。

| 対象 | 残す理由（少しでも疑いがあれば触らない） |
|---|---|
| `audit_logs` | フロントが `supabase.from('audit_logs').insert()`（`src/lib/auditLog.ts`）。admin の authenticated INSERT/SELECT ポリシーあり。**触らない** |
| `ai_call_logs` | フロントが `supabase.from('ai_call_logs').select()`（`src/hooks/useGeminiAuthBanner.ts`）。admin SELECT ポリシーあり。**触らない** |
| `admin_alerts` | 現状フロント直アクセスは無いが admin SELECT ポリシー（authenticated）あり。将来 admin UI が直読みし得るため保留 |
| `experiments` / `experiment_assignments` | 現状フロントは RPC（`get_experiment_metrics` / `get_my_experiment_variants`）経由のみだが、`admin_all_*` / `own_select_assignments` の authenticated ポリシーが**意図的に存在**。直アクセス再開の余地があるため保留 |

本番 SQL Editor で実権限を点検する（**読み取り専用**）。(a) の 4 件は anon/authenticated が 0 行になっていること、(b) の各テーブルは想定どおりの権限のみであることを確認する。

```sql
-- (a) migration 化済み 4 件: anon/authenticated 行が 0 件であるべき
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon','authenticated')
  and table_name in ('admin_login_attempts','geo_cache','lifecycle_email_log','user_last_active')
order by table_name, grantee, privilege_type;

-- (b) 手動保留分: 直アクセスポリシーがあるため現状維持。意図どおりの権限かを目視確認
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon','authenticated')
  and table_name in ('audit_logs','ai_call_logs','ai_call_logs_daily',
                     'admin_alerts','experiments','experiment_assignments')
order by table_name, grantee, privilege_type;
```

> (b) の REVOKE を将来検討する場合は、RLS ポリシーの依存を外す（または RPC 経由に寄せる）改修とセットで**別 REQ に切り出し**、ステージング/CI で RLS テスト＋E2E を通してから本番適用する（既定 GRANT 依存箇所を壊さないため）。

### C-4. anon キーでの実地確認（任意・読み取りのみ・自プロジェクト）

塞いだはずのテーブルが anon キーで空/拒否になるかを GET のみで確認できる（手順・例は Obsidian `Supabase_RLS監査手順.md` ステップ 6-3）。副作用なし。**キーの生値は本書に書かない。**

### C-5. リリース判定への接続（FR-221-07・合格基準のみ）

- **リリース条件**: リリース前に Security Advisor を Rerun し、**SECURITY カテゴリの ERROR / WARN が 0 件**（または C-2 の acknowledge 記録がある）こと。
- **CI ゲート化の合格基準（実装は REQ-180 / REQ-210 側）**: `supabase db lint`（または Splinter 相当）を CI で実行し、**SECURITY 重大度（ERROR/WARN）を検出したら fail**。CLI 自動 lint が現実的でない場合は、本チェックリストの手動 Advisor 確認をリリース必須ステップとして残す。
  - 連携先に渡す情報: 落とす対象 slug = `0013 / 0007 / 0008 / 0010 / 0011 / 0002`（+ 任意で `0014`）、落とす重大度 = ERROR/WARN、acknowledge 済みは除外可。

---
