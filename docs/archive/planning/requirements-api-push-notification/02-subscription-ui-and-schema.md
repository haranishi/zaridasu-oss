## 機能要件

**F1: 購読 UI（DashboardPage）**

- 「通知を受け取る」トグルスイッチ
- ON 時: `Notification.requestPermission()` → 許可後 `PushManager.subscribe()` → Supabase に購読データ保存
- iOS 16.4 未満には「iOS 16.4 以降が必要です」と表示（グレーアウト）

**F2: 通知条件設定**

- 市区町村フィルター: MUNICIPALITIES 配列から複数選択（空 = 全域）
- 種別フィルター: `american` / `bullfrog` / 両方
- 情報種別フィルター: `sighting` / `capture` / `trace` / `damage` の複数選択

**F3: `push_subscriptions` テーブル**

```sql
CREATE TABLE push_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  filter_conditions JSONB DEFAULT '{"municipalities":[],"species":[],"info_types":[]}',
  is_active BOOLEAN DEFAULT TRUE,
  UNIQUE(user_id, endpoint)
);
```

RLS: `user_id = auth.uid()` のみ CRUD 許可

**F4: Supabase Database Webhook**

- `posts` テーブルの `INSERT` イベントをトリガー
- Edge Function `send-push` を HTTP POST で呼び出す
- Supabase Dashboard > Database > Webhooks で設定
