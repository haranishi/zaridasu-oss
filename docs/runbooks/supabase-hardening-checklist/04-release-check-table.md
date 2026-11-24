## リリース前 点検チェック表（毎回コピーして使う）

> 秘密値（project ref / IP / キー）は書かない。「済/未」と日付のみ。

| 区分 | 項目 | 合格基準 | 状態 | 確認日 / 備考 |
|---|---|---|---|---|
| A | `npm run schema:check` | OK | ☐ | |
| A | pgTAP `rls_set_user_admin_role` | 5/5 ok（INV-01/02 が ok） | ☐ | |
| A | pgTAP `grant_hardening_internal_tables` | 20/20 ok | ☐ | |
| B-1 | SSL Enforcement | 有効 | ☐ | |
| B-2 | Network Restrictions | 必要範囲に限定 | ☐ | |
| B-3 | アカウント/組織 MFA + Owner 複数 | 有効・複数 | ☐ | |
| B-4 | PITR（REQ-217 参照） | 有効・復元テスト済 | ☐ | |
| B-5 | 本番 SMTP（REQ-219 参照） | 設定済 | ☐ | |
| B-6 | Exposed schemas = config と一致 | `public` のみ | ☐ | |
| C-1 | Security Advisor Rerun | SECURITY ERROR/WARN = 0 | ☐ | |
| C-2 | acknowledge 記録 | 残す警告に理由/期日あり | ☐ | |
| C-3(a) | migration 化済み 4 件の GRANT | anon/authenticated が 0 件 | ☐ | `admin_login_attempts`/`geo_cache`/`lifecycle_email_log`/`user_last_active` |
| C-3(b) | 手動保留分の GRANT 点検 | 意図どおり（直アクセスポリシー由来は現状維持） | ☐ | `audit_logs`/`ai_call_logs`/`admin_alerts`/`experiments`/`experiment_assignments` |
| REQ-292 | RPC の anon EXECUTE 実測 | 4 本すべて false | ☐ | `admin_login_record`/`admin_login_check`/`check_email_exists`/`admin_login_password_attempt`（下記 REQ-292 節・SQL は要件定義書の「本番適用手順 (II)」） |
| REQ-292 | pgTAP `req292_anon_granted_rpc_authz` | 28/28 ok | ☐ | |
| REQ-292 | Password Verification Attempt Hook | 有効化した場合、正しいパスワードでログインできる | ☐ | 未有効化なら「未」のまま可（問題A/C/D は migration だけで閉じている） |

---
