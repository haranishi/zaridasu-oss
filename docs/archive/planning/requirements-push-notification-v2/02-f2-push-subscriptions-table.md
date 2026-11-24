### F2: `push_subscriptions` テーブル

```sql
CREATE TABLE push_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  filter_municipalities TEXT[] DEFAULT '{}',
  filter_species TEXT[] DEFAULT '{}',
  filter_info_types TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT TRUE,
  last_sent_at TIMESTAMPTZ,
  error_count INT DEFAULT 0,
  UNIQUE(user_id, endpoint)
);

-- RLS
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own" ON push_subscriptions FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "insert_own" ON push_subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_own" ON push_subscriptions FOR UPDATE
  USING (auth.uid() = user_id);
CREATE POLICY "delete_own" ON push_subscriptions FOR DELETE
  USING (auth.uid() = user_id);

-- updated_at 自動更新トリガー
CREATE TRIGGER update_push_subscriptions_updated_at
  BEFORE UPDATE ON push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

**API-005 からの変更点**:
- `filter_conditions` JSONB → 個別カラム（`filter_municipalities`, `filter_species`, `filter_info_types`）に分離。DB レベルでのフィルタクエリが容易
- `last_sent_at` 追加: 通知頻度制限に使用
- `error_count` 追加: 連続失敗でエンドポイントを無効化（3回連続失敗 → `is_active = FALSE`）
