## B. 管理者アカウントの乗っ取り（特別扱い・最重要）

### まず保全（封じ込めと並行で最優先）

管理者操作は広範なので、**何をされたか**を消える前に押さえる（→ [evidence-preservation.md](./evidence-preservation.md)）。

```sql
-- 不審な admin 操作の確認（誰が・何を・いつ）
select id, admin_id, action, target_type, target_id, details, created_at
from audit_logs
order by created_at desc
limit 200;

-- 特に重い操作（ロール付与・公式化・削除）に絞る
select * from audit_logs
where action in ('grant_admin','revoke_admin','toggle_official','delete_post','delete_comment','reject_post')
order by created_at desc;

-- ログイン試行・ロック状況（侵入経路の痕跡）
select id, email_hash, ip, user_agent, success, attempted_at, locked_until
from admin_login_attempts
order by attempted_at desc
limit 100;
```

> **注意**: `audit_logs` は `writeAuditLog` の **fire-and-forget で欠落し得る**（`src/lib/auditLog.ts:25-27`）。ログに「無い＝やられていない」ではない。Supabase Logs・データ実体（不正に追加された admin ユーザー等）も併せて確認する。

### 封じ込め（管理者）

1. **パスワード変更 → 全セッション失効**（A と同じ）。Supabase で当該管理者の token を失効。
2. **MFA 再設定**。攻撃者が登録した MFA / 連携を削除。
3. **不正に付与された admin ロールの剥奪**:
   - `audit_logs` の `grant_admin` を確認し、身に覚えのない `app_metadata.role = 'admin'` を持つアカウントが増えていないか点検。
   - 不正な admin は **role を剥奪**（`revoke_admin` 相当の管理操作 / Supabase Admin API で `app_metadata` を修正）。
4. **service-role キーの取り扱い**: 管理者侵害時は service-role キーも漏れた前提で扱い、必要なら [01-secret-leak.md](./01-secret-leak.md) の手順でローテーションする。

### プラットフォーム別の復旧フォーム導線（⚠️要確認）

運用基盤アカウント自体（メールごと）を奪われ、ログインできない場合の復旧入口。**URL は変わり得るので最新を確認**（→ [contacts.md](./contacts.md)）。

| プラットフォーム | 復旧の入口 |
|---|---|
| **GitHub** | アカウント復旧 / サポート `https://support.github.com/` ⚠️要確認 |
| **Vercel** | Help / サポート `https://vercel.com/help` ⚠️要確認 |
| **Supabase** | Support（プロジェクト） `https://supabase.com/support` ⚠️要確認 |
| **Google（GCP / AI Studio）** | Google アカウント復旧 `https://accounts.google.com/signin/recovery` ⚠️要確認 |
| **Resend / Sentry / レジストラ** | 各サービスのサポート（→ contacts.md） |

> 運用基盤の Google / GitHub アカウントを失うと、Supabase / Vercel / Gemini / デプロイすべてに波及する。**運用基盤アカウントの MFA は最優先で堅牢化**しておく。

---
