## 実装前の準備作業（コード不要）

1. VAPID 鍵ペアを生成: `npx web-push generate-vapid-keys`
2. `VAPID_PUBLIC_KEY` を `.env.local` と `constants.js` に設定
3. `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` を Supabase シークレットに登録
4. Supabase Dashboard で Database Webhook を設定

---

## テスト観点

1. `Notification.requestPermission()` denied 時に適切なフィードバックが表示されること
2. フィルター条件: 指定市区町村以外の投稿で通知が来ないこと
3. 無効エンドポイント（410）で `is_active` が FALSE になること
4. Database Webhook が posts INSERT と連動して Edge Function が呼ばれること
5. iOS 16.4 未満のデバイスで購読 UI がグレーアウトされること
