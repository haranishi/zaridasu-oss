## 非機能要件

| 項目 | 要件 |
|-----|------|
| コスト | Web Push 配信は無料（ブラウザベンダーの Push Service 経由）。VAPID 方式で FCM 等の有料サービス不要 |
| 配信保証 | ベストエフォート。TTL: 86400 秒（24時間）。端末がオフラインでも Push Service がキューイング |
| セキュリティ | VAPID 秘密鍵は Supabase Edge Function シークレット。公開鍵のみクライアント配信 |
| iOS 制限 | iOS 16.4+ 対応。**ホーム画面追加（standalone モード）が必須**。Safari 単体では動作しない |
| Android | Chrome 50+、Edge 17+ で動作。特別な制約なし |
| スケーラビリティ | 購読者 100 件超はバッチ分割（100件/回）。Supabase Edge Function のタイムアウト（26秒）内に完了 |
| プライバシー | 通知ペイロードにユーザー個人情報を含めない。投稿の公開情報（種別、市区町村）のみ |
| アクセシビリティ | トグル UI に `role="switch"`, `aria-checked`, `aria-label` を設定。スクリーンリーダー対応 |

---

## 実装設計

### 新規ファイル

| ファイル | 内容 |
|---------|------|
| `supabase/migrations/20260320_push_subscriptions.sql` | テーブル作成 + RLS + トリガー |
| `supabase/functions/send-push/index.ts` | Webhook 受信 → フィルタ → VAPID 署名 → Push 送信 |
| `src/hooks/usePushSubscription.ts` | Push 購読の登録・解除・フィルタ管理フック |
| `src/components/features/dashboard/PushNotificationCard.tsx` | 購読設定 UI |

### 変更ファイル

| ファイル | 変更内容 |
|---------|---------|
| `package.json` | `web-push`（型定義のみ。実際の送信は Edge Function） |
| `src/pages/DashboardPage.jsx` | `PushNotificationCard` コンポーネントを追加 |
| `src/lib/constants.js` | `VAPID_PUBLIC_KEY` 定数を追加 |
| `vite.config.js` | VitePWA の SW カスタムコードに push/notificationclick ハンドラー追加 |
| `src/locales/*/translation.json` | `notification.*` 翻訳キー追加（4言語） |

---

## 実装前の準備作業（コード不要）

1. VAPID 鍵ペアを生成: `npx web-push generate-vapid-keys`
2. `VAPID_PUBLIC_KEY` を `constants.js` に設定
3. `VAPID_PRIVATE_KEY` を Supabase Edge Function シークレットに登録
4. `VAPID_SUBJECT` を `mailto:admin@zaridasu.com` として Supabase シークレットに登録
5. Supabase Dashboard → Database → Webhooks で `posts` INSERT/UPDATE トリガーを設定
6. Webhook の認証用 `WEBHOOK_SECRET` を生成・登録

---

## テスト観点

1. 対応ブラウザで「通知を受け取る」トグルが有効であること
2. `Notification.requestPermission()` → denied 時に適切なフィードバック（設定手順リンク付き）
3. iOS 16.4 未満 / standalone でない場合にグレーアウト + 説明メッセージ
4. フィルタ条件（市区町村・種別・情報種別）の組み合わせが正しくマッチすること
5. 自分の投稿では通知が**来ない**こと
6. 無効エンドポイント（410 Gone）で `is_active = FALSE` に更新されること
7. 通知タップで該当投稿の詳細ページに遷移すること
8. 既にアプリタブが開いている場合はフォーカスのみ（新規タブを開かない）
9. 頻度制限（5分間隔、1日20件上限）が機能すること
10. 購読解除後に通知が来なくなること

---
