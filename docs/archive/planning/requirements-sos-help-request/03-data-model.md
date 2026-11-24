## 4. データモデル設計

### 4.1 posts テーブル拡張

```sql
-- info_type CHECK制約に 'sos' を追加
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_info_type_check;
ALTER TABLE posts ADD CONSTRAINT posts_info_type_check
  CHECK (info_type IN ('sighting','capture','trace','damage','absence','sos'));

-- SOS専用カラム追加
ALTER TABLE posts ADD COLUMN sos_category TEXT
  CHECK (sos_category IN ('capture_help','survey','equipment','other'));
ALTER TABLE posts ADD COLUMN sos_urgency TEXT DEFAULT 'medium'
  CHECK (sos_urgency IN ('high','medium','low'));
ALTER TABLE posts ADD COLUMN sos_desired_date DATE;
ALTER TABLE posts ADD COLUMN sos_max_people INTEGER CHECK (sos_max_people BETWEEN 1 AND 10);
ALTER TABLE posts ADD COLUMN sos_status TEXT DEFAULT 'open'
  CHECK (sos_status IN ('open','resolved','expired'));
ALTER TABLE posts ADD COLUMN sos_resolved_at TIMESTAMPTZ;
ALTER TABLE posts ADD COLUMN sos_resolved_comment TEXT CHECK (char_length(sos_resolved_comment) <= 200);
```

### 4.2 SOS応答テーブル（新規）

```sql
CREATE TABLE sos_responses (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id    UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message    TEXT CHECK (char_length(message) <= 200),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(post_id, user_id)  -- 1ユーザー1応答
);

-- RLS
ALTER TABLE sos_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sos_responses_read" ON sos_responses
  FOR SELECT USING (true);

CREATE POLICY "sos_responses_insert" ON sos_responses
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "sos_responses_delete_own" ON sos_responses
  FOR DELETE USING (auth.uid() = user_id);
```

### 4.3 SOS通知設定（user_profiles拡張）

```sql
ALTER TABLE user_profiles ADD COLUMN sos_notify_enabled BOOLEAN DEFAULT true;
ALTER TABLE user_profiles ADD COLUMN sos_notify_urgency_only BOOLEAN DEFAULT false;
-- sos_notify_urgency_only = true の場合、urgency='high' のみ通知
```

### 4.4 自動期限切れ (pg_cron / Supabase Cron)

```sql
-- 7日間で自動期限切れ
CREATE OR REPLACE FUNCTION expire_old_sos()
RETURNS void AS $$
BEGIN
  UPDATE posts
  SET sos_status = 'expired', updated_at = now()
  WHERE info_type = 'sos'
    AND sos_status = 'open'
    AND created_at < now() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Supabase Cron: 毎日0時に実行
SELECT cron.schedule('expire-sos', '0 0 * * *', 'SELECT expire_old_sos()');
```

---

