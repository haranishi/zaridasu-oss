## 1. 手動対応が必要な項目（実装だけでは完了しない）

### 1-1. シークレットローテーション（REQ-017）— Critical

| # | 作業内容 | 完了 |
|---|---------|------|
| 1 | Supabase ダッシュボード → Settings → API で Anon Key を再生成 | [ ] |
| 2 | Google Cloud Console で Gemini API Key を再生成 | [ ] |
| 3 | Vercel ダッシュボード → Settings → Environment Variables を新しいキーに更新 | [ ] |
| 4 | `git filter-repo` 等で `.env.local` / `supabase/functions/.env` をgit履歴から除去 | [ ] |
| 5 | デプロイ後、アプリが新しいキーで正常動作することを確認 | [ ] |

### 1-2. SQLマイグレーション実行（REQ-020/025/032）— Critical

Supabase ダッシュボード → SQL Editor で以下を **順番に** 実行する。

| # | ファイル | 内容 | 完了 |
|---|---------|------|------|
| 1 | `supabase/migrations/001_rls_and_audit_triggers.sql` | RLSポリシー整理 + 監査ログトリガー | [ ] |
| 2 | `supabase/migrations/002_dashboard_stats_rpc.sql` | ダッシュボード統計RPC関数 | [ ] |

実行後の確認:
- [ ] `SELECT policyname FROM pg_policies WHERE tablename='posts';` で `public_read`, `public_insert` が存在しないこと
- [ ] `SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 5;` でトリガーログが記録されること（投稿を削除して確認）
- [ ] `SELECT * FROM get_dashboard_stats();` が正常にJSONを返すこと

### 1-3. MFA有効化（REQ-018）— High

| # | 作業内容 | 完了 |
|---|---------|------|
| 1 | Supabase ダッシュボード → Auth → Multi Factor Auth を有効化 | [ ] |
| 2 | 管理者アカウントにTOTPを設定（Google Authenticator等） | [ ] |

---
