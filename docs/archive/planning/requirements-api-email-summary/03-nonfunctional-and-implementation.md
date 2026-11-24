## 非機能要件

| 項目 | 要件 |
|-----|------|
| コスト | Resend Free プラン月 3,000 件以内なら無料。超過時は $20/月 |
| 冪等性 | 同一週に重複送信しないよう送信ログで確認 |
| 配信率 | 購読解除リンク必須（スパム判定回避）、Verified domain 設定推奨 |
| セキュリティ | `CRON_SECRET`, `RESEND_API_KEY` は Supabase シークレットで管理 |

---

## 実装設計

### 新規ファイル

| ファイル | 内容 |
|---------|------|
| `supabase/functions/send-weekly-summary/index.ts` | Cron トリガー受信 + 集計 + Resend 送信 |
| `src/hooks/useNotificationSettings.ts` | 通知設定の読み書きフック |
| `src/components/features/dashboard/EmailSummaryCard.jsx` | 通知設定 UI |
| `supabase/migrations/20260316000002_notification_settings.sql` | テーブル作成 + RLS |

### 変更ファイル

| ファイル | 変更内容 |
|---------|---------|
| `src/pages/DashboardPage.jsx` | `EmailSummaryCard` を追加 |
| `src/locales/*/translation.json` | `emailSummary.*` キー追加 |

---
