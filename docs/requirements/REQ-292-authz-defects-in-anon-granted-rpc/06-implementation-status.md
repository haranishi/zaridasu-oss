## 実施状況（2026-07-30）

### 判断点の決定

| 判断点 | 決定 | 理由 |
|---|---|---|
| FR-292-01 の方式 | **(a) と (b) のハイブリッド** | (b) 相当（EXECUTE 剥奪＋本体の fail-closed ゲート＋`login_success` の本人限定化）は migration 適用だけで即座に効く。(a) 相当として Password Verification Attempt Hook 用の `public.admin_login_password_attempt(jsonb)` を新設し、`/auth/v1/token` 直叩きも含む全試行をサーバー側で記録できるようにした |
| FR-292-01(b) が要求する代替ブルートフォース対策 | **Supabase Auth 自身の `/auth/v1/token` レート制限に委ねる**（フックは `reject` を返さない） | フックのペイロードは `{user_id, valid}` のみで **IP を含まない**ため、reject を有効にするとカウンタが「メール単位・全 IP 共通」になり、**第三者が管理者のメールで 5 回失敗させるだけで正規管理者をロックアウトできる**（管理者 DoS）。より強い強制が必要なら Dashboard の `token` レート制限引き下げ／Cloudflare WAF／ログインの Edge Function 化を別 REQ で検討する |
| FR-292-02 の `admin_login_check` | **anon / authenticated ともに剥奪** | 任意メールのロック状態問い合わせ＝管理者メールの当て推量に使えるため。ロック判定をサーバー側へ移したのでフロントから呼ぶ必要が無い |
| FR-292-04 の汚染行 | **(a) 現状を残し調査手順を記録** | `audit_logs` は append-only（UPDATE/DELETE ポリシー不在・REQ-020 / REQ-134）で、消せないこと自体が改竄防止の設計意図。DELETE は行わず、調査クエリを migration 内 §5 に記載した。REQ-292 以降の行は `details.source`（`client_rpc` / `auth_hook` / `server_rpc`）で由来が判別できる |
| FR-292-05 | **(a) RPC を廃止（フロントの事前チェック削除）** | 重複判定は `signUp` 後の `identities` 空判定＝Auth レート制限と Turnstile が**実際に掛かる**経路に一本化。既存キー `auth.errors.alreadyRegistered` を再利用したため i18n 追加は不要 |

### 変更ファイル

- `supabase/migrations/20260730000001_req292_authz_defects_anon_granted_rpc.sql`（新規）／`supabase/schema.sql`（正本を同期・drift なし）
- `supabase/tests/req292_anon_granted_rpc_authz.sql`（新規 pgTAP・28 アサーション）
- `supabase/ci/reapply-after-grants.txt` — **CI の `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated` が本 migration の REVOKE を打ち消す**ため、既定 GRANT 後の再適用対象に追加（同ファイル冒頭の運用ルールも「関数の EXECUTE REVOKE」を含むよう拡張）
- `supabase/config.toml` — `[auth.hook.password_verification_attempt]` を **`enabled = false`** で追記（有効化手順をコメントで併記）
- `src/components/modals/AuthModal.tsx` / `src/views/admin/AdminLoginPage.tsx`（＋各テスト）
- 受容根拠の訂正: `docs/runbooks/supabase-hardening-checklist.md`（「REQ-292.【訂正】」節）／`docs/requirements/REQ-241-*.md`／`docs/requirements/REQ-212-*.md`／`docs/security/captcha-setup.md`

### Auth Hook を既定で無効にしている理由

フック関数の**本体**は `EXCEPTION WHEN others` で fail-open だが、**配線**は fail-open ではない。関数が存在しない
（migration 未適用の DB に GoTrue が先に繋がる）・`supabase_auth_admin` への `GRANT EXECUTE` が無い・
GoTrue / CLI がフック未対応、のいずれでも**全ユーザーのパスワードログインが失敗し得る**。
一方、問題A・C・D は本 migration だけで閉じており、フックは「記録と可視化」専用（`reject` を返さない）なので
**有効化を保留しても現状比のセキュリティ後退は無い**（保留中に失うのは `/auth/v1/token` 直叩き失敗の記録だけ）。
したがって有効化は「正しいパスワードでログインできることの実測」を伴う人手の運用手順に切り出した。
手順は `supabase/config.toml` の当該ブロックのコメントに記載。
