## 受入条件

- [ ] AC-01: `supabase/schema.sql` に `REVOKE CREATE ON SCHEMA public FROM PUBLIC;` と `ALTER DEFAULT PRIVILEGES ... REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;` が含まれ、内部テーブルへの anon/authenticated の不要 GRANT が排除/明示化されている（実 DB 権限の点検結果が記録されている）。
- [ ] AC-02: `handle_new_user()` と `check_survey_request_rate_limit()` が schema.sql・migration の両方で `SET search_path` を持ち、`SECURITY DEFINER` 関数で `search_path` 未固定のものが**ゼロ**である（`grep` で `SECURITY DEFINER` 件数 ≦ `search_path` 件数を確認、または個別確認）。
- [ ] AC-03: `admin_user_list` ビューが `security_invoker = true` になっている（または Advisor `0010`/`0002` を理由付きで acknowledge した記録がある）。`auth.users` 由来列は一般ロールから読めないまま（`REVOKE` 維持）である。
- [ ] AC-04: Data API の Exposed schemas 最小化方針が決定・記録され、低リスク分が適用されている。アプリが直接参照する公開テーブルは従来どおり機能する（E2E 回帰なし）。
- [ ] AC-05: SSL Enforcement / Network Restrictions / アカウント・組織 MFA（Owner 複数）/ PITR の各本番値がチェックリスト上で「合格」と記録されている（PITR は REQ-217 参照、SMTP/メール到達性は REQ-219 参照で交差確認）。
- [ ] AC-06: Security Advisor を Rerun した結果、SECURITY カテゴリの ERROR/WARN が **0 件**（または各警告に acknowledge 記録がある）。点検対象 slug（`0013/0007/0008/0010/0011/0002`）の現状が記録されている。
- [ ] AC-07: 「Advisor 検知ゼロ」がリリースチェック項目として文書化され、CI ゲート化の合格基準が REQ-180/REQ-210 に連携項目として渡されている。
- [ ] AC-08: `npm run schema:check` と CI（rls-tests・E2E）が green。schema.sql と migration の間に本 REQ 由来のドリフトが無い。

## 影響範囲

**本 REQ が担う範囲（設定・運用ハードニング）:**
- `supabase/schema.sql`（`REVOKE CREATE ON SCHEMA public` / `ALTER DEFAULT PRIVILEGES` / 2 関数の `search_path` 固定 / `admin_user_list` の `security_invoker` / 必要なら明示 GRANT）
- `supabase/migrations/`（上記の新規連番 migration。過去 migration は改変しない）
- `supabase/config.toml`（`[api] schemas` の最小化方針反映、必要に応じて `[auth]` の点検）
- ダッシュボード側設定（SSL Enforcement / Network Restrictions / MFA / Exposed schemas / PITR）= IaC 化不可のためチェックリスト/runbook で管理
- `.github/workflows/ci.yml`（FR-221-07 の合格基準を満たす Advisor/lint ゲートは REQ-180/REQ-210 側で実装。本 REQ では基準定義のみ）

**本 REQ が担わない範囲（既存 REQ との境界＝重複回避）:**
- 行/列/トリガーの防御は REQ-025（RLS 整理）/ REQ-034・REQ-208（posts・survey_requests 列保護トリガー）/ REQ-179（reporter_ip 列 REVOKE）が担当。本 REQ はそれらを前提とし、**個別ポリシーの中身は変更しない**（GRANT/設定/Advisor 運用の網羅に集中）。
- バックアップ/PITR の詳細運用は REQ-217、メール認証（SPF/DKIM/DMARC）は REQ-219、CI ゲートのジョブ実装は REQ-180/REQ-210 が主管（本 REQ は相互参照・基準提供にとどめる）。

**他機能への影響リスク:**
- GRANT 明示化・Exposed schemas 最小化は、anon/authenticated が依存する公開テーブルのアクセスを誤って絞ると投稿一覧/地図/詳細などが機能停止しうる。必ずステージング/CI で RLS テスト＋E2E を通してから本番適用する。
- `search_path` 固定・`security_invoker` 付与は挙動変更が小さいが、`handle_new_user`（新規登録トリガー）は OAuth サインアップ経路に関わるため、適用後にサインアップ E2E を確認する。

## 優先度

- **緊急度**: Medium / **重要度**: High
- **理由**: 個々の問題（`search_path` 未固定 2 件、`admin_user_list` の `security_invoker` 未設定）は REVOKE 等で実害が緩和されており単体の深刻度は中程度。しかしクライアント直結アーキテクチャでは「設定ミスが即・全件漏洩」につながりやすく、最小権限 GRANT の土台欠如（whether 側が暗黙の既定まかせ）と Advisor 検知ゼロ運用の不在は、多層防御の最外層・最下層がともに薄い状態を意味する。卒研 PF の本番公開を見据えると、低コストで効果の大きい恒常的ハードニングとして優先度は高い。一方、Exposed schemas の大規模なスキーマ移設は後続 REQ に分割しても良く、本 REQ は「コードで閉じられる土台＋ダッシュボード点検＋Advisor 恒常運用」を確実に締めることを主眼とする。
