## 非機能要件

| 項目 | 要件 |
|-----|------|
| コスト | Web Push 配信は無料（ブラウザベンダー経由）。VAPID 方式で中間サービス不要 |
| 配信保証 | ベストエフォート（`ttl: 86400` で 24 時間保持） |
| セキュリティ | VAPID 秘密鍵はクライアント非公開。Database Webhook は `WEBHOOK_SECRET` で認証 |
| iOS 制限 | iOS 16.4 以降対応。それ以前は通知不可を UI に明示 |
| スケーラビリティ | 購読者 100 件超の場合はバッチ 100 件/回で分割送信 |

---

## 実装設計

### 新規ファイル

| ファイル | 内容 |
|---------|------|
| `supabase/functions/send-push/index.ts` | Database Webhook 受信 + フィルタリング + VAPID 署名 + Push 送信 |
| `src/hooks/usePushSubscription.ts` | Push 購読の登録・解除・状態管理フック |
| `src/components/features/dashboard/PushNotificationCard.jsx` | 購読設定 UI コンポーネント |
| `supabase/migrations/20260316000003_push_subscriptions.sql` | テーブル作成 + RLS |

### 変更ファイル

| ファイル | 変更内容 |
|---------|---------|
| `src/pages/DashboardPage.jsx` | `PushNotificationCard` を追加 |
| `src/lib/constants.js` | `VAPID_PUBLIC_KEY` 追加 |
| `vite.config.js` | VitePWA の Service Worker カスタムコードで push/notificationclick ハンドラー追加 |
| `src/locales/*/translation.json` | `notification.*` キー追加 |

---
